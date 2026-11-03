import { Scale } from 'lucide-react';
import { ASSUMPTIONS } from '../../config/assumptions';
import { COMPARISON_ROWS, COMPARISON_SOURCES, type ComparisonRow } from '../../config/comparison';
import { RUNNING } from '../../config/costs';
import { OPERATING_ENVELOPE } from '../../config/operatingEnvelope';
import { DRIFT_DATA } from '../../data/drift.generated';
import { FAILURES_DATA } from '../../data/failures.generated';
import { HINDCAST_DATA } from '../../data/hindcast.generated';
import { SEEDS_DATA } from '../../data/seeds.generated';
import { popUpDuration } from '../../simulation/curtain';
import { getCurtainLayout } from '../../simulation/geometry';
import { pct } from '../../utils/format';
import { Panel } from '../ui/Panel';

/** SweepLine's answer to each question, from the twin's own studies. */
function sweepLine(): Record<ComparisonRow['key'], string> {
  const popUp = popUpDuration(getCurtainLayout(20)) / 60;
  const failures = Object.values(FAILURES_DATA.outcomes);
  const neverWorse = failures.filter((o) => o.worstExcess === 0).length;
  const design = DRIFT_DATA.outcomes.find((o) => o.id === DRIFT_DATA.design)!;
  const R = SEEDS_DATA.reference;
  return {
    crew: `Nobody during a bloom: it pops up from the seabed in ${popUp.toFixed(1)} min on one command from the control room`,
    units: `${pct(R.reduction.mean, 1)} fewer intake contacts across ${R.reduction.n} simulated blooms; never worse than without it in ${neverWorse} of ${failures.length} simulated failures`,
    waves: `No change up to Hs 1.2 m in the model; it retracts above ${OPERATING_ENVELOPE.waveHeight.max} m, which never happened in ${HINDCAST_DATA.seasons.length} recorded seasons`,
    animals: `Carried alive ${ASSUMPTIONS.release.design.along / 1000} km down-drift with no air; ${pct(design.backAtSite, 0)} drift back within a week`,
    cost: `About US$${RUNNING.low}–${RUNNING.high}k a season`,
  };
}

/** Against today's response: boats and crews, bubble curtains, and SweepLine, question by question. */
export function ComparisonPanel() {
  const ours = sweepLine();
  return (
    <Panel title="Against today’s response" subtitle="What plants do now, the most common alternative, and SweepLine" icon={<Scale size={18} />}>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[820px] table-fixed text-left text-[12.5px]">
          <colgroup>
            <col className="w-[17%]" />
            <col className="w-[27%]" />
            <col className="w-[27%]" />
            <col className="w-[29%]" />
          </colgroup>
          <thead className="text-[11px] tracking-[0.06em] text-muted uppercase">
            <tr className="border-b border-line">
              <th className="px-3 py-2 font-medium" />
              <th className="px-3 py-2 font-medium">Boats and crews</th>
              <th className="px-3 py-2 font-medium">Bubble curtain</th>
              <th className="px-3 py-2 font-medium text-teal">SweepLine</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((r) => (
              <tr key={r.key} className="border-b border-line align-top last:border-0">
                <td className="px-3 py-2.5 font-semibold text-white">{r.question}</td>
                <td className="px-3 py-2.5 text-pretty text-ink-2">{r.boats}</td>
                <td className="px-3 py-2.5 text-pretty text-ink-2">{r.bubbles}</td>
                <td className="bg-teal/[0.05] px-3 py-2.5 text-pretty text-white">{ours[r.key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span>SweepLine column: the twin’s own studies (Evidence). Others:</span>
        {COMPARISON_SOURCES.map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-ink-2">
            {s.label}
          </a>
        ))}
      </p>
    </Panel>
  );
}
