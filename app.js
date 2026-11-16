// Oberfläche der Wochenplan-App. Die Rechenlogik steckt in planer.js, die Figuren in figuren.js.
// Alles läuft im Browser des Handys; Eingaben bleiben auf dem Gerät (localStorage).
import {
  MAHLZEITEN, GERAETE, LAEDEN, FIGUREN, AKTIV, ZIELE, standardEinstellungen, kontext, auswerten, planen, alternativen,
  skaliert, naehrwerte, bedarfRechnen, zieleVon, blockTeilen, mengeText, gramm, vorratStatus, wochenStart, kandidaten,
} from './planer.js';
import { figur, FIGUR_FUER } from './figuren.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const kc = (n) => Math.round(Number(n) || 0).toLocaleString('de-DE');
const lc = (s) => String(s).trim().toLowerCase();
const store = {
  get(k, d) { try { const v = localStorage.getItem('wp3:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wp3:' + k, JSON.stringify(v)); } catch {} },
};
const KAT = ['Obst', 'Gemüse', 'Brot & Backwaren', 'Fleisch & Fisch', 'Milch & Käse', 'Eier', 'Nudeln, Reis & Getreide', 'Konserven & Saucen', 'Öl & Gewürze', 'Tiefkühl', 'Getränke', 'Snacks & Süßes', 'Sonstiges'];
const GERAET_NAME = Object.fromEntries(GERAETE.map((g) => [g.id, g.label]));
const MZ_NAME = Object.fromEntries(MAHLZEITEN.map((m) => [m.id, m.label]));
const MZ_FARBE = { fruehstueck: 'var(--fr)', snack: 'var(--sn)', mittag: 'var(--mi)', abend: 'var(--ab)' };
const TAG_NAME = { 'meal-prep': 'Meal Prep', vorabend: 'Vorabend', mitnehmen: 'Zum Mitnehmen', kalt: 'Kalt', schnell: 'Schnell', einfrierbar: 'Einfrierbar' };

// ---------------------------------------------------------------- Zustand
let stamm = null;            // {artikel, rezepte}
let wochenDaten = null;      // plan.json (Angebote der Läden)
let ein = null;              // Einstellungen inkl. Profile
let vorrat = store.get('vorrat', {});
let woche = null;            // {id, plan, wer, fertig, abzug, seed, haken, bezahlt, sig}
let ctx = null, erg = null;
let tab = store.get('tab', 'woche');
let tag = null;
let filter = { mz: '', geraet: '', tag: '', q: '' };
let toastMsg = null;
let wiz = null;              // Planungs-Abfrage
let sichtP = null;           // für wen das Rezeptblatt rechnet
let blattArt = null;         // welches Blatt gerade offen ist (z. B. 'person:p1')

const GH = (() => {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return m && repo ? { owner: m[1], repo } : null;
})();

async function holeJson(datei, frisch) {
  const urls = [];
  if (frisch && GH) urls.push(`https://raw.githubusercontent.com/${GH.owner}/${GH.repo}/main/${datei}?t=${Date.now()}`);
  urls.push(datei + (frisch ? '?t=' + Date.now() : ''));
  for (const u of urls) {
    try { const r = await fetch(u, frisch ? { cache: 'no-store' } : {}); if (r.ok) return await r.json(); } catch {}
  }
  return null;
}

async function laden() {
  const [katalog, rezepte, plan, cfg] = await Promise.all([
    holeJson('daten/katalog.json'), holeJson('daten/rezepte.json'), holeJson('plan.json', true), holeJson('config.json', true),
  ]);
  if (katalog && rezepte) { stamm = { artikel: katalog.artikel, rezepte: rezepte.rezepte }; store.set('stamm', stamm); } else stamm = store.get('stamm', null);
  if (plan) { wochenDaten = plan; store.set('plan', plan); } else { wochenDaten = store.get('plan', null); if (wochenDaten) wochenDaten._offline = true; }
  const std = standardEinstellungen(cfg || store.get('cfg', {}));
  if (cfg) store.set('cfg', cfg);
  const g = store.get('ein', null);
  ein = g ? { ...std, ...g, mahlzeiten: { ...std.mahlzeiten, ...g.mahlzeiten }, geraete: { ...std.geraete, ...g.geraete }, extras: std.extras, tagNamen: std.tagNamen, tage: std.tage } : std;
}

const zustand = (mehr) => ({ wer: woche.wer, fertig: woche.fertig, seed: woche.seed, letzte: store.get('letzte', []), ...mehr });
const sichern = () => { store.set('ein', ein); store.set('vorrat', vorrat); store.set('woche', woche); };
const signatur = () => MAHLZEITEN.map((m) => ein.mahlzeiten[m.id].tage).join('-');

function planPasst() {
  for (const s of ctx.slots) {
    const b = woche.plan?.[s.id];
    if (!b || b.reduce((x, y) => x + y.n, 0) !== ein.tage) return false;
    if (b.some((x) => x.r && !ctx.rezepte.has(x.r))) return false;
    if (b.some((x) => !x.r && !x.fix) && kandidaten(ctx, s.id).length) return false;
  }
  return true;
}

/** Baut alles neu auf: Kontext, ggf. neuer Plan, Auswertung. */
function rechnen({ neuPlanen = false, neuStruktur = false } = {}) {
  if (!stamm) return;
  const id = wochenStart();
  if (!woche) woche = store.get('woche', null);
  if (!woche || woche.id !== id) {
    if (woche?.plan) store.set('letzte', Object.values(woche.plan).flat().map((b) => b.r).filter(Boolean));
    woche = { id, plan: null, wer: {}, fertig: {}, abzug: {}, seed: 1, haken: {}, bezahlt: 0, sig: signatur() };
  }
  if (woche.sig !== signatur()) { neuStruktur = true; woche.sig = signatur(); }
  ctx = kontext(stamm, wochenDaten, ein, vorrat);
  if (neuPlanen || neuStruktur || !woche.plan || !planPasst()) woche.plan = planen(ctx, zustand({ neuStruktur }), woche.plan);
  erg = auswerten(ctx, woche.plan, zustand());
  sichern();
}

function toast(text, bad) { toastMsg = { text, bad }; dock(); clearTimeout(toast.t); toast.t = setTimeout(() => { toastMsg = null; dock(); }, 3800); }
function dock() { $('#dock').innerHTML = toastMsg ? `<div class="status ${toastMsg.bad ? 'bad' : ''}">${esc(toastMsg.text)}</div>` : ''; }

// ---------------------------------------------------------------- Helfer
const ladenName = (id) => LAEDEN.find((l) => l.id === id)?.name || id;
const datumKurz = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
const tagName = (d) => ein.tagNamen[d] || 'Tag ' + (d + 1);
const heuteIndex = () => (woche.id === wochenStart() ? (new Date().getDay() + 6) % 7 : -1);
const tagWort = (d) => { const h = heuteIndex(); return d === h ? 'Heute' : d === h + 1 ? 'Morgen' : tagName(d); };
const person = (pid) => ctx.personen.find((p) => p.id === pid);
const esserAm = (slot, d) => { const w = woche.wer[slot + ':' + d]; const alle = ein.profile.map((p) => p.id); return w ? w.filter((id) => alle.includes(id)) : alle; };
const kurzName = (a) => a.name.replace(/ \(.*\)$/, '');
const nwZeile = (n) => `${kc(n[0])} kcal · ${Math.round(n[1])} g Protein · ${Math.round(n[2])} g Fett · ${Math.round(n[3])} g KH`;
const kacheln = (n, titel = ['kcal', 'Protein', 'Fett', 'Kohlenh.']) => `<div class="kacheln">${n.map((v, i) => `<div class="kachel"><b>${i ? Math.round(v * 10) / 10 + ' g' : kc(v)}</b><span>${titel[i]}</span></div>`).join('')}</div>`;

function kopf() {
  const von = new Date(woche.id + 'T12:00:00');
  const bis = new Date(von.getTime() + (ein.tage - 1) * 86400000);
  const f = (d) => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  const n = ein.profile.length;
  $('#sub').textContent = `${f(von)} – ${f(bis)} · ${ladenName(ein.laden)} · ${n === 1 ? ein.profile[0].name : n + ' Personen'}`;
  const b = [];
  if (wochenDaten?._offline) b.push(`<div class="banner warn">Offline – du siehst die zuletzt geladenen Angebote.</div>`);
  const l = wochenDaten?.laeden?.[ein.laden];
  if (!l || !(l.angebote || []).length) {
    b.push(`<div class="banner warn"><b>Für ${esc(ladenName(ein.laden))} sind gerade keine Angebote geladen.</b><br>Der Plan rechnet mit Normalpreisen.${l?.fehler ? '<br>' + esc(l.fehler) : ''}</div>`);
  } else if (l.bis && l.bis < woche.id) {
    b.push(`<div class="banner warn">Die Angebote von ${esc(ladenName(ein.laden))} sind von letzter Woche (bis ${datumKurz(l.bis)}). Neue kommen automatisch am Sonntag.</div>`);
  }
  $('#banners').innerHTML = b.join('');
}

