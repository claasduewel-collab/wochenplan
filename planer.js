// Planungskern der Wochenplan-App. Reine Logik ohne DOM – läuft im Browser und in Node (Tests).
//
// Begriffe:
//   Artikel  = Produkt aus daten/katalog.json (Packungsgröße, Preis, Nährwerte je 100 g)
//   Rezept   = Zutaten in Gramm je Basisportion (daten/rezepte.json)
//   Plan     = je Mahlzeit eine Liste von Blöcken {r: Rezept-ID, n: Tage am Stück, fix: vom Nutzer gewählt}
//   Vorrat   = was zu Hause ist: {artikelId: Gramm}

export const MAHLZEITEN = [
  { id: 'fruehstueck', label: 'Frühstück', anteil: 0.2, tage: 4 },
  { id: 'snack', label: 'Snack', anteil: 0.1, tage: 4 },
  { id: 'mittag', label: 'Mittag', anteil: 0.32, tage: 3 },
  { id: 'abend', label: 'Abend', anteil: 0.38, tage: 2 },
];
export const GERAETE = [
  { id: 'airfryer', label: 'Heißluftfritteuse' },
  { id: 'ofen', label: 'Backofen' },
  { id: 'herd', label: 'Herd' },
  { id: 'mikrowelle', label: 'Mikrowelle' },
  { id: 'keins', label: 'Ohne Kochen' },
];
export const LAEDEN = [
  { id: 'lidl', name: 'Lidl', karte: 'Lidl Plus' },
  { id: 'aldi-nord', name: 'Aldi Nord' },
  { id: 'rewe', name: 'Rewe', karte: 'Rewe Bonus' },
  { id: 'edeka', name: 'Edeka', karte: 'Edeka-App' },
  { id: 'penny', name: 'Penny', karte: 'Penny-App' },
  { id: 'kaufland', name: 'Kaufland', karte: 'Kaufland Card' },
  { id: 'netto', name: 'Netto', karte: 'Netto-App' },
];

const lc = (s) => String(s ?? '').trim().toLowerCase();
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r2 = (x) => Math.round(x * 100) / 100;

// ------------------------------------------------------------------ Einstellungen

export function standardEinstellungen(cfg = {}) {
  const mz = {};
  for (const m of MAHLZEITEN) {
    const c = (cfg.mahlzeiten || []).find((x) => x.slot === m.id);
    mz[m.id] = { an: c ? c.an !== false : true, tage: (c && c.tage) || m.tage, kalt: c ? c.art === 'kalt' : false };
  }
  return {
    profile: cfg.profile || Array.from({ length: cfg.personen || 2 }, (_, i) => ({
      id: 'p' + (i + 1), name: i === 0 ? cfg.name || 'Ich' : 'Person ' + (i + 1), figur: FIGUREN[i % FIGUREN.length],
      geschlecht: 'm', alter: 30, groesse: 178, gewicht: 80, aktiv: 1.4, ziel: 'halten',
      manuell: !!cfg.ziele, ...(cfg.ziele || {}), extras: i === 0,
    })),
    extras: cfg.feste_extras || [],
    mahlzeiten: mz,
    tage: (cfg.tage || []).length || 7,
    tagNamen: cfg.tage || ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
    laden: cfg.laden || 'lidl',
    karte: cfg.kundenkarte !== false,
    kein_schwein: !!cfg.kein_schwein,
    vegetarisch: !!cfg.vegetarisch,
    mag_nicht: [...(cfg.mag_nicht || [])],
    mag_nicht_gerichte: [...(cfg.mag_nicht_gerichte || [])],
    favoriten: [],
    geraete: { airfryer: true, ofen: true, herd: true, mikrowelle: true, ...(cfg.geraete || {}) },
    airfryer_lieber: cfg.airfryer_lieber !== false,
  };
}

export const FIGUREN = ['karotte', 'ei', 'avocado', 'brokkoli', 'tomate', 'blaubeere'];
export const AKTIV = [[1.2, 'Kaum Bewegung (Bürojob)'], [1.4, 'Etwas Bewegung, 1–2× Sport'], [1.6, 'Aktiv, 3–4× Sport'], [1.8, 'Sehr aktiv, körperliche Arbeit']];
export const ZIELE = [['abnehmen', 'Abnehmen'], ['halten', 'Gewicht halten'], ['aufbauen', 'Muskeln aufbauen']];

