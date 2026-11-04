/**
 * Builds the 1200 × 1600 mm poster as HTML from the twin's own outputs, then prints it to PDF.
 * It is printed and mounted, so the ground stays pale water with dark ink on frosted cards.
 *
 *   python poster/water.py           # the water page and the hero blended into it
 *   node poster/build.mjs            # writes poster/poster.html and poster/54.ENEC.SweepLine.pdf
 *
 * Inputs: poster/content.json (text), poster/data/results.json (one summary per model run),
 * poster/data/frame.json (flow, tide) and poster/images (renders captured from the running twin,
 * with hero.json holding where each labelled thing falls in the hero image).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = (p) => JSON.parse(readFileSync(resolve(here, p), 'utf8'));
const C = read('content.json');
const F = read('data/frame.json');
const R = read('data/results.json');
const H = read('images/hero.json');
const font = (p) => pathToFileURL(resolve(root, 'node_modules', p)).href;
const img = (p) => pathToFileURL(resolve(here, 'images', p)).href;

const INK = '#062C45';
const INK2 = '#17435A';
const MUTED = '#3C6579';
const LINE = '#C9DEE6';
const CYAN = '#0A73A5';
const TEAL = '#05796F';
const AMBER = '#C96F00';
const RED = '#C7372F';
const DEEP = '#07405F';

// ------------------------------------------------------------------ hero overlay (mm on the poster)
const HERO_TOP = 150; // keep in step with poster/water.py
const HERO_W = 1200;
const HERO_H = (1200 * H.size[1]) / H.size[0];
const at = (k) => [H.points[k][0] * HERO_W, H.points[k][1] * HERO_H];

function callout(n, key, tx, ty, text, opts = {}) {
  const [x, y] = Array.isArray(key) ? key : at(key);
  const w = text.length * 7.95 + 46;
  const left = opts.end ? tx - w : tx;
  const cx = left + 15;
  return `<line x1="${x}" y1="${y}" x2="${opts.end ? tx - 15 : cx}" y2="${ty}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="${x}" cy="${y}" r="3.6" fill="#fff" stroke="${DEEP}" stroke-width="1.2"/>
    <g transform="translate(${left} ${ty - 15})"><rect width="${w}" height="30" rx="15" fill="${INK}" fill-opacity="0.93" stroke="#fff" stroke-opacity="0.75" stroke-width="0.8"/>
    <circle cx="15" cy="15" r="11" fill="#fff"/><text x="15" y="20.4" text-anchor="middle" font-size="15.5" font-weight="800" fill="${INK}">${n}</text>
    <text x="33" y="21" font-size="16" font-weight="700" fill="#fff">${text}</text></g>`;
}

function heroOverlay() {
  const route = ['r0', 'r1', 'r2', 'r3', 'r4'].map((k) => at(k).map((v) => v.toFixed(1)).join(',')).join(' ');
  return `<svg viewBox="0 0 ${HERO_W} ${HERO_H}" class="over" font-family="Inter Variable">
    <polyline points="${route}" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-opacity="0.9"/>
    <polyline points="${route}" fill="none" stroke="${TEAL}" stroke-width="2.6" stroke-linecap="round"/>
    ${callout(1, [158, 346], 44, 400, 'A bloom drifts in on the tide')}
    ${callout(2, 'mouth', 742, 384, 'The plant’s own flow draws it in')}
    ${callout(3, 'netA', 118, 352, 'Net A sweeps it along')}
    ${callout(4, 'netB', 118, 308, 'Net B catches what gets past')}
    ${callout(6, 'intake', 118, 264, 'All four intakes untouched')}
    ${callout(5, 'collector', 690, 264, 'Screw lift, no impeller')}
    ${callout(7, [H.points.r3[0] * HERO_W + 60, H.points.r3[1] * HERO_H - 1.6], 1156, 306, 'Released 2 km along the coast', { end: true })}
  </svg>`;
}

// ------------------------------------------------------------------ decoration (mm on the poster)
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** A translucent jellyfish, about 100 × 200 units at s = 1. */
function jelly(x, y, s, rot, o, seed) {
  const r = rng(seed * 7919 + 13);
  const line = (x0, len, amp, ph, freq) => {
    const pts = [];
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      pts.push(`${(x0 + Math.sin(t * freq + ph) * amp * (0.25 + t)).toFixed(1)},${(6 + t * len).toFixed(1)}`);
    }
    return pts.join(' ');
  };
  let tent = '';
  for (let i = 0; i < 9; i++) {
    const x0 = -40 + i * 10;
    tent += `<polyline points="${line(x0, 130 + r() * 70, 6 + r() * 7, r() * 6, 7 + r() * 4)}" fill="none" stroke="url(#jt)" stroke-width="${(1 + r() * 0.9).toFixed(2)}" stroke-linecap="round"/>`;
  }
  let arms = '';
  for (let i = 0; i < 4; i++) {
    const x0 = -15 + i * 10;
    arms += `<polyline points="${line(x0, 92 + r() * 38, 9 + r() * 5, r() * 6, 6 + r() * 3)}" fill="none" stroke="url(#ja)" stroke-width="${(5 + r() * 3).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  let ribs = '';
  for (const k of [-34, -20, -7, 7, 20, 34]) ribs += `<path d="M${k * 0.32} -46 Q${k} -30 ${k} 2" fill="none" stroke="#2B9CC0" stroke-opacity="0.28" stroke-width="1"/>`;
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" opacity="${o}">
    ${tent}${arms}
    <path d="M-50 4 C-54 -62 54 -62 50 4 C42 12 34 3 25 9 C16 15 8 7 0 11 C-8 7 -16 15 -25 9 C-34 3 -42 12 -50 4 Z" fill="url(#jb)" stroke="#2B9CC0" stroke-opacity="0.55" stroke-width="1.1"/>
    ${ribs}
    <ellipse cx="0" cy="-22" rx="20" ry="11" fill="#fff" fill-opacity="0.5"/>
  </g>`;
}

