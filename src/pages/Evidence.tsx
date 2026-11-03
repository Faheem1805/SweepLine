import { AlertTriangle, CheckCircle2, CircleDashed, Download, FlaskRound, Info, Waves } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useHistory, useSnap } from '../app/hooks';
import { useApp } from '../app/store';
import { downsample, Legend, SERIES, TimeChart, type SeriesDef } from '../components/charts/TimeChart';
import { ReleaseDriftPanel } from '../components/panels/ReleaseDrift';
import { SensitivityPanel } from '../components/panels/Sensitivity';
import { HINDCAST_DATA } from '../data/hindcast.generated';
import { SEEDS_DATA } from '../data/seeds.generated';
import type { SeedStat } from '../data/seedsTypes';
import { Icon } from '../components/ui/icons';
import { FlowArrow, IconTile, Panel, type TileTone } from '../components/ui/Panel';
import type { Balance } from '../simulation/SimulationEngine';
import { controller } from '../simulation/SimController';
import { cn, downloadText, int, mmss, pct } from '../utils/format';

const BOTH: SeriesDef[] = [
  { key: 'b', name: 'Without SweepLine', color: SERIES.baseline },
  { key: 's', name: 'With SweepLine', color: SERIES.sweepline },
];

function Metric({ icon, tone, value, label, detail, valueTone }: { icon: ReactNode; tone?: TileTone; value: string; label: string; detail: string; valueTone: string }) {
  return (
    <section className="card flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <IconTile size={40} tone={tone}>
          {icon}
        </IconTile>
        <span className="text-[14.5px] text-ink">{label}</span>
      </div>
      <div className={cn('num text-[40px] leading-none font-semibold tracking-tight', valueTone)}>{value}</div>
      <p className="text-[13px] leading-snug text-pretty text-muted">{detail}</p>
    </section>
  );
}

const ci = (s: SeedStat) => `${pct(s.lo, 1)}–${pct(s.hi, 1)}`;

/** The headline results across many blooms (multi-seed study), not just the run on screen. */
function AcrossBlooms() {
  const R = SEEDS_DATA.reference;
  const T = SEEDS_DATA.tideTurn;
  const H = HINDCAST_DATA;
  const hours = H.seasons.reduce((n, p) => n + p.hours, 0);
  const out = H.seasons.reduce((n, p) => n + Math.max(p.overWave, p.overCurrent), 0);
  const maxWave = Math.max(...H.seasons.map((p) => p.maxWave));
  const maxCurrent = Math.max(...H.seasons.map((p) => p.maxCurrent));
  const items: Array<{ label: string; value: string; detail: string; tone: string }> = [
    {
      label: `Fewer intake contacts · ${R.reduction.n} blooms`,
      value: pct(R.reduction.mean, 1),
      detail: `95% CI ${ci(R.reduction)} · worst bloom ${pct(R.reduction.min, 1)} · ${R.minutes} min from the bloom approach`,
      tone: 'text-teal',
    },
    {
      label: 'Diversion · under-skirt',
      value: `${pct(R.diversion.mean, 1)} · ${pct(R.underSkirt.mean, 1)}`,
      detail: `95% CI ${ci(R.diversion)} and ${ci(R.underSkirt)}`,
      tone: 'text-cyan',
    },
    {
      label: `After the recorded tide turn · ${T.twin.n} blooms`,
      value: `${pct(T.twin.mean, 0)} vs ${pct(T.single.mean, 0)}`,
      detail: `Fewer intake contacts in the ${T.hoursAfter} h after the turn: Twin-Line (95% CI ${ci(T.twin)}) against a single line`,
      tone: 'text-teal',
    },
    {
      label: `Deployable · ${H.seasons.length} recorded seasons`,
      value: pct(1 - out / hours, out ? 1 : 0),
      detail: `Oct–Nov ${H.seasons[0].label.slice(-4)}–${H.seasons[H.seasons.length - 1].label.slice(-4)}, ${int(hours)} h: waves peaked at ${maxWave} m (limit ${H.limits.wave}), current at ${maxCurrent} m/s (limit ${H.limits.current}). All year: longest stand-down ${H.allYear.longestStandDown} h`,
      tone: 'text-teal',
    },
  ];
  return (
    <section className="card grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="flex min-w-0 flex-col gap-1">
          <span className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">{it.label}</span>
          <span className={cn('num text-[24px] leading-none font-semibold', it.tone)}>{it.value}</span>
          <span className="text-[12px] leading-snug text-pretty text-muted">{it.detail}</span>
        </div>
      ))}
    </section>
  );
}

/** Mass balance of both worlds on screen: every jellyfish that entered the site is accounted for. */
function Accounted({ b, s }: { b: Balance; s: Balance }) {
  const ok = b.closes && s.closes;
  const row = (name: string, x: Balance) => (
    <span>
      {name} <span className="num text-ink-2">{int(x.entered)}</span> entered = <span className="num text-ink-2">{int(x.contact)}</span> at the screens +{' '}
      <span className="num text-ink-2">{int(x.diverted)}</span> to the throat + <span className="num text-ink-2">{int(x.passed)}</span> passed +{' '}
      <span className="num text-ink-2">{int(x.inWater)}</span> still in the water
    </span>
  );
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-muted">
      <span className={cn('inline-flex items-center gap-1.5 font-semibold', ok ? 'text-teal' : 'text-red')}>
        {ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
        {ok ? 'Every jellyfish accounted for' : 'Mass balance does not close'}
      </span>
      {row('With SweepLine:', s)}
      {row('Without:', b)}
    </p>
  );
}