// ---------------------------------------------------------------- Woche
function balken(label, wert, ziel, einheit) {
  const pct = ziel ? Math.min(100, (wert / ziel) * 100) : 0;
  return `<div class="bar-row"><span>${label}</span><div class="bar"><i class="${ziel && wert > ziel * 1.1 ? 'over' : ''}" style="width:${pct}%"></i></div><span class="num">${Math.round(wert)} / ${ziel ?? '–'} ${einheit}</span></div>`;
}

function heldKarte() {
  const mitAngeboten = new Set(Object.entries(wochenDaten?.laeden || {}).filter(([, l]) => (l.angebote || []).length).map(([id]) => id));
  const genutzt = erg.einkauf.filter((e) => e.angebot).length;
  const portionen = erg.bloecke.reduce((s, b) => s + (b.r ? b.portionen : 0), 0);
  const gesamt = erg.kosten + (woche.bezahlt || 0);
  const pills = [];
  if (portionen) pills.push(`<span class="pill">${portionen} Portionen · ${eur(gesamt / portionen)} je Portion</span>`);
  if (genutzt) pills.push(`<span class="pill">${genutzt} ${genutzt === 1 ? 'Angebot' : 'Angebote'} · ${eur(erg.ersparnis)} gespart</span>`);
  if (erg.ausVorrat.length) pills.push(`<span class="pill">${erg.ausVorrat.length}× aus dem Vorrat</span>`);
  pills.push(erg.resteFrisch.length
    ? `<span class="pill warn">Rest: ${erg.resteFrisch.map((r) => `${gramm(r.g)} ${esc(kurzName(r.a))}`).join(', ')}</span>`
    : `<span class="pill">Nichts Frisches bleibt übrig</span>`);
  return `<section class="card held">
    <div class="oben">${figur('karotte', 76, { hut: true })}<div><div class="gruss">Moin ${esc(ein.profile[0].name)}! ${woche.bezahlt ? 'Noch einzukaufen:' : 'Dein Einkauf kostet etwa'}</div><div class="big">${eur(erg.kosten)}</div></div></div>
    <div class="fakten">${pills.join('')}</div>
    <div class="aktionen"><button class="btn" data-act="planen">＋ Was brauchst du?</button><button class="btn ghost" data-act="wuerfeln">↻ Neue Ideen</button></div>
    <div style="margin-top:12px;position:relative;z-index:1"><select class="field" data-ein="laden" aria-label="Laden">${LAEDEN.map((l) => `<option value="${l.id}" ${l.id === ein.laden ? 'selected' : ''}>Einkaufen bei ${esc(l.name)}${mitAngeboten.has(l.id) ? '' : ' (ohne Angebote)'}</option>`).join('')}</select></div>
  </section>`;
}

function werZeile(slot, d) {
  if (ein.profile.length < 2) return '';
  const da = esserAm(slot, d);
  return `<div class="wer"><span>Wer isst mit?</span>${ein.profile.map((p) => `<button class="kopf-btn" data-wer="${slot}:${d}:${p.id}" aria-pressed="${da.includes(p.id)}">${figur(p.figur, 24, { ruhig: true })}${esc(p.name)}</button>`).join('')}</div>`;
}

function mahlzeitKarte(b, d) {
  const s = MZ_NAME[b.slot];
  const farbe = `style="--farbe:${MZ_FARBE[b.slot]}"`;
  const da = esserAm(b.slot, d);
  if (!da.length) {
    return `<section class="card mahl aus" ${farbe}><span><span class="slot">${s}</span><br><span class="muted">nicht geplant</span></span><button class="btn ghost klein" data-einplanen="${b.slot}:${d}">Einplanen</button></section>`;
  }
  if (!b.r) return `<section class="card mahl aus" ${farbe}><span><span class="slot">${s}</span><br><span class="muted">Kein passendes Rezept</span></span><button class="btn ghost klein" data-tausch="${b.slot}:${b.i}">Auswählen</button></section>`;
  const r = b.r;
  const kochtag = b.tage[0];
  const erster = d === kochtag;
  const vorabend = (r.tags || []).includes('vorabend');
  const reicht = (r.haelt || 3) >= b.tage.length;
  const wann = b.fertig ? 'fertig zubereitet'
    : !reicht ? (vorabend ? 'Am Vorabend vorbereiten' : '')
      : erster ? (b.tage.length > 1 ? `${vorabend ? 'Am Vorabend vorbereiten' : 'Kochtag'} · reicht für ${b.tage.length} Tage` : vorabend ? 'Am Vorabend vorbereiten' : '')
        : `vorbereitet am ${tagName(kochtag)}`;
  const kochen = erster && reicht && b.portionen > da.length; // heute wird für mehrere Tage/Personen gekocht
  const zeilen = b.z.map(([id], i) => {
    const a = ctx.kat.get(id);
    const jeP = da.map((pid) => [pid, b.zP.get(pid)[i][1]]);
    const heute = jeP.reduce((x, [, g]) => x + g, 0);
    const fett = kochen ? b.menge.get(id) : heute;
    return `<li><span><button class="art" data-artikel="${esc(id)}">${esc(kurzName(a))}</button>${a.angebot && !a.basis ? '<span class="tag deal">Angebot</span>' : ''}${(vorrat[id] || 0) > 0 ? '<span class="tag used">Vorrat</span>' : ''}
      ${da.length > 1 ? `<small>${jeP.map(([pid, g]) => `${esc(person(pid).name)} ${mengeText(a, g)}`).join(' · ')}</small>` : ''}</span>
      <span class="g"><b>${mengeText(a, fett)}</b>${kochen ? '<br>für alle Tage' : da.length > 1 ? '<br>zusammen' : ''}</span></li>`;
  }).join('');
  return `<section class="card mahl ${b.fertig ? 'fertig' : ''}" ${farbe}>
    <div class="mahl-kopf">${figur(FIGUR_FUER[b.slot], 38, { ruhig: true })}<span class="slot">${s} · ${r.geraet.map((g) => GERAET_NAME[g]).join(' + ')} · ${r.zeit} Min.</span></div>
    <div class="meal-name"><span data-rezept="${esc(r.id)}" style="cursor:pointer">${esc(r.name)}</span>${b.fix ? ' <span title="von dir gewählt">📌</span>' : ''}</div>
    ${da.map((pid) => `<div class="pers-zeile">${ein.profile.length > 1 ? figur(person(pid).figur, 22, { ruhig: true }) + `<b>${esc(person(pid).name)}</b>` : ''}<span>${nwZeile(b.nwP.get(pid))}</span></div>`).join('')}
    ${wann ? `<div class="hint" style="margin-top:8px">${esc(wann)}</div>` : ''}
    ${(erster || !reicht ? b.hinweise.filter((h) => erster || h.art === 'lang') : []).map((h) => `<div class="hint warn">${esc(h.text)}</div>`).join('')}
    <ul class="ing" style="margin-top:8px">${zeilen}</ul>
    <details><summary>Zubereitung</summary>
      ${(r.gewuerze || []).length ? `<p class="muted klein" style="margin:4px 0">Aus dem Schrank: ${esc(r.gewuerze.join(', '))}</p>` : ''}
      <ol class="steps">${r.schritte.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      ${r.tipp ? `<p class="muted klein">Tipp: ${esc(r.tipp)}</p>` : ''}
    </details>
    ${werZeile(b.slot, d)}
    <div class="aktionen">
      <button class="btn ghost klein" data-tausch="${b.slot}:${b.i}:${d}">Tauschen</button>
      <button class="btn ghost klein" data-fertig="${b.slot}:${b.start}" aria-pressed="${b.fertig}">${b.fertig ? '✓ Zubereitet' : 'Zubereitet'}</button>
      ${ein.profile.length < 2 ? `<button class="btn ghost klein" data-wer="${b.slot}:${d}:${ein.profile[0].id}">Auslassen</button>` : ''}
    </div>
  </section>`;
}