/** Kalorien- und Makrobedarf aus Körperdaten (Mifflin-St Jeor). Richtwerte, keine medizinische Beratung. */
export function bedarfRechnen(p) {
  const w = Number(p.gewicht) || 75, h = Number(p.groesse) || 175, a = Number(p.alter) || 30;
  const grund = 10 * w + 6.25 * h - 5 * a + (p.geschlecht === 'w' ? -161 : 5);
  const umsatz = grund * (Number(p.aktiv) || 1.4);
  const kcal = Math.round(umsatz * (p.ziel === 'abnehmen' ? 0.8 : p.ziel === 'aufbauen' ? 1.1 : 1) / 10) * 10;
  const protein = Math.round(w * (p.ziel === 'halten' ? 1.6 : 2));
  const fett = Math.round(w * 0.9);
  const kh = Math.max(0, Math.round((kcal - protein * 4 - fett * 9) / 4));
  return { kcal, protein, fett, kh, grund: Math.round(grund), umsatz: Math.round(umsatz) };
}
export const zieleVon = (p) => (p.manuell
  ? { kcal: Number(p.kcal) || 2000, protein: Number(p.protein) || 120, fett: Number(p.fett) || 70, kh: Number(p.kh) || 200 }
  : bedarfRechnen(p));

export const aktiveSlots = (ein) => MAHLZEITEN.filter((m) => ein.mahlzeiten[m.id]?.an);

/** Teilt D Tage in Blöcke von höchstens w Tagen, möglichst gleich groß: (7,3) → [3,2,2]. */
export function teilen(D, w) {
  const n = Math.ceil(D / Math.max(1, w));
  const basis = Math.floor(D / n);
  const extra = D - basis * n;
  return Array.from({ length: n }, (_, i) => basis + (i < extra ? 1 : 0));
}

// ------------------------------------------------------------------ Angebote

/** Ordnet ein Prospekt-Angebot einem Katalog-Artikel zu (oder null). */
export function angebotFinden(artikelListe, angebot) {
  const byId = angebot.katalog_id && artikelListe.find((a) => a.id === angebot.katalog_id);
  if (byId) return byId.id;
  if (angebot.katalog_id === '') return null; // ausdrücklich „passt zu nichts“
  const text = lc(`${angebot.produkt || ''} ${angebot.marke || ''}`);
  let best = null, bestLen = 0;
  for (const a of artikelListe) {
    if (!a.suche) continue;
    if (a.nicht && new RegExp(a.nicht, 'i').test(text)) continue;
    for (const s of a.suche) {
      const m = text.match(new RegExp(s, 'i'));
      if (m && m[0].length > bestLen) { best = a.id; bestLen = m[0].length; }
    }
  }
  return best;
}

function angebotMenge(a, o) {
  if (Number(o.menge_g) > 0) return Number(o.menge_g);
  if (/kg-?preis|je kg|pro kg/i.test(o.menge || '')) return 1000;
  if (a.stk && /st[üu]ck|stk/i.test(o.menge || '')) return a.stk;
  return null;
}

// ------------------------------------------------------------------ Kontext

/**
 * Baut aus Stammdaten, Wochen-Angeboten, Einstellungen und Vorrat alles, was Planung und Anzeige brauchen.
 * stamm = {artikel:[…], rezepte:[…]}, woche = plan.json ({laeden:{lidl:{angebote:[…]}}, rezepte_extra, artikel_extra})
 */
