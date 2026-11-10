import { ASSUMPTIONS } from '../../config/assumptions';
import { HEAD_TANK } from '../../simulation/lift';
import { SITE, CREST, eastCrestLine } from '../../config/site';
import { NETS } from '../../simulation/geometry';

const W = 980;
const H = 424;
const k = 0.335;
const px = (x: number) => 268 + x * k;
const py = (z: number) => 336 - z * k;
const TEAL = '#2dd4bf';
const AMBER = '#f5b94c';
const CYAN = '#22d3ee';
const RED = '#f87171';
const INK = '#e7f1f5';
const MUTED = '#93a9b6';

function Label({ x, y, tx, ty, children, color = INK, anchor = 'start' }: { x: number; y: number; tx: number; ty: number; children: string; color?: string; anchor?: 'start' | 'end' | 'middle' }) {
  return (
    <g>
      <line x1={x} y1={y} x2={tx} y2={ty} stroke={color} strokeOpacity={0.55} strokeWidth={0.8} />
      <circle cx={x} cy={y} r={1.8} fill={color} />
      <text x={tx + (anchor === 'start' ? 5 : anchor === 'end' ? -5 : 0)} y={ty + 4} fill={color} fontSize={12} fontWeight={600} textAnchor={anchor}>
        {children}
      </text>
    </g>
  );
}