function wocheAnsicht() {
  const heute = heuteIndex();
  if (tag == null || tag >= ein.tage) tag = heute >= 0 && heute < ein.tage ? heute : 0;
  const t = erg.tage[tag];
  let html = heldKarte();
  html += `<div class="days" role="group" aria-label="Tag wählen">` + erg.tage.map((x) => `<button class="day" data-day="${x.d}" aria-pressed="${x.d === tag}">${esc(tagName(x.d).slice(0, 2))}${x.d === heute ? '<span class="today" aria-label="heute"></span>' : ''}</button>`).join('') + `</div>`;
  for (const s of ctx.slots) {
    const b = erg.bloecke.find((x) => x.slot === s.id && tag >= x.start && tag < x.start + x.n);
    if (b) html += mahlzeitKarte(b, tag);
  }
  for (const p of ctx.personen) {
    const n = t.nP.get(p.id);
    if (!n) continue;
    html += `<section class="card"><div class="mahl-kopf">${figur(p.figur, 34, { ruhig: true })}<span class="slot">${esc(p.name)} · ${esc(tagName(tag))}</span></div>
      <div class="day-total"><span class="big">${kc(n[0])}</span><span class="muted">von ${kc(p.z.kcal)} kcal</span></div>
      <div class="totals">${balken('Protein', n[1], p.z.protein, 'g')}${balken('Fett', n[2], p.z.fett, 'g')}${balken('Kohlenh.', n[3], p.z.kh, 'g')}</div>
      ${p.ex[0] ? `<p class="muted klein" style="margin:10px 0 0">Inklusive ${ein.extras.map((e) => esc(e.name.replace(/\s*\(.*\)/, ''))).join(' und ')} (${kc(p.ex[0])} kcal)</p>` : ''}</section>`;
  }
  return html;
}

// ---------------------------------------------------------------- Blatt (Overlay)
function blatt(titel, inhalt) {
  const el = $('#sheet');
  el.innerHTML = `<div class="sheet-in" role="dialog" aria-label="${esc(titel)}"><div class="sheet-kopf"><h3>${esc(titel)}</h3><button class="zu" data-act="zu" aria-label="Schließen">×</button></div>${inhalt}</div>`;
  el.hidden = false;
  blattArt = null;
  document.body.style.overflow = 'hidden';
}
function blattZu() { blattArt = null; wiz = null; $('#sheet').hidden = true; $('#sheet').innerHTML = ''; document.body.style.overflow = ''; }

function rezeptMeta(r, nw) {
  const teile = [`${r.zeit} Min.`, r.geraet.map((g) => GERAET_NAME[g]).join(' + ')];
  if (nw) teile.push(`${kc(nw[0])} kcal · ${Math.round(nw[1])} g Protein`);
  return teile.join(' · ');
}

function tauschBlatt(slot, i, d) {
  const liste = alternativen(ctx, woche.plan, slot, i, zustand());
  const b = woche.plan[slot][i];
  const zeilen = liste.map((x) => {
    const tags = [];
    if (x.aktuell) tags.push('<span class="tag neutral">aktuell</span>');
    if (x.angebote.length) tags.push(`<span class="tag deal">Angebot: ${esc(x.angebote.map((n) => n.replace(/ \(.*\)$/, '')).slice(0, 2).join(', '))}</span>`);
    if (x.vorrat.length) tags.push(`<span class="tag used">nutzt Vorrat</span>`);
    if (ein.favoriten.includes(x.r.id)) tags.push('<span class="tag bad">♥</span>');
    const k = x.kosten;
    return `<div class="rez" data-waehl="${slot}:${i}:${esc(x.r.id)}"><div><b>${esc(x.r.name)}</b>${tags.join('')}<small>${esc(rezeptMeta(x.r, x.nw))}</small></div>
      <div class="price">${x.aktuell ? '' : (k > 0.005 ? '+' : k < -0.005 ? '−' : '±') + eur(Math.abs(k))}<small>${x.aktuell ? '' : 'Einkauf'}</small></div></div>`;
  }).join('');
  blatt(`${MZ_NAME[slot]} aussuchen`, `<p class="muted klein" style="margin:0 0 4px">Beste Wahl zuerst: günstig mit den aktuellen Angeboten, wenig Reste, passt zu den Zielen. Rechts steht, wie sich dein Einkauf ändert.</p>
    ${b.n > 1 && d != null ? `<button class="btn ghost breit klein" data-nurtag="${slot}:${d}">Nur ${esc(tagWort(+d))} ändern statt alle ${b.n} Tage</button>` : ''}
    <section class="card flach">${zeilen || '<p class="muted">Keine passenden Rezepte.</p>'}</section>
    ${b.fix ? `<button class="btn ghost breit" data-loesen="${slot}:${i}">📌 Auswahl lösen (Planer darf wieder wählen)</button>` : ''}`);
}

function rezeptBlatt(id) {
  const r = ctx.alle.get(id);
  if (!r) return;
  const slot = r.mahlzeit.find((m) => ctx.slots.some((s) => s.id === m)) || r.mahlzeit[0];
  const aktiv = ctx.slots.some((s) => s.id === slot);
  if (!sichtP || !person(sichtP)) sichtP = ctx.personen[0].id;
  const jeP = new Map(ctx.personen.map((p) => [p.id, aktiv ? skaliert(ctx, r, slot, p.id) : { z: r.zutaten, n: naehrwerte(ctx, r.zutaten) }]));
  const sk = jeP.get(sichtP);
  const fav = ein.favoriten.includes(id);
  const nope = ein.mag_nicht_gerichte.map(lc).includes(lc(id));
  let tagPos = 0;
  const ziele = (aktiv ? woche.plan[slot] || [] : []).map((b, i) => { const von = tagPos; tagPos += b.n; return `<button class="btn ghost klein" data-waehl="${slot}:${i}:${esc(id)}">${esc(tagName(von).slice(0, 2))}${b.n > 1 ? '–' + esc(tagName(von + b.n - 1).slice(0, 2)) : ''}</button>`; }).join('');
  blatt(r.name, `
    <p class="muted klein" style="margin:0">${esc(r.mahlzeit.map((m) => MZ_NAME[m]).join(', '))} · ${esc(rezeptMeta(r))}</p>
    <div class="fakten">${(r.tags || []).map((t) => `<span class="pill">${TAG_NAME[t] || t}</span>`).join('')}<span class="pill">hält ${r.haelt} ${r.haelt === 1 ? 'Tag' : 'Tage'}</span></div>
    ${r.gesperrt ? `<div class="banner warn">Wird nicht eingeplant: ${esc(r.gesperrt)}.</div>` : ''}
    <h2>Nährwerte je Portion</h2>
    ${ctx.personen.length > 1 ? `<div class="wer" style="margin-top:0">${ctx.personen.map((p) => `<button class="kopf-btn" data-sicht="${p.id}:${esc(id)}" aria-pressed="${p.id === sichtP}">${figur(p.figur, 24, { ruhig: true })}${esc(p.name)}</button>`).join('')}</div>` : ''}
    ${kacheln(sk.n)}
    <h2>Zutaten${ctx.personen.length > 1 ? ' für ' + esc(person(sichtP).name) : ''}</h2>
    <section class="card flach"><ul class="ing">${sk.z.map(([zid, g], i) => {
      const a = ctx.kat.get(zid);
      const alle = [...jeP.values()].reduce((x, s) => x + s.z[i][1], 0);
      return `<li><span><button class="art" data-artikel="${esc(zid)}">${esc(kurzName(a))}</button>${a.angebot && !a.basis ? '<span class="tag deal">Angebot</span>' : ''}<small>${kc(a.n[0] * g / 100)} kcal · ${Math.round(a.n[1] * g / 10) / 10} g Protein</small></span>
        <span class="g"><b>${mengeText(a, g)}</b>${ctx.personen.length > 1 ? `<br>alle: ${mengeText(a, alle)}` : ''}</span></li>`;
    }).join('')}</ul>
      ${(r.gewuerze || []).length ? `<p class="muted klein">Aus dem Schrank: ${esc(r.gewuerze.join(', '))}</p>` : ''}</section>
    <h2>Zubereitung</h2>
    <section class="card"><ol class="steps" style="margin-top:0">${r.schritte.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>${r.tipp ? `<p class="muted klein" style="margin-bottom:0">Tipp: ${esc(r.tipp)}</p>` : ''}</section>
    ${!r.gesperrt && ziele ? `<h2>In die Woche einplanen (${MZ_NAME[slot]})</h2><div class="aktionen" style="margin-top:0">${ziele}</div>` : ''}
    <div class="aktionen"><button class="btn ghost" data-fav="${esc(id)}" aria-pressed="${fav}">${fav ? '♥ Favorit' : '♡ Favorit'}</button><button class="btn ghost" data-nope="${esc(id)}" aria-pressed="${nope}">${nope ? '👎 Abgewählt' : '👎 Nicht mehr vorschlagen'}</button></div>`);
}

