import { Scale } from 'lucide-react';
import { ASSUMPTIONS } from '../../config/assumptions';
import { COMPARISON_ROWS, COMPARISON_SOURCES, type ComparisonRow } from '../../config/comparison';
import { runningTotal } from '../../config/costs';
import { STUDY } from '../../data/study.generated';
import { Panel } from '../ui/Panel';

/** SweepLine's answer to each question, from the twin's own studies. */
function sweepLine(): Record<ComparisonRow['key'], string> {
  const run = runningTotal();
  const b = STUDY.blooms;
  return {
    tide: `Nothing happens. Inside the channel the plant sets the flow, so ${STUDY.cases.tide.with < 0.05 ? 'under 0.1 t' : `${STUDY.cases.tide.with.toFixed(1)} t`} reached the screens through a recorded turn`,
    depth: `Float line to seabed, ${ASSUMPTIONS.net.meshBar * 1000} mm mesh, on a weighted ground line. Under 0.1 t reached the screens from a deep-living species`,
    waves: 'Inside the breakwaters: a fifth of the wave height reaches the net. Same result in the biggest waves on record',
    crew: 'Nobody during a bloom. A small crew swaps panels on a four-week cycle, between blooms',
    animals: `Swept along the net and lifted without an impeller, then ${ASSUMPTIONS.release.design.along / 1000} km down the coast with no air. Survival still to be measured`,
    cost: `About US$${(run.low / 1000).toFixed(1)}–${(run.high / 1000).toFixed(1)}M a year, mostly panels. Comparable to boats, with ${b.baseLow.toFixed(0)}–${b.baseHigh.toFixed(0)} t kept off the screens per bloom in the model`,
  };
}

/** Against the usual answers, question by question. */
export function ComparisonPanel() {
  const ours = sweepLine();
  return (
    <Panel title="Against the usual answers" subtitle="What plants do now, the two common proposals, and SweepLine" icon={<Scale size={18} />}>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[980px] table-fixed text-left text-[12.5px]">
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[20%]" />
            <col className="w-[20%]" />
            <col className="w-[20%]" />
            <col className="w-[26%]" />
          </colgroup>
          <thead className="text-[11px] tracking-[0.06em] text-muted uppercase">
            <tr className="border-b border-line">
              <th className="px-3 py-2 font-medium" />
              <th className="px-3 py-2 font-medium">Boats and crews</th>
              <th className="px-3 py-2 font-medium">Bubble curtain</th>
              <th className="px-3 py-2 font-medium">Floating boom</th>
              <th className="px-3 py-2 font-medium text-teal">SweepLine</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((r) => (
              <tr key={r.key} className="border-b border-line align-top last:border-0">
                <td className="px-3 py-2.5 font-semibold text-white">{r.question}</td>
                <td className="px-3 py-2.5 text-pretty text-ink-2">{r.boats}</td>
                <td className="px-3 py-2.5 text-pretty text-ink-2">{r.bubbles}</td>
                <td className="px-3 py-2.5 text-pretty text-ink-2">{r.boom}</td>
                <td className="bg-teal/[0.05] px-3 py-2.5 text-pretty text-white">{ours[r.key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px] text-muted">
        Sources:{' '}
        {COMPARISON_SOURCES.map((s, i) => (
          <span key={s.url}>
            {i > 0 && ' · '}
            <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-ink-2">
              {s.label}
            </a>
          </span>
        ))}
      </p>
    </Panel>
  );
}