/** Validation roadmap, in order: what exists today, then what comes next. */
const STAGES: Array<{ done: boolean; title: string; detail: string }> = [
  { done: true, title: 'Simulation visualiser', detail: '3D digital twin of a reference coastal intake' },
  { done: true, title: 'Agent model', detail: 'Seeded agent-based model with a same-seed baseline' },
  { done: false, title: 'Flume calibration', detail: 'Scaled curtain: the conveyor jets first (the largest swing), then guidance, skirt depth and under-skirt rate' },
  { done: false, title: 'Biological testing', detail: 'Live Blue Blubber through the screw lift and a 25-min pipe loop, paired controls, 96 h hold' },
  { done: false, title: 'Coastal pilot', detail: 'One curtain arm: pop-up timing and SafeOpen in real conditions' },
];

/** 03 — Evidence: does SweepLine appear to work, and how much should we trust the result? */
export function Evidence() {
  const snap = useSnap();
  const hist = useHistory(undefined, 1000);
  const showToast = useApp((s) => s.showToast);
  const rows = useMemo(() => downsample(hist, 240).map((h) => ({ t: h.t, b: h.bContacts, s: h.sContacts })), [hist]);
  if (!snap) return null;
  const b = snap.baseline;
  const s = snap.sweepline;
  const reduction = b.intakeContactPct !== null && s.intakeContactPct !== null && b.intakeContactPct > 0 ? 1 - s.intakeContactPct / b.intakeContactPct : null;
  const under = s.underSkirtPct;
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-6 py-6">
        <header className="flex items-start justify-between gap-6">
          <div className="min-w-0 max-w-[900px]">
            <div className="page-eyebrow">Evidence</div>
            <h1 className="mt-1.5 text-[clamp(30px,2.6vw,42px)] leading-[1.08] font-bold tracking-tight text-balance text-white">
              {reduction === null ? (
                <>
                  <span className="text-teal">{pct(SEEDS_DATA.reference.reduction.mean, 1)}</span> fewer intake contacts
                  <span className="text-ink-2"> across {SEEDS_DATA.reference.reduction.n} simulated blooms</span>
                </>
              ) : (
                <>
                  <span className="text-teal">{pct(reduction)}</span> fewer intake contacts
                  <span className="text-ink-2"> in the same-seed simulation</span>
                </>
              )}
            </h1>
            <p className="mt-2.5 text-[15px] leading-relaxed text-pretty text-ink-2">
              The same bloom — identical seed, timing, positions and depths — runs with and without SweepLine.
            </p>
            <p className="mt-1 text-[13px] text-muted">
              <span className="num">{mmss(snap.simTime)}</span> simulated · {snap.scenarioName}
            </p>
          </div>
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
        </header>

        <div className="flex items-start gap-3 rounded-2xl border border-amber/30 bg-amber/[0.06] px-4 py-3">
          <Info size={18} className="mt-[3px] shrink-0 text-amber" />
          <p className="text-[13.5px] leading-relaxed text-pretty text-ink-2">
            <span className="font-semibold text-amber">Simulation estimates — not field-validated.</span> These numbers come from an uncalibrated
            agent-based model, not CFD or field trials. They show the mechanism and its trade-offs; flume and biological testing will set the real values.
            Every assumption is exported with the run data.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Metric
            icon={<Icon name="intake" size={20} />}
            tone="teal"
            label="Intake reduction"
            value={reduction === null ? '—' : pct(reduction)}
            valueTone={reduction === null ? 'text-muted' : reduction > 0.5 ? 'text-teal' : 'text-amber'}
            detail={
              reduction === null
                ? 'Collecting enough resolved outcomes…'
                : `${pct(b.intakeContactPct, 1)} of the bloom reaches the screens without SweepLine, ${pct(s.intakeContactPct, 1)} with it.`
            }
          />
          <Metric
            icon={<Icon name="throat" size={20} />}
            label="Diversion efficiency"
            value={pct(s.diversionEfficiency)}
            valueTone="text-cyan"
            detail="Of the jellyfish that meet the curtain, the share delivered alive to the recovery throat."
          />
          <Metric
            icon={<Waves size={20} />}
            tone={under !== null && under > 0.1 ? 'amber' : 'cyan'}
            label="Under-skirt escape"
            value={pct(under)}
            valueTone={under !== null && under > 0.1 ? 'text-amber' : 'text-ink'}
            detail="Of the jellyfish that meet the curtain, the share that slip underneath it."
          />
        </div>

        <AcrossBlooms />

        <Panel title="Jellyfish reaching the intake" subtitle="Cumulative contacts with the intake screens — same bloom, with and without SweepLine" actions={<Legend series={BOTH} />}>
          <TimeChart data={rows} series={BOTH} digits={0} height={280} yLabel="Intake contacts (cumulative)" />
          <Accounted b={b.balance} s={s.balance} />
        </Panel>

        <ReleaseDriftPanel />

        <SensitivityPanel />

        <Panel title="Validation roadmap" subtitle="What exists today and what comes next" icon={<FlaskRound size={18} />}>
          <ol className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {STAGES.map((st, i) => (
              <li key={st.title} className="card-inner relative flex flex-col gap-2 p-4">
                <div className={cn('flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.08em] uppercase', st.done ? 'text-teal' : 'text-amber')}>
                  {st.done ? <CheckCircle2 size={16} /> : <CircleDashed size={16} />}
                  {st.done ? 'Built' : 'Next'}
                </div>
                <div className="text-[14.5px] font-semibold text-white">{st.title}</div>
                <p className="text-[12.5px] leading-snug text-pretty text-muted">{st.detail}</p>
                {i < STAGES.length - 1 && <FlowArrow top={24} />}
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