function artikelBlatt(id) {
  const a = ctx.kat.get(id);
  if (!a) return;
  const o = a.angebot;
  const inRezepten = [...ctx.alle.values()].filter((r) => r.zutaten.some(([z]) => z === id)).length;
  blatt(a.name, `
    <p class="muted klein" style="margin:0">${esc(a.kat)} · ${a.halt === 'frisch' ? `frisch, hält etwa ${a.tage} Tage` : 'lange haltbar'}${a.basis ? ' · Grundvorrat (wird nicht eingekauft)' : ''}</p>
    <h2>Nährwerte je 100 g</h2>${kacheln(a.n)}
    ${a.stk ? `<p class="muted klein">1 ${esc(a.stkName)} ≈ ${a.stk} g = ${kc(a.n[0] * a.stk / 100)} kcal, ${Math.round(a.n[1] * a.stk / 10) / 10} g Protein</p>` : ''}
    <h2>Preis</h2><section class="card flach">
      <div class="zeile"><span>Normal${a.lose ? ' (je kg)' : ` (${gramm(a.pack)})`}</span><span class="num">${eur(a.preis)}</span></div>
      ${o ? `<div class="zeile"><span>${esc(o.produkt)}<span class="tag deal">−${o.guenstiger} %</span><br><span class="muted klein">${esc([o.menge, o.gueltig_ab ? 'ab ' + o.gueltig_ab : ''].filter(Boolean).join(' · '))}</span></span><span class="num">${eur(ein.karte && o.preis_mit_app ? o.preis_mit_app : o.preis)}</span></div>` : ''}
      <div class="zeile"><span>Protein je Euro</span><span class="num">${Math.round(a.n[1] * a.pack / 100 / a.preis)} g</span></div></section>
    <p class="muted klein">Im Vorrat: ${(vorrat[id] || 0) > 0 ? mengeText(a, vorrat[id]) : 'nichts'} · kommt in ${inRezepten} Rezepten vor</p>
    ${a.basis ? '' : `<div class="aktionen"><button class="btn ghost" data-vorrat-plus="${esc(id)}">Eine Packung in den Vorrat</button><button class="btn ghost" data-suche-nach="${esc(kurzName(a))}">Rezepte damit</button></div>`}`);
}

// ---------------------------------------------------------------- Planungs-Abfrage
function planBlatt() {
  const w = wiz;
  const heute = Math.max(0, heuteIndex());
  const kopfZeile = (n, von, frage) => `<div class="schritt">Schritt ${n} von ${von}</div><div class="frage">${frage}</div>`;
  const weiter = (ok, text = 'Weiter') => `<div class="aktionen"><button class="btn ghost" data-wiz="zurueck">Zurück</button><button class="btn accent" data-wiz="weiter" ${ok ? '' : 'disabled'} style="flex:1">${text}</button></div>`;
  const leute = `<div class="wahl">${ein.profile.map((p) => `<button data-wiz-t="wer:${p.id}" aria-pressed="${w.wer.has(p.id)}">${figur(p.figur, 40, { ruhig: true })}<span>${esc(p.name)}<small>${kc(zieleVon(p).kcal)} kcal · ${zieleVon(p).protein} g Protein am Tag</small></span></button>`).join('')}</div>`;
  let html = '';
  if (w.schritt === 0) {
    html = `<div class="frage">Was brauchst du?</div><div class="wahl">
      <button data-wiz="art:eine">${figur('ei', 46)}<span>Nur eine Mahlzeit<small>z. B. Frühstück für morgen, nur für dich</small></span></button>
      <button data-wiz="art:woche">${figur('karotte', 46, { hut: true })}<span>Mehrere Tage oder die ganze Woche<small>Du wählst Mahlzeiten, Tage und wer mitisst</small></span></button></div>`;
  } else if (w.art === 'eine') {
    if (w.schritt === 1) html = kopfZeile(1, 3, 'Welche Mahlzeit?') + `<div class="wahl raster">${MAHLZEITEN.map((m) => `<button data-wiz="slot:${m.id}">${figur(FIGUR_FUER[m.id], 36, { ruhig: true })}<span>${m.label}</span></button>`).join('')}</div>` + weiter(false);
    if (w.schritt === 2) html = kopfZeile(2, 3, `${MZ_NAME[w.slot]} – für wann?`) + `<div class="wahl tage">${ein.tagNamen.slice(0, ein.tage).map((_, d) => `<button data-wiz="tag:${d}" ${d < heute ? 'style="opacity:.45"' : ''}>${esc(tagWort(d))}<small>${esc(tagName(d).slice(0, 2))}</small></button>`).join('')}</div>` + weiter(false);
    if (w.schritt === 3) html = kopfZeile(3, 3, 'Für wen?') + leute + weiter(w.wer.size > 0, 'Rezepte zeigen');
  } else {
    if (w.schritt === 1) html = kopfZeile(1, 3, 'Welche Mahlzeiten?') + `<div class="wahl raster">${MAHLZEITEN.map((m) => `<button data-wiz-t="mz:${m.id}" aria-pressed="${w.mz.has(m.id)}">${figur(FIGUR_FUER[m.id], 36, { ruhig: true })}<span>${m.label}</span></button>`).join('')}</div>` + weiter(w.mz.size > 0);
    if (w.schritt === 2) html = kopfZeile(2, 3, 'An welchen Tagen?') + `<div class="wahl tage">${ein.tagNamen.slice(0, ein.tage).map((_, d) => `<button data-wiz-t="tage:${d}" aria-pressed="${w.tage.has(d)}">${esc(tagName(d).slice(0, 2))}<small>${d === heute ? 'heute' : d === heute + 1 ? 'morgen' : '&nbsp;'}</small></button>`).join('')}</div>
      <div class="aktionen" style="margin-top:0"><button class="btn ghost klein" data-wiz="alletage">Alle Tage</button><button class="btn ghost klein" data-wiz="abheute">Ab heute</button></div>` + weiter(w.tage.size > 0);
    if (w.schritt === 3) html = kopfZeile(3, 3, 'Für wen?') + leute + `<p class="muted klein">Alles andere in dieser Woche wird nicht eingeplant und steht nicht auf der Einkaufsliste.</p>` + weiter(w.wer.size > 0, 'Plan erstellen');
  }
  blatt('Planen', html);
  wiz = w; // blatt() schließt nichts, aber blattZu() setzt wiz zurück
}

function planAnwenden() {
  const w = wiz;
  if (w.art === 'eine') {
    ein.mahlzeiten[w.slot].an = true;
    rechnen();
    const i = blockTeilen(woche.plan, w.slot, w.tag);
    woche.plan[w.slot][i].fix = false;
    woche.wer[`${w.slot}:${w.tag}`] = [...w.wer];
    tag = w.tag;
    rechnen();
    render();
    wiz = null;
    tauschBlatt(w.slot, i, null);
  } else {
    for (const m of MAHLZEITEN) {
      if (w.mz.has(m.id)) ein.mahlzeiten[m.id].an = true;
      for (let d = 0; d < ein.tage; d++) woche.wer[`${m.id}:${d}`] = w.mz.has(m.id) && w.tage.has(d) ? [...w.wer] : [];
    }
    tag = Math.min(...w.tage);
    blattZu();
    tab = 'woche'; store.set('tab', tab);
    neu({ neuPlanen: true });
    toast('Plan steht – Einkaufsliste ist angepasst.');
  }
}

// ---------------------------------------------------------------- Rezepte
function rezepteAnsicht() {
  const chip = (gruppe, wert, text) => `<button class="fchip" data-filter="${gruppe}:${wert}" aria-pressed="${filter[gruppe] === wert}">${text}</button>`;
  let liste = [...ctx.alle.values()];
  if (filter.mz) liste = liste.filter((r) => r.mahlzeit.includes(filter.mz));
  if (filter.geraet) liste = liste.filter((r) => r.geraet.includes(filter.geraet));
  if (filter.tag === 'fav') liste = liste.filter((r) => ein.favoriten.includes(r.id));
  else if (filter.tag === 'angebot') liste = liste.filter((r) => r.zutaten.some(([id]) => ctx.kat.get(id).angebot));
  else if (filter.tag === 'veggie') liste = liste.filter((r) => !r.zutaten.some(([id]) => (ctx.kat.get(id).tags || []).some((t) => t === 'fleisch' || t === 'fisch')));
  else if (filter.tag) liste = liste.filter((r) => (r.tags || []).includes(filter.tag));
  const q = lc(filter.q);
  if (q) liste = liste.filter((r) => lc(r.name).includes(q) || r.zutaten.some(([id]) => lc(ctx.kat.get(id).name).includes(q)));
  liste.sort((a, b) => (a.gesperrt ? 1 : 0) - (b.gesperrt ? 1 : 0) || a.name.localeCompare(b.name, 'de'));
  const imPlan = new Set(Object.values(woche.plan).flat().map((b) => b.r));
  const nw = (r) => { const n = naehrwerte(ctx, r.zutaten); return `${kc(n[0])} kcal · ${Math.round(n[1])} g Protein`; };
  return `<input class="field" type="search" placeholder="Rezept oder Zutat suchen" value="${esc(filter.q)}" data-suche autocomplete="off" style="margin-top:12px">
    <div class="filter">${chip('mz', '', 'Alle')}${MAHLZEITEN.map((m) => chip('mz', m.id, m.label)).join('')}</div>
    <div class="filter">${chip('geraet', '', 'Jedes Gerät')}${GERAETE.map((g) => chip('geraet', g.id, g.label)).join('')}</div>
    <div class="filter">${chip('tag', '', 'Alles')}${chip('tag', 'angebot', 'Im Angebot')}${chip('tag', 'fav', '♥ Favoriten')}${chip('tag', 'meal-prep', 'Meal Prep')}${chip('tag', 'vorabend', 'Vorabend')}${chip('tag', 'mitnehmen', 'Zum Mitnehmen')}${chip('tag', 'schnell', 'Schnell')}${chip('tag', 'veggie', 'Vegetarisch')}${chip('tag', 'einfrierbar', 'Einfrierbar')}</div>
    <p class="muted klein" style="margin:10px 0 0">${liste.length} Rezepte · Nährwerte je Grundportion</p>
    <section class="card flach">${liste.map((r) => `<div class="rez" data-rezept="${esc(r.id)}"><div><b style="${r.gesperrt ? 'color:var(--muted);text-decoration:line-through' : ''}">${esc(r.name)}</b>${imPlan.has(r.id) ? '<span class="tag used">im Plan</span>' : ''}${r.zutaten.some(([id]) => ctx.kat.get(id).angebot) ? '<span class="tag deal">Angebot</span>' : ''}<small>${esc(r.mahlzeit.map((m) => MZ_NAME[m]).join(', '))} · ${esc(rezeptMeta(r))}<br>${nw(r)}</small></div>
      <button class="herz" data-fav="${esc(r.id)}" aria-pressed="${ein.favoriten.includes(r.id)}" aria-label="Favorit">${ein.favoriten.includes(r.id) ? '♥' : '♡'}</button></div>`).join('') || `<div class="empty">${figur('brokkoli', 64)}Nichts gefunden.</div>`}</section>`;
}

