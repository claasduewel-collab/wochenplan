// node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../planer.js';

const j = (f) => JSON.parse(readFileSync(new URL('../' + f, import.meta.url), 'utf8'));
const stamm = { artikel: j('daten/katalog.json').artikel, rezepte: j('daten/rezepte.json').rezepte };
const cfg = j('config.json');
const woche = { laeden: { lidl: { angebote: [
  { produkt: 'Frische Hähnchenbrustfilets XXL', marke: 'Metzgerfrisch', menge: 'Je 1,5 kg', menge_g: 1500, preis: 12.99, preis_mit_app: null },
  { produkt: 'Frisches Rinder-Hackfleisch XXL', menge_g: 1000, preis: 9.49, preis_mit_app: 8.69 },
  { produkt: 'Thunfisch-Salat', marke: 'Saupiquet', menge_g: 320, preis: 3.99 },
  { produkt: 'Gurken, lose', menge: 'Je Stück', menge_g: null, preis: 0.55 },
] } } };
const bau = (aendern = {}, vorrat = {}) => P.kontext(stamm, woche, { ...P.standardEinstellungen(cfg), ...aendern }, vorrat);

test('teilen verteilt Tage gleichmäßig', () => {
  assert.deepEqual(P.teilen(7, 3), [3, 2, 2]);
  assert.deepEqual(P.teilen(7, 2), [2, 2, 2, 1]);
  assert.deepEqual(P.teilen(7, 4), [4, 3]);
  assert.deepEqual(P.teilen(7, 1), [1, 1, 1, 1, 1, 1, 1]);
});

test('Angebote werden dem richtigen Artikel zugeordnet', () => {
  const ctx = bau();
  const zu = Object.fromEntries(ctx.angebote.map((o) => [o.produkt, o.artikel]));
  assert.equal(zu['Frische Hähnchenbrustfilets XXL'], 'haehnchenbrust');
  assert.equal(zu['Frisches Rinder-Hackfleisch XXL'], 'rinderhack');
  assert.equal(zu['Thunfisch-Salat'], null, 'Fertigsalat ist kein Dosenthunfisch');
  assert.equal(zu['Gurken, lose'], 'gurke');
  assert.equal(ctx.kat.get('haehnchenbrust').optionen.length, 2);
  assert.equal(ctx.kat.get('rinderhack').optionen[1].preis, 8.69, 'Preis mit Kundenkarte');
  assert.equal(bau({ karte: false }).kat.get('rinderhack').optionen[1].preis, 9.49);
  assert.equal(ctx.kat.get('gurke').optionen[1].pack, 400, 'Stückpreis gilt für eine Gurke');
});

test('kauf rundet auf Packungen: Frisches wird aufgebraucht, knapp zu wenig wird gekürzt', () => {
  const a = { halt: 'frisch', g100: 1, optionen: [{ pack: 500, preis: 5 }] };
  assert.deepEqual([P.kauf(a, 450).nutz, P.kauf(a, 450).rest], [500, 0]);      // 50 g mehr verkochen
  assert.deepEqual([P.kauf(a, 540).nutz, P.kauf(a, 540).packs[0].n], [500, 1]); // 40 g weniger statt 2. Packung
  const k = P.kauf(a, 700);
  assert.deepEqual([k.packs[0].n, k.nutz, k.rest], [2, 700, 300]);               // echter Rest
  const lang = { halt: 'lang', g100: 1, optionen: [{ pack: 1000, preis: 2 }] };
  assert.deepEqual([P.kauf(lang, 300).nutz, P.kauf(lang, 300).rest], [300, 700]);
  const lose = { lose: true, g100: 0.2, optionen: [{ pack: 1000, preis: 2 }] };
  assert.equal(P.kauf(lose, 250).kosten, 0.5);
  assert.equal(P.kauf({ basis: true, optionen: [] }, 100).kosten, 0);
});

test('kauf nimmt das Angebot, wenn es sich lohnt', () => {
  const ctx = bau();
  const h = ctx.kat.get('haehnchenbrust');
  assert.equal(P.kauf(h, 1500).packs[0].pack, 1500);
  assert.equal(P.kauf(h, 500).packs[0].pack, 600, 'für wenig Bedarf die kleine Packung');
});

test('skaliert trifft das Kalorienziel der Mahlzeit ungefähr', () => {
  const ctx = bau();
  let ok = 0, n = 0;
  for (const r of ctx.rezepte.values()) for (const m of r.mahlzeit) {
    const s = P.skaliert(ctx, r, m); n++;
    if (Math.abs(s.n[0] - ctx.ziel.p1[m].kcal) / ctx.ziel.p1[m].kcal < 0.2) ok++;
  }
  assert.ok(ok / n > 0.85, `${ok}/${n} Rezepte im Rahmen`);
});

test('planen: vollständig, stabil, ohne Abgewähltes, ohne doppelte Gerichte', () => {
  const ctx = bau();
  const plan = P.planen(ctx, { seed: 3 });
  assert.deepEqual(plan, P.planen(bau(), { seed: 3 }), 'gleicher Seed → gleicher Plan');
  const ids = Object.values(plan).flat().map((b) => b.r);
  assert.ok(ids.every(Boolean));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) for (const [z] of ctx.alle.get(id).zutaten) {
    const a = ctx.kat.get(z);
    assert.ok(!(a.tags || []).includes('schwein'), 'kein Schwein');
    assert.ok(!['thunfisch', 'skyr', 'magerquark', 'champignons', 'kidneybohnen', 'garnelen', 'suesskartoffeln'].includes(z), z);
  }
  for (const b of plan.mittag) assert.ok(ctx.alle.get(b.r).tags.includes('kalt'), 'Mittag kalt');
  const e = P.auswerten(ctx, plan, { seed: 3 });
  assert.ok(e.kosten > 20 && e.kosten < 200);
  for (const t of e.tage) for (const [pid, n] of t.nP) {
    const z = ctx.personen.find((p) => p.id === pid).z;
    assert.ok(Math.abs(n[0] - z.kcal) / z.kcal < 0.15, 'Tageskalorien ' + Math.round(n[0]));
  }
});

