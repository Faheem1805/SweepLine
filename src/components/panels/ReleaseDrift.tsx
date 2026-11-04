import { Navigation } from 'lucide-react';
import { useMemo } from 'react';
import { ASSUMPTIONS } from '../../config/assumptions';
import { SITE } from '../../config/site';
import { DRIFT_DATA } from '../../data/drift.generated';
import { landRings } from '../../simulation/drift';
import { TIDE } from '../../simulation/tide';
import { cn, pct } from '../../utils/format';
import { Panel } from '../ui/Panel';

/** Map window (site metres): x along the shore (WSW to the right), z offshore (down). */
const X0 = -3600;
const X1 = 3600;
const Z0 = -800;
const Z1 = 2800;

const TONE: Record<string, { stroke: string; text: string; bar: string; label: string }> = {
  'as-built': { stroke: '#f5b94c', text: 'text-amber', bar: 'bg-amber', label: 'Just outside the breakwater' },
  'offshore-2000': { stroke: '#93a9b6', text: 'text-ink-2', bar: 'bg-ink-2', label: 'Straight out, 2 km offshore' },
  design: { stroke: '#2dd4bf', text: 'text-teal', bar: 'bg-teal', label: `One line, ${ASSUMPTIONS.release.design.along / 1000} km down-drift (WSW)` },
};

/** SVG path for the real coastline inside the map window (even-odd fill). */
function useCoastPath(): string {
  return useMemo(
    () =>
      landRings()
        .map((r) => `M${r.map(([x, z]) => `${x.toFixed(0)},${z.toFixed(0)}`).join('L')}Z`)
        .join(''),
    [],
  );
}

/**
 * Where released jellyfish go over the following days (the drift study): the share that comes
 * back to the plant for each release option, with sample tracks on the real coastline.
 */
