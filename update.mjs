// Angebots-Sammler für die Wochenplan-App.
// Läuft jeden Sonntag auf GitHub (.github/workflows/wochenplan.yml) und schreibt plan.json:
//   1. sucht je Laden den aktuellen Prospekt (Seitenbilder)
//   2. lässt Gemini die Lebensmittel-Angebote von den Seiten ablesen und Katalog-Artikeln zuordnen
// Die eigentliche Wochenplanung (Rezepte, Mengen, Einkaufsliste, Vorrat) macht die App selbst – sofort und ohne KI.
// Benötigt Node 20+ und die Umgebungsvariable GEMINI_API_KEY.
//
//   node update.mjs              alles
//   node update.mjs --seiten     nur zeigen, welche Prospektseiten gelesen würden (ohne Gemini)

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const datum = (d) => d.toISOString().slice(0, 10);

async function holen(url, als = 'text') {
  for (let versuch = 1; versuch <= 3; versuch++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'de-DE,de;q=0.9' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} bei ${new URL(url).hostname}`);
      if (als === 'json') return await res.json();
      if (als === 'bytes') return Buffer.from(await res.arrayBuffer());
      return await res.text();
    } catch (e) {
      if (versuch === 3) throw e;
      await sleep(3000 * versuch);
    }
  }
}

// ---------------------------------------------------------------- Quelle: Lidl

const LIDL_UEBERSICHT = 'https://www.lidl.de/c/online-prospekte/s10005610';
const LEAFLET_API = 'https://endpoints.leaflets.schwarz/v4/flyer';

/** Für welchen Tag suchen wir Angebote? Sonntags für die kommende Woche, sonst für heute. */
export function zielTag(jetzt = new Date()) {
  const d = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate()));
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export function prospekteAusHtml(html) {
  const re = /aktionsprospekt-(\d{2})-(\d{2})-(\d{4})-(\d{2})-(\d{2})-(\d{4})-[0-9a-z]+/gi;
  const gefunden = new Map();
  for (const m of html.matchAll(re)) {
    if (gefunden.has(m[0])) continue;
    gefunden.set(m[0], { id: m[0], von: new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])), bis: new Date(Date.UTC(+m[6], +m[5] - 1, +m[4])) });
  }
  return [...gefunden.values()];
}

export function prospektWaehlen(liste, ziel) {
  if (!liste.length) return null;
  const laufend = liste.filter((p) => p.von <= ziel && p.bis >= ziel).sort((a, b) => b.von - a.von)[0];
  if (laufend) return laufend;
  const zukunft = liste.filter((p) => p.von > ziel).sort((a, b) => a.von - b.von)[0];
  return zukunft || [...liste].sort((a, b) => b.von - a.von)[0];
}

const ESSEN = /fleisch|hähnchen|haehnchen|pute|rind|hack|steak|fisch|lachs|käse|joghurt|quark|milch|butter|eier\b|obst|gemüse|kartoffel|möhren|äpfel|birnen|orangen|tomaten|gurke|salat|brot|brötchen|nudel|reis|kg-preis|metzgerfrisch|frisch|bio|müsli|pizza|suppe|kaffee/gi;
const KEIN_ESSEN = /parkside|silvercrest|crivit|livarno|esmara|lupilu|werkzeug|akku|matratze|bekleidung|feuerwerk|spielzeug|deko|reise|gewinnspiel|karriere|foto/gi;

/** Wählt die Seiten mit Lebensmitteln aus (anhand der Stichwörter, die der Prospekt je Seite mitliefert). */
export function lebensmittelSeiten(seiten, max = 30) {
  return seiten
    .map((s) => {
      const text = `${s.keyWords || ''} ${s.altText || ''}`;
      const links = s.links || [];
      const shop = links.filter((l) => l.displayType === 'product').length;
      const rezept = links.filter((l) => l.displayType === 'recipe').length;
      const punkte = (text.match(ESSEN) || []).length + rezept * 2 - (text.match(KEIN_ESSEN) || []).length * 2 - shop;
      return { ...s, punkte };
    })
    .filter((s) => s.punkte >= 2)
    .sort((a, b) => b.punkte - a.punkte)
    .slice(0, max)
    .sort((a, b) => a.number - b.number);
}

async function lidl(cfg) {
  const html = await holen(LIDL_UEBERSICHT);
  const prospekt = prospektWaehlen(prospekteAusHtml(html), zielTag());
  if (!prospekt) throw new Error('Auf lidl.de wurde kein Aktionsprospekt gefunden.');
  log('Lidl-Prospekt:', prospekt.id);
  const flyer = await holen(`${LEAFLET_API}?flyer_identifier=${prospekt.id}&region_id=0&region_code=0`, 'json');
  const seiten = lebensmittelSeiten(flyer?.flyer?.pages || [], cfg.max_prospektseiten || 30);
  if (!seiten.length) throw new Error('Der Lidl-Prospekt hatte keine lesbaren Lebensmittelseiten.');
  return {
    von: datum(prospekt.von), bis: datum(prospekt.bis),
    url: flyer?.flyer?.flyerUrlAbsolute || LIDL_UEBERSICHT,
    seiten: seiten.map((s) => ({ nummer: s.number, bild: s.zoom || s.image, ersatz: s.image })),
  };
}

// Weitere Läden lassen sich hier ergänzen: eine Funktion, die {von, bis, url, seiten:[{nummer, bild}]} liefert.
const QUELLEN = { lidl };
const NAMEN = { lidl: 'Lidl', 'aldi-nord': 'Aldi Nord', rewe: 'Rewe', edeka: 'Edeka', penny: 'Penny', kaufland: 'Kaufland', netto: 'Netto' };

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

class SchluesselFehler extends Error {}
class KontingentFehler extends Error {}
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
let modell = null;

/** Sucht das neueste verfügbare Flash-Modell, falls das eingestellte nicht (mehr) existiert. */
export function modellWaehlen(liste) {
  const ok = (liste || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-[\d.]+-flash/.test(n) && !/lite|image|tts|live|audio|embedding|thinking/.test(n));
  const version = (n) => parseFloat(n.match(/^gemini-([\d.]+)/)[1]);
  const stabil = (n) => (/preview|exp/.test(n) ? 0 : 1);
  return ok.sort((a, b) => version(b) - version(a) || stabil(b) - stabil(a) || a.length - b.length)[0] || null;
}

/** Alle brauchbaren Flash-Modelle, bestes zuerst – als Ausweichliste bei Überlastung oder leerem Kontingent. */
export function modellListe(liste) {
  const ok = (liste || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /^gemini-[\d.]+-flash/.test(n) && !/image|tts|live|audio|embedding|thinking/.test(n));
  const version = (n) => parseFloat(n.match(/^gemini-([\d.]+)/)[1]);
  const rang = (n) => (/preview|exp/.test(n) ? 0 : 2) + (/lite/.test(n) ? 0 : 1);
  return ok.sort((a, b) => rang(b) - rang(a) || version(b) - version(a) || a.length - b.length);
}

let ausweich = null; // weitere Modelle, falls das aktuelle nicht kann
const start = Date.now();
export const ZEIT_UM = () => Date.now() - start > 20 * 60000; // GitHub bricht nach 30 Min. ab – vorher speichern

async function naechstesModell(key, grund) {
  if (!ausweich) {
    const liste = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } }).then((r) => r.json()).catch(() => ({}));
    ausweich = modellListe(liste.models).filter((m) => m !== modell);
  }
  const neu = ausweich.shift();
  if (neu) { log(`${modell}: ${grund} – weiche auf ${neu} aus.`); modell = neu; }
  return !!neu;
}

async function gemini(cfg, parts, { temperature = 0 } = {}) {
  const roh = process.env.GEMINI_API_KEY;
  if (!roh || !roh.trim()) throw new SchluesselFehler('Der Gemini-Schlüssel fehlt (GitHub → Settings → Secrets and variables → Actions → GEMINI_API_KEY).');
  const key = roh.trim();
  modell ||= cfg.modell || 'gemini-2.5-flash';
  const body = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature, responseMimeType: 'application/json' } });
  let nochmal = 0;
  for (;;) {
    if (ZEIT_UM()) throw new Error('Zeit abgelaufen.');
    let res;
    try {
      res = await fetch(`${GEMINI}/models/${modell}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body, signal: AbortSignal.timeout(120000) });
    } catch (e) {
      if (nochmal++ < 1) { await sleep(5000); continue; }
      throw new Error('Verbindung zu Gemini fehlgeschlagen: ' + e.message);
    }
    const daten = await res.json().catch(() => ({}));
    const meldung = daten?.error?.message || '';
    if (res.status === 401 || res.status === 403 || /api key not valid/i.test(meldung)) {
      throw new SchluesselFehler(`Google lehnt den Gemini-Schlüssel ab (${res.status}: ${meldung.slice(0, 160) || 'ohne Begründung'}). Der Schlüssel hat ${key.length} Zeichen${/^AIza/.test(key) ? '' : ' und beginnt nicht mit „AIza“'}. Neuen Schlüssel auf aistudio.google.com/apikey erstellen und in GitHub als Secret GEMINI_API_KEY speichern.`);
    }
    if (res.status === 429 || res.status === 404 || res.status >= 500) {
      const grund = res.status === 429 ? 'Kontingent erschöpft' : res.status === 404 ? 'Modell gibt es nicht mehr' : 'überlastet';
      // Einmal kurz warten (nur bei Überlastung oder Minuten-Limit), dann lieber ein anderes Modell als das Kontingent leerzufragen.
      const tagesLimit = /per ?day|daily/i.test(meldung);
      if (res.status !== 404 && !tagesLimit && nochmal++ < 1) { log(`Gemini ${res.status} (${meldung.slice(0, 90)}), warte 20s ...`); await sleep(20000); continue; }
      nochmal = 0;
      if (await naechstesModell(key, `${grund} (${res.status})`)) continue;
      throw new KontingentFehler(`Gemini nimmt gerade nichts an (${res.status}: ${meldung.slice(0, 160) || grund}). Das kostenlose Kontingent ist vermutlich für heute aufgebraucht – morgen noch einmal „Run workflow“ starten.`);
    }
    if (!res.ok) throw new Error(`Gemini-Fehler ${res.status}: ${meldung || 'unbekannt'}`);
    const text = (daten.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    if (!text) throw new Error('Gemini hat nichts geantwortet (' + (daten.candidates?.[0]?.finishReason || 'kein Grund') + ').');
    return jsonLesen(text);
  }
}

