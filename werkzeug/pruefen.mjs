// Prüft Rezeptdateien gegen den Katalog.
//   node werkzeug/pruefen.mjs daten/rezepte.json            (oder mehrere Dateien)
// Endet mit Code 1, wenn Fehler gefunden wurden.
import { readFileSync } from 'node:fs';

const MAHLZEITEN = ['fruehstueck', 'snack', 'mittag', 'abend'];
const GERAETE = ['herd', 'ofen', 'airfryer', 'mikrowelle', 'keins'];
const TAGS = ['meal-prep', 'vorabend', 'mitnehmen', 'kalt', 'schnell', 'einfrierbar'];
// kcal-Spanne und Mindest-Protein je Basisportion
const RAHMEN = {
  fruehstueck: { kcal: [250, 600], protein: 20 },
  snack: { kcal: [90, 350], protein: 8 },
  mittag: { kcal: [400, 800], protein: 30 },
  abend: { kcal: [450, 850], protein: 35 },
};

export function pruefen(katalog, dateien) {
  const artikel = new Map(katalog.artikel.map((a) => [a.id, a]));
  const fehler = [];
  const ids = new Set();
  const zeilen = [];
  for (const { name, inhalt } of dateien) {
    for (const a of inhalt.artikel_neu || []) {
      if (!a.id || !a.name || !a.kat || !(a.pack > 0) || !(a.preis > 0) || !Array.isArray(a.n) || a.n.length !== 4 || !['frisch', 'lang'].includes(a.halt)) {
        fehler.push(`${name}: artikel_neu "${a.id}" unvollständig (id, name, kat, pack, preis, n[4], halt)`);
        continue;
      }
      if (a.halt === 'frisch' && !(a.tage > 0)) fehler.push(`${name}: artikel_neu "${a.id}" ist frisch, aber ohne "tage"`);
      if (!artikel.has(a.id)) artikel.set(a.id, a);
    }
    for (const r of inhalt.rezepte || []) {
      const f = (t) => fehler.push(`${name}: ${r.id || r.name || '?'}: ${t}`);
      if (!/^[a-z0-9-]+$/.test(r.id || '')) f('id fehlt oder enthält andere Zeichen als a-z, 0-9, -');
      if (ids.has(r.id)) f('id doppelt');
      ids.add(r.id);
      if (!r.name) f('name fehlt');
      if (!Array.isArray(r.mahlzeit) || !r.mahlzeit.length || r.mahlzeit.some((m) => !MAHLZEITEN.includes(m))) f('mahlzeit ungültig');
      if (!Array.isArray(r.geraet) || !r.geraet.length || r.geraet.some((g) => !GERAETE.includes(g))) f('geraet ungültig');
      if (!(r.zeit >= 1 && r.zeit <= 120)) f('zeit (Minuten) fehlt');
      if (!(r.haelt >= 1 && r.haelt <= 5)) f('haelt (Tage im Kühlschrank, 1-5) fehlt');
      if (!Array.isArray(r.tags) || r.tags.some((t) => !TAGS.includes(t))) f('tags ungültig: ' + JSON.stringify(r.tags));
      if (!Array.isArray(r.gewuerze)) f('gewuerze muss eine Liste sein');
      if (!Array.isArray(r.schritte) || r.schritte.length < 2) f('mindestens 2 schritte');
      for (const s of r.schritte || []) if (/\d\s?(g|kg|ml)\b/.test(s)) f('Mengenangabe im Schritt (App skaliert Mengen): ' + s.slice(0, 50));
      const sum = [0, 0, 0, 0];
      const gesehen = new Set();
      for (const z of r.zutaten || []) {
        const [id, g] = z;
        const a = artikel.get(id);
        if (!a) { f(`Zutat "${id}" nicht im Katalog`); continue; }
        if (gesehen.has(id)) f(`Zutat "${id}" doppelt`);
        gesehen.add(id);
        if (!(g >= 1 && g <= 600)) f(`Menge von "${id}" unplausibel: ${g}`);
        a.n.forEach((v, i) => { sum[i] += (v * g) / 100; });
      }
      if (!(r.zutaten || []).length) f('zutaten fehlen');
      for (const m of r.mahlzeit || []) {
        const ra = RAHMEN[m];
        if (!ra) continue;
        if (sum[0] < ra.kcal[0] || sum[0] > ra.kcal[1]) f(`${Math.round(sum[0])} kcal passt nicht zu ${m} (${ra.kcal.join('–')})`);
        if (sum[1] < ra.protein) f(`nur ${Math.round(sum[1])} g Protein (${m} braucht mind. ${ra.protein})`);
      }
      zeilen.push(`${(r.id || '').padEnd(38)} ${String(Math.round(sum[0])).padStart(4)} kcal ${String(Math.round(sum[1])).padStart(3)} P  ${(r.mahlzeit || []).join(',')} · ${(r.geraet || []).join(',')}`);
    }
  }
  return { fehler, zeilen, anzahl: ids.size };
}

if (process.argv[1] && process.argv[1].endsWith('pruefen.mjs')) {
  const katalog = JSON.parse(readFileSync(new URL('../daten/katalog.json', import.meta.url), 'utf8'));
  const dateien = process.argv.slice(2).map((p) => ({ name: p, inhalt: JSON.parse(readFileSync(p, 'utf8')) }));
  const { fehler, zeilen, anzahl } = pruefen(katalog, dateien);
  console.log(zeilen.join('\n'));
  console.log(`\n${anzahl} Rezepte, ${fehler.length} Fehler`);
  for (const f of fehler) console.log('FEHLER', f);
  process.exit(fehler.length ? 1 : 0);
}