export function kontext(stamm, woche, ein, vorrat = {}) {
  const kat = new Map();
  for (const a of [...(stamm.artikel || []), ...(woche?.artikel_extra || [])]) {
    kat.set(a.id, { ...a, optionen: [{ pack: a.pack, preis: a.preis }], g100: a.preis / a.pack * 100 });
  }
  const liste = [...kat.values()];
  const laden = woche?.laeden?.[ein.laden];
  const angebote = [];
  for (const o of laden?.angebote || []) {
    const id = angebotFinden(liste, o);
    const a = id && kat.get(id);
    const eintrag = { ...o, artikel: a ? a.id : null, genutzt: false };
    angebote.push(eintrag);
    if (!a || a.basis) continue;
    const menge = angebotMenge(a, o);
    const preis = Number(ein.karte && o.preis_mit_app ? o.preis_mit_app : o.preis);
    if (!menge || !(preis > 0)) continue;
    const g100 = preis / menge * 100;
    if (g100 >= a.g100 * 0.99) continue; // „Angebot“ ist nicht günstiger als der Normalpreis
    eintrag.guenstiger = Math.round((1 - g100 / a.g100) * 100);
    if (a.lose) {
      if (!a.angebot || g100 < a.optionen[0].preis / a.optionen[0].pack * 100) {
        a.optionen = [{ pack: 1000, preis: g100 * 10, angebot: eintrag }];
        a.angebot = eintrag;
      }
    } else {
      a.optionen.push({ pack: menge, preis, angebot: eintrag });
      a.angebot = eintrag;
    }
  }

  const nein = ein.mag_nicht.map(lc).filter(Boolean);
  const gesperrt = (a) => {
    const tags = a.tags || [];
    if (ein.kein_schwein && tags.includes('schwein')) return true;
    if (ein.vegetarisch && (tags.includes('fleisch') || tags.includes('fisch'))) return true;
    const name = lc(a.name);
    return nein.some((t) => name.includes(t) || lc(a.id).includes(t) || tags.includes(t));
  };
  const neinGericht = new Set(ein.mag_nicht_gerichte.map(lc));
  const rezepte = new Map();
  const alle = new Map();
  for (const r of [...(stamm.rezepte || []), ...(woche?.rezepte_extra || [])]) {
    if (!r.zutaten?.every(([id]) => kat.has(id))) continue;
    const grund =
      neinGericht.has(lc(r.id)) || neinGericht.has(lc(r.name)) ? 'abgewählt'
        : r.zutaten.some(([id]) => gesperrt(kat.get(id))) ? 'enthält etwas, das du nicht magst'
          : r.geraet.some((g) => g !== 'keins' && ein.geraete[g] === false) ? 'Gerät fehlt' : '';
    const rr = { ...r, gesperrt: grund };
    alle.set(r.id, rr);
    if (!grund) rezepte.set(r.id, rr);
  }

  const slots = aktiveSlots(ein);
  const summe = slots.reduce((s, m) => s + m.anteil, 0) || 1;
  const ex = (ein.extras || []).reduce((s, e) => [s[0] + (e.kcal || 0), s[1] + (e.protein || 0), s[2] + (e.fett || 0), s[3] + (e.kh || 0)], [0, 0, 0, 0]);
  const personen = ein.profile.map((p) => ({ ...p, z: zieleVon(p), ex: p.extras ? ex : [0, 0, 0, 0] }));
  const ziel = {};
  for (const p of personen) {
    ziel[p.id] = {};
    for (const m of slots) ziel[p.id][m.id] = { kcal: Math.max(0, p.z.kcal - p.ex[0]) * m.anteil / summe, protein: Math.max(0, p.z.protein - p.ex[1]) * m.anteil / summe };
  }
  return { ein, kat, rezepte, alle, angebote, laden: laden || null, vorrat, slots, ziel, personen, cache: new Map() };
}

export const naehrwerte = (ctx, zutaten) => {
  const n = [0, 0, 0, 0];
  for (const [id, g] of zutaten) { const a = ctx.kat.get(id); if (a) for (let i = 0; i < 4; i++) n[i] += a.n[i] * g / 100; }
  return n;
};

