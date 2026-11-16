// Oberfläche der Wochenplan-App. Die Rechenlogik steckt in planer.js.
import {
  MAHLZEITEN, GERAETE, LAEDEN, standardEinstellungen, kontext, auswerten, planen, alternativen,
  skaliert, mengeText, gramm, vorratStatus, wochenStart, teilen, kandidaten,
} from './planer.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const kc = (n) => Math.round(Number(n) || 0).toLocaleString('de-DE');
const lc = (s) => String(s).trim().toLowerCase();
const store = {
  get(k, d) { try { const v = localStorage.getItem('wp2:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wp2:' + k, JSON.stringify(v)); } catch {} },
};
const KAT = ['Obst', 'Gemüse', 'Brot & Backwaren', 'Fleisch & Fisch', 'Milch & Käse', 'Eier', 'Nudeln, Reis & Getreide', 'Konserven & Saucen', 'Öl & Gewürze', 'Tiefkühl', 'Getränke', 'Snacks & Süßes', 'Sonstiges'];
const GERAET_NAME = Object.fromEntries(GERAETE.map((g) => [g.id, g.label]));
const MZ_NAME = Object.fromEntries(MAHLZEITEN.map((m) => [m.id, m.label]));
const TAG_NAME = { 'meal-prep': 'Meal Prep', vorabend: 'Vorabend', mitnehmen: 'Zum Mitnehmen', kalt: 'Kalt', schnell: 'Schnell', einfrierbar: 'Einfrierbar' };

// ---------------------------------------------------------------- Zustand
let stamm = null;            // {artikel, rezepte}
let wochenDaten = null;      // plan.json (Angebote der Läden)
let ein = null;              // Einstellungen
let vorrat = store.get('vorrat', {});
let woche = null;            // {id, plan, aus, fertig, abzug, seed, haken, bezahlt}
let ctx = null, erg = null;
let tab = store.get('tab', 'woche');
let tag = null;
let filter = { mz: '', geraet: '', tag: '', q: '' };
let toastMsg = null;

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
  const gesp = store.get('ein', null);
  ein = gesp ? { ...std, ...gesp, ziele: { ...std.ziele, ...gesp.ziele }, mahlzeiten: { ...std.mahlzeiten, ...gesp.mahlzeiten }, geraete: { ...std.geraete, ...gesp.geraete }, extras: std.extras, tagNamen: std.tagNamen, tage: std.tage } : std;
}

const zustand = () => ({ aus: woche.aus, fertig: woche.fertig, seed: woche.seed, letzte: store.get('letzte', []) });
const sichern = () => { store.set('ein', ein); store.set('vorrat', vorrat); store.set('woche', woche); };

function planPasst() {
  for (const s of ctx.slots) {
    const b = woche.plan?.[s.id];
    const soll = teilen(ein.tage, ein.mahlzeiten[s.id].tage);
    if (!b || b.length !== soll.length || b.some((x, i) => x.n !== soll[i])) return false;
    if (b.some((x) => x.r && !ctx.rezepte.has(x.r))) return false;
    if (b.some((x) => !x.r && !x.fix) && kandidaten(ctx, s.id).length) return false;
  }
  return true;
}

/** Baut alles neu auf: Kontext, ggf. neuer Plan, Auswertung. */
function rechnen({ neuPlanen = false } = {}) {
  if (!stamm) return;
  const id = wochenStart();
  if (!woche) woche = store.get('woche', null);
  if (!woche || woche.id !== id) {
    if (woche?.plan) store.set('letzte', Object.values(woche.plan).flat().map((b) => b.r).filter(Boolean));
    woche = { id, plan: null, aus: {}, fertig: {}, abzug: {}, seed: 1, haken: {}, bezahlt: 0 };
  }
  ctx = kontext(stamm, wochenDaten, ein, vorrat);
  if (neuPlanen || !woche.plan || !planPasst()) woche.plan = planen(ctx, zustand(), woche.plan);
  erg = auswerten(ctx, woche.plan, zustand());
  sichern();
}

function toast(text, bad) { toastMsg = { text, bad }; dock(); clearTimeout(toast.t); toast.t = setTimeout(() => { toastMsg = null; dock(); }, 3800); }
function dock() { $('#dock').innerHTML = toastMsg ? `<div class="status ${toastMsg.bad ? 'bad' : ''}">${esc(toastMsg.text)}</div>` : ''; }

// ---------------------------------------------------------------- Kopf
const ladenName = (id) => LAEDEN.find((l) => l.id === id)?.name || id;
const datumKurz = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