// ---------------------------------------------------------------- Einkauf
const packText = (e) => e.packs.map((p) => (p.lose ? `${gramm(p.g)} lose` : `${p.n}× ${gramm(p.pack)}`)).join(' + ');

function einkaufAnsicht() {
  if (!erg.einkauf.length) {
    return `<div class="empty">${figur('avocado', 84)}<b>Alles da</b>Für den Rest der Woche musst du nichts mehr kaufen.</div>${woche.bezahlt ? `<p class="muted klein" style="text-align:center">Diese Woche eingekauft: ${eur(woche.bezahlt)}</p>` : ''}`;
  }
  const gruppen = new Map();
  for (const e of erg.einkauf) { const k = e.a.kat || 'Sonstiges'; if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(e); }
  const sortiert = [...gruppen.keys()].sort((a, b) => KAT.indexOf(a) - KAT.indexOf(b));
  const offen = erg.einkauf.filter((e) => !woche.haken[e.a.id]).reduce((s, e) => s + e.kosten, 0);
  const n = Object.keys(woche.haken).filter((id) => erg.einkauf.some((e) => e.a.id === id)).length;
  let html = `<section class="card"><div class="sum"><span class="muted">${esc(ladenName(ein.laden))} · geschätzt</span><span class="big">${eur(erg.kosten)}</span></div>
    <div class="sum"><span class="muted klein">${erg.einkauf.length} Artikel · noch offen</span><span class="num">${eur(offen)}</span></div>
    ${erg.ersparnis > 0 ? `<div class="fakten"><span class="pill deal">${eur(erg.ersparnis)} durch Angebote gespart</span></div>` : ''}
    <div class="aktionen"><button class="btn accent" data-act="einraeumen" ${n ? '' : 'disabled'}>${n ? `${n} abgehakte in den Vorrat` : 'Erst abhaken, dann einräumen'}</button><button class="btn ghost" data-act="teilen">Liste teilen</button></div></section>`;
  for (const k of sortiert) {
    html += `<h2>${esc(k)}</h2><section class="card flach"><ul class="shop">` + gruppen.get(k).map((e) => {
      const ok = woche.haken[e.a.id];
      const o = e.packs.find((p) => p.angebot)?.angebot;
      return `<li class="${ok ? 'done' : ''}"><input type="checkbox" data-haken="${esc(e.a.id)}" ${ok ? 'checked' : ''} aria-label="${esc(e.a.name)} abhaken">
        <div class="what" data-artikel="${esc(e.a.id)}">${esc(e.a.name.replace(/ \(lose\)$/, ''))}${e.angebot ? '<span class="tag deal">Angebot</span>' : ''}
          <small>${esc(packText(e))} · für ${esc(e.von.slice(0, 2).join(', '))}${e.von.length > 2 ? ' +' + (e.von.length - 2) : ''}</small>
          ${o ? `<small style="color:var(--deal)">${esc(o.produkt)}${o.gueltig_ab ? ' · ab ' + esc(o.gueltig_ab) : ''}${ein.karte && o.preis_mit_app ? ' · mit App' : ''}</small>` : ''}
          ${e.rest > 0 ? `<small>${e.a.halt === 'frisch' ? '⚠ ' : ''}${gramm(e.rest)} bleiben übrig${e.a.halt === 'frisch' ? '' : ' (haltbar, kommt in den Vorrat)'}</small>` : ''}</div>
        <span class="price">${eur(e.kosten)}</span></li>`;
    }).join('') + `</ul></section>`;
  }
  if (erg.ausVorrat.length) {
    html += `<h2>Schon zu Hause</h2><section class="card flach">${erg.ausVorrat.map((v) => `<div class="zeile"><span>${esc(v.a.name)}</span><span class="num">${mengeText(v.a, v.g)} aus dem Vorrat</span></div>`).join('')}</section>`;
  }
  html += `<p class="muted klein">Preise: Prospektpreise, sonst übliche Discounter-Preise (geschätzt). Öl, Gewürze und Honig gelten als Grundvorrat und stehen nicht auf der Liste. Tippe auf einen Artikel für Nährwerte.</p>`;
  return html;
}

function listeAlsText() {
  const zeilen = [`Einkauf ${ladenName(ein.laden)} (ca. ${eur(erg.kosten)})`, ''];
  const gruppen = new Map();
  for (const e of erg.einkauf) { if (woche.haken[e.a.id]) continue; const k = e.a.kat; if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(e); }
  for (const [k, liste] of gruppen) { zeilen.push(k.toUpperCase()); for (const e of liste) zeilen.push(`☐ ${e.a.name} – ${packText(e)}${e.angebot ? ' (Angebot)' : ''}`); zeilen.push(''); }
  return zeilen.join('\n').trim();
}

// ---------------------------------------------------------------- Vorrat
function vorratAnsicht() {
  const bedarf = new Map();
  for (const b of erg.bloecke) if (b.r && !b.fertig && b.gesamt) for (const [id, g] of b.gesamt) bedarf.set(id, (bedarf.get(id) || 0) + g);
  const eintraege = Object.entries(vorrat).map(([id, g]) => ({ a: ctx.kat.get(id), g })).filter((x) => x.a);
  const gruppen = new Map();
  for (const e of eintraege) { const k = e.a.kat; if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(e); }
  const sortiert = [...gruppen.keys()].sort((a, b) => KAT.indexOf(a) - KAT.indexOf(b));
  let html = `<p class="muted klein" style="margin:14px 0 0">Was zu Hause ist. Abgehakte Einkäufe landen hier, „Zubereitet“ zieht die Mengen wieder ab. Der Planer verbraucht zuerst, was da ist.</p>`;
  if (!eintraege.length) html += `<div class="empty">${figur('ei', 84)}<b>Noch nichts im Vorrat</b>Hake im Einkauf ab, was du gekauft hast, und räume es in den Vorrat – oder trage unten ein, was schon da ist.</div>`;
  for (const k of sortiert) {
    html += `<h2>${esc(k)}</h2><section class="card flach">` + gruppen.get(k).sort((x, y) => x.a.name.localeCompare(y.a.name, 'de')).map(({ a, g }) => {
      const st = vorratStatus(a, g, bedarf.get(a.id) || 0);
      const chip = st === 'leer' ? '<span class="tag bad">leer</span>' : st === 'knapp' ? '<span class="tag warn">reicht nicht für den Plan</span>' : st === 'wenig' ? '<span class="tag warn">wenig</span>' : '';
      const frisch = a.halt === 'frisch' && g > 0 && !(bedarf.get(a.id) > 0) ? '<span class="tag warn">bald verbrauchen</span>' : '';
      return `<div class="zeile"><div class="what" data-artikel="${esc(a.id)}">${esc(a.name)}${chip}${frisch}<small>${g > 0 ? mengeText(a, g) : 'aufgebraucht'}${bedarf.get(a.id) ? ` · Plan braucht ${gramm(bedarf.get(a.id))}` : ''} · ${kc(a.n[0])} kcal/100 g</small></div>
        <div class="mini"><button data-vorrat="${esc(a.id)}:-1" aria-label="weniger">−</button><input class="field" type="number" inputmode="numeric" min="0" step="10" value="${Math.round(g)}" data-vorrat-g="${esc(a.id)}" aria-label="${esc(a.name)} in Gramm"><button data-vorrat="${esc(a.id)}:1" aria-label="mehr">+</button></div></div>`;
    }).join('') + `</section>`;
  }
  const frei = [...ctx.kat.values()].filter((a) => !a.basis && !(a.id in vorrat)).sort((x, y) => x.name.localeCompare(y.name, 'de'));
  html += `<h2>Hinzufügen</h2><section class="card"><form class="add-row" data-form="vorrat" style="margin-top:0">
    <select class="field" name="id" style="flex:2">${frei.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select>
    <input class="field" name="g" type="number" inputmode="numeric" placeholder="Gramm" style="flex:1" aria-label="Menge in Gramm">
    <button class="btn">+</button></form>
    <p class="muted klein" style="margin:8px 0 0">Ohne Mengenangabe wird eine ganze Packung eingetragen.</p></section>`;
  if (eintraege.length) html += `<div class="aktionen"><button class="btn ghost klein" data-act="leere-weg">Leere Einträge entfernen</button></div>`;
  return html;
}