const KATEGORIEN = ['Fleisch & Fisch', 'Milch & Käse', 'Eier', 'Obst', 'Gemüse', 'Brot & Backwaren', 'Nudeln, Reis & Getreide', 'Konserven & Saucen', 'Tiefkühl', 'Öl & Gewürze', 'Getränke', 'Snacks & Süßes', 'Sonstiges'];

export function lesePrompt(name, katalog) {
  return `Du siehst Seiten aus einem deutschen ${name}-Prospekt. Lies ALLE Lebensmittel-Angebote ab (inkl. Getränke). ` +
    'Ignoriere Non-Food (Kleidung, Technik, Deko, Haushalt, Kosmetik) komplett. Erfinde nichts: nur was lesbar auf der Seite steht.\n' +
    'Antworte NUR mit JSON: {"angebote":[{"seite":Zahl,"produkt":"Name inkl. Sorte","marke":"oder leer",' +
    '"menge":"wie aufgedruckt, z.B. Je 400 g / kg-Preis / Je Stück","menge_g":Zahl oder null (Gramm bzw. ml der Packung; bei kg-Preis 1000; bei Mehrfachpackungen gesamt; bei Stückware ohne Gewicht null),' +
    '"preis":Zahl in Euro (Preis OHNE Kundenkarte/App; wenn nur ein Preis da ist, dieser),"preis_mit_app":Zahl oder null (Preis mit Kundenkarte/App, z.B. „Mit Lidl Plus“),' +
    '"gueltig_ab":"wie im Seitenkopf, z.B. Mo. 12.10." oder leer,"kategorie":"eine von: ' + KATEGORIEN.join(' | ') + '",' +
    '"katalog_id":"ID aus der Liste unten, wenn das Angebot genau so ein Produkt ist und es im Rezept ersetzen kann – sonst leer"}]}\n' +
    'Wenn eine Seite keine Lebensmittel hat, liefere für sie nichts.\n\n' +
    'KATALOG (id: Produkt). Nur zuordnen, wenn es wirklich dasselbe Grundprodukt ist (z.B. „Frische Hähnchenbrustfilets XXL“ → haehnchenbrust; ' +
    'aber Fertiggerichte, panierte, marinierte oder gewürzte Varianten NICHT zuordnen):\n' +
    katalog.filter((a) => !a.basis).map((a) => `${a.id}: ${a.name}`).join('\n');
}