function kopf() {
  const von = new Date(woche.id + 'T12:00:00');
  const bis = new Date(von.getTime() + (ein.tage - 1) * 86400000);
  const f = (d) => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  $('#sub').textContent = `${f(von)} – ${f(bis)} · ${ladenName(ein.laden)} · ${ein.personen} ${ein.personen === 1 ? 'Person' : 'Personen'}`;
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
const tagName = (d) => ein.tagNamen[d] || 'Tag ' + (d + 1);
const heuteIndex = () => { const d = Math.round((new Date(wochenStart(new Date()) + 'T12:00:00') - new Date(woche.id + 'T12:00:00')) / 86400000); return d === 0 ? (new Date().getDay() + 6) % 7 : -1; };

function steuerKarte() {
  const mitAngeboten = new Set(Object.entries(wochenDaten?.laeden || {}).filter(([, l]) => (l.angebote || []).length).map(([id]) => id));
  return `<section class="card"><div class="steuer">
    <label>Wo kaufst du ein?<select class="field" data-ein="laden">${LAEDEN.map((l) => `<option value="${l.id}" ${l.id === ein.laden ? 'selected' : ''}>${esc(l.name)}${mitAngeboten.has(l.id) ? '' : ' (ohne Angebote)'}</option>`).join('')}</select></label>
    <label>Personen<div class="stepper"><button data-pers="-1" aria-label="Eine Person weniger">−</button><span>${ein.personen}</span><button data-pers="1" aria-label="Eine Person mehr">+</button></div></label>
  </div></section>`;
}

function summenKarte() {
  const genutzt = erg.einkauf.filter((e) => e.angebot).length;
  const gesamtPortionen = erg.bloecke.reduce((s, b) => s + (b.r ? b.portionen : 0), 0);
  const gesamt = erg.kosten + (woche.bezahlt || 0);
  const pills = [];
  if (gesamtPortionen) pills.push(`<span class="pill">${eur(gesamt / gesamtPortionen)} pro Portion</span>`);
  if (genutzt) pills.push(`<span class="pill deal">${genutzt} ${genutzt === 1 ? 'Angebot' : 'Angebote'} · ${eur(erg.ersparnis)} gespart</span>`);
  if (erg.ausVorrat.length) pills.push(`<span class="pill ok">${erg.ausVorrat.length}× aus dem Vorrat</span>`);
  pills.push(erg.resteFrisch.length
    ? `<span class="pill warn">Rest: ${erg.resteFrisch.map((r) => `${gramm(r.g)} ${esc(r.a.name)}`).join(', ')}</span>`
    : `<span class="pill ok">Nichts Frisches bleibt übrig</span>`);
  return `<section class="card">
    <div class="sum"><span class="muted">${woche.bezahlt ? 'Noch einzukaufen' : 'Wocheneinkauf ca.'}</span><span class="big">${eur(erg.kosten)}</span></div>
    ${woche.bezahlt ? `<div class="sum"><span class="muted klein">Schon eingekauft</span><span class="num">${eur(woche.bezahlt)}</span></div>` : ''}
    <div class="fakten">${pills.join('')}</div>
    <div class="aktionen"><button class="btn ghost klein" data-act="wuerfeln">↻ Neu würfeln</button><button class="btn ghost klein" data-tab-go="einkauf">Einkaufsliste</button></div>
  </section>`;
}

function mahlzeitKarte(b, d) {
  const s = MZ_NAME[b.slot];
  const key = `${b.slot}:${d}`;
  if (woche.aus[key]) return `<section class="card aus"><span><span class="slot">${s}</span><br><span class="muted">ausgelassen</span></span><button class="btn ghost klein" data-aus="${key}">Wieder einplanen</button></section>`;
  if (!b.r) return `<section class="card aus"><span><span class="slot">${s}</span><br><span class="muted">Kein passendes Rezept</span></span><button class="btn ghost klein" data-tausch="${b.slot}:${b.i}">Auswählen</button></section>`;
  const p = ein.personen, r = b.r;
  const kochtag = b.tage[0];
  const erster = d === kochtag;
  const vorabend = (r.tags || []).includes('vorabend');
  const reicht = (r.haelt || 3) >= b.tage.length;
  const wann = b.fertig ? 'fertig zubereitet'
    : !reicht ? (vorabend ? 'Am Vorabend vorbereiten' : '')
      : erster ? (b.tage.length > 1 ? `${vorabend ? 'Am Vorabend vorbereiten' : 'Kochtag'} · reicht für ${b.tage.length} Tage` : vorabend ? 'Am Vorabend vorbereiten' : '')
        : `vorbereitet am ${tagName(kochtag)}`;
  const zeilen = b.z.map(([id, g]) => {
    const a = ctx.kat.get(id);
    return `<li><span>${esc(a.name.replace(/ \(.*\)$/, ''))}${a.angebot && !a.basis ? '<span class="tag deal">Angebot</span>' : ''}${(vorrat[id] || 0) > 0 ? '<span class="tag used">Vorrat</span>' : ''}</span>
      <span class="g"><b>${mengeText(a, g)}</b>${erster && b.portionen > 1 ? `<br>${mengeText(a, g * b.portionen)} gesamt` : ''}</span></li>`;
  }).join('');
  return `<section class="card ${b.fertig ? 'fertig' : ''}">
    <div class="meal-head"><span class="slot">${s} · ${r.geraet.map((g) => GERAET_NAME[g]).join(' + ')} · ${r.zeit} Min.</span><span class="kcal-pill">${kc(b.nw[0])} kcal</span></div>
    <div class="meal-name">${esc(r.name)}${b.fix ? ' <span title="von dir gewählt">📌</span>' : ''}</div>
    <div class="macro-line">${Math.round(b.nw[1])} g Protein · ${Math.round(b.nw[2])} g Fett · ${Math.round(b.nw[3])} g KH${p > 1 ? ' · pro Person' : ''}</div>
    ${wann ? `<div class="hint">${esc(wann)}</div>` : ''}
    ${erster || !reicht ? b.hinweise.filter((h) => erster || h.art === 'lang').map((h) => `<div class="hint warn">${esc(h.text)}</div>`).join('') : ''}
    <ul class="ing">${zeilen}</ul>
    <details><summary>Zubereitung</summary>
      ${(r.gewuerze || []).length ? `<p class="muted klein" style="margin:4px 0">Aus dem Schrank: ${esc(r.gewuerze.join(', '))}</p>` : ''}
      <ol class="steps">${r.schritte.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      ${r.tipp ? `<p class="muted klein">Tipp: ${esc(r.tipp)}</p>` : ''}
    </details>
    <div class="aktionen">
      <button class="btn ghost klein" data-tausch="${b.slot}:${b.i}">Tauschen</button>
      <button class="btn ghost klein" data-fertig="${b.slot}:${b.i}" aria-pressed="${b.fertig}">${b.fertig ? '✓ Zubereitet' : 'Zubereitet'}</button>
      <button class="btn ghost klein" data-aus="${key}">Heute auslassen</button>
    </div>
  </section>`;
}

function wocheAnsicht() {
  const heute = heuteIndex();
  if (tag == null || tag >= ein.tage) tag = heute >= 0 && heute < ein.tage ? heute : 0;
  const t = erg.tage[tag];
  let html = steuerKarte() + summenKarte();
  html += `<div class="days" role="group" aria-label="Tag wählen">` + erg.tage.map((x) => `<button class="day" data-day="${x.d}" aria-pressed="${x.d === tag}">${esc(tagName(x.d).slice(0, 2))}${x.d === heute ? '<span class="today" aria-label="heute"></span>' : ''}</button>`).join('') + `</div>`;
  for (const s of ctx.slots) {
    const b = erg.bloecke.find((x) => x.slot === s.id && tag >= x.start && tag < x.start + x.n);
    if (b) html += mahlzeitKarte(b, tag);
  }
  const z = ein.ziele;
  html += `<section class="card"><div class="slot">${esc(tagName(tag))} · ${ein.personen > 1 ? 'pro Person' : 'gesamt'}</div>
    <div class="day-total"><span class="big">${kc(t.n[0])}</span><span class="muted">von ${kc(z.kcal)} kcal</span></div>
    <div class="totals">${balken('Protein', t.n[1], z.protein, 'g')}${balken('Fett', t.n[2], z.fett, 'g')}${balken('Kohlenh.', t.n[3], z.kh, 'g')}</div>
    ${(ein.extras || []).length ? `<p class="muted klein" style="margin:10px 0 0">Inklusive ${ein.extras.map((e) => esc(e.name.replace(/\s*\(.*\)/, ''))).join(' und ')} (${kc(ctx.extras[0])} kcal)</p>` : ''}</section>`;
  return html;
}

// ---------------------------------------------------------------- Blatt (Overlay)
function blatt(titel, inhalt) {
  const el = $('#sheet');
  el.innerHTML = `<div class="sheet-in" role="dialog" aria-label="${esc(titel)}"><div class="sheet-kopf"><h3>${esc(titel)}</h3><button class="zu" data-act="zu" aria-label="Schließen">×</button></div>${inhalt}</div>`;
  el.hidden = false;
  document.body.style.overflow = 'hidden';
}
function blattZu() { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; document.body.style.overflow = ''; }

function rezeptMeta(r, nw) {
  const teile = [`${r.zeit} Min.`, r.geraet.map((g) => GERAET_NAME[g]).join(' + ')];
  if (nw) teile.push(`${kc(nw[0])} kcal · ${Math.round(nw[1])} g Protein`);
  return teile.join(' · ');
}

function tauschBlatt(slot, i) {
  const liste = alternativen(ctx, woche.plan, slot, i, zustand());
  const b = woche.plan[slot][i];
  const zeilen = liste.map((x) => {
    const tags = [];
    if (x.aktuell) tags.push('<span class="tag neutral">aktuell</span>');
    if (x.angebote.length) tags.push(`<span class="tag deal">Angebot: ${esc(x.angebote.map((n) => n.replace(/ \(.*\)$/, '')).slice(0, 2).join(', '))}</span>`);
    if (x.vorrat.length) tags.push(`<span class="tag used">nutzt Vorrat</span>`);
    if (ein.favoriten.includes(x.r.id)) tags.push('<span class="tag bad">♥</span>');
    const d = x.kosten;
    return `<div class="rez" data-waehl="${slot}:${i}:${esc(x.r.id)}"><div><b>${esc(x.r.name)}</b>${tags.join('')}<small>${esc(rezeptMeta(x.r, x.nw))}</small></div>
      <div class="price">${x.aktuell ? '' : (d > 0.005 ? '+' : d < -0.005 ? '−' : '±') + eur(Math.abs(d))}<small>${x.aktuell ? '' : 'Einkauf'}</small></div></div>`;
  }).join('');
  blatt(`${MZ_NAME[slot]} tauschen`, `<p class="muted klein" style="margin:0 0 4px">Beste Wahl zuerst: günstig mit den aktuellen Angeboten, wenig Reste, passt zu deinen Zielen. Rechts steht, wie sich dein Einkauf ändert.</p>
    <section class="card flach">${zeilen || '<p class="muted">Keine passenden Rezepte.</p>'}</section>
    ${b.fix ? `<button class="btn ghost breit" data-loesen="${slot}:${i}">📌 Auswahl lösen (Planer darf wieder wählen)</button>` : ''}`);
}

function rezeptBlatt(id) {
  const r = ctx.alle.get(id);
  if (!r) return;
  const slot = r.mahlzeit.find((m) => ctx.ziel[m]) || r.mahlzeit[0];
  const sk = ctx.ziel[slot] ? skaliert(ctx, r, slot) : { z: r.zutaten, n: [0, 0, 0, 0] };
  const p = ein.personen;
  const fav = ein.favoriten.includes(id);
  const nope = ein.mag_nicht_gerichte.map(lc).includes(lc(id));
  const bloecke = ctx.ziel[slot] ? (woche.plan[slot] || []) : [];
  let tagPos = 0;
  const ziele = bloecke.map((b, i) => { const von = tagPos; tagPos += b.n; return `<button class="btn ghost klein" data-waehl="${slot}:${i}:${esc(id)}">${esc(tagName(von).slice(0, 2))}${b.n > 1 ? '–' + esc(tagName(von + b.n - 1).slice(0, 2)) : ''}</button>`; }).join('');
  blatt(r.name, `
    <p class="muted klein" style="margin:0">${esc(r.mahlzeit.map((m) => MZ_NAME[m]).join(', '))} · ${esc(rezeptMeta(r, sk.n))}${p > 1 ? ' pro Person' : ''}</p>
    <div class="fakten">${(r.tags || []).map((t) => `<span class="pill">${TAG_NAME[t] || t}</span>`).join('')}<span class="pill">hält ${r.haelt} ${r.haelt === 1 ? 'Tag' : 'Tage'}</span></div>
    ${r.gesperrt ? `<div class="banner warn">Wird nicht eingeplant: ${esc(r.gesperrt)}.</div>` : ''}
    <h2>Zutaten für ${p} ${p === 1 ? 'Person' : 'Personen'}</h2>
    <section class="card flach"><ul class="ing">${sk.z.map(([zid, g]) => { const a = ctx.kat.get(zid); return `<li><span>${esc(a.name.replace(/ \(.*\)$/, ''))}${a.angebot && !a.basis ? '<span class="tag deal">Angebot</span>' : ''}</span><span class="g"><b>${mengeText(a, g * p)}</b></span></li>`; }).join('')}</ul>
      ${(r.gewuerze || []).length ? `<p class="muted klein">Aus dem Schrank: ${esc(r.gewuerze.join(', '))}</p>` : ''}</section>
    <h2>Zubereitung</h2>
    <section class="card"><ol class="steps" style="margin-top:0">${r.schritte.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>${r.tipp ? `<p class="muted klein" style="margin-bottom:0">Tipp: ${esc(r.tipp)}</p>` : ''}</section>
    ${!r.gesperrt && ziele ? `<h2>In die Woche einplanen (${MZ_NAME[slot]})</h2><div class="aktionen" style="margin-top:0">${ziele}</div>` : ''}
    <div class="aktionen"><button class="btn ghost" data-fav="${esc(id)}" aria-pressed="${fav}">${fav ? '♥ Favorit' : '♡ Favorit'}</button><button class="btn ghost" data-nope="${esc(id)}" aria-pressed="${nope}">${nope ? '👎 Abgewählt' : '👎 Nicht mehr vorschlagen'}</button></div>`);
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
  return `<input class="field" type="search" placeholder="Rezept oder Zutat suchen" value="${esc(filter.q)}" data-suche autocomplete="off" style="margin-top:12px">
    <div class="filter">${chip('mz', '', 'Alle')}${MAHLZEITEN.map((m) => chip('mz', m.id, m.label)).join('')}</div>
    <div class="filter">${chip('geraet', '', 'Jedes Gerät')}${GERAETE.map((g) => chip('geraet', g.id, g.label)).join('')}</div>
    <div class="filter">${chip('tag', '', 'Alles')}${chip('tag', 'angebot', 'Im Angebot')}${chip('tag', 'fav', '♥ Favoriten')}${chip('tag', 'meal-prep', 'Meal Prep')}${chip('tag', 'vorabend', 'Vorabend')}${chip('tag', 'mitnehmen', 'Zum Mitnehmen')}${chip('tag', 'schnell', 'Schnell')}${chip('tag', 'veggie', 'Vegetarisch')}${chip('tag', 'einfrierbar', 'Einfrierbar')}</div>
    <p class="muted klein" style="margin:10px 0 0">${liste.length} Rezepte</p>
    <section class="card flach">${liste.map((r) => `<div class="rez" data-rezept="${esc(r.id)}"><div><b style="${r.gesperrt ? 'color:var(--muted);text-decoration:line-through' : ''}">${esc(r.name)}</b>${imPlan.has(r.id) ? '<span class="tag used">im Plan</span>' : ''}${r.zutaten.some(([id]) => ctx.kat.get(id).angebot) ? '<span class="tag deal">Angebot</span>' : ''}<small>${esc(r.mahlzeit.map((m) => MZ_NAME[m]).join(', '))} · ${esc(rezeptMeta(r))}</small></div>
      <button class="herz" data-fav="${esc(r.id)}" aria-pressed="${ein.favoriten.includes(r.id)}" aria-label="Favorit">${ein.favoriten.includes(r.id) ? '♥' : '♡'}</button></div>`).join('') || '<p class="muted">Nichts gefunden.</p>'}</section>`;
}

// ---------------------------------------------------------------- Einkauf
function packText(e) {
  return e.packs.map((p) => (p.lose ? `${gramm(p.g)} lose` : `${p.n}× ${gramm(p.pack)}`)).join(' + ');
}
function einkaufAnsicht() {
  if (!erg.einkauf.length) {
    return `<div class="empty"><b>Alles da</b>Für den Rest der Woche musst du nichts mehr kaufen.</div>${woche.bezahlt ? `<p class="muted klein" style="text-align:center">Diese Woche eingekauft: ${eur(woche.bezahlt)}</p>` : ''}`;
  }
  const gruppen = new Map();
  for (const e of erg.einkauf) { const k = e.a.kat || 'Sonstiges'; if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(e); }
  const sortiert = [...gruppen.keys()].sort((a, b) => (KAT.indexOf(a) + 99) % 99 - (KAT.indexOf(b) + 99) % 99);
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
        <div class="what">${esc(e.a.name.replace(/ \(lose\)$/, ''))}${e.angebot ? '<span class="tag deal">Angebot</span>' : ''}
          <small>${esc(packText(e))} · für ${esc(e.von.slice(0, 2).join(', '))}${e.von.length > 2 ? ' +' + (e.von.length - 2) : ''}</small>
          ${o ? `<small style="color:var(--deal)">${esc(o.produkt)}${o.gueltig_ab ? ' · ab ' + esc(o.gueltig_ab) : ''}${ein.karte && o.preis_mit_app ? ' · mit App' : ''}</small>` : ''}
          ${e.rest > 0 ? `<small>${e.a.halt === 'frisch' ? '⚠ ' : ''}${gramm(e.rest)} bleiben übrig${e.a.halt === 'frisch' ? '' : ' (haltbar, kommt in den Vorrat)'}</small>` : ''}</div>
        <span class="price">${eur(e.kosten)}</span></li>`;
    }).join('') + `</ul></section>`;
  }
  if (erg.ausVorrat.length) {
    html += `<h2>Schon zu Hause</h2><section class="card flach">${erg.ausVorrat.map((v) => `<div class="zeile"><span>${esc(v.a.name)}</span><span class="num">${mengeText(v.a, v.g)} aus dem Vorrat</span></div>`).join('')}</section>`;
  }
  html += `<p class="muted klein">Preise: Prospektpreise, sonst übliche Discounter-Preise (geschätzt). Öl, Gewürze und Honig gelten als Grundvorrat und stehen nicht auf der Liste.</p>`;
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
  for (const b of erg.bloecke) if (b.r && !b.fertig) for (const [id, g] of b.sk.z) bedarf.set(id, (bedarf.get(id) || 0) + g * b.portionen);
  const eintraege = Object.entries(vorrat).map(([id, g]) => ({ a: ctx.kat.get(id), g })).filter((x) => x.a);
  const gruppen = new Map();
  for (const e of eintraege) { const k = e.a.kat; if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(e); }
  const sortiert = [...gruppen.keys()].sort((a, b) => KAT.indexOf(a) - KAT.indexOf(b));
  let html = `<p class="muted klein" style="margin:14px 0 0">Was zu Hause ist. Abgehakte Einkäufe landen hier, „Zubereitet“ zieht die Mengen wieder ab. Der Planer verbraucht zuerst, was da ist.</p>`;
  if (!eintraege.length) html += `<div class="empty"><b>Noch nichts im Vorrat</b>Hake im Einkauf ab, was du gekauft hast, und räume es in den Vorrat – oder trage unten ein, was schon da ist.</div>`;
  for (const k of sortiert) {
    html += `<h2>${esc(k)}</h2><section class="card flach">` + gruppen.get(k).sort((x, y) => x.a.name.localeCompare(y.a.name, 'de')).map(({ a, g }) => {
      const st = vorratStatus(a, g, bedarf.get(a.id) || 0);
      const chip = st === 'leer' ? '<span class="tag bad">leer</span>' : st === 'knapp' ? '<span class="tag warn">reicht nicht für den Plan</span>' : st === 'wenig' ? '<span class="tag warn">wenig</span>' : '';
      const frisch = a.halt === 'frisch' && g > 0 && !(bedarf.get(a.id) > 0) ? '<span class="tag warn">bald verbrauchen</span>' : '';
      return `<div class="zeile"><div class="what">${esc(a.name)}${chip}${frisch}<small>${g > 0 ? mengeText(a, g) : 'aufgebraucht'}${bedarf.get(a.id) ? ` · Plan braucht ${gramm(bedarf.get(a.id))}` : ''}</small></div>
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
    return html + `<div class="empty"><b>Keine Angebote für ${esc(ladenName(ein.laden))}</b>${l?.fehler ? esc(l.fehler) : 'Für diesen Laden werden noch keine Prospekte automatisch gelesen. Der Plan rechnet hier mit üblichen Normalpreisen.'}</div>`;
  }
  const gekauft = new Set(erg.einkauf.filter((e) => e.angebot).map((e) => e.a.id));
  const passend = list.filter((o) => o.artikel && o.guenstiger);
  const rest = list.filter((o) => !(o.artikel && o.guenstiger));
  const zeile = (o) => `<div class="zeile"><div class="what">${esc(o.produkt)}${o.artikel && gekauft.has(o.artikel) ? '<span class="tag used">im Plan</span>' : ''}${o.guenstiger ? `<span class="tag deal">−${o.guenstiger} %</span>` : ''}
      <small>${esc([o.marke, o.menge, o.gueltig_ab ? 'ab ' + o.gueltig_ab : ''].filter(Boolean).join(' · '))}</small></div>
      <div class="price">${eur(ein.karte && o.preis_mit_app ? o.preis_mit_app : o.preis)}${o.preis_mit_app ? `<small>${ein.karte ? 'mit App' : 'App ' + eur(o.preis_mit_app)}</small>` : ''}</div></div>`;
  html += `<p class="muted klein" style="margin:14px 0 0">${list.length} Lebensmittel-Angebote${l.von ? `, gültig ${datumKurz(l.von)} – ${datumKurz(l.bis)}` : ''}. ${l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">Prospekt öffnen</a>` : ''}</p>`;
  if (passend.length) html += `<h2>Für deine Rezepte nutzbar</h2><section class="card flach">${passend.map(zeile).join('')}</section>`;
  html += `<h2>Weitere Angebote</h2><section class="card flach">${rest.map(zeile).join('')}</section>`;
  return html;
}

// ---------------------------------------------------------------- Profil
function profilAnsicht() {
  const z = ein.ziele;
  const schalter = (text, attr, an) => `<label class="schalter"><span>${text}</span><input type="checkbox" ${attr} ${an ? 'checked' : ''}></label>`;
  const chips = (liste, feld) => liste.length ? `<div class="chips">${liste.map((x, i) => `<span class="chip">${esc(ctx.alle.get(x)?.name || x)}<button data-del="${feld}:${i}" aria-label="entfernen">×</button></span>`).join('')}</div>` : `<span class="muted klein">Noch nichts.</span>`;
  let html = `<h2>Haushalt</h2><section class="card"><div class="grid2">
      <label>Personen<input class="field" type="number" inputmode="numeric" min="1" max="8" data-zahl="personen" value="${ein.personen}"></label>
      <label>Laden<select class="field" data-ein="laden">${LAEDEN.map((l) => `<option value="${l.id}" ${l.id === ein.laden ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label></div>
    <div style="margin-top:8px">${schalter('Preise mit Kundenkarte/App (z. B. Lidl Plus)', 'data-bool="karte"', ein.karte)}</div></section>

    <h2>Tagesziel pro Person</h2><section class="card"><div class="grid2">
      <label>Kalorien (kcal)<input class="field" type="number" inputmode="numeric" data-ziel="kcal" value="${z.kcal}"></label>
      <label>Protein (g)<input class="field" type="number" inputmode="numeric" data-ziel="protein" value="${z.protein}"></label>
      <label>Fett (g)<input class="field" type="number" inputmode="numeric" data-ziel="fett" value="${z.fett}"></label>
      <label>Kohlenhydrate (g)<input class="field" type="number" inputmode="numeric" data-ziel="kh" value="${z.kh}"></label></div>
      ${(ein.extras || []).length ? `<p class="muted klein" style="margin:10px 0 0">Fest eingeplant: ${ein.extras.map((e) => esc(e.name) + ` (${e.kcal} kcal)`).join(', ')}</p>` : ''}
      <p class="muted klein" style="margin:8px 0 0">Die Portionen werden so angepasst, dass Kalorien und Protein zu deinem Ziel passen.</p></section>

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
    <p style="margin:0 0 6px">${ctx.alle.size} Rezepte, ${ctx.kat.size} Produkte. Die Prospekte werden jeden Sonntag automatisch neu gelesen.</p>
    ${laeden.map(([id, l]) => `<div class="zeile"><span>${esc(ladenName(id))}</span><span class="num">${l.fehler ? '⚠ ' + esc(l.fehler.slice(0, 60)) : `${(l.angebote || []).length} Angebote${l.bis ? ' bis ' + datumKurz(l.bis) : ''}`}</span></div>`).join('') || '<span class="muted">Noch keine Angebote geladen.</span>'}
    ${GH ? `<div class="aktionen"><a class="btn ghost klein" href="https://github.com/${GH.owner}/${GH.repo}/actions/workflows/wochenplan.yml" target="_blank" rel="noopener">Jetzt neu lesen lassen (GitHub)</a></div>` : ''}</section>
    <div class="aktionen"><button class="btn ghost klein" data-act="woche-neu">Diese Woche komplett neu planen</button></div>`;
  return html;
}

// ---------------------------------------------------------------- Render
function render() {
  document.querySelectorAll('nav button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  const v = $('#view');
  if (!stamm || !ctx) { $('#sub').textContent = ''; v.innerHTML = `<div class="empty"><b>Keine Verbindung</b>Rezepte und Produkte konnten nicht geladen werden. Bitte einmal mit Internet öffnen.</div>`; return; }
  kopf();
  const fokus = document.activeElement?.matches?.('[data-suche]');
  v.innerHTML = { woche: wocheAnsicht, rezepte: rezepteAnsicht, einkauf: einkaufAnsicht, vorrat: vorratAnsicht, angebote: angeboteAnsicht, profil: profilAnsicht }[tab]();
  if (fokus) { const i = $('[data-suche]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  dock();
}
const neu = (opt) => { rechnen(opt); render(); };
const hatFortschritt = () => (woche.bezahlt || 0) > 0 || Object.keys(woche.fertig).length > 0;

// ---------------------------------------------------------------- Aktionen
function blockVon(schluessel) { const [slot, i] = schluessel.split(':'); return erg.bloecke.find((b) => b.slot === slot && b.i === +i); }

function fertigUmschalten(schluessel) {
  const b = blockVon(schluessel);
  if (!b || !b.r) return;
  if (woche.fertig[schluessel]) {
    for (const [id, g] of Object.entries(woche.abzug[schluessel] || {})) vorrat[id] = (vorrat[id] || 0) + g;
    delete woche.fertig[schluessel]; delete woche.abzug[schluessel];
    toast('Zurückgenommen – Mengen sind wieder im Vorrat.');
  } else {
    const ab = {};
    for (const [id, g] of b.z) {
      const a = ctx.kat.get(id);
      if (a.basis || !(vorrat[id] > 0)) continue;
      const m = Math.min(vorrat[id], g * b.portionen);
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

document.addEventListener('click', async (e) => {
  const t = e.target;
  const nb = t.closest('nav button, [data-tab-go]');
  if (nb) { tab = nb.dataset.tab || nb.dataset.tabGo; store.set('tab', tab); blattZu(); render(); scrollTo(0, 0); return; }
  if (t.id === 'sheet' || t.closest('[data-act="zu"]')) { blattZu(); return; }
  const day = t.closest('.day'); if (day) { tag = +day.dataset.day; render(); return; }
  const pers = t.closest('[data-pers]');
  if (pers) { ein.personen = Math.min(8, Math.max(1, ein.personen + +pers.dataset.pers)); neu(); return; }
  const fav = t.closest('[data-fav]');
  if (fav) { e.stopPropagation(); const id = fav.dataset.fav; ein.favoriten = ein.favoriten.includes(id) ? ein.favoriten.filter((x) => x !== id) : [...ein.favoriten, id]; rechnen(); if (!$('#sheet').hidden) rezeptBlatt(id); render(); return; }
  const nope = t.closest('[data-nope]');
  if (nope) { const id = nope.dataset.nope; const an = ein.mag_nicht_gerichte.includes(id); ein.mag_nicht_gerichte = an ? ein.mag_nicht_gerichte.filter((x) => x !== id) : [...ein.mag_nicht_gerichte, id]; blattZu(); neu(); toast(an ? 'Wird wieder vorgeschlagen.' : 'Kommt nicht mehr in deine Pläne.'); return; }
  const waehl = t.closest('[data-waehl]');
  if (waehl) { const [slot, i, id] = waehl.dataset.waehl.split(':'); woche.plan[slot][+i] = { ...woche.plan[slot][+i], r: id, fix: true }; blattZu(); tab = 'woche'; store.set('tab', tab); neu(); toast('Eingeplant – Einkaufsliste ist angepasst.'); return; }
  const loesen = t.closest('[data-loesen]');
  if (loesen) { const [slot, i] = loesen.dataset.loesen.split(':'); woche.plan[slot][+i].fix = false; blattZu(); neu(); return; }
  const rz = t.closest('[data-rezept]'); if (rz) { rezeptBlatt(rz.dataset.rezept); return; }
  const tausch = t.closest('[data-tausch]'); if (tausch) { const [slot, i] = tausch.dataset.tausch.split(':'); tauschBlatt(slot, +i); return; }
  const fertig = t.closest('[data-fertig]'); if (fertig) { fertigUmschalten(fertig.dataset.fertig); return; }
  const aus = t.closest('[data-aus]');
  if (aus) { const k = aus.dataset.aus; if (woche.aus[k]) delete woche.aus[k]; else woche.aus[k] = true; neu(); return; }
  const fc = t.closest('[data-filter]');
  if (fc) { const [g, w] = fc.dataset.filter.split(':'); filter[g] = w; render(); return; }
  const vr = t.closest('[data-vorrat]');
  if (vr) { const [id, r] = vr.dataset.vorrat.split(':'); const a = ctx.kat.get(id); const schritt = a.stk && a.stk <= 200 ? a.stk : Math.max(10, Math.round(a.pack / 4 / 10) * 10); vorrat[id] = Math.max(0, Math.round((vorrat[id] || 0) + +r * schritt)); neu(); return; }
  const del = t.closest('[data-del]');
  if (del) { const [feld, i] = del.dataset.del.split(':'); ein[feld].splice(+i, 1); neu(); return; }
  const act = t.closest('[data-act]')?.dataset.act;
  if (act === 'wuerfeln') { woche.seed++; neu({ neuPlanen: true }); toast('Neuer Vorschlag – 📌 gewählte Gerichte bleiben.'); }
  if (act === 'woche-neu') { woche.seed++; for (const b of Object.values(woche.plan).flat()) b.fix = false; woche.aus = {}; neu({ neuPlanen: true }); tab = 'woche'; render(); }
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
  if (t.dataset.ein === 'laden') { ein.laden = t.value; neu({ neuPlanen: !hatFortschritt() }); return; }
  if (t.dataset.zahl) { ein[t.dataset.zahl] = Math.min(8, Math.max(1, Math.round(Number(t.value) || 1))); neu(); return; }
  if (t.dataset.ziel) { ein.ziele[t.dataset.ziel] = Math.max(0, Number(t.value) || 0); neu(); return; }
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
