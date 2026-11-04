import { CheckCircle2, CircleDashed, Download, FlaskRound, Info, Radar, Waves } from 'lucide-react';
import { useApp } from '../app/store';
import { useSnap } from '../app/hooks';
import { Legend, SERIES, TimeChart, type SeriesDef } from '../components/charts/TimeChart';
import { ReleaseDriftPanel } from '../components/panels/ReleaseDrift';
import { SensitivityPanel } from '../components/panels/Sensitivity';
import { Panel } from '../components/ui/Panel';
import { AIR_EVIDENCE, DECISIVE_TEST, SURVIVAL, survivalRange } from '../config/survival';
import { HINDCAST_DATA } from '../data/hindcast.generated';
import { STUDY } from '../data/study.generated';
import { controller } from '../simulation/SimController';
import { downloadText, pct } from '../utils/format';

const BOTH: SeriesDef[] = [
  { key: 'b', name: 'Without SweepLine', color: SERIES.baseline },
  { key: 's', name: 'With SweepLine', color: SERIES.sweepline },
];

const rows = STUDY.reference.series.map((p) => ({ t: p.t, b: p.b, s: p.s }));

const STATUS = [
  {
    title: 'Built',
    tone: 'text-teal',
    icon: <CheckCircle2 size={16} />,
    items: ['This 3D digital twin', 'Agent model of the same bloom with and without SweepLine', 'Hydraulic model of every net panel', 'Recorded current and wave data at the site', 'Mass balance on every run'],
  },
  {
    title: 'Simulated',
    tone: 'text-amber',
    icon: <CircleDashed size={16} />,
    items: ['How jellyfish behave at a net: sliding, snagging, leaking are assumed', 'Fouling rate, from other seas', 'What the screens can wash off, 10 t/h', 'Bloom size and depth'],
  },
  {
    title: 'Missing',
    tone: 'text-red',
    icon: <FlaskRound size={16} />,
    items: ['Any test on live jellyfish', 'The real channel: width, depth, flow', 'Survival through the lift and line', 'A contractor’s price', 'Approvals: FANR safety review, EAD permits for the works and for live release'],
  },
];

/** What failed along the way and what it changed. Each of these is a real entry from the build. */
const LOG: Array<[string, string]> = [
  ['A floating pop-up curtain leaked under its skirt, needed a second line for the tide, and was far too small for a plant’s flow', 'Dropped it. Fixed full-depth nets in the one-way intake channel'],
  ['A sealed pump could cut the animals', 'Screw lift with no impeller, with survival still to be measured'],
  ['At 2 million m³/h a 9 m channel broke the fish-screen limit at 20°', 'Reference channel taken to 12 m, and a rule for sizing the net in any channel'],
  ['Our 67 kW left out the lift over the breakwater', 'Corrected to about 130 kW'],
  ['We claimed a bloom would trigger the float-line relief. The model says it never does', 'Stopped claiming it, and added a debris test that does trigger it'],
  ['Warning time was a hand sum of 21 minutes', 'Measured across five model blooms: at least 30 minutes'],
];