/** Passt ein Rezept an das Kalorien- und Proteinziel der Mahlzeit an. Liefert Zutaten je Portion. */
export function skaliert(ctx, r, slot, pid = ctx.personen[0]?.id) {
  const key = r.id + '|' + slot + '|' + pid;
  let hit = ctx.cache.get(key);
  if (hit) return hit;
  const z = ctx.ziel[pid]?.[slot] || { kcal: 0, protein: 0 };
  let Pk = 0, Pp = 0, Kk = 0, Kp = 0, Xk = 0, Xp = 0;
  for (const [id, g] of r.zutaten) {
    const a = ctx.kat.get(id);
    const k = a.n[0] * g / 100, p = a.n[1] * g / 100;
    if (a.rolle === 'p') { Pk += k; Pp += p; } else if (a.rolle === 'k') { Kk += k; Kp += p; } else { Xk += k; Xp += p; }
  }
  let a = 1, b = 1;
  const T = z.kcal - Xk, Tp = z.protein - Xp;
  if (z.kcal > 0) {
    if (Pk > 0 && Kk > 0) {
      const det = Pk * Kp - Kk * Pp;
      if (Math.abs(det) > 1e-6) { a = (T * Kp - Kk * Tp) / det; b = (Pk * Tp - T * Pp) / det; } else a = b = T / (Pk + Kk);
      a = clamp(a, 0.6, 2.2);
      b = clamp((T - a * Pk) / Kk, 0.35, 2.2);
    } else if (Pk > 0) a = clamp(T / Pk, 0.6, 2.2);
    else if (Kk > 0) b = clamp(T / Kk, 0.5, 2.2);
  }
  const kcal = Xk + a * Pk + b * Kk;
  const u = z.kcal > 0 && kcal > 0 ? clamp(z.kcal / kcal, 0.75, 1.5) : 1;
  const zutaten = r.zutaten.map(([id, g]) => {
    const art = ctx.kat.get(id);
    let m = g * u * (art.rolle === 'p' ? a : art.rolle === 'k' ? b : 1);
    m = Math.min(m, Math.max(g, art.max || (art.rolle === 'p' ? 350 : 600))); // keine absurden Portionen
    if (art.stk && art.stk <= 70 && g >= art.stk * 0.75) m = Math.max(1, Math.round(m / art.stk)) * art.stk; // Eier, Scheiben, Wraps: ganze Stücke
    else m = Math.max(5, Math.round(m / 5) * 5);
    return [id, m];
  });
  hit = { z: zutaten, n: naehrwerte(ctx, zutaten) };
  ctx.cache.set(key, hit);
  return hit;
}

// ------------------------------------------------------------------ Einkauf einer Zutat

/**
 * Welche Packungen kaufen, um q Gramm zu decken? Rundet auf ganze Packungen:
 * wenig zu viel bei Frischem → wird mit verkocht („aufbrauchen“), wenig zu wenig → Rezept nimmt etwas weniger.
 */
export function kauf(a, q) {
  const leer = { packs: [], kosten: 0, nutz: 0, rest: 0, effektiv: 0, normal: 0 };
  if (!(q > 0) || a.basis) return leer;
  if (a.lose) {
    const o = a.optionen[0];
    const kosten = q * o.preis / o.pack;
    return { packs: [{ lose: true, g: q, pack: o.pack, preis: kosten, n: 1, angebot: o.angebot }], kosten, nutz: q, rest: 0, effektiv: kosten, normal: q * a.g100 / 100 };
  }
  const opts = a.optionen;
  const frisch = a.halt === 'frisch';
  const ganz = a.stk && a.stk <= 70; // Stückware wird nicht umgerechnet
  let best = null;
  const zaehler = opts.map(() => 0);
  const probier = (i) => {
    if (i === opts.length) {
      let T = 0, kosten = 0;
      for (let j = 0; j < opts.length; j++) { T += zaehler[j] * opts[j].pack; kosten += zaehler[j] * opts[j].preis; }
      if (T <= 0 || T < q * (ganz ? 1 : 0.88)) return;
      for (let j = 0; j < opts.length; j++) if (zaehler[j] && T - opts[j].pack >= q) return; // eine Packung zu viel
      let nutz = q, rest = T - q;
      if (T < q) { nutz = T; rest = 0; } else if (frisch && !ganz && rest <= 0.3 * q) { nutz = T; rest = 0; }
      const jeG = kosten / T;
      const effektiv = frisch ? kosten + rest * jeG * 0.5 : kosten - 0.7 * rest * jeG;
      const obj = effektiv + 0.1 * kosten * Math.abs(nutz - q) / q;
      if (!best || obj < best.obj) {
        best = { obj, kosten, nutz, rest, effektiv, packs: opts.map((o, j) => ({ ...o, n: zaehler[j] })).filter((p) => p.n) };
      }
      return;
    }
    const max = Math.min(12, Math.ceil(q * 1.35 / opts[i].pack) + 1);
    for (let n = 0; n <= max; n++) { zaehler[i] = n; probier(i + 1); }
    zaehler[i] = 0;
  };
  probier(0);
  if (!best) return leer;
  best.normal = best.packs.reduce((s, p) => s + p.n * p.pack, 0) * a.g100 / 100;
  return best;
}

// ------------------------------------------------------------------ Plan auswerten

