import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { FAILURE_MODES } from '../../config/failureModes';
import { FAILURES_DATA } from '../../data/failures.generated';
import { SEEDS_DATA } from '../../data/seeds.generated';
import { cn, pct } from '../../utils/format';

/** How each run ended, in words. */
const ENDED: Record<string, { text: string; tone: string }> = {
  NOMINAL: { text: 'Guiding', tone: 'text-teal' },
  ELEVATED: { text: 'Guiding, elevated load', tone: 'text-amber' },
  WARNING: { text: 'Guiding, warning', tone: 'text-amber' },
  SAFEOPEN: { text: 'Retracting', tone: 'text-amber' },
  BASELINE_RESTORED: { text: 'Retracted, plant as today', tone: 'text-ink-2' },
  OUTSIDE_ENVELOPE: { text: 'Not deployed, plant as today', tone: 'text-ink-2' },
  DEPLOYING: { text: 'Deploying', tone: 'text-cyan' },
  STANDBY: { text: 'Stowed', tone: 'text-ink-2' },
};

/**
 * What can go wrong and what happens to the intake (the failure-mode study): the same blooms with
 * and without SweepLine, so the claim "never worse than today" is checked, not asserted.
 */
export function FailureModes() {
  const D = FAILURES_DATA;
  const sim = FAILURE_MODES.filter((m) => m.source === 'sim' && D.outcomes[m.key]);
  const worse = sim.filter((m) => D.outcomes[m.key]!.worstExcess > 0);
  const tide = SEEDS_DATA.tideTurn;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-1">
        <h3 className="text-[14.5px] font-semibold text-white">When something fails</h3>
        <span className={cn('inline-flex items-center gap-1.5 text-[12.5px] font-semibold', worse.length ? 'text-red' : 'text-teal')}>
          {worse.length ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
          {worse.length
            ? `Worse than without SweepLine in ${worse.length} of ${sim.length} simulated failures`
            : `In all ${sim.length} simulated failures the intake sees no more jellyfish than without SweepLine`}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[760px] text-left text-[12.5px]">
          <thead className="text-[11px] tracking-[0.06em] text-muted uppercase">
            <tr className="border-b border-line">
              <th className="px-3 py-2 font-medium">What fails</th>
              <th className="px-3 py-2 font-medium">What SweepLine does</th>
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Intake contacts, {D.minutes} min</th>
              <th className="px-3 py-2 font-medium">Ends</th>
            </tr>
          </thead>
          <tbody>
            {FAILURE_MODES.map((m) => {
              const o = D.outcomes[m.key];
              const ended = o ? (ENDED[o.status] ?? { text: o.status, tone: 'text-ink-2' }) : null;
              return (
                <tr key={m.key} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-semibold text-white">{m.failure}</td>
                  <td className="px-3 py-2 text-pretty text-ink-2">{m.response}</td>
                  <td className="num px-3 py-2 text-right whitespace-nowrap">
                    {m.source === 'sim' && o ? (
                      <>
                        <span className="text-white">{Math.round(o.sweep)}</span>
                        <span className="text-muted"> vs {Math.round(o.base)} without</span>
                      </>
                    ) : m.source === 'tide' ? (
                      <span className="text-white">
                        {pct(tide.twin.mean, 1)} fewer<span className="text-muted"> in {tide.hoursAfter} h</span>
                      </span>
                    ) : (
                      <span className="text-muted">by design</span>
                    )}
                  </td>
                  <td className={cn('px-3 py-2 whitespace-nowrap', ended?.tone ?? 'text-muted')}>
                    {ended ? ended.text : m.source === 'tide' ? `Line B guiding · ${tide.twin.n} blooms` : 'Stowed on the seabed'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-muted">
        Same {D.seeds.length} blooms with and without SweepLine, {D.minutes} simulated minutes each, faults injected into steady operation or the stress-test
        scenarios · npm run study:failures
      </p>
    </div>
  );
}
