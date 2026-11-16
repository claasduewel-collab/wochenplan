// Baut daten/rezepte.json aus den Quelldateien in werkzeug/rezepte/ und prüft alles.
//   node werkzeug/katalog-quelle.mjs && node werkzeug/bauen.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pruefen } from './pruefen.mjs';

const hier = new URL('./rezepte/', import.meta.url);
const katalog = JSON.parse(readFileSync(new URL('../daten/katalog.json', import.meta.url), 'utf8'));
const dateien = readdirSync(hier).filter((f) => f.endsWith('.json')).sort()
  .map((f) => ({ name: f, inhalt: JSON.parse(readFileSync(new URL(f, hier), 'utf8')) }));
for (const d of dateien) d.inhalt = { rezepte: d.inhalt.rezepte }; // neue Artikel gehören in katalog-quelle.mjs
const { fehler, anzahl } = pruefen(katalog, dateien);
for (const f of fehler) console.log('FEHLER', f);
if (fehler.length) process.exit(1);
const rezepte = dateien.flatMap((d) => d.inhalt.rezepte);
writeFileSync(new URL('../daten/rezepte.json', import.meta.url), '{"rezepte":[\n' + rezepte.map((r) => JSON.stringify(r)).join(',\n') + '\n]}\n');
console.log(anzahl, 'Rezepte geschrieben');
