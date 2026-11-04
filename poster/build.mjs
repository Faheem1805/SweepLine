/**
 * Builds the 1200 × 1600 mm poster as HTML from the twin's own outputs, then prints it to PDF.
 * Light on purpose: it is printed and mounted, so it stays a white page with dark ink.
 *
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

const INK = '#0B2B3D';
const INK2 = '#2F4B59';
const MUTED = '#5A7482';
const LINE = '#D3E0E6';
const PALE = '#EDF6F8';
const CYAN = '#0B7FA8';
const TEAL = '#07877B';
const AMBER = '#D97F0E';
const RED = '#D2433B';

// ------------------------------------------------------------------ hero overlay (mm on the poster)
const HERO_W = 1200;
const HERO_H = (1200 * H.size[1]) / H.size[0];
const at = (k) => [H.points[k][0] * HERO_W, H.points[k][1] * HERO_H];

function callout(n, key, tx, ty, text, opts = {}) {
  const [x, y] = Array.isArray(key) ? key : at(key);
  const w = text.length * 7.95 + 46;
  const left = opts.end ? tx - w : tx;
  const cx = left + 15;
  return `<line x1="${x}" y1="${y}" x2="${opts.end ? tx - 15 : cx}" y2="${ty}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="${x}" cy="${y}" r="3.4" fill="#fff" stroke="${INK}" stroke-width="1"/>
    <g transform="translate(${left} ${ty - 15})"><rect width="${w}" height="30" rx="15" fill="#fff" fill-opacity="0.95"/>
    <circle cx="15" cy="15" r="11.5" fill="${INK}"/><text x="15" y="20.4" text-anchor="middle" font-size="15.5" font-weight="800" fill="#fff">${n}</text>
    <text x="33" y="21" font-size="16" font-weight="700" fill="${INK}">${text}</text></g>`;
}

function heroOverlay() {
  const route = ['r0', 'r1', 'r2', 'r3', 'r4'].map((k) => at(k).map((v) => v.toFixed(1)).join(',')).join(' ');
  return `<svg viewBox="0 0 ${HERO_W} ${HERO_H}" class="over" font-family="Inter Variable">
    <polyline points="${route}" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-opacity="0.9"/>
    <polyline points="${route}" fill="none" stroke="${TEAL}" stroke-width="2.6" stroke-linecap="round"/>
    ${callout(1, [150, HERO_H - 120], 44, HERO_H - 58, 'A bloom drifts in on the tide')}
    ${callout(2, 'mouth', 740, 380, 'The plant’s own flow draws it in')}
    ${callout(3, 'netA', 118, 350, 'Net A sweeps it along')}
    ${callout(4, 'netB', 118, 306, 'Net B catches what gets past')}
    ${callout(5, 'collector', 690, 262, 'Screw lift, no impeller')}
    ${callout(6, 'intake', 118, 262, 'All four intakes untouched')}
    ${callout(7, [H.points.r3[0] * HERO_W + 60, H.points.r3[1] * HERO_H - 1.6], 1156, 300, 'Released 2 km along the coast', { end: true })}
  </svg>`;
}

// ------------------------------------------------------------------ charts
const axisText = (x, y, t, a = 'end') => `<text x="${x}" y="${y}" text-anchor="${a}" font-size="11.5" fill="${MUTED}">${t}</text>`;

function bloomChart() {
  const r = R.reference;
  const W = 368;
  const H2 = 152;
  const L = 30;
  const B = 22;
  const T = 8;
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
  const W = 368;
  const H2 = 152;
  const L = 30;
  const B = 22;
  const T = 8;
  const U = F.channelSpeed;
  const x = (h) => L + ((h + 18) / 36) * (W - L - 6);
  const y = (v) => T + ((0.42 - v) / 0.7) * (H2 - B - T);
  let g = '';
  for (const v of [-0.2, 0, 0.2, 0.4]) g += `<line x1="${L}" x2="${W - 6}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? '#AFC3CC' : LINE}" stroke-width="0.7"/>${axisText(L - 5, y(v) + 4, v.toFixed(1))}`;
  for (const h of [-12, 0, 12]) g += axisText(x(h), H2 - B + 15, h === 0 ? 'tide turn' : `${h > 0 ? '+' : ''}${h} h`, 'middle');
  return `<svg viewBox="0 0 ${W} ${H2}" width="100%" font-family="Inter Variable">${g}
    <line x1="${x(-18)}" x2="${x(18)}" y1="${y(U)}" y2="${y(U)}" stroke="${CYAN}" stroke-width="4.4"/>
    <polyline points="${F.tide.map(([h, u]) => `${x(h).toFixed(1)},${y(u).toFixed(1)}`).join(' ')}" fill="none" stroke="${AMBER}" stroke-width="3.4" stroke-linejoin="round"/>
    <text x="${x(18)}" y="${y(U) - 8}" text-anchor="end" font-size="15" font-weight="800" fill="${CYAN}">Inside the channel: steady, one way</text>
    <text x="${x(18)}" y="${y(-0.235)}" text-anchor="end" font-size="15" font-weight="800" fill="${AMBER}">Outside: the recorded tide</text></svg>`;
}

function faultChart() {
  const rows = R.failures;
  const W = 368;
  const rowH = 24.6;
  const H2 = rows.length * rowH + 6;
  const X = 150;
  const max = Math.max(...rows.map((r) => Number(r.without)));
  const bar = (v) => ((W - X - 76) * v) / max;
  const g = rows
    .map((r, i) => {
      const y = i * rowH + 4;
      const w = bar(Number(r.without));
      return `<text x="0" y="${y + 16}" font-size="13.2" font-weight="700" fill="${INK}">${r.failure}</text>
        <rect x="${X}" y="${y + 3}" width="${w}" height="9" rx="2" fill="${RED}" fill-opacity="0.85"/>
        <text x="${X + w + 5}" y="${y + 12}" font-size="12" font-weight="700" fill="${RED}">${r.without} t</text>
        <rect x="${X}" y="${y + 14}" width="3" height="9" rx="1" fill="${TEAL}"/>
        <text x="${X + 8}" y="${y + 23}" font-size="12" font-weight="800" fill="${TEAL}">${r.with === 'under 0.1' ? 'under 0.1 t' : `${r.with} t`}</text>`;
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
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[k]}"/></svg>`;

const mark = `<svg viewBox="0 0 40 40" class="mark">
  <path d="M4 14c4.2-4.4 8.4-4.4 12.6 0s8.4 4.4 12.6 0 6.3-3.3 6.8-1.2" fill="none" stroke="${CYAN}" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M4 22c4.2-4.4 8.4-4.4 12.6 0s8.4 4.4 12.6 0 6.3-3.3 6.8-1.2" fill="none" stroke="${TEAL}" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M6 32.5 34 27" fill="none" stroke="${AMBER}" stroke-width="3" stroke-linecap="round"/></svg>`;

/** Plan of the system, to scale, light for print. */
function planSvg() {
  const W = 270;
  const H2 = 122;
  const k = 0.108;
  const px = (x) => 30 + x * k;
  const py = (z) => 97 - z * k;
  const ch = 70;
  const land = py(-62);
  const [A, B] = F.nets;
  const route = [[76, 88], [100, 89], [132, 94], [620, 150], [2040, 300]].map(([x, z]) => `${px(x).toFixed(1)},${py(z).toFixed(1)}`).join(' ');
  const units = [0, 1, 2, 3].map((i) => `<rect x="${px(-60 + i * 30) + 0.25}" y="${py(-30)}" width="${30 * k - 0.5}" height="5" fill="${INK}"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H2}" preserveAspectRatio="xMidYMid slice" style="display:block;width:100%;height:122mm;border-radius:5mm" font-family="Inter Variable">
    <rect width="${W}" height="${H2}" fill="#D8EEF4"/>
    <rect y="${land}" width="${W}" height="${H2 - land}" fill="#F1E6CC"/>
    <circle cx="${px(0)}" cy="${py(540)}" r="${300 * k}" fill="${RED}" fill-opacity="0.09" stroke="${RED}" stroke-width="0.5" stroke-dasharray="2 1.5"/>
    <rect x="${px(-ch - 9)}" y="${py(548)}" width="9" height="${land - py(548)}" fill="#7C7A70"/>
    <rect x="${px(ch)}" y="${py(548)}" width="9" height="${land - py(548)}" fill="#7C7A70"/>
    <rect x="${px(-ch)}" y="${py(548)}" width="${2 * ch * k}" height="${land - py(548)}" fill="#A9DCE9"/>
    ${units}
    <line x1="${px(A.ax)}" y1="${py(A.az)}" x2="${px(A.bx)}" y2="${py(A.bz)}" stroke="${AMBER}" stroke-width="1.5"/>
    <line x1="${px(B.ax)}" y1="${py(B.az)}" x2="${px(B.bx)}" y2="${py(B.bz)}" stroke="${AMBER}" stroke-width="1.5" stroke-dasharray="2.4 1.2"/>
    <polyline points="${route}" fill="none" stroke="${TEAL}" stroke-width="1.5"/>
    <circle cx="${px(2040)}" cy="${py(300)}" r="3" fill="${TEAL}"/>
    <text x="${px(2040) + 3}" y="${py(300) - 6}" font-size="10.5" font-weight="800" fill="${TEAL}" text-anchor="end">Release, 2 km along</text>
    <text x="${px(1150)}" y="${py(190) + 19}" font-size="10.5" font-weight="700" fill="${TEAL}" text-anchor="middle">1 m line over the breakwater</text>
    <text x="${px(0) + 300 * k + 4}" y="${py(640)}" font-size="10.5" font-weight="700" fill="${RED}">Water the plant draws in</text>
    <text x="${px(ch + 20)}" y="${land + 13}" font-size="10.5" font-weight="700" fill="${INK}">Four intakes</text>
    
    <line x1="${W - 66}" y1="20" x2="${W - 66 + 500 * k}" y2="20" stroke="${INK}" stroke-width="1.2"/><text x="${W - 66 + 250 * k}" y="14" font-size="10" fill="${INK}" text-anchor="middle">500 m</text>
  </svg>`;
}

const tile = (src, title, text) => `<figure class="tile"><img class="ph" src="${src}" alt=""><figcaption><b>${title}</b>${text}</figcaption></figure>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>SweepLine poster</title><style>
@font-face{font-family:'Inter Variable';src:url('${font('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}') format('woff2');font-weight:100 900}
@page{size:1200mm 1600mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200mm;height:1600mm;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Inter Variable',sans-serif;color:${INK};font-size:13.6mm;line-height:1.36;position:relative;overflow:hidden}
.page{position:absolute;inset:0;display:flex;flex-direction:column;background:#fff}
header{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:30mm;padding:30mm 44mm 0}
.brand{display:flex;align-items:center;gap:16mm}
.mark{width:92mm;height:92mm}
.brand h1{font-size:106mm;font-weight:850;letter-spacing:-4mm;line-height:.96;color:${INK}}
.brand p{font-size:25mm;font-weight:600;color:${TEAL};letter-spacing:-.4mm;margin-top:3mm}
.who{text-align:right}
.who .tag{font-size:18mm;font-weight:800;color:${CYAN}}
.who .names{font-size:17.5mm;font-weight:700;margin-top:4mm;line-height:1.2}
.who .uni{font-size:16mm;color:${INK2};margin-top:3mm;font-weight:600}
.problem{position:relative;z-index:2;display:grid;grid-template-columns:1.28fr 1fr;gap:26mm;padding:16mm 44mm 0;align-items:start}
.problem .k{font-size:11mm;font-weight:800;letter-spacing:1mm;text-transform:uppercase;color:${AMBER};margin-bottom:2mm}
.problem .q{font-size:29mm;font-weight:800;line-height:1.1;letter-spacing:-.9mm}
.problem p{font-size:14.4mm;line-height:1.3;color:${INK2};padding-top:13mm}
.hero{position:relative;width:1200mm;height:${HERO_H}mm;margin-top:-142mm;z-index:1}
.hero img{position:absolute;inset:0;width:100%;height:100%;display:block}
.hero .fade{position:absolute;inset:0;background:linear-gradient(#fff 0%,#fff 26%,rgba(255,255,255,.86) 32%,rgba(255,255,255,.4) 37%,rgba(255,255,255,.12) 41%,rgba(255,255,255,0) 45%)}
.hero .over{position:absolute;inset:0;width:100%;height:100%}
.hero .cap{position:absolute;left:44mm;bottom:9mm;background:rgba(255,255,255,.95);border-radius:4mm;padding:2.6mm 6mm;font-size:11mm;font-weight:600;color:${INK2}}
.stats{display:grid;grid-template-columns:1.62fr 1fr 1fr 1fr;padding:12mm 44mm 10mm}
.stat{padding:0 11mm;border-left:.7mm solid ${LINE}}
.stat:first-child{padding-left:0;border-left:0}
.stat b{display:block;font-size:40mm;line-height:1;font-weight:850;letter-spacing:-1.9mm;white-space:nowrap}
.stat span{display:block;font-size:12.4mm;line-height:1.24;color:${INK2};margin-top:2.6mm}
.rows{flex:1;display:flex;flex-direction:column;justify-content:space-between;gap:9mm;padding:0 44mm 45mm}
.row{display:grid;gap:24mm}
.r1{grid-template-columns:1fr 1.06fr .94fr}
.r3{grid-template-columns:1fr 1fr 1fr}
h2{font-size:20.5mm;font-weight:850;letter-spacing:-.7mm;line-height:1.05;margin-bottom:4mm;color:${INK}}
h2 i{font-style:normal;color:${TEAL}}
.tiles{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12mm}
.tile .ph{display:block;width:100%;height:122mm;object-fit:cover;border-radius:5mm}
.tile figcaption{font-size:11.6mm;line-height:1.24;color:${INK2};margin-top:2.6mm}
.tile figcaption b{display:block;font-size:13.6mm;color:${INK};font-weight:800}
.plan{height:128mm;border-radius:5mm;overflow:hidden;background:${PALE}}
.note{font-size:10.6mm;line-height:1.25;color:${MUTED};margin-top:2mm}
.feat{display:grid;grid-template-columns:repeat(5,1fr);gap:7mm 12mm}
.feat div{display:grid;grid-template-columns:20mm 1fr;gap:0 4.5mm;align-items:start}
.feat svg{width:20mm;height:20mm;color:${TEAL}}
.feat b{display:block;font-size:13.2mm;line-height:1.14;font-weight:800;color:${INK}}
.feat span{display:block;font-size:11.2mm;line-height:1.22;color:${INK2};margin-top:1mm}
.steps{display:grid;grid-template-columns:repeat(5,1fr);gap:0}
.step{position:relative;padding:4mm 16mm 4mm 15mm;background:${PALE};clip-path:polygon(0 0,calc(100% - 10mm) 0,100% 50%,calc(100% - 10mm) 100%,0 100%,10mm 50%)}
.step:first-child{clip-path:polygon(0 0,calc(100% - 10mm) 0,100% 50%,calc(100% - 10mm) 100%,0 100%);padding-left:9mm}
.step b{display:block;font-size:13.4mm;line-height:1.15;font-weight:800;color:${TEAL}}
.step span{display:block;font-size:11mm;line-height:1.2;color:${INK2}}
footer{position:absolute;left:44mm;right:44mm;bottom:12mm;display:flex;justify-content:space-between;gap:20mm;font-size:10mm;line-height:1.22;color:${MUTED};border-top:.6mm solid ${LINE};padding-top:3.4mm}
footer b{color:${INK}}
</style></head><body><div class="page">
<header>
  <div class="brand">${mark}<div><h1>${C.team}</h1><p>${C.tagline}</p></div></div>
  <div class="who"><div class="tag">${C.stand} · ${C.track}</div><div class="names">${C.students.join('<br>')}</div><div class="uni">${C.university}</div></div>
</header>
<div class="problem"><div><div class="k">Problem statement</div><div class="q">${C.problem.question}</div></div><p>${C.problem.context}</p></div>
<div class="hero"><img src="${img('hero.jpg')}" alt=""><div class="fade"></div>${heroOverlay()}<div class="cap">${C.heroCaption}</div></div>
<div class="stats">${R.stats.map((s) => `<div class="stat"><b style="color:${s.color}">${s.value}</b><span>${s.label}</span></div>`).join('')}</div>
<div class="rows">
  <div class="row r1">
    <section><h2>Proposed solution</h2><p>${C.solution}</p></section>
    <section><h2>Technical explanation</h2><p>${C.technical}</p></section>
    <section><h2>Why 20° works</h2>${speedDiagram()}</section>
  </div>
  <div class="tiles">
    ${tile(img('net.jpg'), 'At the nets', 'The bloom on the face of net A')}
    ${tile(img('collector.jpg'), 'Screw lift', 'Duty and standby, over the breakwater')}
    <figure class="tile">${planSvg()}<figcaption><b>Where it sits</b>To scale: nets ahead of every intake</figcaption></figure>
    ${tile(img('under.jpg'), 'Under water', 'Mesh from surface to seabed')}
  </div>
  <div class="row r3">
    <section><h2>Same bloom, <i>both ways</i></h2>${bloomChart()}<p class="note">${R.captions.bloom}</p></section>
    <section><h2>The tide <i>doesn’t matter</i></h2>${tideChart()}<p class="note">${R.captions.tide}</p></section>
    <section><h2>When something <i>fails</i></h2>${faultChart()}<p class="note">${R.captions.failures}</p></section>
  </div>
  <section><h2>Solution features: <i>what goes wrong, and what we did</i></h2><div class="feat">${C.features.map(([k, a, b]) => `<div>${icon(k)}<p><b>${a}</b><span>${b}</span></p></div>`).join('')}</div></section>
  <section><h2>Future improvements</h2><div class="steps">${C.future.map(([a, b]) => `<div class="step"><b>${a}</b><span>${b}</span></div>`).join('')}</div></section>
</div>
<footer><span><b>Built:</b> ${C.builtSimulatedNext.built}</span><span><b>Simulated:</b> ${C.builtSimulatedNext.simulated} ${C.footnote}</span></footer>
</div></body></html>`;

const out = resolve(here, 'poster.html');
writeFileSync(out, html);

const browsers = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
const chrome = browsers.find((b) => existsSync(b));
const pdf = resolve(here, '54.ENEC.SweepLine.pdf');
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=9000', '--allow-file-access-from-files', `--print-to-pdf=${pdf}`, pathToFileURL(out).href], { stdio: 'ignore', timeout: 240000 });
console.log('wrote', pdf);