test('gewählte Gerichte bleiben beim Neuplanen stehen', () => {
  const ctx = bau();
  const plan = P.planen(ctx, { seed: 1 });
  const wunsch = P.kandidaten(ctx, 'abend').find((r) => !Object.values(plan).flat().some((b) => b.r === r.id)).id;
  plan.abend[1] = { ...plan.abend[1], r: wunsch, fix: true };
  assert.equal(P.planen(ctx, { seed: 2 }, plan).abend[1].r, wunsch);
});

test('Vorrat senkt den Einkauf, mehr Personen erhöhen ihn', () => {
  const plan = P.planen(bau(), { seed: 1 });
  const ohne = P.auswerten(bau(), plan, { seed: 1 });
  const erster = ohne.einkauf[0];
  const mit = P.auswerten(bau({}, { [erster.a.id]: erster.bedarf * 2 }), plan, { seed: 1 });
  assert.ok(mit.kosten < ohne.kosten);
  assert.ok(!mit.einkauf.some((x) => x.a.id === erster.a.id));
  const std = P.standardEinstellungen(cfg);
  const vier = [...std.profile, ...std.profile.map((p, i) => ({ ...p, id: 'x' + i }))];
  assert.ok(P.auswerten(bau({ profile: vier }), plan, { seed: 1 }).kosten > ohne.kosten * 1.5);
});

test('Tag auslassen und "zubereitet" verringern den Bedarf', () => {
  const ctx = bau();
  const plan = P.planen(ctx, { seed: 1 });
  const voll = P.auswerten(ctx, plan, {});
  assert.ok(P.auswerten(ctx, plan, { wer: { 'abend:0': [], 'abend:1': [] } }).portionen < voll.portionen);
  assert.equal(P.auswerten(ctx, plan, { wer: { 'abend:0': ['p1'] } }).portionen, voll.portionen - 1, 'nur eine Person isst mit');
  assert.ok(P.auswerten(ctx, plan, { fertig: { 'abend:0': true } }).portionen < voll.portionen);
});

test('alternativen liefert sortierte Vorschläge mit Preisunterschied', () => {
  const ctx = bau();
  const plan = P.planen(ctx, { seed: 1 });
  const alt = P.alternativen(ctx, plan, 'abend', 0, { seed: 1 });
  assert.ok(alt.length > 10);
  assert.ok(alt.some((x) => x.aktuell && x.kosten === 0));
  for (let i = 1; i < alt.length; i++) assert.ok(alt[i - 1].score <= alt[i].score);
});

test('Bedarf aus Körperdaten und eigene Ziele je Person', () => {
  const b = P.bedarfRechnen({ geschlecht: 'm', alter: 30, groesse: 180, gewicht: 80, aktiv: 1.4, ziel: 'halten' });
  assert.equal(b.grund, 1780);            // 10*80 + 6.25*180 - 5*30 + 5
  assert.equal(b.kcal, 2490);
  assert.equal(b.protein, 128);
  assert.ok(P.bedarfRechnen({ geschlecht: 'w', alter: 30, groesse: 165, gewicht: 60, aktiv: 1.4, ziel: 'abnehmen' }).kcal < 1600);
  const std = P.standardEinstellungen(cfg);
  const klein = { ...std.profile[1], manuell: false, geschlecht: 'w', gewicht: 58, groesse: 165, ziel: 'abnehmen' };
  const ctx = bau({ profile: [std.profile[0], klein] });
  const plan = P.planen(ctx, { seed: 1 });
  const e = P.auswerten(ctx, plan, { seed: 1 });
  const bl = e.bloecke.find((x) => x.slot === 'abend');
  assert.ok(bl.nwP.get('p2')[0] < bl.nwP.get('p1')[0] * 0.85, 'kleinere Portion für Person 2');
});

test('eine einzelne Mahlzeit lässt sich aus einem Block herauslösen', () => {
  const ctx = bau();
  const plan = P.planen(ctx, { seed: 1 });
  const vorher = plan.mittag.map((b) => b.n);
  const i = P.blockTeilen(plan, 'mittag', 1);
  assert.deepEqual(vorher, [3, 2, 2]);
  assert.deepEqual(plan.mittag.map((b) => b.n), [1, 1, 1, 2, 2]);
  assert.equal(i, 1);
  assert.deepEqual(P.planen(ctx, { seed: 2 }, plan).mittag.map((b) => b.n), [1, 1, 1, 2, 2], 'Aufteilung bleibt');
  assert.deepEqual(P.planen(ctx, { seed: 2, neuStruktur: true }, plan).mittag.map((b) => b.n), [3, 2, 2]);
});

test('Abneigungen als Schalter sperren die passenden Rezepte', () => {
  const std = P.standardEinstellungen(cfg);
  assert.ok(std.nein_gruppen.includes('pilze') && std.nein_gruppen.includes('thunfisch'), 'aus config.json übernommen');
  const ohne = bau({ nein_gruppen: [], mag_nicht: [] });
  const mit = bau({ nein_gruppen: ['linsen', 'fisch'], mag_nicht: [] });
  assert.ok(mit.rezepte.size < ohne.rezepte.size);
  for (const r of mit.rezepte.values()) for (const [id] of r.zutaten) {
    assert.ok(!/linsen/.test(id) && !(mit.kat.get(id).tags || []).includes('fisch'), r.id + ' enthält ' + id);
  }
});