function waves() {
  const path = (y, amp, per, ph) => {
    let d = `M0 1600 L0 ${y}`;
    for (let x = 0; x <= 1200; x += 8) d += ` L${x} ${(y + Math.sin(x / per + ph) * amp + Math.sin(x / (per * 0.43) + ph * 1.7) * amp * 0.3).toFixed(1)}`;
    return `${d} L1200 1600 Z`;
  };
  return `<path d="${path(1495, 13, 140, 0.4)}" fill="#fff" fill-opacity="0.2"/><path d="${path(1525, 11, 110, 2.1)}" fill="#0B7C97" fill-opacity="0.14"/><path d="${path(1553, 9, 165, 4.2)}" fill="#07405F" fill-opacity="0.13"/>`;
}

const defs = `<defs>
    <radialGradient id="jb" cx="50%" cy="38%" r="62%"><stop offset="0" stop-color="#fff" stop-opacity="0.92"/><stop offset="0.65" stop-color="#BDEBF5" stop-opacity="0.62"/><stop offset="1" stop-color="#5CC2DC" stop-opacity="0.5"/></radialGradient>
    <linearGradient id="jt" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="200"><stop offset="0" stop-color="#3EA9CB" stop-opacity="0.7"/><stop offset="1" stop-color="#3EA9CB" stop-opacity="0"/></linearGradient>
    <linearGradient id="ja" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="130"><stop offset="0" stop-color="#fff" stop-opacity="0.75"/><stop offset="1" stop-color="#8FD9EA" stop-opacity="0.05"/></linearGradient>
  </defs>`;
const decorBack = `<svg class="decor" viewBox="0 0 1200 1600">${defs}
  ${waves()}
  ${jelly(1180, 786, 0.62, -12, 0.85, 2)}
  ${jelly(20, 700, 0.5, 16, 0.85, 3)}
  ${jelly(1186, 1284, 0.6, 10, 0.8, 5)}
  ${jelly(18, 1250, 0.46, -14, 0.8, 6)}
</svg>`;
const decorFront = `<svg class="decor" viewBox="0 0 1200 1600">${jelly(1136, 206, 0.95, 14, 0.95, 1)}</svg>`;

