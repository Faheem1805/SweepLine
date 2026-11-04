import { ASSUMPTIONS } from '../../config/assumptions';
import { SITE } from '../../config/site';
import { NETS } from '../../simulation/geometry';

const W = 980;
const H = 400;
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
  const crest = (x: number) => x * (1 + 0.14);
  const pipe = [[76, 88], ...SITE.pipeRoute] as ReadonlyArray<readonly [number, number]>;
  const unitW = (I.x1 - I.x0) / ASSUMPTIONS.plant.units;
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

      {/* Breakwaters. */}
      {[-1, 1].map((s) => (
        <rect
          key={s}
          x={Math.min(px(s * C.halfWidth), px(s * (C.halfWidth + B.crestWidth * 2.2)))}
          y={py(C.mouthZ + 8)}
          width={B.crestWidth * 2.2 * k}
          height={py(SITE.shore.crestZ) - py(C.mouthZ + 8)}
          rx={3}
          fill="#6b6f6c"
        />
      ))}
      <rect x={px(-C.halfWidth)} y={py(C.mouthZ)} width={2 * C.halfWidth * k} height={py(SITE.shore.crestZ) - py(C.mouthZ)} fill="#0e4257" />

      {/* Four intakes, all behind the nets. */}
      {Array.from({ length: ASSUMPTIONS.plant.units }, (_, i) => (
        <rect key={i} x={px(I.x0 + i * unitW) + 1} y={py(I.mouthZ)} width={unitW * k - 2} height={(I.mouthZ - I.backZ) * k} fill={INK} fillOpacity={0.85} />
      ))}

      {/* Flow down the channel. */}
      {[-40, 0, 40].map((x) => (
        <line key={x} x1={px(x)} y1={py(C.mouthZ - 8)} x2={px(x)} y2={py(C.mouthZ - 60)} stroke={CYAN} strokeWidth={1.4} markerEnd="url(#plan-arrow)" />
      ))}
      {[-48, 0, 48].map((x) => (
        <line key={x} x1={px(x)} y1={py(26)} x2={px(x)} y2={py(-6)} stroke={CYAN} strokeWidth={1.4} markerEnd="url(#plan-arrow)" />
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

      <Label x={px(crest(-20))} y={py(I.mouthZ) + 4} tx={px(-300)} ty={py(30)} anchor="end">
        All four intakes, behind the nets
      </Label>
      <Label x={px(NETS[0].ax + 40 * NETS[0].tx)} y={py(NETS[0].az + 40 * NETS[0].tz)} tx={px(-300)} ty={py(470)} color={AMBER} anchor="end">
        Net A, 20° across the channel
      </Label>
      <Label x={px(NETS[1].ax + 90 * NETS[1].tx)} y={py(NETS[1].az + 90 * NETS[1].tz)} tx={px(-300)} ty={py(330)} color={AMBER} anchor="end">
        Net B, 60 m behind
      </Label>
      <Label x={px(84)} y={py(76)} tx={px(320)} ty={py(-30)} color={TEAL}>
        Collector and screw lifts
      </Label>
      <Label x={px(620)} y={py(150)} tx={px(760)} ty={py(30)} color={TEAL}>
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