function ChangedLog() {
  return (
    <Panel title="What we got wrong, and what it changed" subtitle="The design moved every time the evidence did" icon={<FlaskRound size={18} />}>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[720px] text-left text-[12.5px]">
          <thead className="text-[11px] tracking-[0.06em] text-muted uppercase">
            <tr className="border-b border-line">
              <th className="px-3 py-2 font-medium">What we found</th>
              <th className="px-3 py-2 font-medium">What we changed</th>
            </tr>
          </thead>
          <tbody>
            {LOG.map(([a, b]) => (
              <tr key={a} className="border-b border-line align-top last:border-0">
                <td className="px-3 py-2 text-pretty text-ink-2">{a}</td>
                <td className="px-3 py-2 text-pretty text-white">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Survival() {
  const r = survivalRange();
  return (
    <Panel title="Survival on the way" subtitle={`Fish analogues, multiplied: ${pct(r.low)}–${pct(r.high)} end to end. No published study covers jellyfish`} icon={<Waves size={18} />}>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[720px] text-left text-[12.5px]">
          <thead className="text-[11px] tracking-[0.06em] text-muted uppercase">
            <tr className="border-b border-line">
              <th className="px-3 py-2 font-medium">Stage</th>
              <th className="px-3 py-2 text-right font-medium">Survival</th>
              <th className="px-3 py-2 font-medium">Based on</th>
            </tr>
          </thead>
          <tbody>
            {SURVIVAL.map((s) => (
              <tr key={s.stage} className="border-b border-line align-top last:border-0">
                <td className="px-3 py-2 font-semibold text-white">{s.stage}</td>
                <td className="num px-3 py-2 text-right whitespace-nowrap text-white">
                  {pct(s.low)}–{pct(s.high)}
                </td>
                <td className="px-3 py-2 text-pretty text-ink-2">
                  {s.basis} <span className="text-muted">{s.source}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-pretty text-ink-2">{AIR_EVIDENCE}</p>
      <p className="mt-1 text-[12.5px] leading-snug text-pretty text-white">
        <span className="font-semibold text-teal">The decisive test: </span>
        {DECISIVE_TEST}
      </p>
    </Panel>
  );
}

function Recorded() {
  const H = HINDCAST_DATA;
  const hours = H.seasons.reduce((s, x) => s + x.hours, 0);
  const wave = Math.max(...H.seasons.map((x) => x.maxWave));
  const current = Math.max(...H.seasons.map((x) => x.maxCurrent));
  return (
    <Panel title="Recorded conditions" subtitle="Copernicus current and wave records at the site" icon={<Radar size={18} />}>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [hours.toLocaleString('en-GB'), 'hours checked, Oct–Nov 2022–2025'],
          [`${wave.toFixed(2)} m`, 'largest significant wave. A fifth of it reaches the net'],
          [`${current.toFixed(2)} m/s`, 'fastest current outside. Inside, the plant sets the flow'],
        ].map(([v, l]) => (
          <div key={l} className="card-inner px-3.5 py-3">
            <div className="num text-[24px] leading-tight font-semibold text-white">{v}</div>
            <div className="mt-0.5 text-[12.5px] leading-snug text-pretty text-muted">{l}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** 03 — Evidence: the result, what it rests on, and what is still missing. */
export function Evidence() {
  const snap = useSnap();
  const showToast = useApp((s) => s.showToast);
  const B = STUDY.blooms;
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-6 py-6">
        <header className="flex items-start justify-between gap-6">
          <div className="min-w-0 max-w-[900px]">
            <div className="page-eyebrow">Evidence</div>
            <h1 className="mt-1.5 text-[clamp(28px,2.4vw,38px)] leading-[1.1] font-bold tracking-tight text-balance text-white">
              <span className="text-red">
                {B.baseLow.toFixed(0)}–{B.baseHigh.toFixed(0)} t
              </span>{' '}
              at the screens without SweepLine. <span className="text-teal">Under 0.1 t</span> with it.
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-pretty text-ink-2">
              Across {B.n} simulated {STUDY.bloomTph} t/h blooms over {STUDY.hours} hours, the same bloom each time, with and without SweepLine. {B.balanced ? 'Every jellyfish is accounted for on every run.' : ''}
            </p>
          </div>
          {snap && (
            <div className="flex shrink-0 gap-2 pt-1">
              <button
                type="button"
                className="btn !h-[38px] !px-3.5"
                onClick={() => {
                  downloadText(`sweepline-run-${snap.params.seed}.json`, JSON.stringify(controller.exportRun(), null, 2));
                  showToast('Simulation run exported (JSON)', 'ok');
                }}
                title="Scenario, seed, parameters, assumptions, metrics and events"
              >
                <Download size={15} /> Run data
              </button>
              <button
                type="button"
                className="btn !h-[38px] !px-3.5"
                onClick={() => {
                  downloadText(`sweepline-metrics-${snap.params.seed}.csv`, controller.exportCsv(), 'text/csv');
                  showToast('Metric history exported (CSV)', 'ok');
                }}
                title="Metric history, one row per sample"
              >
                <Download size={15} /> CSV
              </button>
            </div>
          )}
        </header>

        <div className="flex items-start gap-3 rounded-2xl border border-amber/30 bg-amber/[0.06] px-4 py-3">
          <Info size={18} className="mt-[3px] shrink-0 text-amber" />
          <p className="text-[13.5px] leading-relaxed text-pretty text-ink-2">
            <span className="font-semibold text-amber">Simulation estimates, not field results.</span> The model is not calibrated. How jellyfish behave at the net is assumed, and the reference channel is not any real plant. It shows the mechanism and its trade-offs. The tests below will set the real values.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {STATUS.map((s) => (
            <section key={s.title} className="card flex flex-col gap-2 p-4">
              <div className={`flex items-center gap-2 text-[13px] font-semibold ${s.tone}`}>
                {s.icon}
                {s.title}
              </div>
              <ul className="flex flex-col gap-1 text-[13px] leading-snug text-pretty text-ink-2">
                {s.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <Panel title="Biomass reaching the screens" subtitle="One bloom, seed 1000, tonnes over the run" actions={<Legend series={BOTH} />}>
          <TimeChart data={rows} series={BOTH} digits={1} height={280} yLabel="Tonnes at the screens" />
        </Panel>

        <ReleaseDriftPanel />

        <Survival />

        <SensitivityPanel />

        <ChangedLog />

        <Recorded />
      </div>
    </div>
  );
}