const hauptProtein = (ctx, r) => {
  let best = null, max = 0;
  for (const [id, g] of r.zutaten) { const p = ctx.kat.get(id).n[1] * g; if (p > max) { max = p; best = id; } }
  return best;
};

function zufall(seed) { // mulberry32
  let t = seed >>> 0;
  return () => { t = (t + 0x6d2b79f5) >>> 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/**
 * Rechnet einen Plan durch: Portionen, Einkauf, Kosten, Reste, Nährwerte je Tag, Hinweise und eine Bewertung.
 * zustand = {wer: {'mittag:3': ['p1']} (wer an dem Tag mitisst; fehlt = alle, [] = niemand),
 *            fertig: {'mittag:0': true} (Block ab Tag 0 schon gekocht), seed, letzte: [Rezept-IDs der Vorwoche]}
 */
export function auswerten(ctx, plan, zustand = {}) {
  const { ein, kat } = ctx;
  const leute = ctx.personen, P = leute.length || 1, D = ein.tage;
  const wer = zustand.wer || {}, fertig = zustand.fertig || {};
  const alleIds = leute.map((p) => p.id);
  const esserAm = (slot, d) => { const w = wer[slot + ':' + d]; return w ? w.filter((id) => alleIds.includes(id)) : alleIds; };
  const bloecke = [];
  for (const s of ctx.slots) {
    let tag = 0;
    (plan[s.id] || []).forEach((b, i) => {
      const r = b.r ? ctx.alle.get(b.r) : null;
      const tage = [], mal = new Map();
      for (let d = tag; d < tag + b.n; d++) {
        const e = esserAm(s.id, d);
        if (e.length) tage.push(d);
        for (const id of e) mal.set(id, (mal.get(id) || 0) + 1);
      }
      const sk = new Map();
      if (r) for (const id of mal.keys()) sk.set(id, skaliert(ctx, r, s.id, id));
      bloecke.push({ slot: s.id, i, start: tag, n: b.n, tage, mal, r, fix: !!b.fix, fertig: !!fertig[s.id + ':' + tag], portionen: [...mal.values()].reduce((x, y) => x + y, 0), sk, hinweise: [] });
      tag += b.n;
    });
  }

  const bedarf = new Map();
  for (const b of bloecke) {
    if (!b.r || !b.portionen) continue;
    b.gesamt = new Map(); // Zutat → Gramm für alle Esser und Tage des Blocks
    for (const [pid, n] of b.mal) for (const [id, g] of b.sk.get(pid).z) b.gesamt.set(id, (b.gesamt.get(id) || 0) + g * n);
    if (b.fertig) continue;
    for (const [id, g] of b.gesamt) {
      const e = bedarf.get(id) || { g: 0, von: [] };
      e.g += g;
      if (!e.von.includes(b.r.name)) e.von.push(b.r.name);
      bedarf.set(id, e);
    }
  }

  const einkauf = [], ausVorrat = [], reste = [], faktor = new Map();
  let kosten = 0, effektiv = 0, ersparnis = 0;
  for (const [id, e] of bedarf) {
    const a = kat.get(id);
    if (a.basis) continue;
    const da = Math.max(0, ctx.vorrat[id] || 0);
    const fehlt = Math.max(0, e.g - da);
    const k = kauf(a, fehlt);
    const aufbrauchen = a.halt === 'frisch' && !(a.stk && a.stk <= 70) && da > e.g && da - e.g <= 0.3 * e.g;
    faktor.set(id, aufbrauchen ? da / e.g : (Math.min(da, e.g) + k.nutz) / e.g);
    if (da > 0) ausVorrat.push({ a, g: aufbrauchen ? da : Math.min(da, e.g), bleibt: aufbrauchen ? 0 : Math.max(0, da - e.g) });
    if (fehlt > 0) {
      einkauf.push({ a, bedarf: e.g, vorrat: da, fehlt, ...k, von: e.von, angebot: k.packs.some((p) => p.angebot) });
      kosten += k.kosten; effektiv += k.effektiv;
      for (const p of k.packs) if (p.angebot) ersparnis += Math.max(0, (p.lose ? p.g : p.n * p.pack) * a.g100 / 100 - (p.lose ? p.preis : p.n * p.preis));
      if (k.rest > 0) reste.push({ a, g: k.rest, frisch: a.halt === 'frisch', wert: k.rest * k.kosten / (k.rest + k.nutz) });
    }
  }
  // Frisches aus dem Vorrat, das der Plan nicht aufbraucht, zählt als drohender Rest
  let verfall = 0;
  for (const [id, g] of Object.entries(ctx.vorrat)) {
    const a = kat.get(id);
    if (!a || a.halt !== 'frisch' || !(g > 0)) continue;
    const uebrig = g - (bedarf.get(id)?.g || 0) * (faktor.get(id) ?? 1);
    if (uebrig > a.pack * 0.1) verfall += uebrig * a.g100 / 100;
  }

  // Nährwerte je Portion mit den tatsächlichen (auf Packungen gerundeten) Mengen
  for (const b of bloecke) {
    if (!b.r) continue;
    const f = (id) => (b.fertig ? 1 : faktor.get(id) ?? 1);
    b.zP = new Map(); b.nwP = new Map(); // je Person: Zutaten und Nährwerte einer Portion
    for (const [pid, sk] of b.sk) {
      const z = sk.z.map(([id, g]) => [id, g * f(id)]);
      b.zP.set(pid, z); b.nwP.set(pid, naehrwerte(ctx, z));
    }
    b.menge = new Map([...(b.gesamt || [])].map(([id, g]) => [id, g * f(id)]));
    const erster = b.zP.keys().next().value;
    b.z = erster ? b.zP.get(erster) : skaliert(ctx, b.r, b.slot).z;
    b.nw = erster ? b.nwP.get(erster) : naehrwerte(ctx, b.z);
    if (!b.portionen || b.fertig) continue;
    for (const [id] of b.z) {
      const a = kat.get(id);
      if (a.halt !== 'frisch' || (ctx.vorrat[id] || 0) > 0) continue;
      if (a.tage <= b.start) {
        if (a.kat === 'Fleisch & Fisch') b.hinweise.push({ art: 'frost', text: `${a.name} nach dem Einkauf einfrieren und am Vortag auftauen.` });
        else b.hinweise.push({ art: 'spaet', text: `${a.name} besser erst kurz vorher frisch kaufen.` });
      }
    }
    const haelt = b.r.haelt || 3;
    if (b.tage.length > haelt) {
      const runden = Math.ceil(b.tage.length / haelt);
      b.hinweise.push({ art: 'lang', text: haelt === 1 ? 'Jeden Tag frisch zubereiten – geht schnell, hält aber nicht bis morgen.'
        : (b.r.tags || []).includes('einfrierbar') ? `Hält ${haelt} Tage im Kühlschrank – den Rest einfrieren.` : `Hält ${haelt} Tage – in ${runden} Runden zubereiten.` });
    }
  }

  const tage = [];
  for (let d = 0; d < D; d++) {
    const nP = new Map(), slots = {};
    for (const b of bloecke) {
      if (!b.r || !b.tage.includes(d)) continue;
      slots[b.slot] = b;
      for (const pid of esserAm(b.slot, d)) {
        if (!nP.has(pid)) nP.set(pid, [...leute.find((p) => p.id === pid).ex]);
        const n = nP.get(pid), nw = b.nwP.get(pid);
        for (let i = 0; i < 4; i++) n[i] += nw[i];
      }
    }
    tage.push({ d, slots, nP });
  }

  // Bewertung (kleiner = besser)
  const U = P;
  let strafe = 0;
  for (const t of tage) {
    for (const [pid, n] of t.nP) {
      const z = leute.find((p) => p.id === pid).z;
      const anteil = Object.keys(t.slots).length / ctx.slots.length; // Teil-Tage (nur einzelne Mahlzeiten) fair bewerten
      strafe += Math.max(0, z.protein * anteil - n[1]) * 0.02;
      if (anteil === 1) strafe += Math.max(0, Math.abs(n[0] - z.kcal) / z.kcal - 0.07) * 4;
      if (z.fett) strafe += Math.max(0, n[2] - z.fett * 1.15) * 0.03;
      if (z.kh && anteil === 1) strafe += Math.max(0, z.kh * 0.7 - n[3]) * 0.01;
    }
  }
  const gesehen = new Map();
  const rnd = (id) => (hash(String(zustand.seed || 0) + id) % 1000) / 1000;
  const letzte = new Set(zustand.letzte || []);
  for (const b of bloecke) {
    if (!b.r || !b.portionen) continue;
    const hp = hauptProtein(ctx, b.r);
    for (const [slot, id] of gesehen.get(hp) || []) strafe += (slot === b.slot ? 1.5 : 0.6) * U;
    for (const liste of gesehen.values()) for (const [, id] of liste) if (id === b.r.id) strafe += 6 * U;
    gesehen.set(hp, [...(gesehen.get(hp) || []), [b.slot, b.r.id]]);
    strafe += rnd(b.r.id) * 0.8 * U;
    if (ein.favoriten.includes(b.r.id)) strafe -= 1.5 * U;
    if (letzte.has(b.r.id)) strafe += 1.5 * U;
    if (ein.airfryer_lieber && ein.geraete.airfryer && b.r.geraet.includes('airfryer')) strafe -= 0.4 * U;
    for (const h of b.hinweise) strafe += (h.art === 'frost' ? 0.3 : h.art === 'spaet' ? 1 : 0.6) * U;
  }
  // Abwechslung: nicht die ganze Woche dieselbe Proteinquelle (z. B. 80 Eier)
  for (const [id, e] of bedarf) {
    const a = kat.get(id);
    if (a.rolle !== 'p') continue;
    const grenze = (a.id === 'eier' ? 500 : 700) * (D / 7);
    strafe += Math.max(0, e.g / P - grenze) / 100 * 0.8 * P;
  }
  const score = effektiv + verfall + strafe - ersparnis; // Angebote zählen doppelt

  const portionen = bloecke.reduce((s, b) => s + (b.r && !b.fertig ? b.portionen : 0), 0);
  return {
    bloecke, tage, einkauf, ausVorrat, reste, kosten: r2(kosten), ersparnis: r2(ersparnis), score, portionen,
    resteFrisch: reste.filter((x) => x.frisch), resteLang: reste.filter((x) => !x.frisch),
  };
}

// ------------------------------------------------------------------ Planen

export function kandidaten(ctx, slot) {
  const kalt = ctx.ein.mahlzeiten[slot]?.kalt;
  return [...ctx.rezepte.values()].filter((r) => r.mahlzeit.includes(slot) && (!kalt || (r.tags || []).includes('kalt')));
}

/**
 * Sucht einen günstigen Wochenplan: wenig Kosten, wenig Reste, genug Protein, Abwechslung.
 * `alt` = bisheriger Plan; Blöcke mit fix:true bleiben stehen.
 */
export function planen(ctx, zustand = {}, alt = null) {
  const { ein } = ctx;
  const rng = zufall(hash('plan' + (zustand.seed || 0)));
  const pools = {}, geruest = {};
  for (const s of ctx.slots) {
    pools[s.id] = kandidaten(ctx, s.id);
    const vorhanden = !zustand.neuStruktur && alt?.[s.id]?.length && alt[s.id].reduce((x, b) => x + b.n, 0) === ein.tage;
    const groessen = vorhanden ? alt[s.id].map((b) => b.n) : teilen(ein.tage, ein.mahlzeiten[s.id].tage);
    geruest[s.id] = groessen.map((n, i) => {
      const a = alt?.[s.id]?.[i];
      return a && a.fix && a.n === n && (a.r === null || ctx.rezepte.has(a.r)) ? { ...a } : { r: null, n, fix: false };
    });
  }
  const frei = [];
  for (const s of ctx.slots) geruest[s.id].forEach((b, i) => { if (!b.fix && pools[s.id].length) frei.push([s.id, i]); });
  const kopie = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.map((b) => ({ ...b }))]));
  const wert = (p) => auswerten(ctx, p, zustand).score;

  let best = null, bestScore = Infinity;
  const runden = frei.length ? 4 : 1;
  for (let lauf = 0; lauf < runden; lauf++) {
    const p = kopie(geruest);
    const benutzt = new Set(Object.values(p).flat().map((b) => b.r).filter(Boolean));
    for (const [s, i] of frei) {
      const pool = pools[s].filter((r) => !benutzt.has(r.id));
      const r = (pool.length ? pool : pools[s])[Math.floor(rng() * (pool.length || pools[s].length))];
      p[s][i].r = r.id; benutzt.add(r.id);
    }
    let score = wert(p), besser = true, durchgang = 0;
    while (besser && durchgang++ < 3) {
      besser = false;
      for (const [s, i] of frei) {
        const vorher = p[s][i].r;
        let lokal = vorher, lokalScore = score;
        for (const r of pools[s]) {
          if (r.id === vorher) continue;
          p[s][i].r = r.id;
          const sc = wert(p);
          if (sc < lokalScore - 1e-9) { lokal = r.id; lokalScore = sc; }
        }
        p[s][i].r = lokal;
        if (lokal !== vorher) { score = lokalScore; besser = true; }
      }
    }
    if (score < bestScore) { bestScore = score; best = kopie(p); }
  }
  return best || geruest;
}

