import { FlaskConical } from 'lucide-react';
import { SENSITIVITY_FACTORS, TEST_PLAN, type SettledBy } from '../../config/sensitivity';
import { STUDY } from '../../data/study.generated';
import { cn } from '../../utils/format';
import { Panel } from '../ui/Panel';

const CHIP: Record<SettledBy, string> = {
  Flume: 'border-cyan/40 text-cyan',
  'Site data': 'border-amber/40 text-amber',
  'Sea trial': 'border-teal/40 text-teal',
};
const tonnes = (v: number) => (v < 0.05 ? 'under 0.1 t' : `${v.toFixed(v < 10 ? 1 : 0)} t`);

/** Which assumptions matter, and which test settles each one. */
export function SensitivityPanel() {
  const rows = SENSITIVITY_FACTORS.map((f) => ({ f, ...STUDY.sensitivity[f.key] }));
  return (
    <Panel title="What if our assumptions are wrong?" subtitle="Each one moved on its own, same bloom. Tonnes at the screens with SweepLine" icon={<FlaskConical size={18} />}>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[760px] text-left text-[12.5px]">
          <thead className="text-[11px] tracking-[0.06em] text-muted uppercase">
            <tr className="border-b border-line">
              <th className="px-3 py-2 font-medium">Assumption</th>
              <th className="px-3 py-2 font-medium">In the model</th>
              <th className="px-3 py-2 text-right font-medium">Low end</th>
              <th className="px-3 py-2 text-right font-medium">High end</th>
              <th className="px-3 py-2 font-medium">Settled by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ f, low, high }) => (
              <tr key={f.key} className="border-b border-line align-top last:border-0">
                <td className="px-3 py-2 font-semibold text-white">{f.label}</td>
                <td className="num px-3 py-2 text-ink-2">{f.ref}</td>
                <td className="num px-3 py-2 text-right whitespace-nowrap">
                  <span className="text-white">{low ? tonnes(low.with) : '–'}</span>
                  <div className="text-[11px] text-muted">{f.low}</div>
                </td>
                <td className="num px-3 py-2 text-right whitespace-nowrap">
                  <span className="text-white">{high ? tonnes(high.with) : '–'}</span>
                  <div className="text-[11px] text-muted">{f.high}</div>
                </td>
                <td className="px-3 py-2 text-pretty text-muted">
                  <span className={cn('mr-2 rounded-md border px-1.5 py-0.5 text-[10.5px] font-semibold', CHIP[f.settledBy])}>{f.settledBy}</span>
                  {f.test}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-pretty text-ink-2">
        The result hardly moves, and that is a warning as much as a comfort: the model has no way for an animal to pass except the leaks we gave it. A flume can show one we did not think of, which is why it comes first.
      </p>
      <h3 className="mt-5 mb-2 text-[13.5px] font-semibold text-white">The test plan, cheapest first</h3>
      <div className="grid gap-2 md:grid-cols-4">
        {TEST_PLAN.map((t, i) => (
          <div key={t.stage} className="card-inner flex flex-col gap-1.5 px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13.5px] font-semibold text-white">
                {i + 1}. {t.stage}
              </span>
              <span className="num shrink-0 text-[11.5px] text-muted">{t.time}</span>
            </div>
            <p className="text-[12.5px] leading-snug text-pretty text-ink-2">{t.proves}</p>
            <p className="text-[12px] leading-snug text-pretty text-teal">Pass: {t.pass}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
