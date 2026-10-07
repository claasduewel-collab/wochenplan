// Wochenplan-Generator
// Läuft jeden Sonntag auf GitHub (siehe .github/workflows/wochenplan.yml):
//  1. sucht den Lidl-Aktionsprospekt der kommenden Woche
//  2. lässt Gemini die Lebensmittel-Angebote aus den Prospektseiten lesen
//  3. lässt Gemini daraus einen 7-Tage-Plan + Einkaufsliste bauen
//  4. rechnet Makros, Kosten und Restmengen selbst nach (und lässt bei Bedarf korrigieren)
//  5. schreibt alles in plan.json, die die App anzeigt
// Benötigt Node 20+ und die Umgebungsvariable GEMINI_API_KEY.

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const LIDL_UEBERSICHT = 'https://www.lidl.de/c/online-prospekte/s10005610';
const LEAFLET_API = 'https://endpoints.leaflets.schwarz/v4/flyer';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------------------------------------------------------------- Lidl

async function holen(url, als = 'text') {
  for (let versuch = 1; versuch <= 3; versuch++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'de-DE,de;q=0.9' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} bei ${url}`);
      if (als === 'json') return await res.json();
      if (als === 'bytes') return Buffer.from(await res.arrayBuffer());
      return await res.text();
    } catch (e) {
      if (versuch === 3) throw e;
      await sleep(3000 * versuch);
    }
  }
}

function naechsterMontag(jetzt = new Date()) {
  const d = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate()));
  const tag = d.getUTCDay(); // 0 = Sonntag
  const plus = tag === 1 ? 0 : (8 - tag) % 7;
  d.setUTCDate(d.getUTCDate() + plus);
  return d;
}

export function prospekteAusHtml(html) {
  const re = /aktionsprospekt-(\d{2})-(\d{2})-(\d{4})-(\d{2})-(\d{2})-(\d{4})-[0-9a-z]+/gi;
  const gefunden = new Map();
  for (const m of html.matchAll(re)) {
    const id = m[0];
    if (gefunden.has(id)) continue;
    gefunden.set(id, {
      id,
      von: new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])),
      bis: new Date(Date.UTC(+m[6], +m[5] - 1, +m[4])),
    });
  }
  return [...gefunden.values()];
}

export function prospektWaehlen(liste, ziel) {
  if (!liste.length) return null;
  const tag = 86400000;
  const passend = liste.find((p) => Math.abs(p.von - ziel) < tag);
  if (passend) return passend;
  const laufend = liste.filter((p) => p.von <= ziel && p.bis >= ziel).sort((a, b) => b.von - a.von)[0];
  if (laufend) return laufend;
  const zukunft = liste.filter((p) => p.von > ziel).sort((a, b) => a.von - b.von)[0];
  return zukunft || liste.sort((a, b) => b.von - a.von)[0];
}

export function lebensmittelSeiten(seiten, max = 30) {
  // Seiten, die nur Non-Food-Produktlinks haben (Kleidung, Technik ...), fliegen raus.
  return seiten
    .filter((s) => {
      const links = s.links || [];
      const produkt = links.some((l) => l.displayType === 'product');
      const rezept = links.some((l) => l.displayType === 'recipe');
      return !(produkt && !rezept);
    })
    .slice(0, max);
}

// ---------------------------------------------------------------- Gemini

export function jsonLesen(text) {
  if (!text) throw new Error('Leere Antwort');
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch {}
  const start = Math.min(...['{', '['].map((c) => t.indexOf(c)).filter((i) => i >= 0));
  const ende = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (Number.isFinite(start) && ende > start) return JSON.parse(t.slice(start, ende + 1));
  throw new Error('Antwort war kein JSON: ' + t.slice(0, 200));
}

async function gemini(cfg, parts, { temperature = 0.2 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY fehlt (GitHub → Settings → Secrets → Actions).');
  const modell = cfg.modell || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modell}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature, responseMimeType: 'application/json' },
  };
  for (let versuch = 1; versuch <= 6; versuch++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      const warte = 15000 * versuch;
      log(`Gemini ${res.status}, warte ${warte / 1000}s ...`);
      await sleep(warte);
      continue;
    }
    const daten = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Gemini-Fehler ${res.status}: ${daten?.error?.message || 'unbekannt'}`);
    const text = (daten.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    if (!text) throw new Error('Gemini hat nichts geantwortet (' + (daten.candidates?.[0]?.finishReason || 'kein Grund') + ').');
    return jsonLesen(text);
  }
  throw new Error('Gemini ist gerade überlastet (zu viele Versuche).');
}

