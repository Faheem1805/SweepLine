import { CheckCircle2 } from 'lucide-react';
import { FAILURE_MODES } from '../../config/failureModes';
import { STUDY } from '../../data/study.generated';

type Case = { with: number; without: number; hours: number };
const cases = STUDY.cases as unknown as Record<string, Case | undefined>;
const tonnes = (v: number) => (v < 0.05 ? 'under 0.1' : v < 10 ? v.toFixed(1) : v.toFixed(0));

/**
 * What can go wrong and what happens at the screens: the same bloom with and without SweepLine, so
 * the claim "never worse than without it" is measured wherever it can be.
 */
export function FailureModes() {
  const measured = FAILURE_MODES.filter((m) => m.run && cases[m.run]);
  const worse = measured.filter((m) => cases[m.run!]!.with > cases[m.run!]!.without);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-1">
        <h3 className="text-[14.5px] font-semibold text-white">When something fails</h3>
        {worse.length === 0 && (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-teal">
            <CheckCircle2 size={14} /> In all {measured.length} measured faults the screens see less than without SweepLine
          </span>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[760px] text-left text-[12.5px]">
          <thead className="text-[11px] tracking-[0.06em] text-muted uppercase">
            <tr className="border-b border-line">
              <th className="px-3 py-2 font-medium">What fails</th>
              <th className="px-3 py-2 font-medium">What happens</th>
              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">At the screens, tonnes</th>
            </tr>
          </thead>
          <tbody>
            {FAILURE_MODES.map((m) => {
              const o = m.run ? cases[m.run] : undefined;
              const single = m.single ? cases[m.single] : undefined;
              return (
                <tr key={m.key} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-semibold text-white">{m.failure}</td>
                  <td className="px-3 py-2 text-pretty text-ink-2">
                    {m.response}
                    {single && <span className="text-muted"> ({tonnes(single.with)} t with one net)</span>}
                  </td>
                  <td className="num px-3 py-2 text-right whitespace-nowrap">
                    {o ? (
                      <>
                        <span className="text-white">{tonnes(o.with)}</span>
                        <span className="text-muted"> vs {tonnes(o.without)} without</span>
                      </>
                    ) : (
                      <span className="text-muted">by design</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-muted">Model runs, one bloom each, {STUDY.hours} h (lift cases 5 h). Jellyfish behaviour at the net is assumed, not measured. npm run study</p>
    </div>
  );
}