/** Plan of the whole system, to scale, from the same geometry the simulation uses. */
export function PlanSchematic() {
  const C = SITE.channel;
  const B = SITE.breakwater;
  const I = SITE.intake;
  const landY = py(SITE.shore.crestZ);
  const pipe = [[HEAD_TANK.x, HEAD_TANK.z], [81, 78], ...SITE.pipeRoute] as ReadonlyArray<readonly [number, number]>;
  const B2 = SITE.basin;
  const west = `${px(-CREST.centre)},${py(C.mouthZ)} ${px(-CREST.centre)},${py(B2.wallZ)}`;
  const east = eastCrestLine(30)
    .map(([x, z]) => `${px(x)},${py(z)}`)
    .join(' ');
  const R = SITE.release;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Plan of the channel between two breakwaters, the four intakes behind two angled nets, the collector, and the release line over the east breakwater to the outlet 2 km along the coast">
      <defs>
        <marker id="plan-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 1 L9 5 L0 9 z" fill={CYAN} />
        </marker>
      </defs>
      <rect width={W} height={H} fill="#0a2a38" />
      <rect y={landY} width={W} height={H - landY} fill="#3b3626" />
      <text x={16} y={H - 14} fill="#a89f7f" fontSize={12}>
        Land
      </text>
      <text x={W - 16} y={24} fill={MUTED} fontSize={12} textAnchor="end">
        Open sea
      </text>

      {/* The water the plant draws in. */}
      <circle cx={px(0)} cy={py(C.mouthZ)} r={ASSUMPTIONS.drift.returnRadius * k} fill={RED} fillOpacity={0.07} stroke={RED} strokeOpacity={0.6} strokeDasharray="5 4" />

      {/* Channel and side basin. */}
      <rect x={px(-C.halfWidth)} y={py(C.mouthZ)} width={2 * C.halfWidth * k} height={py(B2.wallZ) - py(C.mouthZ)} fill="#0e4257" />
      <rect x={px(-C.halfWidth)} y={py(B2.northZ)} width={(B2.endX + C.halfWidth) * k} height={py(B2.wallZ) - py(B2.northZ)} fill="#0e4257" />

      {/* Breakwaters. */}
      <polyline points={west} fill="none" stroke="#6b6f6c" strokeWidth={B.crestWidth * 2.2 * k} strokeLinecap="round" />
      <polyline points={east} fill="none" stroke="#6b6f6c" strokeWidth={B.crestWidth * 2.2 * k} strokeLinecap="round" strokeLinejoin="round" />

      {/* One intake per unit, along the plant wall behind the nets. */}
      {B2.units.map((x) => (
        <rect key={x} x={px(x + I.x0)} y={py(B2.wallZ)} width={(I.x1 - I.x0) * k} height={7} fill={INK} fillOpacity={0.85} />
      ))}

      {/* Flow down the channel. */}
      {[-40, 0, 40].map((x) => (
        <line key={x} x1={px(x)} y1={py(C.mouthZ - 8)} x2={px(x)} y2={py(C.mouthZ - 60)} stroke={CYAN} strokeWidth={1.4} markerEnd="url(#plan-arrow)" />
      ))}
      {[-80, -20].map((z) => (
        <line key={z} x1={px(90)} y1={py(z)} x2={px(190)} y2={py(z)} stroke={CYAN} strokeWidth={1.4} markerEnd="url(#plan-arrow)" />
      ))}

      {/* Nets. */}
      {NETS.map((L) => (
        <line key={L.index} x1={px(L.ax)} y1={py(L.az)} x2={px(L.bx)} y2={py(L.bz)} stroke={AMBER} strokeWidth={2} strokeDasharray={L.index === 1 ? '6 3' : undefined} />
      ))}

      {/* Release line. */}
      <polyline points={pipe.map(([x, z]) => `${px(x)},${py(z)}`).join(' ')} fill="none" stroke={TEAL} strokeWidth={2} />
      <rect x={px(62)} y={py(90)} width={22 * k} height={32 * k} fill={TEAL} />
      <circle cx={px(R.x)} cy={py(R.z)} r={6} fill={TEAL} stroke="#04131a" strokeWidth={2} />

      {/* Tide outside, both ways. */}
      <line x1={px(560)} y1={py(690)} x2={px(960)} y2={py(690)} stroke={MUTED} strokeWidth={1.4} markerStart="url(#plan-arrow)" markerEnd="url(#plan-arrow)" />
      <text x={px(760)} y={py(690) - 8} fill={MUTED} fontSize={12} textAnchor="middle">
        Tide outside, turning about four times a day
      </text>

      <Label x={px(B2.units[1])} y={py(B2.wallZ) + 7} tx={px(B2.units[2])} ty={H - 14} anchor="middle">
        All four intakes, along the plant wall, behind the nets
      </Label>
      <Label x={px(NETS[0].ax + 40 * NETS[0].tx)} y={py(NETS[0].az + 40 * NETS[0].tz)} tx={px(-300)} ty={py(470)} color={AMBER} anchor="end">
        Net A at 20°
      </Label>
      <Label x={px(NETS[1].ax + 90 * NETS[1].tx)} y={py(NETS[1].az + 90 * NETS[1].tz)} tx={px(-300)} ty={py(330)} color={AMBER} anchor="end">
        Net B, 60 m behind
      </Label>
      <Label x={px(84)} y={py(76)} tx={px(250)} ty={py(330)} color={TEAL}>
        Collector and screw lifts
      </Label>
      <Label x={px(1200)} y={py(206)} tx={px(1280)} ty={py(70)} color={TEAL}>
        1 m line over the breakwater, 2.2 km, 24 min
      </Label>
      <Label x={px(R.x)} y={py(R.z)} tx={px(R.x - 120)} ty={py(R.z + 180)} color={TEAL} anchor="end">
        Release, 2 km down-drift
      </Label>
      <Label x={px(0) + ASSUMPTIONS.drift.returnRadius * k * 0.71} y={py(C.mouthZ) - ASSUMPTIONS.drift.returnRadius * k * 0.71} tx={px(430)} ty={py(860)} color={RED}>
        Water the plant draws in
      </Label>

      {/* Scale. */}
      <g transform={`translate(${W - 170} ${H - 22})`}>
        <line x1={0} y1={0} x2={500 * k} y2={0} stroke={INK} strokeWidth={1.5} />
        <line x1={0} y1={-4} x2={0} y2={4} stroke={INK} strokeWidth={1.5} />
        <line x1={500 * k} y1={-4} x2={500 * k} y2={4} stroke={INK} strokeWidth={1.5} />
        <text x={250 * k} y={-7} fill={INK} fontSize={11} textAnchor="middle">
          500 m
        </text>
      </g>
    </svg>
  );
}