async function angeboteLesen(cfg, name, seiten, katalog) {
  const alle = [];
  const prompt = lesePrompt(name, katalog);
  const ids = new Set(katalog.map((a) => a.id));
  let fehler = 0, abbruch = '';
  const JE = 6; // wenige, größere Anfragen schonen das kostenlose Kontingent
  for (let i = 0; i < seiten.length; i += JE) {
    const gruppe = seiten.slice(i, i + JE);
    log(`${name}: lese Seiten ${gruppe.map((s) => s.nummer).join(', ')} mit ${modell || cfg.modell}`);
    const parts = [{ text: prompt }];
    for (const s of gruppe) {
      let bild;
      try { bild = await holen(s.ersatz || s.bild, 'bytes'); } catch { bild = await holen(s.bild, 'bytes'); }
      parts.push({ text: `Prospektseite ${s.nummer}:` }, { inline_data: { mime_type: 'image/jpeg', data: bild.toString('base64') } });
    }
    try {
      const antwort = await gemini(cfg, parts);
      for (const a of antwort.angebote || []) {
        if (!a || !a.produkt || !(Number(a.preis) > 0)) continue;
        if (a.katalog_id && !ids.has(a.katalog_id)) delete a.katalog_id;
        if (!a.katalog_id) delete a.katalog_id; // die App ordnet dann selbst per Stichwort zu
        alle.push(a);
      }
      log(`  ${alle.length} Angebote bisher`);
    } catch (e) {
      if (e instanceof SchluesselFehler) throw e; // weiterzumachen wäre sinnlos
      fehler++;
      log('  Seitengruppe übersprungen:', e.message);
      if (e instanceof KontingentFehler || ZEIT_UM()) { abbruch = e.message; break; } // behalten, was schon gelesen ist
    }
    await sleep(6000);
  }
  const gesehen = new Set();
  const liste = alle.filter((a) => { const k = (a.produkt + '|' + a.preis).toLowerCase(); if (gesehen.has(k)) return false; gesehen.add(k); return true; });
  if (liste.length < 5) throw new Error(abbruch || `Nur ${liste.length} Angebote erkannt${fehler ? ` (${fehler} Seitengruppen fehlgeschlagen)` : ''} – Prospekt vermutlich nicht lesbar.`);
  return liste;
}

