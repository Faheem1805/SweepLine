import { SlidersHorizontal } from 'lucide-react';
import { SENSITIVITY_FACTORS, type SettledBy } from '../../config/sensitivity';
import { SENSITIVITY_DATA } from '../../data/sensitivity.generated';
import { cn, pct } from '../../utils/format';
import { Panel } from '../ui/Panel';

const TONE: Record<SettledBy, { chip: string; bar: string }> = {
  'Site data': { chip: 'border-cyan/40 text-cyan', bar: 'bg-cyan/70' },
  Flume: { chip: 'border-amber/40 text-amber', bar: 'bg-amber/70' },
  Tank: { chip: 'border-teal/40 text-teal', bar: 'bg-teal/70' },
};

const value = (v: number, unit: string) => (unit === 'output' ? (v === 0 ? 'jets off' : pct(v, 0)) : `${v} ${unit}`);
/** Swings smaller than this read as no change (a tenth of a percentage point). */
const FLAT = 0.001;

/**
 * Which assumptions the headline result depends on (the sensitivity study): each factor at both ends
 * of its plausible range on the same blooms, largest swing first, with the test that settles it.
 */
export function SensitivityPanel() {
  const D = SENSITIVITY_DATA;
  const rows = SENSITIVITY_FACTORS.map((f) => {
    const r = D.factors[f.key];
    return { f, ...r, swing: Math.max(Math.abs(r.low - D.base), Math.abs(r.high - D.base)) };
  }).sort((a, b) => b.swing - a.swing);
  const worst = Math.min(D.base, ...rows.flatMap((r) => [r.low, r.high]));
  const best = Math.max(D.base, ...rows.flatMap((r) => [r.low, r.high]));
  // Axis: from an even percentage below the worst case to 100 %.
  const lo = Math.max(0, Math.floor(worst * 50 - 0.5) / 50);
  const x = (v: number) => `${((v - lo) / (1 - lo)) * 100}%`;
  const top = rows[0];
  const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  const flat = rows.filter((r) => r.swing < FLAT).map((r) => lower(r.f.label));
  const list = flat.length > 1 ? `${flat.slice(0, -1).join(', ')} and ${flat[flat.length - 1]}` : flat[0];
  return (
    <Panel
      title="What the result depends on"
      subtitle={`Each assumption pushed to both ends of its plausible range, one at a time, on the same ${D.seeds.length} blooms (${D.minutes} min runs)`}
      icon={<SlidersHorizontal size={18} />}
    >
      <p className="mb-4 max-w-[980px] text-[14px] leading-relaxed text-pretty text-ink-2">
        With any one assumption at either end of its range, SweepLine still avoids{' '}
        <span className="num font-semibold text-white">
          {pct(worst, 1)}–{pct(best, 1)}
        </span>{' '}
        of intake contacts (reference {pct(D.base, 1)}). The largest swing: <span className="font-semibold text-white">{lower(top.f.label)}</span>,{' '}
        {pct(Math.min(top.low, top.high), 1)}–{pct(Math.max(top.low, top.high), 1)} from {value(top.f.low, top.f.unit)} to {value(top.f.high, top.f.unit)}. First test:{' '}
        {lower(top.f.test)}.
      </p>
      <div className="flex flex-col gap-1.5">
        <div className="hidden grid-cols-[minmax(0,230px)_minmax(0,1fr)_minmax(0,300px)] gap-4 px-3 pb-1 text-[11px] tracking-[0.06em] text-muted uppercase md:grid">
          <span>Assumption · range tested</span>
          <span className="flex justify-between">
            <span>{pct(lo, 0)} avoided</span>
            <span>100%</span>
          </span>
          <span>Settled by</span>
        </div>
        {rows.map(({ f, low, high }) => (
          <div key={f.key} className="card-inner grid grid-cols-1 items-center gap-x-4 gap-y-2 px-3 py-2.5 md:grid-cols-[minmax(0,230px)_minmax(0,1fr)_minmax(0,300px)]">
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-white">{f.label}</div>
              <div className="text-[11.5px] text-muted" title={f.basis}>
                {value(f.low, f.unit)} to {value(f.high, f.unit)}
              </div>
            </div>
            <div className="relative h-7" aria-label={`${f.label}: ${pct(low, 1)} at ${value(f.low, f.unit)}, ${pct(high, 1)} at ${value(f.high, f.unit)}`}>
              <div className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
              <div className="absolute top-0 bottom-0 border-l border-dashed border-ink-2/60" style={{ left: x(D.base) }} />
              <div
                className={cn('absolute top-1/2 h-2 -translate-y-1/2 rounded-full', TONE[f.settledBy].bar)}
                style={{ left: x(Math.min(low, high)), width: `calc(${x(Math.max(low, high))} - ${x(Math.min(low, high))} + 2px)` }}
              />
              {[
                { v: low, filled: false },
                { v: high, filled: true },
              ].map((m) => (
                <span
                  key={String(m.filled)}
                  className={cn('absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white', m.filled ? 'bg-white' : 'bg-panel')}
                  style={{ left: x(m.v) }}
                  title={`${pct(m.v, 1)} avoided`}
                />
              ))}
              <span className="num absolute -top-0.5 -translate-x-full pr-2 text-[11px] text-ink-2" style={{ left: x(Math.min(low, high)) }}>
                {pct(Math.min(low, high), 1)}
              </span>
            </div>
            <div className="flex min-w-0 items-start gap-2">
              <span className={cn('shrink-0 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold', TONE[f.settledBy].chip)}>{f.settledBy}</span>
              <span className="text-[12px] leading-snug text-pretty text-muted">{f.test}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span>
          <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border-2 border-white bg-panel align-middle" />
          Low end
        </span>
        <span>
          <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border-2 border-white bg-white align-middle" />
          High end
        </span>
        <span>
          <span className="mr-1.5 inline-block h-3 w-0 border-l border-dashed border-ink-2/60 align-middle" />
          Reference
        </span>
        {flat.length > 0 && <span>No bar: {list} did not change how many reached the screens over these ranges.</span>}
        <span>Each point against its own same-seed baseline · npm run study:sensitivity</span>
      </p>
    </Panel>
  );
}
