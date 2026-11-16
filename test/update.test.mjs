import test from 'node:test';
import assert from 'node:assert/strict';
import { modellListe, zielTag, prospekteAusHtml, prospektWaehlen, lebensmittelSeiten, modellWaehlen, jsonLesen, lesePrompt } from '../update.mjs';

test('zielTag: sonntags die kommende Woche, sonst heute', () => {
  assert.equal(zielTag(new Date('2026-11-15T12:00:00Z')).toISOString().slice(0, 10), '2026-11-16');
  assert.equal(zielTag(new Date('2026-11-18T12:00:00Z')).toISOString().slice(0, 10), '2026-11-18');
});

test('Prospekt der laufenden Woche wird gewählt', () => {
  const html = 'x aktionsprospekt-16-11-2026-21-11-2026-225480 y aktionsprospekt-23-11-2026-28-11-2026-4b5a7d z aktionsprospekt-16-11-2026-21-11-2026-225480';
  const liste = prospekteAusHtml(html);
  assert.equal(liste.length, 2);
  assert.equal(prospektWaehlen(liste, new Date('2026-11-18T00:00:00Z')).id, 'aktionsprospekt-16-11-2026-21-11-2026-225480');
  assert.equal(prospektWaehlen(liste, new Date('2026-11-23T00:00:00Z')).id, 'aktionsprospekt-23-11-2026-28-11-2026-4b5a7d');
  assert.equal(prospektWaehlen(liste, new Date('2026-11-22T00:00:00Z')).id, 'aktionsprospekt-23-11-2026-28-11-2026-4b5a7d');
});

test('nur Lebensmittelseiten werden gelesen', () => {
  const seiten = [
    { number: 1, keyWords: 'Metzgerfrisch Frische Hähnchen Brustfilets Kg-Preis Rinder Hackfleisch Lachs', links: [{ displayType: 'recipe' }] },
    { number: 2, keyWords: 'Parkside Akku Werkzeug Winkelschleifer', links: [{ displayType: 'product' }, { displayType: 'product' }] },
    { number: 3, keyWords: 'Deutsche Möhren Kg Salat-Mix Gurken Äpfel Orangen', altText: 'Frisches Obst und Gemüse', links: [] },
  ];
  assert.deepEqual(lebensmittelSeiten(seiten).map((s) => s.number), [1, 3]);
});

test('Modell-Ersatz nimmt das neueste stabile Flash-Modell', () => {
  const m = (name, methoden = ['generateContent']) => ({ name: 'models/' + name, supportedGenerationMethods: methoden });
  assert.equal(modellWaehlen([m('gemini-2.5-flash'), m('gemini-3.0-flash-preview'), m('gemini-3.0-flash'), m('gemini-3.0-flash-lite'), m('gemini-3.0-pro'), m('gemini-3.5-flash-image'), m('text-embedding-004', ['embedContent'])]), 'gemini-3.0-flash');
  assert.equal(modellWaehlen([]), null);
});

test('jsonLesen verträgt Code-Zäune und Vorgeplänkel', () => {
  assert.deepEqual(jsonLesen('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(jsonLesen('Hier: {"a":[1,2]} fertig'), { a: [1, 2] });
});

test('Lese-Auftrag enthält den Katalog ohne Grundvorrat', () => {
  const p = lesePrompt('Lidl', [{ id: 'eier', name: 'Eier' }, { id: 'rapsoel', name: 'Rapsöl', basis: true }]);
  assert.ok(p.includes('eier: Eier') && !p.includes('rapsoel'));
});

test('Ausweichliste: stabile Modelle zuerst, Lite als Reserve', () => {
  const m = (name) => ({ name: 'models/' + name, supportedGenerationMethods: ['generateContent'] });
  assert.deepEqual(modellListe([m('gemini-2.5-flash-lite'), m('gemini-2.5-flash'), m('gemini-3.0-flash-preview'), m('gemini-3.0-flash'), m('gemini-3.0-pro'), m('gemini-2.5-flash-image')]),
    ['gemini-3.0-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.0-flash-preview']);
});