/** Alternativen für einen Block, beste zuerst – mit Preisunterschied zum aktuellen Gericht. */
export function alternativen(ctx, plan, slot, i, zustand = {}) {
  const basis = auswerten(ctx, plan, zustand);
  const imPlan = new Set(Object.values(plan).flat().map((b) => b.r));
  const liste = [];
  for (const r of kandidaten(ctx, slot)) {
    if (imPlan.has(r.id) && plan[slot][i].r !== r.id) continue;
    const p = { ...plan, [slot]: plan[slot].map((b, j) => (j === i ? { ...b, r: r.id } : b)) };
    const e = auswerten(ctx, p, zustand);
    const b = e.bloecke.find((x) => x.slot === slot && x.i === i);
    liste.push({
      r, aktuell: plan[slot][i].r === r.id, score: e.score, kosten: r2(e.kosten - basis.kosten), nw: b.nw,
      angebote: r.zutaten.map(([id]) => ctx.kat.get(id)).filter((a) => a.angebot).map((a) => a.name),
      vorrat: r.zutaten.map(([id]) => ctx.kat.get(id)).filter((a) => !a.basis && (ctx.vorrat[a.id] || 0) > 0).map((a) => a.name),
      resteFrisch: e.resteFrisch.length,
    });
  }
  return liste.sort((x, y) => x.score - y.score);
}