// ------------------------------------------------------------------ charts
const axisText = (x, y, t, a = 'end') => `<text x="${x}" y="${y}" text-anchor="${a}" font-size="11.5" fill="${MUTED}">${t}</text>`;

function bloomChart() {
  const r = R.reference;
  const W = 352;
  const H2 = 138;
  const L = 28;
  const B = 20;
  const T = 6;
  const s = r.series;
  const maxT = s[s.length - 1].t / 60;
  const maxY = Math.ceil(Math.max(...s.map((p) => p.b)) / 10) * 10;
  const x = (m) => L + (m / maxT) * (W - L - 6);
  const y = (v) => H2 - B - (v / maxY) * (H2 - B - T);
  const path = (k) => s.map((p) => `${x(p.t / 60).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  let g = '';
  for (let v = 0; v <= maxY; v += 25) g += `<line x1="${L}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="${LINE}" stroke-width="0.7"/>${axisText(L - 5, y(v) + 4, v)}`;
  for (let m = 0; m <= maxT; m += 60) g += axisText(x(m), H2 - B + 15, `${m / 60} h`, Math.abs(m - maxT) < 2 ? 'end' : 'middle');
  return `<svg viewBox="0 0 ${W} ${H2}" width="100%" font-family="Inter Variable">${g}
    <polyline points="${path('b')}" fill="none" stroke="${RED}" stroke-width="4" stroke-linejoin="round"/>
    <polyline points="${path('s')}" fill="none" stroke="${TEAL}" stroke-width="4"/>
    <text x="${x(maxT * 0.66)}" y="${y(maxY * 0.8)}" text-anchor="end" font-size="15" font-weight="800" fill="${RED}">Without: ${r.bScreens.toFixed(0)} t</text>
    <text x="${x(maxT)}" y="${y(0) - 8}" text-anchor="end" font-size="15" font-weight="800" fill="${TEAL}">With SweepLine: under 0.1 t</text></svg>`;
}

function tideChart() {
  const W = 352;
  const H2 = 138;
  const L = 28;
  const B = 20;
  const T = 6;
  const U = F.channelSpeed;
  const x = (h) => L + ((h + 18) / 36) * (W - L - 6);
  const y = (v) => T + ((0.42 - v) / 0.7) * (H2 - B - T);
  let g = '';
  for (const v of [-0.2, 0, 0.2, 0.4]) g += `<line x1="${L}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? '#9DB9C5' : LINE}" stroke-width="0.7"/>${axisText(L - 5, y(v) + 4, v.toFixed(1))}`;
  for (const h of [-12, 0, 12]) g += axisText(x(h), H2 - B + 15, h === 0 ? 'tide turn' : `${h > 0 ? '+' : ''}${h} h`, 'middle');
  return `<svg viewBox="0 0 ${W} ${H2}" width="100%" font-family="Inter Variable">${g}
    <line x1="${x(-18)}" x2="${x(18)}" y1="${y(U)}" y2="${y(U)}" stroke="${CYAN}" stroke-width="4.4"/>
    <polyline points="${F.tide.map(([h, u]) => `${x(h).toFixed(1)},${y(u).toFixed(1)}`).join(' ')}" fill="none" stroke="${AMBER}" stroke-width="3.4" stroke-linejoin="round"/>
    <text x="${x(18)}" y="${y(U) - 7}" text-anchor="end" font-size="14.5" font-weight="800" fill="${CYAN}">Inside the channel: steady, one way</text>
    <text x="${x(18)}" y="${y(-0.25)}" text-anchor="end" font-size="14.5" font-weight="800" fill="${AMBER}">Outside: the recorded tide</text></svg>`;
}

function faultChart() {
  const rows = R.failures;
  const W = 352;
  const rowH = 23;
  const H2 = rows.length * rowH + 4;
  const X = 146;
  const max = Math.max(...rows.map((r) => Number(r.without)));
  const bar = (v) => ((W - X - 62) * v) / max;
  const g = rows
    .map((r, i) => {
      const y = i * rowH + 2;
      const w = bar(Number(r.without));
      return `<text x="0" y="${y + 15}" font-size="12.8" font-weight="700" fill="${INK}">${r.failure}</text>
        <rect x="${X}" y="${y + 2}" width="${w}" height="8.5" rx="2" fill="${RED}" fill-opacity="0.88"/>
        <text x="${X + w + 5}" y="${y + 10.5}" font-size="11.5" font-weight="700" fill="${RED}">${r.without} t</text>
        <rect x="${X}" y="${y + 12.5}" width="3" height="8.5" rx="1" fill="${TEAL}"/>
        <text x="${X + 8}" y="${y + 21}" font-size="11.5" font-weight="800" fill="${TEAL}">${r.with === 'under 0.1' ? 'under 0.1 t' : `${r.with} t`}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H2}" width="100%" font-family="Inter Variable">${g}</svg>`;
}

function speedDiagram() {
  const W = 340;
  const H2 = 146;
  const a = (20 * Math.PI) / 180;
  const ox = 30;
  const oy = 30;
  const L = 200;
  const P = (s) => [ox + Math.cos(a) * s, oy + Math.sin(a) * s];
  const A = P(L * Math.cos(a));
  const Fx = ox + L;
  const arrow = (x0, y0, x1, y1, c, w = 4) => {
    const th = Math.atan2(y1 - y0, x1 - x0);
    const s = 13;
    return `<line x1="${x0}" y1="${y0}" x2="${x1 - Math.cos(th) * 8}" y2="${y1 - Math.sin(th) * 8}" stroke="${c}" stroke-width="${w}"/><polygon points="${x1},${y1} ${x1 - Math.cos(th - 0.42) * s},${y1 - Math.sin(th - 0.42) * s} ${x1 - Math.cos(th + 0.42) * s},${y1 - Math.sin(th + 0.42) * s}" fill="${c}"/>`;
  };
  const [n0x, n0y] = P(-26);
  const [n1x, n1y] = P(262);
  return `<svg viewBox="0 0 ${W} ${H2}" width="100%" font-family="Inter Variable">
    <line x1="${n0x}" y1="${n0y}" x2="${n1x}" y2="${n1y}" stroke="${AMBER}" stroke-width="6" stroke-linecap="round"/>
    ${arrow(ox, oy, Fx, oy, CYAN)}
    ${arrow(ox, oy, A[0], A[1], TEAL)}
    ${arrow(A[0], A[1], Fx, oy, INK, 3.4)}
    <text x="${ox + 2}" y="${oy - 12}" font-size="15" font-weight="800" fill="${CYAN}">Channel 0.33 m/s</text>
    <text x="${ox + 8}" y="${A[1] + 26}" font-size="15" font-weight="800" fill="${TEAL}">Along the net 0.31 m/s</text>
    <text x="${Fx + 12}" y="${oy + 22}" font-size="15" font-weight="800" fill="${INK}">Through</text>
    <text x="${Fx + 12}" y="${oy + 40}" font-size="15" font-weight="800" fill="${INK}">0.11 m/s</text>
    <text x="${n1x + 2}" y="${n1y + 21}" font-size="15" font-weight="800" fill="${AMBER}" text-anchor="end">Net at 20°</text>
  </svg>`;
}

/** Plan of the system, to scale, drawn for print. */
function planSvg() {
  const W = 262;
  const H2 = 124;
  const k = 0.104;
  const px = (x) => 30 + x * k;
  const py = (z) => 100 - z * k;
  const ch = 70;
  const land = py(-62);
  const [A, B] = F.nets;
  const route = [[76, 88], [100, 89], [132, 94], [620, 150], [2040, 300]].map(([x, z]) => `${px(x).toFixed(1)},${py(z).toFixed(1)}`).join(' ');
  const units = [0, 1, 2, 3].map((i) => `<rect x="${px(-60 + i * 30) + 0.25}" y="${py(-30)}" width="${30 * k - 0.5}" height="5" fill="${INK}"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H2}" preserveAspectRatio="xMidYMid slice" class="ph" font-family="Inter Variable">
    <rect width="${W}" height="${H2}" fill="#BCE9F2"/>
    <rect y="${land}" width="${W}" height="${H2 - land}" fill="#F3E7CC"/>
    <circle cx="${px(0)}" cy="${py(540)}" r="${300 * k}" fill="${RED}" fill-opacity="0.1" stroke="${RED}" stroke-width="0.5" stroke-dasharray="2 1.5"/>
    <rect x="${px(-ch - 9)}" y="${py(548)}" width="9" height="${land - py(548)}" fill="#7C7A70"/>
    <rect x="${px(ch)}" y="${py(548)}" width="9" height="${land - py(548)}" fill="#7C7A70"/>
    <rect x="${px(-ch)}" y="${py(548)}" width="${2 * ch * k}" height="${land - py(548)}" fill="#8FD8E8"/>
    ${units}
    <line x1="${px(A.ax)}" y1="${py(A.az)}" x2="${px(A.bx)}" y2="${py(A.bz)}" stroke="${AMBER}" stroke-width="1.5"/>
    <line x1="${px(B.ax)}" y1="${py(B.az)}" x2="${px(B.bx)}" y2="${py(B.bz)}" stroke="${AMBER}" stroke-width="1.5" stroke-dasharray="2.4 1.2"/>
    <polyline points="${route}" fill="none" stroke="${TEAL}" stroke-width="1.5"/>
    <circle cx="${px(2040)}" cy="${py(300)}" r="3" fill="${TEAL}"/>
    <text x="${px(2040) + 3}" y="${py(300) - 6}" font-size="10.5" font-weight="800" fill="${TEAL}" text-anchor="end">Release, 2 km along</text>
    <text x="${px(1150)}" y="${py(190) + 18}" font-size="10.5" font-weight="700" fill="${TEAL}" text-anchor="middle">1 m line over the breakwater</text>
    <text x="${px(0) + 300 * k + 4}" y="${py(640)}" font-size="10.5" font-weight="700" fill="${RED}">Water the plant draws in</text>
    <text x="${px(ch + 20)}" y="${land + 13}" font-size="10.5" font-weight="700" fill="${INK}">Four intakes</text>
    <line x1="${W - 62}" y1="17" x2="${W - 62 + 500 * k}" y2="17" stroke="${INK}" stroke-width="1.2"/><text x="${W - 62 + 250 * k}" y="12" font-size="10" fill="${INK}" text-anchor="middle">500 m</text>
  </svg>`;
}

// ------------------------------------------------------------------ icons (24-unit stroke pictograms, own drawings)
const ICON = {
  tide: 'M2 8c3-3 5-3 8 0s5 3 8 0 3-2 4-1M2 16c3-3 5-3 8 0s5 3 8 0 3-2 4-1',
  under: 'M12 3v13M7 11l5 5 5-5M3 21h18',
  tear: 'M3 5h18M3 11h18M3 17h18M6 2v20M12 2v6M12 14v8M18 2v20M10 9l2 2-1 2 2 2',
  clog: 'M3 8h7l2 4 2-4h7M12 21V12M8 17l4 4 4-4',
  power: 'M13 2 4 14h7l-1 8 9-12h-7l1-8zM3 3l18 18',
  waves: 'M4 15a5 5 0 0 1 2-9.6A6 6 0 0 1 17.6 7 4.5 4.5 0 0 1 20 15M13 11l-3 5h4l-3 5',
  dark: 'M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10z',
  foul: 'M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5',
  screw: 'M12 2v20M6 6c4-3 8-2 12 0M6 11c4-3 8-2 12 0M6 16c4-3 8-2 12 0M6 21c4-3 8-2 12 0',
  species: 'M12 3a8 8 0 0 0-8 8v1h16v-1a8 8 0 0 0-8-8zM7 12c0 4-1 6-2 8M12 12v9M17 12c0 4 1 6 2 8',
  alert: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7.500v6M12 16.800v.1',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.500c.8.8 1 1.500 1 2.500h6c0-1 .2-1.700 1-2.500A6 6 0 0 0 12 3z',
  gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  angle: 'M3 20h18M3 20 17 6M11 20a8 8 0 0 0-2.500-6',
  chart: 'M3 3v18h18M7 15l4-4 3 3 6-7',
  warn: 'M12 3 2 20h20L12 3zM12 10v5M12 17.500v.1',
  star: 'M12 3l2.700 5.600 6.100.9-4.400 4.300 1 6.100-5.400-2.900-5.400 2.900 1-6.100-4.400-4.300 6.100-.9z',
  next: 'M5 19 19 5M9 5h10v10',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  box: 'M12 2 3 7v10l9 5 9-5V7l-9-5zM3 7l9 5 9-5M12 12v10',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
  bell: 'M4 12a8 8 0 0 1 16 0H4zM7 12c0 4-1 6-2 8M12 12v9M17 12c0 4 1 6 2 8',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[k]}"/></svg>`;
const pill = (ic, text) => `<div class="pill">${icon(ic)}<span>${text}</span></div>`;
const sec = (ic, title, body, cls = '') => `<section class="sec ${cls}">${pill(ic, title)}<div class="box">${body}</div></section>`;

const tile = (media, title, text) => `<figure class="tile">${media}<figcaption><b>${title}</b>${text}</figcaption></figure>`;
const photo = (f) => `<img class="ph" src="${img(f)}" alt="">`;

const STAT_ICON = ['bell', 'tide', 'box', 'bolt'];

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>SweepLine poster</title><style>
@font-face{font-family:'Inter Variable';src:url('${font('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}') format('woff2');font-weight:100 900}
@page{size:1200mm 1600mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200mm;height:1600mm;background:#BCE9F2;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Inter Variable',sans-serif;color:${INK};font-size:13.2mm;line-height:1.34;position:relative;overflow:hidden}
.page{position:absolute;inset:0;overflow:hidden}
.bg{position:absolute;inset:0;width:100%;height:100%;display:block}
.heroimg{position:absolute;left:0;top:${HERO_TOP}mm;width:1200mm;height:${HERO_H}mm;display:block}
.decor{position:absolute;inset:0;width:100%;height:100%}
.over{position:absolute;left:0;top:${HERO_TOP}mm;width:1200mm;height:${HERO_H}mm}
.flow{position:absolute;inset:0;display:flex;flex-direction:column}
.cap{position:absolute;right:44mm;top:${HERO_TOP + 420}mm;background:rgba(6,44,69,.86);border-radius:8mm;padding:2.4mm 8mm;font-size:11.4mm;font-weight:600;color:#fff}
header{display:flex;align-items:center;justify-content:space-between;gap:24mm;padding:20mm 44mm 0}
.brand h1{font-size:118mm;font-weight:850;letter-spacing:-5mm;line-height:.94;color:${DEEP}}
.brand p{font-size:26mm;font-weight:700;font-style:italic;color:${INK};letter-spacing:-.5mm;margin-top:9mm}
.brand p em{color:${CYAN};font-style:italic}
.who{display:grid;grid-template-columns:auto;padding-left:16mm;border-left:.9mm solid ${DEEP};text-align:left}
.who .tag{font-size:17.5mm;font-weight:800;color:${CYAN}}
.who .names{font-size:15.6mm;font-weight:700;margin-top:3mm;line-height:1.23}
.who .uni{font-size:15mm;color:${INK2};margin-top:2.6mm;font-weight:600}
.problem{position:relative;margin:10mm 44mm 0}
.problem .box{display:grid;grid-template-columns:1.2fr 1fr;gap:15mm;padding:14mm 92mm 10mm 13mm}
.problem .q{font-size:22.5mm;font-weight:800;line-height:1.12;letter-spacing:-.6mm}
.problem p{font-size:13.2mm;line-height:1.28;color:${INK2};border-left:.7mm solid ${LINE};padding-left:13mm}
.pill{position:relative;z-index:2;align-self:flex-start;display:inline-flex;align-items:center;gap:4mm;height:20.5mm;padding:0 12mm 0 8mm;margin:0 0 -9mm 7mm;border-radius:11mm;background:linear-gradient(90deg,${DEEP},#0B7C97);color:#fff;font-size:15.6mm;font-weight:800;letter-spacing:-.2mm;white-space:nowrap}
.pill svg{width:12.5mm;height:12.5mm;color:#fff;flex:none}
.sec{display:flex;flex-direction:column;min-width:0}
.box{flex:1;background:rgba(255,255,255,.82);border:.8mm solid rgba(255,255,255,.96);border-radius:8mm;padding:14mm 11mm 7mm}
.statsbar{position:absolute;left:44mm;right:44mm;top:600mm;display:grid;grid-template-columns:1.68fr .96fr 1.2fr .86fr;background:rgba(255,255,255,.9);border:.8mm solid #fff;border-radius:9mm;padding:8.5mm 6mm}
.stat{display:grid;grid-template-columns:19mm 1fr;column-gap:4mm;align-items:center;padding:0 7mm;border-left:.7mm solid ${LINE}}
.stat:first-child{border-left:0}
.stat svg{width:19mm;height:19mm;color:${CYAN}}
.stat b{display:block;font-size:30.5mm;line-height:1.02;font-weight:850;letter-spacing:-1.3mm;white-space:nowrap}
.stat span{display:block;font-size:11.6mm;line-height:1.2;color:${INK2};margin-top:1.4mm}
.rows{position:absolute;left:44mm;right:44mm;top:699mm;bottom:40mm;display:flex;flex-direction:column;justify-content:space-between}
.row{display:grid;gap:15mm}
.r1{grid-template-columns:1fr 1.08fr .92fr}
.r3{grid-template-columns:1fr 1fr 1fr}
.r1 .box p{font-size:14.6mm;line-height:1.3}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12mm}
.tile{background:rgba(255,255,255,.82);border:.8mm solid rgba(255,255,255,.96);border-radius:8mm;padding:4mm 4mm 4.4mm}
.tile .ph{display:block;width:100%;height:124mm;object-fit:cover;border-radius:5mm}
.tile figcaption{font-size:11mm;line-height:1.2;color:${INK2};margin:2.6mm 2.6mm 0}
.tile figcaption b{display:block;font-size:13.2mm;color:${INK};font-weight:800}
.note{font-size:10.2mm;line-height:1.22;color:${MUTED};margin-top:1.6mm}
.feat{display:grid;grid-template-columns:repeat(5,1fr);gap:5.5mm 10mm}
.feat div{display:grid;grid-template-columns:18mm 1fr;gap:0 4mm;align-items:start}
.feat svg{width:18mm;height:18mm;color:${TEAL}}
.feat b{display:block;font-size:12.8mm;line-height:1.14;font-weight:800;color:${INK}}
.feat span{display:block;font-size:10.9mm;line-height:1.2;color:${INK2};margin-top:.8mm}
.steps{display:grid;grid-template-columns:repeat(5,1fr);gap:0}
.step{position:relative;padding:4mm 15mm 4mm 15mm;background:rgba(255,255,255,.82);clip-path:polygon(0 0,calc(100% - 10mm) 0,100% 50%,calc(100% - 10mm) 100%,0 100%,10mm 50%)}
.step:first-child{clip-path:polygon(0 0,calc(100% - 10mm) 0,100% 50%,calc(100% - 10mm) 100%,0 100%);padding-left:8mm}
.step b{display:block;font-size:13.2mm;line-height:1.15;font-weight:800;color:${TEAL}}
.step span{display:block;font-size:10.9mm;line-height:1.18;color:${INK2}}
.fut{display:flex;flex-direction:column}
.fut .pill{margin:0 0 3mm 7mm}
footer{position:absolute;left:44mm;right:44mm;bottom:11mm;display:flex;justify-content:space-between;gap:18mm;font-size:9.8mm;line-height:1.2;color:${INK}}
footer b{color:${INK}}
</style></head><body><div class="page">
<img class="bg" src="${img('water.jpg')}" alt="">
<img class="heroimg" src="${img('hero-blend.jpg')}" alt="">
${decorBack}
${heroOverlay()}
<div class="flow">
<header>
  <div class="brand"><h1>${C.team}</h1><p>Don’t stop the bloom. Give it <em>another path.</em></p></div>
  <div class="who"><div class="tag">${C.stand} · ${C.track}</div><div class="names">${C.students.join('<br>')}</div><div class="uni">${C.university}</div></div>
</header>
<section class="sec problem">${pill('alert', 'Problem statement')}<div class="box"><div class="q">${C.problem.question}</div><p>${C.problem.context}</p></div></section>
</div>
<div class="cap">${C.heroCaption}</div>
<div class="statsbar">${R.stats.map((s, i) => `<div class="stat">${icon(STAT_ICON[i])}<div><b style="color:${s.color}">${s.value}</b><span>${s.label}</span></div></div>`).join('')}</div>
<div class="rows">
  <div class="row r1">
    ${sec('bulb', 'Proposed solution', `<p>${C.solution}</p>`)}
    ${sec('gear', 'Technical explanation', `<p>${C.technical}</p>`)}
    ${sec('angle', 'Why 20° works', speedDiagram())}
  </div>
  <div class="tiles">
    ${tile(photo('net.jpg'), 'At the nets', 'The bloom on the face of net A')}
    ${tile(photo('collector.jpg'), 'Screw lift', 'Duty and standby, over the breakwater')}
    ${tile(planSvg(), 'Where it sits', 'To scale: nets ahead of every intake')}
    ${tile(photo('under.jpg'), 'Under water', 'Mesh from surface to seabed')}
  </div>
  <div class="row r3">
    ${sec('chart', 'Same bloom, both ways', `${bloomChart()}<p class="note">${R.captions.bloom}</p>`)}
    ${sec('tide', 'The tide doesn’t matter', `${tideChart()}<p class="note">${R.captions.tide}</p>`)}
    ${sec('warn', 'When something fails', `${faultChart()}<p class="note">${R.captions.failures}</p>`)}
  </div>
  ${sec('star', 'Solution features: what goes wrong, and what we did', `<div class="feat">${C.features.map(([k, a, b]) => `<div>${icon(k)}<p><b>${a}</b><span>${b}</span></p></div>`).join('')}</div>`)}
  <section class="fut">${pill('next', 'Future improvements')}<div class="steps">${C.future.map(([a, b]) => `<div class="step"><b>${a}</b><span>${b}</span></div>`).join('')}</div></section>
</div>
${decorFront}
<footer><span><b>Built:</b> ${C.builtSimulatedNext.built}</span><span><b>Simulated:</b> ${C.builtSimulatedNext.simulated} ${C.footnote}</span></footer>
</div></body></html>`;

const out = resolve(here, 'poster.html');
writeFileSync(out, html);

const browsers = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
const chrome = browsers.find((b) => existsSync(b));
const pdf = resolve(here, '54.ENEC.SweepLine.pdf');
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=9000', '--allow-file-access-from-files', `--print-to-pdf=${pdf}`, pathToFileURL(out).href], { stdio: 'ignore', timeout: 240000 });
console.log('wrote', pdf);
