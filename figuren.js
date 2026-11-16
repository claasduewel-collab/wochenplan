// Die kleinen Figuren der App – eigene, handgezeichnete SVG-Charaktere (keine Bilddateien nötig).
const DUNKEL = '#2b2420';

function gesicht(cx, cy, s = 1) {
  const auge = (x) => `<g class="auge" style="transform-origin:${x}px ${cy}px"><ellipse cx="${x}" cy="${cy}" rx="${6.2 * s}" ry="${7.2 * s}" fill="#fff"/><circle cx="${x + 1.2 * s}" cy="${cy + 1 * s}" r="${3.6 * s}" fill="${DUNKEL}"/><circle cx="${x + 2.6 * s}" cy="${cy - 0.8 * s}" r="${1.3 * s}" fill="#fff"/></g>`;
  return auge(cx - 9 * s) + auge(cx + 9 * s) +
    `<path d="M${cx - 6 * s} ${cy + 11 * s} q${6 * s} ${6.5 * s} ${12 * s} 0" fill="none" stroke="${DUNKEL}" stroke-width="${2.2 * s}" stroke-linecap="round"/>` +
    `<ellipse cx="${cx - 16 * s}" cy="${cy + 9 * s}" rx="${3.6 * s}" ry="${2.3 * s}" fill="#ff7b7b" opacity=".5"/><ellipse cx="${cx + 16 * s}" cy="${cy + 9 * s}" rx="${3.6 * s}" ry="${2.3 * s}" fill="#ff7b7b" opacity=".5"/>`;
}
const glieder = (farbe, armY = 48) =>
  `<g stroke="${farbe}" stroke-width="3.4" stroke-linecap="round" fill="none"><path d="M33 69v7M47 69v7"/><path d="M17 ${armY}l-7 5"/><path class="winkarm" style="transform-origin:63px ${armY}px" d="M63 ${armY}l8-7"/></g>`;
const HUT = `<path d="M27 15c-8-1-9-11-1-13 2-7 12-7 14-2 2-5 12-5 14 2 8 2 7 12-1 13v6H27z" fill="#fff" stroke="#d9d4c7" stroke-width="1.5" stroke-linejoin="round"/>`;

const KOERPER = {
  karotte: (hut) => glieder('#d9661a') +
    (hut ? '' : `<path d="M40 17c-7-10-12-11-14-7 2 5 8 7 14 7zM40 17c7-10 12-11 14-7-2 5-8 7-14 7zM40 18c-3-12 0-16 0-16s3 4 0 16z" fill="#4fae52"/>`) +
    `<path d="M40 14c18 0 22 16 18 32-3 14-12 26-18 26S25 60 22 46c-4-16 0-32 18-32z" fill="#ff8a3d"/><path d="M27 58h7M47 63h6M50 22h5" stroke="#e36a1c" stroke-width="2" stroke-linecap="round"/>` + gesicht(40, 36),
  ei: () => glieder('#d8b878') +
    `<path d="M40 9c15 0 24 22 24 38 0 15-10 25-24 25S16 62 16 47C16 31 25 9 40 9z" fill="#fff8e8" stroke="#ecd9b0" stroke-width="1.5"/><circle cx="40" cy="60" r="8" fill="#ffc93c"/>` + gesicht(40, 36),
  avocado: () => glieder('#44702b') +
    `<path d="M40 7c12 0 16 14 18 27 3 17-3 38-18 38S19 51 22 34C24 21 28 7 40 7z" fill="#5b8c3a"/><path d="M40 13c9 0 12 11 13.500 22 2 14-2.500 31-13.500 31S24.500 49 26.500 35C28 24 31 13 40 13z" fill="#cfe58f"/><circle cx="40" cy="55" r="9.500" fill="#9a6a3a"/><circle cx="37" cy="52" r="2.500" fill="#b98a55"/>` + gesicht(40, 31, 0.78),
  brokkoli: () => glieder('#7fb26a', 54) +
    `<rect x="30" y="42" width="20" height="29" rx="8" fill="#b4d99a"/><g fill="#4f9d4a"><circle cx="24" cy="31" r="13"/><circle cx="40" cy="22" r="15"/><circle cx="56" cy="31" r="13"/><circle cx="32" cy="40" r="12"/><circle cx="48" cy="40" r="12"/></g><g fill="#63b35c"><circle cx="34" cy="17" r="4"/><circle cx="52" cy="24" r="3.500"/><circle cx="22" cy="27" r="3"/></g>` + gesicht(40, 32, 0.9),
  tomate: () => glieder('#c93a2c') +
    `<circle cx="40" cy="45" r="27" fill="#ef4f3f"/><ellipse cx="29" cy="33" rx="6" ry="3.500" fill="#fff" opacity=".28" transform="rotate(-30 29 33)"/><path d="M40 22l-11-6 6 8-10 3 12 1 3 7 3-7 12-1-10-3 6-8z" fill="#3f9b45"/>` + gesicht(40, 46),
  blaubeere: () => glieder('#3b4bb0') +
    `<circle cx="40" cy="44" r="27" fill="#5a6de0"/><ellipse cx="29" cy="32" rx="6" ry="3.500" fill="#fff" opacity=".3" transform="rotate(-30 29 32)"/><path d="M40 13l3 5 6-1-3 5 3 4-6-1-3 4-3-4-6 1 3-4-3-5 6 1z" fill="#3b4bb0"/>` + gesicht(40, 44),
};

/** Liefert eine Figur als SVG-Text. typ: karotte | ei | avocado | brokkoli | tomate | blaubeere */
export function figur(typ, px = 48, { hut = false, ruhig = false } = {}) {
  const k = KOERPER[typ] || KOERPER.karotte;
  return `<svg class="figur${ruhig ? ' ruhig' : ''}" viewBox="0 -4 80 82" width="${px}" height="${px}" aria-hidden="true">${k(hut)}${hut ? HUT : ''}</svg>`;
}
export const FIGUR_FUER = { fruehstueck: 'ei', snack: 'blaubeere', mittag: 'avocado', abend: 'tomate' };