/** Macht aus Tag d einen eigenen Block (für „nur diese eine Mahlzeit“). Liefert dessen Index. */
export function blockTeilen(plan, slot, d) {
  const neu = [];
  let tag = 0, idx = -1;
  for (const b of plan[slot]) {
    if (d >= tag && d < tag + b.n) {
      if (d > tag) neu.push({ ...b, n: d - tag });
      idx = neu.length;
      neu.push({ ...b, n: 1 });
      if (d < tag + b.n - 1) neu.push({ ...b, n: tag + b.n - 1 - d });
    } else neu.push(b);
    tag += b.n;
  }
  plan[slot] = neu;
  return idx;
}

// ------------------------------------------------------------------ Anzeige-Helfer

const MEHRZAHL = { Ei: 'Eier', Scheibe: 'Scheiben', Wrap: 'Wraps', Waffel: 'Waffeln', Gurke: 'Gurken', Tomate: 'Tomaten', Zwiebel: 'Zwiebeln', Avocado: 'Avocados', Banane: 'Bananen', Apfel: 'Äpfel', Birne: 'Birnen', Orange: 'Orangen', Mandarine: 'Mandarinen' };
export const gramm = (g) => (g >= 1000 ? (Math.round(g / 10) / 100).toLocaleString('de-DE') + ' kg' : (g < 20 ? Math.round(g) : Math.round(g / 5) * 5) + ' g');

/** "2 Eier", "1½ Paprika (250 g)", "180 g" */
export function mengeText(a, g) {
  if (!a.stk) return gramm(g);
  const n = Math.round(g / a.stk * 2) / 2;
  if (n < 0.5) return gramm(g);
  const zahl = Number.isInteger(n) ? String(n) : (Math.floor(n) || '') + '½';
  const wort = n > 1 ? MEHRZAHL[a.stkName] || a.stkName : a.stkName;
  return a.stk <= 70 ? `${zahl} ${wort}` : `${zahl} ${wort} (${gramm(g)})`;
}

/** Vorrats-Status für die Anzeige. */
export function vorratStatus(a, g, bedarf = 0) {
  if (!(g > 0)) return 'leer';
  if (g < bedarf) return 'knapp';
  if (g < a.pack * 0.25) return 'wenig';
  return 'da';
}

/** Montag der Woche als YYYY-MM-DD (lokale Zeit). */
export function wochenStart(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
