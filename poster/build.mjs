/**
 * Builds the 1200 × 1600 mm poster as HTML from the twin's own outputs, then prints it to PDF.
 *
 *   node poster/build.mjs            # writes poster/poster.html and poster/54.ENEC.SweepLine.pdf
 *
 * Inputs: poster/content.json (text), poster/data/frame.json (a frame of the simulation, flow lines,
 * recorded tide) and poster/data/results.json (one summary per test run). Every number on the
 * poster comes from those two data files or from the arithmetic in this script.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = (p) => JSON.parse(readFileSync(resolve(here, p), 'utf8'));
const C = read('content.json');
const F = read('data/frame.json');
const R = read('data/results.json');
const font = (p) => pathToFileURL(resolve(root, 'node_modules', p)).href;

const INK = '#EAF3F7';
const INK2 = '#B9CBD3';
const MUTED = '#86A0AE';
const BG = '#071420';
const CYAN = '#22D3EE';
const TEAL = '#2DD4BF';
const AMBER = '#F5B94C';
const RED = '#F87171';

// ------------------------------------------------------------------ hero projection (mm on the poster)
const HERO_W = 1200;
const HERO_H = 385;
const S = 0.8;
const K = 0.72;
const HS = 1.5;
const sx = (z) => 1058 - z * S;
const sy = (x, y = 0) => HERO_H * 0.5 + x * S * K - y * HS;
const pt = (x, z, y = 0) => `${sx(z).toFixed(1)},${sy(x, y).toFixed(1)}`;
const poly = (pts, attrs) => `<polygon points="${pts.join(' ')}" ${attrs}/>`;

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function rocks(side, z0, z1, n, seed) {
  // Armour stone scattered over the mound, lit from the sea.
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < n; i++) {
    const z = z0 + r() * (z1 - z0);
    const a = 70 + r() * 55;
    const crest = a > 89 && a < 100;
    const y = crest ? 4.2 : a < 89 ? ((a - 70) / 19.5) * 4.2 : ((125 - a) / 25) * 4.2;
    const rad = 0.7 + r() * 1.5;
    const c = 92 + Math.round(r() * 70);
    out += `<ellipse cx="${sx(z).toFixed(1)}" cy="${sy(side * a, y).toFixed(1)}" rx="${(rad * 1.25).toFixed(2)}" ry="${(rad * 0.8).toFixed(2)}" fill="rgb(${c},${c - 7},${c - 18})"/>`;
  }
  return out;
}

function breakwater(side) {
  const m = 540;
  const toe = 125;
  const top = [pt(side * 70, m), pt(side * 89.5, m, 4.2), pt(side * 99.5, m, 4.2), pt(side * toe, m), pt(side * toe, -50), pt(side * 99.5, -62, 4.2), pt(side * 89.5, -62, 4.2), pt(side * 70, -50)];
  // Rounded head.
  let head = '';
  for (let i = 0; i <= 14; i++) {
    const t = (i / 14) * Math.PI;
    const x = 97.5 - 27.5 * Math.cos(t);
    const z = m + 26 * Math.sin(t);
    head += `${pt(side * x, z)} `;
  }
  return `<polygon points="${top.join(' ')}" fill="#4A4A43"/><polygon points="${head}" fill="#4A4A43"/>
    <polygon points="${pt(side * 89.5, m + 8, 4.2)} ${pt(side * 99.5, m + 8, 4.2)} ${pt(side * 99.5, -62, 4.2)} ${pt(side * 89.5, -62, 4.2)}" fill="#8C8878"/>
    ${rocks(side, -50, m + 20, 2600, side > 0 ? 7 : 19)}
    <polygon points="${pt(side * 91.5, m + 6, 4.3)} ${pt(side * 97.5, m + 6, 4.3)} ${pt(side * 97.5, -62, 4.3)} ${pt(side * 91.5, -62, 4.3)}" fill="#A8A594"/>`;
}

function netRibbon(N, color, opacity) {
  // Shown x-ray, from the float line down to the seabed.
  let out = '';
  const n = N.panels;
  const dx = (N.bx - N.ax) / n;
  const dz = (N.bz - N.az) / n;
  out += poly([pt(N.ax, N.az, 0.6), pt(N.bx, N.bz, 0.6), pt(N.bx, N.bz, -9), pt(N.ax, N.az, -9)], `fill="url(#netFill)" opacity="${opacity}"`);
  // Mesh hatching.
  let mesh = '';
  for (let i = 0; i <= n * 3; i++) {
    const x = N.ax + (dx * i) / 3;
    const z = N.az + (dz * i) / 3;
    mesh += `<line x1="${sx(z).toFixed(1)}" y1="${sy(x, 0.6).toFixed(1)}" x2="${sx(z).toFixed(1)}" y2="${sy(x, -9).toFixed(1)}"/>`;
  }
  out += `<g stroke="${color}" stroke-width="0.14" opacity="${opacity * 0.5}">${mesh}</g>`;
  // Piles.
  for (let i = 0; i <= n; i++) {
    const x = N.ax + dx * i;
    const z = N.az + dz * i;
    out += `<line x1="${sx(z).toFixed(1)}" y1="${sy(x, 4.4).toFixed(1)}" x2="${sx(z).toFixed(1)}" y2="${sy(x, -9).toFixed(1)}" stroke="#C7D3D9" stroke-width="0.8" opacity="${0.5 + opacity * 0.4}"/>`;
    out += `<circle cx="${sx(z).toFixed(1)}" cy="${sy(x, 4.4).toFixed(1)}" r="0.85" fill="#E8EEF1"/>`;
  }
  // Float line, glowing.
  out += `<line x1="${sx(N.az)}" y1="${sy(N.ax, 0.6)}" x2="${sx(N.bz)}" y2="${sy(N.bx, 0.6)}" stroke="${color}" stroke-width="5" opacity="0.2" stroke-linecap="round"/>`;
  out += `<line x1="${sx(N.az)}" y1="${sy(N.ax, 0.6)}" x2="${sx(N.bz)}" y2="${sy(N.bx, 0.6)}" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/>`;
  return out;
}

function flowLines() {
  let out = '';
  for (const line of F.lines) {
    const inside = Math.abs(line[0][0]) < 70 && line[0][1] < 540;
    const d = line.map(([x, z]) => pt(x, z)).join(' ');
    out += `<polyline points="${d}" fill="none" stroke="${CYAN}" stroke-width="${inside ? 0.5 : 0.42}" opacity="${inside ? 0.5 : 0.3}"/>`;
    // Arrowheads along the line.
    for (let i = 12; i < line.length - 2; i += 26) {
      const [x0, z0] = line[i];
      const [x1, z1] = line[i + 1];
      const ax = sx(z0);
      const ay = sy(x0);
      const bx = sx(z1);
      const by = sy(x1);
      const a = Math.atan2(by - ay, bx - ax);
      if (ax < -5 || ax > 1205 || ay < 0 || ay > HERO_H) continue;
      const s = 4.6;
      const p1 = `${(ax + Math.cos(a) * s).toFixed(1)},${(ay + Math.sin(a) * s).toFixed(1)}`;
      const p2 = `${(ax + Math.cos(a + 2.5) * s * 0.75).toFixed(1)},${(ay + Math.sin(a + 2.5) * s * 0.75).toFixed(1)}`;
      const p3 = `${(ax + Math.cos(a - 2.5) * s * 0.75).toFixed(1)},${(ay + Math.sin(a - 2.5) * s * 0.75).toFixed(1)}`;
      out += `<polygon points="${p1} ${p2} ${p3}" fill="${CYAN}" opacity="0.55"/>`;
    }
  }
  return out;
}

function agents() {
  let out = '';
  for (const [x, z, y, st] of F.agents) {
    const cx = sx(z);
    const cy = sy(x, y * 0.5);
    if (cx < -4 || cx > 1204 || cy < -4 || cy > HERO_H + 4) continue;
    if (st === 1) out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2" fill="${AMBER}" opacity="0.22"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="0.9" fill="#FFF3D6"/>`;
    else if (st === 2) out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.2" fill="${TEAL}" opacity="0.3"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1" fill="#D5FFF7"/>`;
    else out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.9" fill="#9FD8FF" opacity="0.16"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="0.75" fill="#E2F4FF" opacity="0.9"/>`;
  }
  return out;
}

function callout(n, x, y, tx, ty, text, anchor = 'start') {
  const w = text.length * 5.45 + 24;
  const left = anchor === 'end' ? tx - w : tx;
  return `<line x1="${x}" y1="${y}" x2="${tx + (anchor === 'end' ? 0 : 0)}" y2="${ty}" stroke="#fff" stroke-width="0.7" opacity="0.85"/>
    <circle cx="${x}" cy="${y}" r="1.6" fill="#fff"/>
    <g transform="translate(${left} ${ty - 10})"><rect width="${w}" height="20" rx="10" fill="#07141F" fill-opacity="0.88" stroke="#fff" stroke-opacity="0.4" stroke-width="0.5"/>
    <circle cx="10.5" cy="10" r="7" fill="${AMBER}"/><text x="10.5" y="13.6" text-anchor="middle" font-size="10.4" font-weight="800" fill="#07141F">${n}</text>
    <text x="21" y="14" font-size="10.8" font-weight="600" fill="#fff">${text}</text></g>`;
}

function hero() {
  const [A, B] = F.nets;
  const land = sx(-62);
  // Depth lines of the natural seabed.
  let depth = '';
  for (const d of [6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13]) {
    const z = (d - 6) / 0.0065 - 50;
    const xp = sx(z);
    if (xp < 0 || xp > 1200) continue;
    depth += `<line x1="${xp.toFixed(1)}" y1="0" x2="${xp.toFixed(1)}" y2="${HERO_H}" stroke="#9FD8FF" stroke-width="0.3" stroke-dasharray="1.6 3.4" opacity="0.2"/>`;
    if (Number.isInteger(d)) depth += `<text x="${(xp + 2).toFixed(1)}" y="${HERO_H - 7}" font-size="7.5" fill="#9FD8FF" opacity="0.55" font-family="JetBrains Mono">${d} m</text>`;
  }
  const pipe = [
    [70, 66],
    [98, 66],
    [130, 72],
    [620, 150],
  ];
  const cA = { x: A.bx - 4, z: A.bz + 12 };
  return `<svg viewBox="0 0 ${HERO_W} ${HERO_H}" width="100%" style="display:block" font-family="Inter Variable">
  <defs>
    <linearGradient id="sea" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#062033"/><stop offset="0.6" stop-color="#0A3345"/><stop offset="0.88" stop-color="#11505C"/></linearGradient>
    <linearGradient id="chan" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#0D3E50"/><stop offset="1" stop-color="#165E68"/></linearGradient>
    <linearGradient id="netFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${AMBER}" stop-opacity="0.34"/><stop offset="1" stop-color="${AMBER}" stop-opacity="0.04"/></linearGradient>
    <linearGradient id="landG" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#6B5D42"/><stop offset="1" stop-color="#3A3427"/></linearGradient>
    <clipPath id="heroClip"><rect width="${HERO_W}" height="${HERO_H}"/></clipPath>
  </defs>
  <g clip-path="url(#heroClip)">
    <rect width="${HERO_W}" height="${HERO_H}" fill="url(#sea)"/>
    ${depth}
    ${flowLines()}
    ${breakwater(-1)}
    <polygon points="${pt(-70, 540)} ${pt(70, 540)} ${pt(70, -40)} ${pt(-70, -40)}" fill="url(#chan)"/>
    <g opacity="1">${F.lines.filter((l) => Math.abs(l[0][0]) < 70 && l[0][1] < 540).map((l) => `<polyline points="${l.map(([x, z]) => pt(x, z)).join(' ')}" fill="none" stroke="${CYAN}" stroke-width="0.5" opacity="0.5"/>`).join('')}</g>
    ${netRibbon(A, AMBER, 1)}
    ${netRibbon(B, AMBER, 0.6)}
    ${agents()}
    ${breakwater(1)}
    <!-- Collector platform and pipe -->
    <polyline points="${pipe.map(([x, z]) => pt(x, z, x < 110 ? 4.6 : 0)).join(' ')}" fill="none" stroke="${TEAL}" stroke-width="2.4" stroke-linecap="round"/>
    ${poly([pt(60, 80, 4.6), pt(78, 80, 4.6), pt(78, 52, 4.6), pt(60, 52, 4.6)], `fill="#C9D4D8" stroke="#E8EEF1" stroke-width="0.4"`)}
    ${poly([pt(64, 76, 9), pt(74, 76, 9), pt(74, 58, 9), pt(64, 58, 9)], `fill="${TEAL}" stroke="#D5FFF7" stroke-width="0.4"`)}
    ${poly([pt(74, 76, 9), pt(74, 58, 9), pt(74, 58, 4.6), pt(74, 76, 4.6)], `fill="#1E9C8E"`)}
    <!-- Land, intake and plant massing -->
    <rect x="${land}" y="0" width="${HERO_W - land}" height="${HERO_H}" fill="url(#landG)"/>
    ${poly([pt(-66, -28, 3.8), pt(66, -28, 3.8), pt(66, -84, 3.8), pt(-66, -84, 3.8)], `fill="#C9CCC6"`)}
    ${poly([pt(66, -28, 3.8), pt(66, -84, 3.8), pt(66, -84, -2), pt(66, -28, -2)], `fill="#7F837F"`)}
    ${Array.from({ length: 12 }, (_, i) => {
      const x = -60 + 10 * i + 5;
      return `<line x1="${sx(-29)}" y1="${sy(x - 4, 3.8)}" x2="${sx(-29)}" y2="${sy(x + 4, 3.8)}" stroke="#20323B" stroke-width="2.6"/>`;
    }).join('')}
    ${[[-150, -70], [-46, -70], [58, -70]].map(([x, w]) => {
      const z0 = -92;
      const z1 = -150;
      const h = 20;
      return `${poly([pt(x, z0, h), pt(x + 92, z0, h), pt(x + 92, z1, h), pt(x, z1, h)], `fill="#B7BDBB"`)}${poly([pt(x + 92, z0, h), pt(x + 92, z1, h), pt(x + 92, z1, 3), pt(x + 92, z0, 3)], `fill="#737B7C"`)}${poly([pt(x, z0, h), pt(x + 92, z0, h), pt(x + 92, z0, 3), pt(x, z0, 3)], `fill="#8F9796"`)}`;
    }).join('')}
    <!-- Callouts -->
    ${callout(1, sx(860), sy(-190), 40, 30, 'Bloom drifts along the coast on the tide')}
    ${callout(2, sx(600), sy(10), 330, 30, 'The plant’s own flow draws it into the channel')}
    ${callout(3, sx(300), sy(-12, 0.6), 640, 30, 'Net A sweeps it along its face', 'start')}
    ${callout(4, sx(190), sy(30, 0.6), 640, HERO_H - 28, 'Net B catches what gets past', 'start')}
    ${callout(5, sx(66), sy(70, 9), 880, HERO_H - 28, 'Collector and gentle pump', 'start')}
    ${callout(6, sx(-29), sy(-40, 3.8), 925, 30, 'Plant’s screens unchanged', 'start')}
    <rect x="16" y="${HERO_H - 56}" width="566" height="46" rx="8" fill="#07141F" fill-opacity="0.86"/>
    <text x="28" y="${HERO_H - 36}" font-size="14" font-weight="700" fill="#fff">A frame from the digital twin: minute ${F.atMin} of a 25 t/h bloom</text>
    <text x="28" y="${HERO_H - 19}" font-size="10.4" fill="${INK2}">Each dot is a simulated jellyfish, about ${Math.round(F.kgPerAgent)} kg of bloom. Thin lines: the model’s flow. Teal line: release pipe.</text>
  </g></svg>`;
}

// ------------------------------------------------------------------ charts
function bloomChart() {
  const r = R.reference;
  const W = 340;
  const H = 190;
  const L = 34;
  const B = 28;
  const T = 12;
  const s = r.series;
  const maxT = s[s.length - 1].t / 60;
  const maxY = Math.ceil(Math.max(...s.map((p) => p.b)) / 10) * 10;
  const x = (m) => L + (m / maxT) * (W - L - 8);
  const y = (v) => H - B - (v / maxY) * (H - B - T);
  const path = (k) => s.map((p) => `${x(p.t / 60).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  let g = '';
  for (let v = 0; v <= maxY; v += 10) g += `<line x1="${L}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}" stroke="#fff" stroke-opacity="0.1" stroke-width="0.4"/><text x="${L - 4}" y="${y(v) + 3.5}" text-anchor="end" font-size="9.5" fill="${MUTED}">${v}</text>`;
  for (let m = 0; m <= maxT; m += 60) g += `<text x="${x(m)}" y="${H - B + 13}" text-anchor="middle" font-size="9.5" fill="${MUTED}">${m / 60} h</text>`;
  const mark = (m, label) => `<line x1="${x(m)}" x2="${x(m)}" y1="${T}" y2="${H - B}" stroke="${RED}" stroke-width="0.6" stroke-dasharray="2 2"/><text x="${x(m) - 2}" y="${T + 9}" text-anchor="end" font-size="9.5" font-weight="600" fill="${RED}">${label}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" font-family="Inter Variable">${g}
    ${r.bDerate ? mark(r.bDerate / 60, 'Screens at capacity') : ''}
    <polyline points="${path('b')}" fill="none" stroke="${RED}" stroke-width="2.6"/>
    <polyline points="${path('s')}" fill="none" stroke="${TEAL}" stroke-width="2.6"/>
    <text x="${x(maxT * 0.7)}" y="${y(maxY * 0.74)}" text-anchor="end" font-size="11.5" font-weight="700" fill="${RED}">Without SweepLine: ${r.bScreens.toFixed(0)} t</text>
    <text x="${x(maxT) - 2}" y="${y(0) - 6}" text-anchor="end" font-size="11" font-weight="700" fill="${TEAL}">With SweepLine: under 0.1 t</text>
    <text x="${L}" y="${T - 3}" font-size="9.5" fill="${MUTED}">Tonnes on the screens</text>
    </svg>`;
}

function tideChart() {
  const W = 340;
  const H = 190;
  const L = 34;
  const B = 28;
  const T = 12;
  const U = F.channelSpeed;
  const x = (h) => L + ((h + 18) / 36) * (W - L - 8);
  const y = (v) => T + ((0.4 - v) / 0.7) * (H - B - T);
  let g = '';
  for (const v of [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4]) g += `<line x1="${L}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}" stroke="#fff" stroke-opacity="${v === 0 ? 0.32 : 0.09}" stroke-width="0.4"/>${Math.abs((v * 10) % 2) < 0.01 ? `<text x="${L - 4}" y="${y(v) + 3.5}" text-anchor="end" font-size="9.5" fill="${MUTED}">${v.toFixed(1)}</text>` : ''}`;
  for (const h of [-12, 0, 12]) g += `<text x="${x(h)}" y="${H - B + 13}" text-anchor="middle" font-size="9.5" fill="${MUTED}">${h === 0 ? 'tide turn' : `${h > 0 ? '+' : ''}${h} h`}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" font-family="Inter Variable">${g}
    <line x1="${x(-18)}" x2="${x(18)}" y1="${y(U)}" y2="${y(U)}" stroke="${CYAN}" stroke-width="2.8"/>
    <polyline points="${F.tide.map(([h, u]) => `${x(h).toFixed(1)},${y(u).toFixed(1)}`).join(' ')}" fill="none" stroke="${AMBER}" stroke-width="2.2"/>
    <text x="${x(18) - 2}" y="${y(U) - 5}" text-anchor="end" font-size="11" font-weight="700" fill="${CYAN}">Inside the channel: steady, one way</text>
    <text x="${x(18) - 2}" y="${y(-0.3)}" text-anchor="end" font-size="11" font-weight="700" fill="${AMBER}">Outside: the recorded tide</text>
    <text x="${L}" y="${T - 3}" font-size="9.5" fill="${MUTED}">Current (m/s)</text></svg>`;
}

function speedDiagram() {
  // Velocity triangle at the net, then a section through it.
  const W = 340;
  const H = 208;
  const a = (20 * Math.PI) / 180;
  const ox = 62;
  const oy = 38;
  const L = 196;
  const et = [Math.cos(a), Math.sin(a)];
  const P = (s) => [ox + et[0] * s, oy + et[1] * s];
  const A = P(L * Math.cos(a));
  const Fx = ox + L;
  const arrow = (x0, y0, x1, y1, c, w = 2.8) => {
    const th = Math.atan2(y1 - y0, x1 - x0);
    const s = 9;
    return `<line x1="${x0}" y1="${y0}" x2="${x1 - Math.cos(th) * 5}" y2="${y1 - Math.sin(th) * 5}" stroke="${c}" stroke-width="${w}"/><polygon points="${x1},${y1} ${x1 - Math.cos(th - 0.42) * s},${y1 - Math.sin(th - 0.42) * s} ${x1 - Math.cos(th + 0.42) * s},${y1 - Math.sin(th + 0.42) * s}" fill="${c}"/>`;
  };
  const [n0x, n0y] = P(-44);
  const [n1x, n1y] = P(258);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" font-family="Inter Variable">
    <line x1="${n0x}" y1="${n0y}" x2="${n1x}" y2="${n1y}" stroke="${AMBER}" stroke-width="6" opacity="0.28" stroke-linecap="round"/>
    <line x1="${n0x}" y1="${n0y}" x2="${n1x}" y2="${n1y}" stroke="${AMBER}" stroke-width="2.2" stroke-linecap="round"/>
    <text x="${n1x - 74}" y="${n1y + 6}" font-size="11.5" font-weight="700" fill="${AMBER}" text-anchor="end">Net</text>
    ${arrow(ox, oy, Fx, oy, CYAN, 3.2)}
    ${arrow(ox, oy, A[0], A[1], TEAL, 3.2)}
    ${arrow(A[0], A[1], Fx, oy, '#fff', 2.4)}
    <path d="M ${ox + 46} ${oy} A 46 46 0 0 1 ${ox + 46 * Math.cos(a)} ${oy + 46 * Math.sin(a)}" fill="none" stroke="#fff" stroke-width="0.8"/>
    <text x="${ox + 52}" y="${oy + 13}" font-size="10.5" font-weight="700" fill="#fff">20°</text>
    <text x="${ox + 2}" y="${oy - 10}" font-size="12" font-weight="700" fill="${CYAN}">Channel flow 0.32 m/s</text>
    <text x="${ox - 2}" y="${A[1] + 16}" font-size="12" font-weight="700" fill="${TEAL}">Along the net 0.30 m/s</text>
    <text x="${Fx + 8}" y="${oy + 26}" font-size="12" font-weight="700" fill="#fff">Through</text>
    <text x="${Fx + 8}" y="${oy + 41}" font-size="12" font-weight="700" fill="#fff">0.11 m/s</text>
    <text x="${Fx + 8}" y="${oy + 54}" font-size="9.5" fill="${MUTED}">limit 0.12</text>
    <g transform="translate(0 134)">
      <rect x="8" y="10" width="324" height="52" fill="#0F4250"/>
      <rect x="8" y="62" width="324" height="7" fill="#6B5D42"/>
      <line x1="8" x2="332" y1="10" y2="10" stroke="#9FD8FF" stroke-width="0.8"/>
      <line x1="118" x2="118" y1="-5" y2="69" stroke="#C7D3D9" stroke-width="3"/>
      <line x1="125" x2="125" y1="9" y2="62" stroke="${AMBER}" stroke-width="1.8" stroke-dasharray="2.4 1.8"/>
      <ellipse cx="125" cy="8.6" rx="5.5" ry="3.4" fill="${AMBER}"/>
      <rect x="119" y="60" width="12" height="3.6" fill="#C7D3D9"/>
      <text x="136" y="26" font-size="10.5" fill="${INK}">Float line to seabed, 9 m</text>
      <text x="136" y="41" font-size="10.5" fill="${INK2}">Nothing swims underneath</text>
      <text x="136" y="56" font-size="10.5" fill="${INK2}">Weighted ground line</text>
      <text x="16" y="26" font-size="10.5" fill="${INK2}">Piles 20 m apart</text>
    </g>
  </svg>`;
}

function failureTable() {
  const rows = R.failures
    .map(
      (r) => `<tr><td class="f">${r.failure}</td><td>${r.response}</td><td class="n"><b>${r.with}</b><span> / ${r.without} t</span></td></tr>`,
    )
    .join('');
  return `<table class="fail"><thead><tr><th>What goes wrong</th><th>What happens</th><th class="n">At the screens</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const section = (n, title, body) => `<section><h2><span>${n}</span>${title}</h2>${body}</section>`;

const stats = R.stats.map((s) => `<div class="stat"><b style="color:${s.color}">${s.value}</b><span>${s.label}</span></div>`).join('');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>SweepLine poster</title><style>
@font-face{font-family:'Inter Variable';src:url('${font('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')}') format('woff2');font-weight:100 900}
@font-face{font-family:'JetBrains Mono';src:url('${font('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2')}') format('woff2');font-weight:500}
@page{size:1200mm 1600mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200mm;height:1600mm;background:${BG};-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Inter Variable',sans-serif;color:${INK};font-size:11.2mm;line-height:1.37;position:relative;overflow:hidden}
.page{position:absolute;inset:0;display:flex;flex-direction:column;background:radial-gradient(1200mm 700mm at 15% 0%,#0D2B3C 0%,${BG} 70%)}
header{display:grid;grid-template-columns:1fr auto;align-items:center;padding:28mm 44mm 14mm;gap:30mm}
.brand{display:flex;align-items:center;gap:20mm}
.brand svg{width:88mm;height:88mm}
.brand h1{font-size:92mm;font-weight:800;letter-spacing:-2.8mm;line-height:.98}
.brand p{font-size:23mm;font-weight:500;color:${AMBER};letter-spacing:-.3mm;margin-top:2mm}
.who{text-align:right}
.who .tag{font-size:17mm;font-weight:700;color:${CYAN}}
.who .names{font-size:17mm;font-weight:600;margin-top:5mm;line-height:1.24}
.who .uni{font-size:15mm;color:${INK2};margin-top:3mm}
.problem{display:grid;grid-template-columns:1fr 1.1fr;gap:26mm;padding:0 44mm 15mm;align-items:center}
.problem .q{font-size:25mm;font-weight:700;line-height:1.14;letter-spacing:-.7mm}
.problem .k{font-size:9.6mm;font-weight:700;letter-spacing:.9mm;text-transform:uppercase;color:${AMBER};margin-bottom:4mm}
.problem p.c{font-size:11.4mm;line-height:1.34;color:${INK2}}
.hero{position:relative;border-top:.5mm solid rgba(255,255,255,.14);border-bottom:.5mm solid rgba(255,255,255,.14)}
.stats{display:grid;grid-template-columns:1.34fr 1fr 1fr 1fr;gap:0;padding:11mm 44mm 9mm}
.stat{padding:0 10mm;border-left:.5mm solid rgba(255,255,255,.16)}
.stat:first-child{padding-left:0;border-left:0}
.stat b{display:block;font-size:32mm;line-height:1.02;font-weight:800;letter-spacing:-1.4mm}
.stat span{display:block;font-size:9.8mm;line-height:1.26;color:${INK2};margin-top:2mm}
.rows{flex:1;display:flex;flex-direction:column;justify-content:space-between;gap:8mm;padding:0 44mm 8mm}
.row{display:grid;gap:22mm}
.r1{grid-template-columns:1fr 1fr 1fr}
.r2{grid-template-columns:1fr 1fr 1.12fr}
.r3{grid-template-columns:1.72fr 1fr}
section h2{display:flex;align-items:center;gap:4.5mm;font-size:15mm;font-weight:800;letter-spacing:-.4mm;margin-bottom:3.4mm;color:#fff}
section h2 span{display:inline-flex;align-items:center;justify-content:center;width:12mm;height:12mm;border-radius:3mm;background:${AMBER};color:#07141F;font-size:9mm;font-weight:800}
figure figcaption{font-size:9mm;line-height:1.28;color:${MUTED};margin-top:2mm}
.feat{display:grid;grid-template-columns:1fr 1fr;gap:2.6mm 14mm}
.feat div b{display:block;font-size:11mm;font-weight:700;color:${TEAL};line-height:1.2}
.feat div{font-size:10mm;line-height:1.27;color:${INK2}}
ol.next{list-style:none;counter-reset:n}
ol.next li{counter-increment:n;position:relative;padding-left:10mm;font-size:10.4mm;line-height:1.28;margin-bottom:2.4mm;color:${INK2}}
ol.next li:before{content:counter(n);position:absolute;left:0;top:.5mm;font-weight:800;color:${AMBER}}
table.fail{width:100%;border-collapse:collapse;font-size:10mm;line-height:1.22}
table.fail th{text-align:left;font-size:8.4mm;font-weight:600;color:${MUTED};padding:0 3mm 2mm 0;border-bottom:.4mm solid rgba(255,255,255,.2)}
table.fail td{padding:2mm 3mm 2mm 0;border-bottom:.3mm solid rgba(255,255,255,.1);vertical-align:top;color:${INK2}}
table.fail td.f{color:#fff;font-weight:700;width:31%}
table.fail .n{text-align:right;white-space:nowrap}
table.fail td.n b{color:${TEAL};font-weight:800}
table.fail td.n span{color:${MUTED}}
.bsn{display:grid;grid-template-columns:1fr 1.25fr .8fr;gap:0;border:.5mm solid rgba(255,255,255,.18);border-radius:5mm;overflow:hidden}
.bsn div{padding:5mm 8mm;font-size:9.8mm;line-height:1.3;color:${INK2};border-left:.5mm solid rgba(255,255,255,.14)}
.bsn div:first-child{border-left:0}
.bsn b{display:block;font-size:10.4mm;letter-spacing:.3mm;margin-bottom:1mm}
footer{padding:0 44mm 14mm;font-size:8.4mm;color:${MUTED}}
</style></head><body><div class="page">
<header>
  <div class="brand">
    <svg viewBox="0 0 40 40"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="${CYAN}"/><stop offset="1" stop-color="${TEAL}"/></linearGradient></defs>
      <path d="M4 14c4.2-4.4 8.4-4.4 12.6 0s8.4 4.4 12.6 0 6.3-3.3 6.8-1.2" fill="none" stroke="url(#lg)" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M4 22c4.2-4.4 8.4-4.4 12.6 0s8.4 4.4 12.6 0 6.3-3.3 6.8-1.2" fill="none" stroke="url(#lg)" stroke-width="3.4" stroke-linecap="round" opacity=".72"/>
      <path d="M6 32.5 34 27" fill="none" stroke="#F59E0B" stroke-width="2.6" stroke-linecap="round"/></svg>
    <div><h1>${C.team}</h1><p>${C.tagline}</p></div>
  </div>
  <div class="who"><div class="tag">${C.stand} · ${C.track}</div><div class="names">${C.students.join('<br>')}</div><div class="uni">${C.university}</div></div>
</header>
<div class="problem"><div class="q">${C.problem.question}</div><div><div class="k">Problem statement</div><p class="c">${C.problem.context}</p></div></div>
<div class="hero">${hero()}</div>
<div class="stats">${stats}</div>
<div class="rows">
  <div class="row r1">
    ${section('A', 'Proposed solution', `<p>${C.solution}</p>`)}
    ${section('B', 'Technical explanation', `<p>${C.technical}</p>`)}
    <section><h2><span>C</span>Why the angle works</h2><figure>${speedDiagram()}</figure></section>
  </div>
  <div class="row r2">
    <section><h2><span>D</span>Same bloom, both ways</h2><figure>${bloomChart()}<figcaption>${R.captions.bloom}</figcaption></figure></section>
    <section><h2><span>E</span>The tide doesn’t matter</h2><figure>${tideChart()}<figcaption>${R.captions.tide}</figcaption></figure></section>
    <section><h2><span>F</span>When something fails</h2>${failureTable()}<figure><figcaption style="margin-top:2.4mm">${R.captions.failures}</figcaption></figure></section>
  </div>
  <div class="row r3">
    ${section('G', 'Solution features', `<div class="feat">${C.features.map(([a, b]) => `<div><b>${a}</b>${b}</div>`).join('')}</div>`)}
    ${section('H', 'Future improvements', `<ol class="next">${C.future.map((x) => `<li>${x}</li>`).join('')}</ol>`)}
  </div>
  <div class="bsn">
    <div><b style="color:${TEAL}">Built</b>${C.builtSimulatedNext.built}</div>
    <div><b style="color:${AMBER}">Simulated</b>${C.builtSimulatedNext.simulated}</div>
    <div><b style="color:${CYAN}">Next</b>${C.builtSimulatedNext.next}</div>
  </div>
</div>
<footer>${C.footnote}</footer>
</div></body></html>`;

const out = resolve(here, 'poster.html');
writeFileSync(out, html);

const browsers = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
const chrome = browsers.find((b) => existsSync(b));
const pdf = resolve(here, '54.ENEC.SweepLine.pdf');
mkdirSync(here, { recursive: true });
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=6000', '--allow-file-access-from-files', `--print-to-pdf=${pdf}`, pathToFileURL(out).href], { stdio: 'ignore', timeout: 180000 });
console.log('wrote', pdf);