const KATEGORIEN = ['Fleisch & Fisch', 'Milch & Käse', 'Eier', 'Obst', 'Gemüse', 'Brot & Backwaren', 'Nudeln, Reis & Getreide', 'Konserven & Saucen', 'Tiefkühl', 'Öl & Gewürze', 'Getränke', 'Snacks & Süßes', 'Sonstiges'];

async function angeboteLesen(cfg, seiten) {
  const alle = [];
  const gruppen = [];
  for (let i = 0; i < seiten.length; i += 4) gruppen.push(seiten.slice(i, i + 4));
  for (const [n, gruppe] of gruppen.entries()) {
    log(`Lese Prospektseiten ${gruppe.map((s) => s.number).join(', ')} (${n + 1}/${gruppen.length})`);
    const parts = [{
      text:
        'Du siehst Seiten aus einem deutschen Lidl-Prospekt. Lies ALLE Lebensmittel-Angebote ab (inkl. Getränke). ' +
        'Ignoriere Non-Food (Kleidung, Technik, Deko, Haushalt) komplett. Erfinde nichts: nur was lesbar auf der Seite steht.\n' +
        'Antworte NUR mit JSON: {"angebote":[{"seite":Zahl,"produkt":"Name inkl. Sorte","marke":"oder leer",' +
        '"menge":"wie aufgedruckt, z.B. 400-g-Packung","menge_g":Zahl oder null (Gramm bzw. ml, bei Mehrfachpackungen gesamt),' +
        '"preis":Zahl in Euro (normaler Aktionspreis),"preis_mit_app":Zahl oder null (Lidl-Plus-Preis falls angegeben),' +
        '"gueltig_ab":"z.B. Mo. 12.10." oder leer,"kategorie":"eine von: ' + KATEGORIEN.join(' | ') + '"}]}\n' +
        'Wenn eine Seite keine Lebensmittel hat, liefere für sie nichts.',
    }];
    for (const s of gruppe) {
      let bild;
      try { bild = await holen(s.zoom || s.image, 'bytes'); } catch { bild = await holen(s.image, 'bytes'); }
      parts.push({ text: `Prospektseite ${s.number}:` });
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: bild.toString('base64') } });
    }
    try {
      const antwort = await gemini(cfg, parts, { temperature: 0 });
      for (const a of antwort.angebote || []) if (a && a.produkt && Number(a.preis) > 0) alle.push(a);
    } catch (e) {
      log('  Seitengruppe übersprungen:', e.message);
    }
    await sleep(4000); // freundlich zum kostenlosen Kontingent
  }
  // doppelte entfernen
  const gesehen = new Set();
  return alle.filter((a) => {
    const k = (a.produkt + '|' + a.preis).toLowerCase();
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------- Plan

const PLAN_FORMAT = `{
  "zusammenfassung": "2-3 Sätze: Idee der Woche, welche Angebote genutzt werden",
  "artikel": [
    {"id": "a1", "name": "Hähnchenbrustfilet", "packung_g": 1000, "anzahl": 1, "preis_pro_packung": 7.99,
     "angebot": true, "kategorie": "Fleisch & Fisch",
     "naehrwerte_100g": {"kcal": 110, "protein": 23.5, "fett": 1.5, "kh": 0}}
  ],
  "tage": [
    {"tag": "Montag",
     "mittag": {"name": "...", "zutaten": [{"id": "a1", "g": 300}], "schritte": ["..."], "resteverwertung": "z.B. nutzt Reis vom Sonntag oder leer"},
     "abend":  {"name": "...", "zutaten": [{"id": "a1", "g": 400}], "schritte": ["..."], "resteverwertung": ""}}
  ]
}`;

function planPrompt(cfg, angebote, ziel) {
  const extras = (cfg.feste_extras || []).reduce((s, e) => ({
    kcal: s.kcal + (e.kcal || 0), protein: s.protein + (e.protein || 0),
  }), { kcal: 0, protein: 0 });
  const proPerson = {
    kcal: cfg.ziele.kcal - extras.kcal,
    protein: cfg.ziele.protein - extras.protein,
  };
  const p = cfg.personen || 1;
  return [
    'Du planst einen Wocheneinkauf bei Lidl und alle Mahlzeiten der Woche. Antworte NUR mit JSON.',
    '',
    `PERSONEN: ${p}. ${cfg.personenHinweis || ''}`,
    `Mengen in "zutaten" sind GESAMTMENGEN für alle ${p} Personen (jede Person isst 1/${p}).`,
    `TAGESZIEL pro Person: ${cfg.ziele.kcal} kcal, ${cfg.ziele.protein} g Protein, ${cfg.ziele.fett} g Fett, ${cfg.ziele.kh} g Kohlenhydrate.`,
    `Davon sind schon fest eingeplant (NICHT einkaufen, NICHT in den Plan schreiben): ${(cfg.feste_extras || []).map((e) => `${e.name} (${e.kcal} kcal, ${e.protein} g Protein)`).join('; ')}.`,
    `=> Mittag + Abend zusammen müssen pro Person ca. ${proPerson.kcal} kcal und mind. ${proPerson.protein} g Protein liefern, d.h. pro Tag GESAMT (alle Personen) ca. ${proPerson.kcal * p} kcal und ${proPerson.protein * p} g Protein.`,
    `MAHLZEITEN: ${(cfg.mahlzeiten || []).map((m) => `${m.label} = ${m.art} (${m.hinweis})`).join('; ')}.`,
    `TAGE: ${(cfg.tage || []).join(', ')}.`,
    cfg.kein_schwein ? 'KEIN Schweinefleisch und keine Produkte mit Schwein (auch kein Schinken, Speck, Salami vom Schwein, Gelatine).' : '',
    `MAG NICHT (niemals verwenden, auch nicht als Zutat): ${(cfg.mag_nicht || []).join(', ')}.`,
    (cfg.mag_nicht_gerichte || []).length ? `DIESE GERICHTE NICHT MEHR PLANEN (auch keine sehr ähnlichen): ${cfg.mag_nicht_gerichte.join(', ')}.` : '',
    `VORRAT (ist zu Hause, nicht einkaufen, nicht in "artikel" aufnehmen; Öl trotzdem nur sparsam): ${(cfg.vorrat || []).join(', ')}.`,
    cfg.budget_pro_woche_euro ? `BUDGET: höchstens ${cfg.budget_pro_woche_euro} € für die ganze Woche.` : 'BUDGET: so günstig wie möglich.',
    'REGELN:',
    ...(cfg.regeln || []).map((r) => '- ' + r),
    '- Kaufe nur ganze Packungen. Die Summe aller "g" eines Artikels über die Woche muss möglichst genau packung_g × anzahl ergeben (maximal 5 % Rest).',
    '- Frisches Fleisch/Fisch innerhalb von 2-3 Tagen nach dem Einkauf verbrauchen oder im Plan als einfrieren kennzeichnen.',
    '- naehrwerte_100g realistisch für das Produkt angeben (wie auf deutschen Packungen). Die App rechnet damit Makros nach.',
    '- Grammangaben und naehrwerte_100g immer für den Zustand beim Kauf (Reis, Nudeln, Linsen ungekocht; Fleisch roh).',
    '- Schritte kurz und konkret, alle Mengen in Gramm.',
    '',
    `ANGEBOTE AUS DEM PROSPEKT (${ziel}), bevorzugt verwenden:`,
    JSON.stringify(angebote.map((a) => ({ produkt: a.produkt, marke: a.marke, menge: a.menge, menge_g: a.menge_g, preis: a.preis, preis_mit_app: a.preis_mit_app, ab: a.gueltig_ab }))),
    '',
    'NORMALPREISE (Orientierung für alles, was nicht im Angebot ist):',
    JSON.stringify(cfg.basispreise || {}),
    '',
    `KATEGORIEN für "kategorie": ${KATEGORIEN.join(' | ')}`,
    '',
    'FORMAT:',
    PLAN_FORMAT,
  ].filter((z) => z !== '').join('\n');
}

const r1 = (x) => Math.round(x * 10) / 10;

export function auswerten(cfg, plan) {
  const p = cfg.personen || 1;
  const artikel = new Map((plan.artikel || []).map((a) => [a.id, a]));
  const verbrauch = new Map();
  const slots = (cfg.mahlzeiten || []).map((m) => m.slot);
  const extras = (cfg.feste_extras || []).reduce((s, e) => ({
    kcal: s.kcal + (e.kcal || 0), protein: s.protein + (e.protein || 0), fett: s.fett + (e.fett || 0), kh: s.kh + (e.kh || 0),
  }), { kcal: 0, protein: 0, fett: 0, kh: 0 });
  const unbekannt = new Set();

  const tage = (plan.tage || []).map((t) => {
    const summe = { ...extras };
    for (const slot of slots) {
      const m = t[slot];
      if (!m) continue;
      const mSumme = { kcal: 0, protein: 0, fett: 0, kh: 0 };
      for (const z of m.zutaten || []) {
        const a = artikel.get(z.id);
        const g = Number(z.g) || 0;
        if (!a) { unbekannt.add(z.id); continue; }
        verbrauch.set(z.id, (verbrauch.get(z.id) || 0) + g);
        const n = a.naehrwerte_100g || {};
        for (const k of ['kcal', 'protein', 'fett', 'kh']) mSumme[k] += ((Number(n[k]) || 0) * g) / 100 / p;
      }
      m.pro_person = Object.fromEntries(Object.entries(mSumme).map(([k, v]) => [k, r1(v)]));
      for (const k of Object.keys(mSumme)) summe[k] += mSumme[k];
    }
    return { tag: t.tag, pro_person: Object.fromEntries(Object.entries(summe).map(([k, v]) => [k, r1(v)])) };
  });

  let kosten = 0;
  const reste = [];
  for (const a of plan.artikel || []) {
    const gekauft = (Number(a.packung_g) || 0) * (Number(a.anzahl) || 1);
    const genutzt = verbrauch.get(a.id) || 0;
    a.genutzt_g = Math.round(genutzt);
    a.gekauft_g = Math.round(gekauft);
    kosten += (Number(a.preis_pro_packung) || 0) * (Number(a.anzahl) || 1);
    const rest = gekauft - genutzt;
    if (genutzt === 0) reste.push({ id: a.id, name: a.name, rest_g: Math.round(gekauft), problem: 'wird gekauft, aber nie verwendet' });
    else if (rest < -Math.max(10, gekauft * 0.03)) reste.push({ id: a.id, name: a.name, rest_g: Math.round(rest), problem: `es werden ${Math.round(genutzt)} g verplant, gekauft sind nur ${Math.round(gekauft)} g` });
    else if (rest > Math.max(30, gekauft * 0.05)) reste.push({ id: a.id, name: a.name, rest_g: Math.round(rest), problem: `${Math.round(rest)} g bleiben übrig` });
  }

  const abweichungen = [];
  for (const t of tage) {
    const z = cfg.ziele;
    if (Math.abs(t.pro_person.kcal - z.kcal) > z.kcal * 0.07) abweichungen.push(`${t.tag}: ${Math.round(t.pro_person.kcal)} kcal statt ${z.kcal}`);
    if (t.pro_person.protein < z.protein * 0.92) abweichungen.push(`${t.tag}: nur ${Math.round(t.pro_person.protein)} g Protein statt ${z.protein}`);
  }
  for (const id of unbekannt) abweichungen.push(`Zutat-ID "${id}" fehlt in der Artikelliste`);

  return { tage, kosten: Math.round(kosten * 100) / 100, reste, abweichungen, gut: reste.length === 0 && abweichungen.length === 0 };
}

async function planErstellen(cfg, angebote, prospektText) {
  log('Erstelle Wochenplan ...');
  const basis = planPrompt(cfg, angebote, prospektText);
  let plan = await gemini(cfg, [{ text: basis }], { temperature: 0.5 });
  let bewertung = auswerten(cfg, plan);
  for (let runde = 1; runde <= 2 && !bewertung.gut; runde++) {
    log(`Korrekturrunde ${runde}: ${bewertung.abweichungen.length} Makro-Abweichungen, ${bewertung.reste.length} Rest-Probleme`);
    await sleep(4000);
    const korrektur = [
      basis,
      '',
      'DEIN BISHERIGER PLAN:',
      JSON.stringify(plan),
      '',
      'NACHGERECHNET (mit deinen naehrwerte_100g, pro Person inkl. Shakes) gibt es diese Probleme:',
      ...bewertung.abweichungen.map((a) => '- ' + a),
      ...bewertung.reste.map((r) => `- ${r.name}: ${r.problem}`),
      '',
      'Korrigiere Grammzahlen, Packungsanzahl oder Gerichte so, dass alle Probleme verschwinden. Antworte mit dem VOLLSTÄNDIGEN korrigierten Plan im selben JSON-Format.',
    ].join('\n');
    try {
      const neu = await gemini(cfg, [{ text: korrektur }], { temperature: 0.3 });
      const neuBewertung = auswerten(cfg, neu);
      const fehler = (b) => b.abweichungen.length + b.reste.length;
      if (fehler(neuBewertung) <= fehler(bewertung)) { plan = neu; bewertung = neuBewertung; }
    } catch (e) {
      log('  Korrektur fehlgeschlagen:', e.message);
      break;
    }
  }
  return { plan, bewertung };
}

// ---------------------------------------------------------------- Ablauf

const datum = (d) => d.toISOString().slice(0, 10);

async function main() {
  const cfg = JSON.parse(await readFile('config.json', 'utf8'));
  let alt = {};
  try { alt = JSON.parse(await readFile('plan.json', 'utf8')); } catch {}

  try {
    log('Suche Lidl-Prospekte ...');
    const html = await holen(LIDL_UEBERSICHT);
    const ziel = naechsterMontag();
    const prospekt = prospektWaehlen(prospekteAusHtml(html), ziel);
    if (!prospekt) throw new Error('Auf lidl.de wurde kein Aktionsprospekt gefunden.');
    log('Prospekt:', prospekt.id);

    const flyer = await holen(`${LEAFLET_API}?flyer_identifier=${prospekt.id}&region_id=0&region_code=0`, 'json');
    const seiten = lebensmittelSeiten(flyer?.flyer?.pages || [], cfg.max_prospektseiten || 30);
    log(`${seiten.length} mögliche Lebensmittelseiten`);
    if (!seiten.length) throw new Error('Der Prospekt hatte keine lesbaren Seiten.');

    const angebote = await angeboteLesen(cfg, seiten);
    log(`${angebote.length} Lebensmittel-Angebote gefunden`);
    if (angebote.length < 5) throw new Error(`Nur ${angebote.length} Angebote erkannt – Prospekt vermutlich nicht lesbar.`);

    const titel = `${datum(prospekt.von)} bis ${datum(prospekt.bis)}`;
    const { plan, bewertung } = await planErstellen(cfg, angebote, titel);

    const ergebnis = {
      status: 'ok',
      erstellt: new Date().toISOString(),
      prospekt: { id: prospekt.id, von: datum(prospekt.von), bis: datum(prospekt.bis), url: flyer?.flyer?.flyerUrlAbsolute || LIDL_UEBERSICHT },
      filiale: cfg.filiale,
      personen: cfg.personen,
      ziele: cfg.ziele,
      feste_extras: cfg.feste_extras,
      mahlzeiten: cfg.mahlzeiten,
      angebote,
      plan,
      auswertung: bewertung,
    };
    await writeFile('plan.json', JSON.stringify(ergebnis, null, 1));
    log(`Fertig. Kosten ca. ${bewertung.kosten.toFixed(2)} €, ${bewertung.abweichungen.length} Makro-Hinweise, ${bewertung.reste.length} Rest-Hinweise.`);
  } catch (e) {
    console.error('FEHLER:', e.message);
    const ergebnis = { ...alt, status: 'fehler', fehler: e.message, fehler_zeit: new Date().toISOString() };
    await writeFile('plan.json', JSON.stringify(ergebnis, null, 1));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