export function ReleaseDriftPanel() {
  const coast = useCoastPath();
  const D = DRIFT_DATA;
  const byId = Object.fromEntries(D.outcomes.map((o) => [o.id, o]));
  const natural = byId[D.natural];
  const design = byId[D.design];
  const xc = (SITE.intake.x0 + SITE.intake.x1) / 2;
  const R = ASSUMPTIONS.release.design;
  const zone = ASSUMPTIONS.drift;
  const range = (id: string) => D.ranges[id];
  const max = Math.max(...D.shown.map((id) => range(id)?.max ?? byId[id].backAtSite), 0.01);
  return (
    <Panel
      title="Where released jellyfish go"
      subtitle={`Followed for ${D.horizonDays} days after release on the recorded Oct–Nov 2025 current and wind, against the real coastline`}
      icon={<Navigation size={18} />}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <figure className="card-inner overflow-hidden p-0">
          <svg viewBox={`${X0} ${Z0} ${X1 - X0} ${Z1 - Z0}`} className="block h-auto w-full" role="img" aria-label="Plan view of the coast around the site with seven-day drift tracks of released jellyfish">
            <rect x={X0} y={Z0} width={X1 - X0} height={Z1 - Z0} fill="#0b2a33" />
            <path d={coast} fill="#3a3527" stroke="#7a6a48" strokeWidth={10} fillRule="evenodd" />
            {/* Back at the plant: the intake's approach band. */}
            <circle cx={xc} cy={SITE.channel.mouthZ} r={zone.returnRadius} fill="rgba(248,113,113,0.16)" stroke="#f87171" strokeWidth={14} strokeDasharray="60 40" />
            {D.shown.map((id) =>
              (D.tracks[id] ?? []).map((t, i) => (
                <polyline
                  key={`${id}-${i}`}
                  points={t.map(([x, z]) => `${x},${z}`).join(' ')}
                  fill="none"
                  stroke={TONE[id]?.stroke ?? '#fff'}
                  strokeOpacity={id === 'offshore-2000' ? 0.35 : 0.75}
                  strokeWidth={id === 'design' ? 16 : 12}
                  strokeLinejoin="round"
                />
              )),
            )}
            {/* Release points: the design outlet(s), and the offshore option. */}
            <circle cx={xc + R.along} cy={R.offshore} r={80} fill="#2dd4bf" stroke="#04131a" strokeWidth={20} />
            <circle cx={xc} cy={2000} r={70} fill="#93a9b6" stroke="#04131a" strokeWidth={20} />
            <rect x={xc - 60} y={-160} width={120} height={120} fill="#e7f1f5" stroke="#04131a" strokeWidth={16} />
            <text x={xc} y={-260} fill="#e7f1f5" fontSize={150} textAnchor="middle">
              Plant
            </text>
            <text x={X1 - 120} y={Z1 - 140} fill="#9fb3bf" fontSize={130} textAnchor="end">
              WSW →
            </text>
            <text x={X0 + 120} y={Z1 - 140} fill="#9fb3bf" fontSize={130}>
              ← ENE
            </text>
          </svg>
          <figcaption className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-[11.5px] text-muted">
            <span>
              <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm border border-red bg-red/20 align-[-1px]" />
              Water the plant draws in
            </span>
            {D.shown.map((id) => (
              <span key={id}>
                <span className="mr-1.5 inline-block h-[3px] w-4 align-middle" style={{ background: TONE[id].stroke }} />
                {TONE[id].label}
              </span>
            ))}
            <span>Sample tracks, one point an hour · OpenStreetMap coastline</span>
          </figcaption>
        </figure>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">Back in the water the plant draws in, within {D.horizonDays} days</div>
          {D.shown.map((id) => {
            const o = byId[id];
            const r = range(id);
            const isDesign = id === D.design;
            return (
              <div key={id} className={cn('card-inner flex flex-col gap-1.5 px-3.5 py-2.5', isDesign && '!border-teal/50 !bg-teal/[0.06]')}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className={cn('min-w-0 text-[13.5px]', isDesign ? 'font-semibold text-white' : 'text-ink')}>
                    {TONE[id].label}
                    {isDesign && <span className="ml-2 text-[11px] font-semibold tracking-[0.08em] text-teal uppercase">Design</span>}
                  </span>
                  <span className={cn('num shrink-0 text-[20px] leading-none font-semibold', TONE[id].text)}>{pct(o.backAtSite)}</span>
                </div>
                <div className="relative h-1.5 overflow-hidden rounded-full bg-line">
                  {r && <div className="absolute inset-y-0 rounded-full bg-white/15" style={{ left: `${(r.min / max) * 100}%`, width: `${Math.max(1, ((r.max - r.min) / max) * 100)}%` }} />}
                  <div className={cn('absolute inset-y-0 left-0 rounded-full', TONE[id].bar)} style={{ width: `${Math.max(1.5, (o.backAtSite / max) * 100)}%` }} />
                </div>
                <div className="num text-[11.5px] text-muted">
                  {r ? `${pct(r.min)}–${pct(r.max)} across windage 0–2 % and spreading 0.3–3 m²/s` : ''}
                  {o.medianReturnH !== null && o.backAtSite > 0.02 ? ` · typically back in ${o.medianReturnH} h` : ''}
                </div>
              </div>
            );
          })}
          <p className="text-[12.5px] leading-relaxed text-pretty text-ink-2">
            Released just outside the breakwater, {pct(byId['as-built']?.backAtSite ?? 0)} are back in the water the plant draws in. Sending them straight offshore
            does not help: the season&rsquo;s onshore drift ({(Math.abs(TIDE.stats.offshoreMean) * 100).toFixed(1)} cm/s) and wind carry them back. Along the shore
            they stay away: from one line {R.along / 1000} km down-drift, {pct(design.backAtSite)} come back.
          </p>
          <p className="text-[12px] leading-relaxed text-pretty text-muted">
            In this season almost everything near the surface reaches the shore within a week: {pct(design.stranded)} of the released animals, and{' '}
            {pct(natural.stranded)} of a natural bloom nearby with no SweepLine at all. Releasing them alive returns them to that coastal system, away from
            the screens. {D.released.toLocaleString('en-GB')} animals per option, one release an hour. Kinematic drift model with the current taken as uniform
            over the area: to be checked with drifters at sea.
          </p>
        </div>
      </div>
    </Panel>
  );
}
