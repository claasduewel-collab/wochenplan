// Quelle für daten/katalog.json – kompakt gepflegt, mit `node werkzeug/katalog-quelle.mjs` neu erzeugen.
// a(id, name, kategorie, packung_g, preis, [kcal, protein, fett, kh] je 100 g, extras)
import { writeFileSync } from 'node:fs';
const L = [];
const a = (id, name, kat, pack, preis, n, x = {}) => L.push({ id, name, kat, pack, preis, n, ...x });
const F = 'Fleisch & Fisch', M = 'Milch & Käse', B = 'Brot & Backwaren', N = 'Nudeln, Reis & Getreide',
  K = 'Konserven & Saucen', T = 'Tiefkühl', G = 'Gemüse', O = 'Obst', S = 'Snacks & Süßes', OE = 'Öl & Gewürze';
const fr = (tage, x = {}) => ({ halt: 'frisch', tage, ...x });
const la = (x = {}) => ({ halt: 'lang', ...x });

// ---- Fleisch & Fisch
a('haehnchenbrust', 'Hähnchenbrustfilet', F, 600, 6.49, [106, 23.5, 1.2, 0], fr(3, { rolle: 'p', tags: ['fleisch'], suche: ['h[äa]hnchen.?brust', 'h[äa]hnchen.?(innen)?filet', 'h[äa]hnchen.?minutenschnitzel', 'h[äa]hnchen.?geschnetzeltes'], nicht: 'paniert|nugget|aufschnitt|ger[äa]uchert|d[öo]ner|salat|cordon|mariniert|schenkel|keule|fl[üu]gel|wurst|tiefgefroren' }));
a('putenbrust', 'Putenbrust (Schnitzel/Geschnetzeltes)', F, 400, 4.49, [107, 24, 1, 0], fr(3, { rolle: 'p', tags: ['fleisch'], suche: ['puten.?(brust|schnitzel|geschnetzeltes|ministeak|minuten|steak|medaillon)'], nicht: 'aufschnitt|paniert|cordon|rollbraten|keule|wurst|salami|mariniert' }));
a('rinderhack', 'Rinderhackfleisch', F, 500, 5.49, [220, 20, 15.5, 0], fr(2, { rolle: 'p', tags: ['fleisch'], suche: ['rinder.{0,3}hack'], nicht: 'patt|burger|b[äa]llchen|frikadelle' }));
a('gefluegelhack', 'Hähnchen-Hackfleisch', F, 400, 3.79, [150, 19, 8, 0], fr(2, { rolle: 'p', tags: ['fleisch'], suche: ['(h[äa]hnchen|puten|gefl[üu]gel).{0,3}hack'] }));
a('rindersteak', 'Rinder-Minutensteaks', F, 300, 5.99, [120, 22, 3.5, 0], fr(3, { rolle: 'p', tags: ['fleisch'], suche: ['rinder.?(h[üu]ft|minuten|rump)?.?steak', 'rumpsteak', 'h[üu]ftsteak'], nicht: 'c[ôo]te|bein|patt' }));
a('schweinesteak', 'Schweine-Minutensteaks', F, 400, 2.99, [110, 22, 2.5, 0], fr(3, { rolle: 'p', tags: ['fleisch', 'schwein'], suche: ['schweine.{0,3}minuten.{0,3}steak', 'schweinefilet', 'schweine.?schnitzel'], nicht: 'paniert|mariniert' }));
a('kochschinken', 'Kochschinken', F, 200, 1.99, [105, 19, 3, 1], fr(7, { rolle: 'p', tags: ['fleisch', 'schwein'], suche: ['kochschinken'] }));
a('haehnchen_aufschnitt', 'Hähnchenbrust-Aufschnitt', F, 150, 1.79, [100, 21, 1.5, 1], fr(7, { rolle: 'p', tags: ['fleisch'], suche: ['h[äa]hnchenbrust.{0,14}aufschnitt'] }));
a('putenbrust_aufschnitt', 'Putenbrust-Aufschnitt', F, 150, 1.69, [105, 21, 2, 1], fr(7, { rolle: 'p', tags: ['fleisch'], suche: ['putenbrust.{0,14}aufschnitt', 'truthahnbrust'] }));
a('lachs', 'Lachsfilet (TK)', F, 250, 4.99, [200, 20, 13.5, 0], la({ rolle: 'p', tags: ['fisch'], suche: ['lachs.?filet'], nicht: 'r[äa]ucher|forelle|wild' }));
a('seelachs', 'Alaska-Seelachsfilet (TK)', F, 750, 5.49, [75, 17, 0.8, 0], la({ rolle: 'p', tags: ['fisch'], suche: ['seelachs.?filet'], nicht: 'paniert|schlemmer|st[äa]bchen' }));
a('thunfisch', 'Thunfisch im eigenen Saft (Dose)', F, 140, 1.29, [110, 25, 1, 0], la({ rolle: 'p', tags: ['fisch'], suche: ['thunfisch'], nicht: 'salat|[öo]l|pizza' }));
a('raeucherlachs', 'Räucherlachs', F, 200, 3.99, [180, 21, 11, 0], fr(7, { rolle: 'p', tags: ['fisch'], suche: ['r[äa]ucherlachs'] }));
a('garnelen', 'Garnelen (TK)', F, 225, 3.99, [70, 16, 0.6, 0], la({ rolle: 'p', tags: ['fisch'], suche: ['garnelen'] }));
// ---- Eier
a('eier', 'Eier (10 Stück)', 'Eier', 600, 2.19, [145, 12.5, 10.3, 0.7], la({ rolle: 'p', stk: 60, stkName: 'Ei', max: 240, suche: ['\\beier\\b'], nicht: 'nudel|lik[öo]r|salat|schoko|spätzle' }));
// ---- Milch & Käse
a('huettenkaese', 'Körniger Frischkäse', M, 200, 0.99, [93, 12.5, 4.3, 1.5], fr(9, { rolle: 'p', suche: ['k[öo]rniger frischk[äa]se', 'h[üu]ttenk[äa]se', 'cottage'] }));
a('speisequark', 'Speisequark 20 %', M, 500, 1.49, [105, 12, 5, 2.7], fr(9, { rolle: 'p', suche: ['speisequark'], nicht: 'mager' }));
a('magerquark', 'Magerquark', M, 500, 1.29, [67, 12, 0.2, 4], fr(9, { rolle: 'p', suche: ['magerquark'] }));
a('skyr', 'Skyr natur', M, 500, 1.59, [63, 11, 0.2, 4], fr(9, { rolle: 'p', suche: ['skyr'], nicht: 'drink|frucht' }));
a('naturjoghurt', 'Naturjoghurt 1,5 %', M, 500, 0.79, [47, 4.4, 1.5, 4.2], fr(9, { suche: ['naturjoghurt', 'joghurt natur'] }));
a('milch', 'H-Milch 1,5 %', M, 1000, 0.95, [47, 3.4, 1.5, 4.9], la({ suche: ['h-milch', 'haltbare milch'] }));
a('mozzarella', 'Mozzarella light', M, 125, 0.89, [163, 19, 9, 1.5], fr(9, { rolle: 'p', suche: ['mozzarella'], nicht: 'sticks|pizza|b[üu]ffel' }));
a('hirtenkaese', 'Hirtenkäse', M, 250, 1.89, [233, 16, 18.5, 1], fr(12, { suche: ['hirtenk[äa]se', '\\bfeta\\b'] }));
a('reibekaese', 'Geriebener Käse light', M, 250, 2.29, [265, 31, 15, 1], fr(10, { suche: ['geriebener? (k[äa]se|gouda|emmentaler)', 'reibek[äa]se', 'streuk[äa]se'] }));
a('kaesescheiben', 'Käsescheiben light', M, 250, 2.19, [255, 30, 15, 0], fr(12, { stk: 25, stkName: 'Scheibe', suche: ['k[äa]sescheiben', 'gouda.{0,12}scheiben'] }));
a('frischkaese', 'Frischkäse light', M, 200, 0.99, [115, 11, 5.5, 4.5], fr(10, { suche: ['frischk[äa]se'], nicht: 'k[öo]rnig' }));
a('kochcreme', 'Kochcreme 15 %', M, 250, 0.89, [160, 2.6, 15, 4], la());
a('protein_pudding', 'High-Protein-Pudding', M, 200, 0.99, [80, 10, 1.5, 6], fr(10, { rolle: 'p', suche: ['protein.?pudding'] }));
a('tofu', 'Bio-Tofu natur', M, 400, 1.99, [125, 13.5, 7, 1.5], la({ rolle: 'p', suche: ['\\btofu'] }));
// ---- Brot & Backwaren
a('vollkornbrot', 'Vollkornbrot (geschnitten)', B, 500, 1.19, [215, 7.5, 2.5, 36], fr(6, { rolle: 'k', stk: 50, stkName: 'Scheibe' }));
a('toast', 'Vollkorn-Sandwichtoast', B, 750, 1.49, [250, 10, 4, 40], fr(7, { rolle: 'k', stk: 37, stkName: 'Scheibe' }));
a('eiweissbrot', 'Eiweißbrot', B, 250, 1.59, [260, 22, 11, 8], fr(6, { stk: 42, stkName: 'Scheibe', suche: ['eiwei[ßs]brot'] }));
a('wraps', 'Vollkorn-Wraps (6 Stück)', B, 370, 1.69, [300, 9, 6.5, 48], fr(12, { rolle: 'k', stk: 62, stkName: 'Wrap', suche: ['wraps', 'tortilla'], nicht: 'chips' }));
a('reiswaffeln', 'Reiswaffeln', B, 100, 0.59, [385, 8, 3, 80], la({ rolle: 'k', stk: 7, stkName: 'Waffel' }));
a('knaeckebrot', 'Vollkorn-Knäckebrot', B, 250, 0.99, [335, 10, 1.5, 62], la({ rolle: 'k', stk: 13, stkName: 'Scheibe' }));
// ---- Nudeln, Reis & Getreide
a('reis', 'Basmatireis', N, 1000, 2.29, [350, 8, 0.8, 77], la({ rolle: 'k', suche: ['basmati', 'langkornreis'] }));
a('vollkornnudeln', 'Vollkornnudeln', N, 500, 1.19, [345, 13, 2.5, 64], la({ rolle: 'k' }));
a('couscous', 'Couscous', N, 500, 1.19, [360, 12, 1.5, 72], la({ rolle: 'k', suche: ['couscous'], nicht: 'salat' }));
a('bulgur', 'Bulgur', N, 500, 1.49, [350, 12, 1.5, 69], la({ rolle: 'k', suche: ['bulgur'] }));
a('haferflocken', 'Haferflocken', N, 500, 0.79, [370, 13.5, 7, 59], la({ rolle: 'k', suche: ['haferflocken'] }));
a('kartoffeln', 'Kartoffeln', N, 2500, 2.99, [77, 2, 0.1, 17], la({ rolle: 'k', suche: ['speisekartoffeln', '^kartoffeln'] }));
a('gnocchi', 'Gnocchi', N, 500, 0.99, [160, 4, 0.5, 34], la({ rolle: 'k', suche: ['gnocchi'] }));
a('rote_linsen', 'Rote Linsen', N, 500, 1.49, [340, 24, 1.5, 50], la({ rolle: 'k' }));
a('mehl', 'Weizenmehl', N, 1000, 0.79, [348, 10, 1, 72], la({ rolle: 'k' }));
a('mie_nudeln', 'Mie-Nudeln', N, 250, 0.99, [350, 12, 2, 70], la({ rolle: 'k' }));
a('paniermehl', 'Paniermehl', N, 400, 0.79, [355, 11, 1.5, 72], la());
a('chiasamen', 'Chiasamen', N, 300, 1.99, [440, 21, 31, 5], la());
// ---- Konserven & Saucen
a('kichererbsen', 'Kichererbsen (Dose)', K, 240, 0.79, [120, 7, 2.5, 15], la({ rolle: 'k' }));
a('kidneybohnen', 'Kidneybohnen (Dose)', K, 250, 0.79, [105, 7.5, 0.6, 14], la({ rolle: 'k' }));
a('weisse_bohnen', 'Weiße Bohnen (Dose)', K, 240, 0.79, [95, 6.5, 0.5, 13], la({ rolle: 'k' }));
a('linsen_dose', 'Linsen (Dose)', K, 265, 0.89, [80, 6, 0.5, 11], la({ rolle: 'k' }));
a('mais', 'Mais (Dose)', K, 285, 0.89, [80, 2.7, 1.2, 13], la());
a('passierte_tomaten', 'Passierte Tomaten', K, 500, 0.59, [30, 1.4, 0.2, 5], la());
a('gehackte_tomaten', 'Gehackte Tomaten (Dose)', K, 400, 0.59, [22, 1.2, 0.1, 3.5], la());
a('tomatenmark', 'Tomatenmark', K, 200, 0.99, [90, 4.5, 0.5, 15], la());
a('kokosmilch', 'Kokosmilch', K, 400, 1.19, [180, 1.6, 18, 2.5], la());
a('pesto', 'Pesto alla Genovese', K, 190, 1.29, [430, 4.5, 43, 6], la());
a('erdnussmus', 'Erdnussbutter', K, 350, 2.29, [610, 26, 50, 10], la({ suche: ['erdnuss(butter|mus|creme)'] }));
a('salsa', 'Salsa-Dip', K, 300, 1.19, [40, 1.5, 0.3, 7], la());
a('hummus', 'Hummus', K, 200, 1.19, [300, 7, 24, 10], fr(8, { suche: ['hummus'] }));
a('gewuerzgurken', 'Gewürzgurken', K, 360, 0.99, [20, 0.5, 0.1, 3], la());
// ---- Tiefkühl
a('spinat', 'Blattspinat (TK)', T, 750, 1.49, [25, 2.8, 0.4, 0.8], la());
a('gemuesemix', 'Pfannengemüse (TK)', T, 750, 1.79, [35, 2.2, 0.4, 4.5], la());
a('erbsen', 'Erbsen (TK)', T, 750, 1.49, [80, 5.8, 0.7, 10], la());
a('brokkoli_tk', 'Brokkoli (TK)', T, 1000, 1.99, [31, 3, 0.5, 2.5], la());
a('beeren', 'Beerenmischung (TK)', T, 750, 2.99, [45, 1, 0.4, 7], la());
a('pommes', 'Backofen-Pommes (TK)', T, 1000, 1.99, [140, 2.5, 4, 22], la({ rolle: 'k' }));
// ---- Gemüse
a('paprika', 'Paprika-Mix (3 Stück)', G, 500, 1.99, [30, 1, 0.3, 5], fr(7, { stk: 165, stkName: 'Paprika', suche: ['paprika'], nicht: 'chips|pulver|gew[üu]rz|sauce|frischk|gef[üu]llt|aufstrich' }));
a('brokkoli', 'Brokkoli', G, 500, 1.29, [34, 3.3, 0.4, 3], fr(5, { suche: ['brokkoli', 'broccoli'], nicht: 'tiefgefroren|tk' }));
a('gurke', 'Salatgurke', G, 400, 0.89, [14, 0.6, 0.2, 2], fr(6, { stk: 400, stkName: 'Gurke', suche: ['gurken?\\b'], nicht: 'gew[üu]rz|cornichon|salat\\b.*dose|sticks|relish' }));
a('cherrytomaten', 'Cherrytomaten', G, 250, 0.99, [20, 1, 0.3, 3], fr(6, { suche: ['cherry.?(rispen)?tomaten', 'cocktailtomaten'] }));
a('tomaten', 'Rispentomaten (lose)', G, 1000, 2.49, [18, 0.9, 0.2, 2.6], fr(6, { lose: true, stk: 100, stkName: 'Tomate', suche: ['rispentomaten', '^tomaten'] }));
a('zwiebeln', 'Zwiebeln', G, 1000, 1.29, [40, 1.2, 0.2, 8], la({ stk: 90, stkName: 'Zwiebel', suche: ['zwiebeln'], nicht: 'r[öo]st|lauch|ringe' }));
a('moehren', 'Möhren', G, 1000, 0.99, [39, 0.9, 0.2, 7], la({ suche: ['m[öo]hren', 'karotten'], nicht: 'saft|salat' }));
a('zucchini', 'Zucchini (lose)', G, 1000, 1.99, [20, 1.6, 0.4, 2.2], fr(6, { lose: true, stk: 250, stkName: 'Zucchini', suche: ['zucchini'] }));
a('romana', 'Romana-Salatherzen (2 Stück)', G, 300, 1.29, [16, 1.2, 0.2, 1.8], fr(5, { suche: ['romana', 'salatherzen'] }));
a('salatmix', 'Salat-Mix', G, 125, 1.19, [20, 1.5, 0.3, 2], fr(3, { suche: ['salat.?mix', 'blattsalat'] }));
a('rucola', 'Rucola', G, 125, 0.99, [25, 2.6, 0.7, 2], fr(3, { suche: ['rucola'] }));
a('champignons', 'Champignons', G, 400, 1.69, [22, 2.7, 0.3, 0.6], fr(4, { tags: ['pilze'], suche: ['champignons'] }));
a('weisskohl', 'Weißkohl/Spitzkohl (lose)', G, 1000, 0.89, [25, 1.3, 0.2, 4.2], fr(12, { lose: true, suche: ['wei[ßs]kohl', 'spitzkohl'] }));
a('blumenkohl', 'Blumenkohl', G, 800, 1.99, [25, 2, 0.3, 2.3], fr(6, { suche: ['blumenkohl'] }));
a('kuerbis', 'Hokkaido-Kürbis (lose)', G, 1000, 1.49, [30, 1.1, 0.1, 6], fr(14, { lose: true, suche: ['hokkaido', 'k[üu]rbis'], nicht: 'kern|suppe' }));
a('suesskartoffeln', 'Süßkartoffeln (lose)', G, 1000, 1.99, [86, 1.6, 0.1, 20], fr(14, { lose: true, rolle: 'k', suche: ['s[üu][ßs]kartoffel'] }));
a('rote_bete', 'Rote Bete (gekocht, vakuumiert)', G, 500, 0.99, [42, 1.5, 0.1, 8], la({ suche: ['rote bete'], nicht: 'saft|salat' }));
a('avocado', 'Avocado', G, 150, 0.99, [160, 2, 15, 1], fr(4, { stk: 150, stkName: 'Avocado', suche: ['avocado'] }));
// ---- Obst
a('bananen', 'Bananen (lose)', O, 1000, 1.39, [90, 1.1, 0.2, 20], fr(5, { lose: true, stk: 120, stkName: 'Banane', suche: ['bananen'] }));
a('aepfel', 'Äpfel (lose)', O, 1000, 2.29, [54, 0.3, 0.2, 12], la({ lose: true, stk: 160, stkName: 'Apfel', suche: ['[äa]pfel\\b'], nicht: 'saft|mus|schorle|mark|kuchen|strudel|ring|chips' }));
a('birnen', 'Birnen (lose)', O, 1000, 1.99, [55, 0.4, 0.2, 12.5], fr(7, { lose: true, stk: 170, stkName: 'Birne', suche: ['birnen'] }));
a('orangen', 'Orangen', O, 2000, 2.99, [47, 0.9, 0.1, 9.4], la({ stk: 200, stkName: 'Orange', suche: ['orangen'], nicht: 'saft|limo|marmelade|nektar' }));
a('mandarinen', 'Mandarinen/Clementinen (lose)', O, 1000, 2.99, [50, 0.8, 0.2, 10], fr(10, { lose: true, stk: 80, stkName: 'Mandarine', suche: ['mandarinen', 'clementinen'] }));
a('trauben', 'Weintrauben', O, 500, 1.99, [70, 0.7, 0.2, 16], fr(5, { suche: ['trauben'], nicht: 'saft|zucker' }));
// ---- Snacks & Nüsse
a('mandeln', 'Mandeln', S, 200, 2.49, [600, 21, 52, 5], la({ suche: ['mandeln'], nicht: 'schoko|gebrannt|milch|drink|marzipan' }));
a('walnuesse', 'Walnusskerne', S, 200, 2.79, [680, 15, 65, 7], la({ suche: ['walnuss'], nicht: '[öo]l\\b|eis' }));
a('zartbitter', 'Zartbitterschokolade', S, 100, 1.19, [540, 7, 37, 36], la());
// ---- Grundvorrat (wird nicht eingekauft, zählt aber bei den Nährwerten mit)
a('rapsoel', 'Rapsöl', OE, 1000, 1.99, [900, 0, 100, 0], la({ basis: true }));
a('olivenoel', 'Olivenöl', OE, 500, 5.99, [900, 0, 100, 0], la({ basis: true }));
a('honig', 'Honig', OE, 500, 3.49, [320, 0.3, 0, 80], la({ basis: true }));

writeFileSync(new URL('../daten/katalog.json', import.meta.url), '{"artikel":[\n' + L.map((x) => JSON.stringify(x)).join(',\n') + '\n]}\n');
console.log(L.length, 'Artikel');