// ---------------------------------------------------------------- Angebote
function angeboteAnsicht() {
  const l = wochenDaten?.laeden?.[ein.laden];
  const vergleich = Object.entries(wochenDaten?.laeden || {}).filter(([, x]) => (x.angebote || []).length).map(([id]) => {
    const c = id === ein.laden ? ctx : kontext(stamm, wochenDaten, { ...ein, laden: id }, vorrat);
    return { id, kosten: id === ein.laden ? erg.kosten : auswerten(c, woche.plan, zustand()).kosten };
  }).sort((a, b) => a.kosten - b.kosten);
  let html = `<section class="card"><label class="feld">Laden<select class="field" data-ein="laden">${LAEDEN.map((x) => `<option value="${x.id}" ${x.id === ein.laden ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    ${vergleich.length > 1 ? `<p class="klein muted" style="margin:10px 0 4px">Dein aktueller Plan kostet bei …</p>${vergleich.map((v, i) => `<div class="zeile"><span>${esc(ladenName(v.id))}${i === 0 ? '<span class="tag used">am günstigsten</span>' : ''}</span><span class="num">${eur(v.kosten)}</span></div>`).join('')}` : ''}</section>`;
  const list = ctx.angebote;
  if (!list.length) {
    return html + `<div class="empty">${figur('tomate', 84)}<b>Keine Angebote für ${esc(ladenName(ein.laden))}</b>${l?.fehler ? esc(l.fehler) : 'Für diesen Laden werden noch keine Prospekte automatisch gelesen. Der Plan rechnet hier mit üblichen Normalpreisen.'}</div>`;
  }
  const gekauft = new Set(erg.einkauf.filter((e) => e.angebot).map((e) => e.a.id));
  const passend = list.filter((o) => o.artikel && o.guenstiger);
  const rest = list.filter((o) => !(o.artikel && o.guenstiger));
  const zeile = (o) => `<div class="zeile"><div class="what" ${o.artikel ? `data-artikel="${esc(o.artikel)}"` : ''}>${esc(o.produkt)}${o.artikel && gekauft.has(o.artikel) ? '<span class="tag used">im Plan</span>' : ''}${o.guenstiger ? `<span class="tag deal">−${o.guenstiger} %</span>` : ''}
      <small>${esc([o.marke, o.menge, o.gueltig_ab ? 'ab ' + o.gueltig_ab : ''].filter(Boolean).join(' · '))}</small></div>
      <div class="price">${eur(ein.karte && o.preis_mit_app ? o.preis_mit_app : o.preis)}${o.preis_mit_app ? `<small>${ein.karte ? 'mit App' : 'App ' + eur(o.preis_mit_app)}</small>` : ''}</div></div>`;
  html += `<p class="muted klein" style="margin:14px 0 0">${list.length} Lebensmittel-Angebote${l.von ? `, gültig ${datumKurz(l.von)} – ${datumKurz(l.bis)}` : ''}. ${l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">Prospekt öffnen</a>` : ''}</p>`;
  if (passend.length) html += `<h2>Für deine Rezepte nutzbar</h2><section class="card flach">${passend.map(zeile).join('')}</section>`;
  html += `<h2>Weitere Angebote</h2><section class="card flach">${rest.map(zeile).join('')}</section>`;
  return html;
}

// ---------------------------------------------------------------- Profil
function personBlatt(pid) {
  const p = ein.profile.find((x) => x.id === pid);
  if (!p) return;
  const b = bedarfRechnen(p), z = zieleVon(p);
  const zahl = (feld, text, wert, mehr = '') => `<label>${text}<input class="field" type="number" inputmode="decimal" data-p="${pid}:${feld}" value="${esc(wert)}" ${mehr}></label>`;
  const wahl = (feld, text, optionen, wert) => `<label>${text}<select class="field" data-p="${pid}:${feld}">${optionen.map(([v, t]) => `<option value="${v}" ${String(v) === String(wert) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  blatt(p.name || 'Person', `
    <div class="figuren-wahl">${FIGUREN.map((f) => `<button data-p-figur="${pid}:${f}" aria-pressed="${p.figur === f}" aria-label="${f}">${figur(f, 44, { ruhig: p.figur !== f })}</button>`).join('')}</div>
    <h2>Über diese Person</h2><section class="card"><div class="grid2">
      <label style="grid-column:1/-1">Name<input class="field" data-p="${pid}:name" value="${esc(p.name)}" autocomplete="off"></label>
      ${wahl('geschlecht', 'Geschlecht', [['m', 'Männlich'], ['w', 'Weiblich']], p.geschlecht)}
      ${zahl('alter', 'Alter (Jahre)', p.alter)}
      ${zahl('groesse', 'Größe (cm)', p.groesse)}
      ${zahl('gewicht', 'Gewicht (kg)', p.gewicht, 'step="0.1"')}
      <div style="grid-column:1/-1" class="feld">${wahl('aktiv', 'Alltag & Sport', AKTIV, p.aktiv)}</div>
      <div style="grid-column:1/-1" class="feld">${wahl('ziel', 'Was willst du erreichen?', ZIELE, p.ziel)}</div></div></section>
    <h2>Berechneter Tagesbedarf</h2>
    ${kacheln([b.kcal, b.protein, b.fett, b.kh])}
    <p class="muted klein">Grundumsatz ${kc(b.grund)} kcal, mit Bewegung ${kc(b.umsatz)} kcal. ${p.ziel === 'abnehmen' ? 'Zum Abnehmen 20 % darunter.' : p.ziel === 'aufbauen' ? 'Zum Aufbauen 10 % darüber.' : ''} Richtwerte nach der Mifflin-St-Jeor-Formel – kein Ersatz für ärztlichen Rat.</p>
    <section class="card flach">
      <label class="schalter"><span>Eigene Zielwerte statt Berechnung</span><input type="checkbox" data-p-bool="${pid}:manuell" ${p.manuell ? 'checked' : ''}></label>
      ${(ein.extras || []).length ? `<label class="schalter"><span>Shakes einrechnen<br><span class="muted klein">${ein.extras.map((e) => esc(e.name.replace(/\s*\(.*\)/, ''))).join(', ')}</span></span><input type="checkbox" data-p-bool="${pid}:extras" ${p.extras ? 'checked' : ''}></label>` : ''}</section>
    ${p.manuell ? `<section class="card"><div class="grid2">${zahl('kcal', 'Kalorien (kcal)', z.kcal)}${zahl('protein', 'Protein (g)', z.protein)}${zahl('fett', 'Fett (g)', z.fett)}${zahl('kh', 'Kohlenhydrate (g)', z.kh)}</div></section>` : ''}
    <div class="aktionen"><button class="btn accent" data-act="zu" style="flex:1">Fertig</button>${ein.profile.length > 1 ? `<button class="btn ghost" data-p-weg="${pid}">Person entfernen</button>` : ''}</div>`);
  blattArt = 'person:' + pid;
}
// Neu zeichnen erst nach dem laufenden Ereignis – und nur, wenn das Blatt noch offen ist.
const personNeu = (pid) => setTimeout(() => { if (blattArt === 'person:' + pid) personBlatt(pid); else render(); });

function profilAnsicht() {
  const schalter = (text, attr, an) => `<label class="schalter"><span>${text}</span><input type="checkbox" ${attr} ${an ? 'checked' : ''}></label>`;
  const chips = (liste, feld) => liste.length ? `<div class="chips">${liste.map((x, i) => `<span class="chip">${esc(ctx.alle.get(x)?.name || x)}<button data-del="${feld}:${i}" aria-label="entfernen">×</button></span>`).join('')}</div>` : `<span class="muted klein">Noch nichts.</span>`;
  let html = `<h2>Wer isst mit?</h2><section class="card flach">${ctx.personen.map((p) => `<div class="person-karte" data-person="${p.id}">${figur(p.figur, 48)}<div class="what"><b>${esc(p.name)}</b><small>${kc(p.z.kcal)} kcal · ${p.z.protein} g Protein · ${p.z.fett} g Fett · ${p.z.kh} g KH am Tag${p.manuell ? ' (eigene Werte)' : ` · ${ZIELE.find(([v]) => v === p.ziel)?.[1] || ''}`}</small></div><span class="muted">›</span></div>`).join('')}</section>
    <div class="aktionen" style="margin-top:0"><button class="btn ghost klein" data-act="person-neu">＋ Person hinzufügen</button></div>

    <h2>Einkauf</h2><section class="card"><label class="feld">Laden<select class="field" data-ein="laden">${LAEDEN.map((l) => `<option value="${l.id}" ${l.id === ein.laden ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
    <div style="margin-top:8px">${schalter('Preise mit Kundenkarte/App (z. B. Lidl Plus)', 'data-bool="karte"', ein.karte)}</div></section>

    <h2>Mahlzeiten</h2><section class="card flach">${MAHLZEITEN.map((m) => {
      const e = ein.mahlzeiten[m.id];
      return `<div class="schalter"><span>${m.label}<br><span class="muted klein">${e.an ? `jedes Gericht für <select class="field" data-mz-tage="${m.id}" style="display:inline-block;width:auto;padding:4px 28px 4px 8px;font-size:14px">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === e.tage ? 'selected' : ''}>${n} ${n === 1 ? 'Tag' : 'Tage'}</option>`).join('')}</select>` : 'nicht geplant'}</span></span><input type="checkbox" data-mz="${m.id}" ${e.an ? 'checked' : ''} aria-label="${m.label} planen"></div>`;
    }).join('')}
      ${schalter('Mittag nur Gerichte, die kalt schmecken', 'data-mz-kalt="mittag"', ein.mahlzeiten.mittag.kalt)}</section>

    <h2>Küche</h2><section class="card flach">
      ${GERAETE.filter((g) => g.id !== 'keins').map((g) => schalter(g.label + (g.id === 'airfryer' ? ' (Ninja Crispi)' : ''), `data-geraet="${g.id}"`, ein.geraete[g.id] !== false)).join('')}
      ${schalter('Heißluftfritteuse bevorzugen', 'data-bool="airfryer_lieber"', ein.airfryer_lieber)}</section>

    <h2>Ernährung</h2><section class="card flach">
      ${schalter('Kein Schweinefleisch', 'data-bool="kein_schwein"', ein.kein_schwein)}
      ${schalter('Vegetarisch', 'data-bool="vegetarisch"', ein.vegetarisch)}</section>

    <h2>Mag ich nicht – Zutaten</h2><section class="card">${chips(ein.mag_nicht, 'mag_nicht')}
      <form class="add-row" data-form="mag_nicht"><input class="field" name="x" placeholder="z. B. Rosenkohl" autocomplete="off" enterkeyhint="done"><button class="btn">Hinzufügen</button></form></section>

    <h2>Abgewählte Gerichte</h2><section class="card">${chips(ein.mag_nicht_gerichte, 'mag_nicht_gerichte')}</section>`;

  const laeden = Object.entries(wochenDaten?.laeden || {});
  html += `<h2>Angebote & Daten</h2><section class="card klein">
    <p style="margin:0 0 6px">${ctx.alle.size} Rezepte, ${ctx.kat.size} Produkte. Die App läuft ganz auf deinem Handy – deine Eingaben bleiben hier gespeichert. Die Prospekte werden jeden Sonntag automatisch neu gelesen.</p>
    ${laeden.map(([id, l]) => `<div class="zeile"><span>${esc(ladenName(id))}</span><span class="num">${l.fehler ? '⚠ ' + esc(l.fehler.slice(0, 60)) : `${(l.angebote || []).length} Angebote${l.bis ? ' bis ' + datumKurz(l.bis) : ''}`}</span></div>`).join('') || '<span class="muted">Noch keine Angebote geladen.</span>'}
    ${GH ? `<div class="aktionen"><a class="btn ghost klein" href="https://github.com/${GH.owner}/${GH.repo}/actions/workflows/wochenplan.yml" target="_blank" rel="noopener">Jetzt neu lesen lassen (GitHub)</a></div>` : ''}</section>
    <div class="aktionen"><button class="btn ghost klein" data-act="woche-neu">Diese Woche komplett neu planen</button></div>`;
  return html;
}

// ---------------------------------------------------------------- Render
function render() {
  document.querySelectorAll('nav button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  const v = $('#view');
  if (!stamm || !ctx) { $('#sub').textContent = ''; v.innerHTML = `<div class="empty">${figur('karotte', 84)}<b>Keine Verbindung</b>Rezepte und Produkte konnten nicht geladen werden. Bitte einmal mit Internet öffnen.</div>`; return; }
  kopf();
  const fokus = document.activeElement?.matches?.('[data-suche]');
  v.innerHTML = { woche: wocheAnsicht, rezepte: rezepteAnsicht, einkauf: einkaufAnsicht, vorrat: vorratAnsicht, angebote: angeboteAnsicht, profil: profilAnsicht }[tab]();
  if (fokus) { const i = $('[data-suche]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  dock();
}
const neu = (opt) => { rechnen(opt); render(); };
const hatFortschritt = () => (woche.bezahlt || 0) > 0 || Object.keys(woche.fertig).length > 0;

// ---------------------------------------------------------------- Aktionen
function fertigUmschalten(schluessel) {
  const [slot, start] = schluessel.split(':');
  const b = erg.bloecke.find((x) => x.slot === slot && x.start === +start);
  if (!b || !b.r) return;
  if (woche.fertig[schluessel]) {
    for (const [id, g] of Object.entries(woche.abzug[schluessel] || {})) vorrat[id] = (vorrat[id] || 0) + g;
    delete woche.fertig[schluessel]; delete woche.abzug[schluessel];
    toast('Zurückgenommen – Mengen sind wieder im Vorrat.');
  } else {
    const ab = {};
    for (const [id, g] of b.menge || []) {
      const a = ctx.kat.get(id);
      if (a.basis || !(vorrat[id] > 0)) continue;
      const m = Math.min(vorrat[id], g);
      vorrat[id] = Math.round(vorrat[id] - m); ab[id] = m;
    }
    woche.fertig[schluessel] = true; woche.abzug[schluessel] = ab;
    toast(Object.keys(ab).length ? 'Zubereitet – Zutaten vom Vorrat abgezogen.' : 'Als zubereitet markiert.');
  }
  neu();
}

function einraeumen() {
  let n = 0, summe = 0;
  for (const e of erg.einkauf) {
    if (!woche.haken[e.a.id]) continue;
    const g = e.packs.reduce((s, p) => s + (p.lose ? p.g : p.n * p.pack), 0);
    vorrat[e.a.id] = Math.round((vorrat[e.a.id] || 0) + g);
    summe += e.kosten; n++;
  }
  woche.bezahlt = (woche.bezahlt || 0) + summe;
  woche.haken = {};
  neu();
  toast(`${n} Artikel in den Vorrat gelegt.`);
}

function wizKlick(t) {
  const w = wiz;
  const [k, v] = (t.dataset.wiz || '').split(':');
  if (k === 'art') { w.art = v; w.schritt = 1; }
  else if (k === 'slot') { w.slot = v; w.schritt = 2; }
  else if (k === 'tag') { w.tag = +v; w.schritt = 3; }
  else if (k === 'zurueck') w.schritt = Math.max(0, w.schritt - 1);
  else if (k === 'alletage') w.tage = new Set(Array.from({ length: ein.tage }, (_, d) => d));
  else if (k === 'abheute') w.tage = new Set(Array.from({ length: ein.tage }, (_, d) => d).filter((d) => d >= Math.max(0, heuteIndex())));
  else if (k === 'weiter') { if (w.schritt === 3) { planAnwenden(); return; } w.schritt++; }
  planBlatt();
}

document.addEventListener('click', async (e) => {
  const t = e.target;
  const nb = t.closest('nav button, [data-tab-go]');
  if (nb) { tab = nb.dataset.tab || nb.dataset.tabGo; store.set('tab', tab); blattZu(); render(); scrollTo(0, 0); return; }
  if (t.id === 'sheet' || t.closest('[data-act="zu"]')) { blattZu(); render(); return; }
  const wb = t.closest('[data-wiz]'); if (wb && wiz) { wizKlick(wb); return; }
  const wt = t.closest('[data-wiz-t]');
  if (wt && wiz) { const [k, v] = wt.dataset.wizT.split(':'); const wert = k === 'tage' ? +v : v; if (wiz[k].has(wert)) wiz[k].delete(wert); else wiz[k].add(wert); planBlatt(); return; }
  const day = t.closest('.day'); if (day) { tag = +day.dataset.day; render(); return; }
  const fav = t.closest('[data-fav]');
  if (fav) { e.stopPropagation(); const id = fav.dataset.fav; ein.favoriten = ein.favoriten.includes(id) ? ein.favoriten.filter((x) => x !== id) : [...ein.favoriten, id]; rechnen(); if (!$('#sheet').hidden) rezeptBlatt(id); render(); return; }
  const nope = t.closest('[data-nope]');
  if (nope) { const id = nope.dataset.nope; const an = ein.mag_nicht_gerichte.includes(id); ein.mag_nicht_gerichte = an ? ein.mag_nicht_gerichte.filter((x) => x !== id) : [...ein.mag_nicht_gerichte, id]; blattZu(); neu(); toast(an ? 'Wird wieder vorgeschlagen.' : 'Kommt nicht mehr in deine Pläne.'); return; }
  const waehl = t.closest('[data-waehl]');
  if (waehl) { const [slot, i, id] = waehl.dataset.waehl.split(':'); woche.plan[slot][+i] = { ...woche.plan[slot][+i], r: id, fix: true }; blattZu(); tab = 'woche'; store.set('tab', tab); neu(); toast('Eingeplant – Einkaufsliste ist angepasst.'); return; }
  const nurtag = t.closest('[data-nurtag]');
  if (nurtag) { const [slot, d] = nurtag.dataset.nurtag.split(':'); const i = blockTeilen(woche.plan, slot, +d); rechnen(); render(); tauschBlatt(slot, i, null); return; }
  const loesen = t.closest('[data-loesen]');
  if (loesen) { const [slot, i] = loesen.dataset.loesen.split(':'); woche.plan[slot][+i].fix = false; blattZu(); neu(); return; }
  const sicht = t.closest('[data-sicht]'); if (sicht) { const [pid, id] = sicht.dataset.sicht.split(':'); sichtP = pid; rezeptBlatt(id); return; }
  const such = t.closest('[data-suche-nach]'); if (such) { filter = { mz: '', geraet: '', tag: '', q: such.dataset.sucheNach }; tab = 'rezepte'; store.set('tab', tab); blattZu(); render(); scrollTo(0, 0); return; }
  const vp = t.closest('[data-vorrat-plus]'); if (vp) { const a = ctx.kat.get(vp.dataset.vorratPlus); vorrat[a.id] = Math.round((vorrat[a.id] || 0) + a.pack); blattZu(); neu(); toast(`${a.name} ist im Vorrat.`); return; }
  const art = t.closest('[data-artikel]'); if (art && !t.closest('input,button:not(.art)')) { artikelBlatt(art.dataset.artikel); return; }
  const rz = t.closest('[data-rezept]'); if (rz) { rezeptBlatt(rz.dataset.rezept); return; }
  const tausch = t.closest('[data-tausch]'); if (tausch) { const [slot, i, d] = tausch.dataset.tausch.split(':'); tauschBlatt(slot, +i, d ?? null); return; }
  const fertig = t.closest('[data-fertig]'); if (fertig) { fertigUmschalten(fertig.dataset.fertig); return; }
  const wer = t.closest('[data-wer]');
  if (wer) { const [slot, d, pid] = wer.dataset.wer.split(':'); const k = `${slot}:${d}`; const da = esserAm(slot, +d); woche.wer[k] = da.includes(pid) ? da.filter((x) => x !== pid) : [...da, pid]; neu(); return; }
  const einp = t.closest('[data-einplanen]'); if (einp) { delete woche.wer[einp.dataset.einplanen]; neu(); return; }
  const pers = t.closest('[data-person]'); if (pers) { personBlatt(pers.dataset.person); return; }
  const pf = t.closest('[data-p-figur]'); if (pf) { const [pid, f] = pf.dataset.pFigur.split(':'); ein.profile.find((p) => p.id === pid).figur = f; rechnen(); personBlatt(pid); return; }
  const pw = t.closest('[data-p-weg]'); if (pw) { ein.profile = ein.profile.filter((p) => p.id !== pw.dataset.pWeg); blattZu(); neu(); return; }
  const fc = t.closest('[data-filter]');
  if (fc) { const [g, w] = fc.dataset.filter.split(':'); filter[g] = w; render(); return; }
  const vr = t.closest('[data-vorrat]');
  if (vr) { const [id, r] = vr.dataset.vorrat.split(':'); const a = ctx.kat.get(id); const schritt = a.stk && a.stk <= 200 ? a.stk : Math.max(10, Math.round(a.pack / 4 / 10) * 10); vorrat[id] = Math.max(0, Math.round((vorrat[id] || 0) + +r * schritt)); neu(); return; }
  const del = t.closest('[data-del]');
  if (del) { const [feld, i] = del.dataset.del.split(':'); ein[feld].splice(+i, 1); neu(); return; }
  const act = t.closest('[data-act]')?.dataset.act;
  if (act === 'planen') { wiz = { schritt: 0, art: '', mz: new Set(ctx.slots.map((s) => s.id)), tage: new Set(Array.from({ length: ein.tage }, (_, d) => d)), wer: new Set(ein.profile.map((p) => p.id)), slot: '', tag: 0 }; planBlatt(); }
  if (act === 'wuerfeln') { woche.seed++; neu({ neuPlanen: true }); toast('Neue Vorschläge – 📌 gewählte Gerichte bleiben.'); }
  if (act === 'woche-neu') { woche.seed++; for (const b of Object.values(woche.plan).flat()) b.fix = false; woche.wer = {}; neu({ neuPlanen: true, neuStruktur: true }); tab = 'woche'; render(); scrollTo(0, 0); }
  if (act === 'person-neu') { const id = 'p' + Date.now().toString(36); ein.profile.push({ id, name: 'Person ' + (ein.profile.length + 1), figur: FIGUREN[ein.profile.length % FIGUREN.length], geschlecht: 'w', alter: 30, groesse: 168, gewicht: 65, aktiv: 1.4, ziel: 'halten', manuell: false, extras: false }); neu(); personBlatt(id); }
  if (act === 'einraeumen') einraeumen();
  if (act === 'leere-weg') { for (const id of Object.keys(vorrat)) if (!(vorrat[id] > 0)) delete vorrat[id]; neu(); }
  if (act === 'teilen') {
    const text = listeAlsText();
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Liste kopiert.'); } } catch {}
  }
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === 'mag_nicht') { const v = f.x.value.trim(); if (v && !ein.mag_nicht.some((x) => lc(x) === lc(v))) ein.mag_nicht.push(v); neu(); }
  if (f.dataset.form === 'vorrat') { const a = ctx.kat.get(f.id.value); if (a) { vorrat[a.id] = Math.round(Number(f.g.value) > 0 ? Number(f.g.value) : a.pack); neu(); } }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.haken) { if (t.checked) woche.haken[t.dataset.haken] = 1; else delete woche.haken[t.dataset.haken]; sichern(); render(); return; }
  if (t.dataset.p) {
    const [pid, feld] = t.dataset.p.split(':');
    const p = ein.profile.find((x) => x.id === pid);
    p[feld] = ['name', 'geschlecht', 'ziel'].includes(feld) ? (t.value.trim() || p[feld]) : Math.max(0, Number(String(t.value).replace(',', '.')) || 0);
    rechnen(); personNeu(pid); return;
  }
  if (t.dataset.pBool) {
    const [pid, feld] = t.dataset.pBool.split(':');
    const p = ein.profile.find((x) => x.id === pid);
    if (feld === 'manuell' && t.checked) Object.assign(p, (({ kcal, protein, fett, kh }) => ({ kcal, protein, fett, kh }))(bedarfRechnen(p)));
    p[feld] = t.checked; rechnen(); personNeu(pid); return;
  }
  if (t.dataset.ein === 'laden') { ein.laden = t.value; neu({ neuPlanen: !hatFortschritt() }); return; }
  if (t.dataset.bool) { ein[t.dataset.bool] = t.checked; neu({ neuPlanen: !hatFortschritt() && t.dataset.bool !== 'karte' }); return; }
  if (t.dataset.geraet) { ein.geraete[t.dataset.geraet] = t.checked; neu(); return; }
  if (t.dataset.mz) { ein.mahlzeiten[t.dataset.mz].an = t.checked; neu(); return; }
  if (t.dataset.mzTage) { ein.mahlzeiten[t.dataset.mzTage].tage = +t.value; neu(); return; }
  if (t.dataset.mzKalt) { ein.mahlzeiten[t.dataset.mzKalt].kalt = t.checked; neu(); return; }
  if (t.dataset.vorratG) { vorrat[t.dataset.vorratG] = Math.max(0, Math.round(Number(t.value) || 0)); neu(); }
});
document.addEventListener('input', (e) => { if (e.target.matches('[data-suche]')) { filter.q = e.target.value; render(); } });
document.addEventListener('visibilitychange', async () => { if (!document.hidden && stamm) { const p = await holeJson('plan.json', true); if (p && p.stand !== wochenDaten?.stand) { wochenDaten = p; store.set('plan', p); neu(); } else if (woche && woche.id !== wochenStart()) neu(); } });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
laden().then(() => neu());
