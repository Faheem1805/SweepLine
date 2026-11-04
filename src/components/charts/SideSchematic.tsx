import { ASSUMPTIONS } from '../../config/assumptions';

const AMBER = '#f5b94c';
const CYAN = '#22d3ee';
const TEAL = '#2dd4bf';
const INK = '#e7f1f5';
const MUTED = '#93a9b6';

function Arrow({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 8;
  return (
    <g stroke={color} fill={color} strokeWidth={2}>
      <line x1={x1} y1={y1} x2={x2 - Math.cos(a) * 4} y2={y2 - Math.sin(a) * 4} />
      <path d={`M${x2} ${y2} L${x2 - h * Math.cos(a - 0.45)} ${y2 - h * Math.sin(a - 0.45)} L${x2 - h * Math.cos(a + 0.45)} ${y2 - h * Math.sin(a + 0.45)} z`} stroke="none" />
    </g>
  );
}

/** How the flow splits at the net: a small part through the mesh, a large part along it. */
export function FlowSplit({ angle, channel, through, sweep }: { angle: number; channel: number; through: number; sweep: number }) {
  const a = (angle * Math.PI) / 180;
  const ox = 44;
  const oy = 160;
  const L = 300;
  const nx = ox + L * Math.cos(a);
  const ny = oy - L * Math.sin(a);
  const px = ox + L * 0.5 * Math.cos(a);
  const py = oy - L * 0.5 * Math.sin(a);
  const scale = 230;
  const vx = px + channel * scale;
  const tx = px + sweep * scale * Math.cos(a);
  const ty = py - sweep * scale * Math.sin(a);
  return (
    <svg viewBox="0 0 400 200" className="block h-auto w-full" role="img" aria-label={`A net at ${angle.toFixed(0)} degrees splits ${channel.toFixed(2)} metres per second into ${through.toFixed(2)} through the mesh and ${sweep.toFixed(2)} along it`}>
      <line x1={ox} y1={oy} x2={nx} y2={ny} stroke={AMBER} strokeWidth={3} />
      <text x={ox + 6} y={oy + 18} fill={AMBER} fontSize={12} fontWeight={600}>
        Net at {angle.toFixed(0)}°
      </text>
      <Arrow x1={px} y1={py} x2={vx} y2={py} color={CYAN} />
      <Arrow x1={px} y1={py} x2={tx} y2={ty} color={TEAL} />
      <Arrow x1={tx} y1={ty} x2={vx} y2={py} color={through <= ASSUMPTIONS.screenCriteria.approachMax ? INK : '#f87171'} />
      <text x={vx + 6} y={py + 4} fill={CYAN} fontSize={12} fontWeight={600}>
        {channel.toFixed(2)} m/s
      </text>
      <text x={tx - 8} y={ty - 8} fill={TEAL} fontSize={12} fontWeight={600} textAnchor="end">
        {sweep.toFixed(2)} along
      </text>
      <text x={vx + 6} y={py + 22} fill={through <= ASSUMPTIONS.screenCriteria.approachMax ? INK : '#f87171'} fontSize={12} fontWeight={600}>
        {through.toFixed(3)} through
      </text>
    </svg>
  );
}

/** Section through a net: float line, full-depth mesh, ground line, pile and the relief dip. */
export function NetSection({ depth }: { depth: number }) {
  const y0 = 46;
  const bed = 180;
  return (
    <svg viewBox="0 0 400 200" className="block h-auto w-full" role="img" aria-label={`Section through the net from the float line to the seabed, ${depth} metres deep`}>
      <rect y={y0} width={400} height={bed - y0} fill="#0e4257" />
      <rect y={bed} width={400} height={20} fill="#6a5f43" />
      <line x1={0} y1={y0} x2={400} y2={y0} stroke={CYAN} strokeOpacity={0.7} />
      <text x={8} y={y0 - 8} fill={MUTED} fontSize={12}>
        Still water
      </text>
      {/* Piles. */}
      {[80, 300].map((x) => (
        <rect key={x} x={x - 6} y={18} width={12} height={bed + 14 - 18} fill="#3a4a53" />
      ))}
      {/* Mesh. */}
      <path d={`M86 ${y0 + 1} L294 ${y0 + 1} L294 ${bed} L86 ${bed} z`} fill="url(#netmesh)" stroke={AMBER} strokeOpacity={0.55} />
      <defs>
        <pattern id="netmesh" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0 H9 M0 0 V9" stroke="#cfd8d0" strokeOpacity={0.5} strokeWidth={0.7} />
        </pattern>
      </defs>
      {/* Float line and ground line. */}
      <line x1={86} y1={y0 - 3} x2={294} y2={y0 - 3} stroke={AMBER} strokeWidth={6} strokeLinecap="round" />
      <line x1={86} y1={bed - 1} x2={294} y2={bed - 1} stroke="#dfe5e4" strokeWidth={4} />
      <text x={190} y={y0 - 12} fill={AMBER} fontSize={12} fontWeight={600} textAnchor="middle">
        Float line, dips at 0.12 m of head
      </text>
      <text x={190} y={(y0 + bed) / 2 + 4} fill={INK} fontSize={12} fontWeight={600} textAnchor="middle">
        {depth} m of mesh, surface to seabed
      </text>
      <text x={190} y={bed + 15} fill={INK} fontSize={12} textAnchor="middle">
        Weighted ground line
      </text>
      <text x={312} y={34} fill={MUTED} fontSize={12}>
        Pile
      </text>
    </svg>
  );
}