// ---------------------------------------------------------------- Ablauf

async function main() {
  const cfg = JSON.parse(await readFile('config.json', 'utf8'));
  const katalog = JSON.parse(await readFile('daten/katalog.json', 'utf8')).artikel;
  let alt = {};
  try { alt = JSON.parse(await readFile('plan.json', 'utf8')); } catch {}
  const nurSeiten = process.argv.includes('--seiten');
  const jetzt = new Date().toISOString();
  const ergebnis = { version: 2, stand: jetzt, laeden: { ...(alt.version === 2 ? alt.laeden : {}) } };

  for (const id of cfg.laeden || ['lidl']) {
    const name = NAMEN[id] || id;
    const vorher = ergebnis.laeden[id] || {};
    try {
      if (!QUELLEN[id]) throw new Error(`Für ${name} gibt es noch keine automatische Prospekt-Quelle.`);
      const p = await QUELLEN[id](cfg);
      log(`${name}: ${p.seiten.length} Lebensmittelseiten (${p.seiten.map((s) => s.nummer).join(', ')})`);
      if (nurSeiten) continue;
      const angebote = await angeboteLesen(cfg, name, p.seiten, katalog);
      ergebnis.laeden[id] = { name, von: p.von, bis: p.bis, url: p.url, stand: jetzt, quelle: 'Prospekt, gelesen mit ' + modell, angebote };
      log(`${name}: ${angebote.length} Angebote, davon ${angebote.filter((a) => a.katalog_id).length} für Rezepte nutzbar`);
    } catch (e) {
      console.error(`FEHLER ${name}:`, e.message);
      // Alte Angebote behalten, solange sie noch gelten – nur den Fehler dazuschreiben.
      const nochGueltig = vorher.bis && vorher.bis >= datum(zielTag());
      ergebnis.laeden[id] = { name, ...(nochGueltig ? vorher : { angebote: [] }), fehler: e.message, fehler_zeit: jetzt };
    }
  }
  if (!nurSeiten) await writeFile('plan.json', JSON.stringify(ergebnis, null, 1) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
