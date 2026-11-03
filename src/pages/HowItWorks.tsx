import { ChevronDown, Gauge, Grid3x3, Recycle, ShieldAlert, ShieldCheck, Sprout, Turtle, Waves } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useSnap } from '../app/hooks';
import { AngleDiagram } from '../components/charts/AngleDiagram';
import { PlanSchematic } from '../components/charts/PlanSchematic';
import { AlertPlanner } from '../components/panels/AlertPlanner';
import { FailureModes } from '../components/panels/FailureModes';
import { SideSchematic } from '../components/charts/SideSchematic';
import { Icon } from '../components/ui/icons';
import { FlowArrow, IconTile, Panel, type TileTone } from '../components/ui/Panel';
import { ASSUMPTIONS } from '../config/assumptions';
import { AED_PER_USD, CAPEX_EXCLUDED, capexTotal, CO2_PER_UNIT_DAY, REFERENCE_EVENT, RUNNING, UNIT_DAY } from '../config/costs';
import { OPERATING_ENVELOPE } from '../config/operatingEnvelope';
import { AIR_EVIDENCE, DECISIVE_TEST, SURVIVAL, survivalRange } from '../config/survival';
import { SITE, seabedDepth } from '../config/site';
import { DRIFT_DATA } from '../data/drift.generated';
import { WILDLIFE_DATA } from '../data/wildlife.generated';
import { popUpDuration } from '../simulation/curtain';
import { feasibility, SIZING_BLOOM } from '../simulation/feasibility';
import { getCurtainLayout } from '../simulation/geometry';
import type { ConstraintStatus } from '../simulation/safety';
import type { AnchorAngle } from '../simulation/types';
import { cn } from '../utils/format';

const C = ASSUMPTIONS.curtain;
const J = ASSUMPTIONS.jets;

const STEPS: Array<{ icon: ReactNode; title: string; body: string }> = [
  {
    icon: <Icon name="curtain" size={22} />,
    title: 'Deploy',
    body: 'Pops up from the seabed when the early warning arrives — about a minute, no vessel.',
  },
  {
    icon: <Icon name="bellmouth" size={22} />,
    title: 'Sweep',
    body: 'The angled curtain turns the current sideways; built-in water jets keep the bloom moving along it.',
  },
  {
    icon: <Icon name="throat" size={22} />,
    title: 'Recover',
    body: 'A large, smooth bellmouth collects the bloom — no cage, no sharp edges.',
  },
  {
    icon: <Icon name="release" size={22} />,
    title: 'Release',
    body: 'A low-shear line carries the jellyfish alive around the intake and releases them 2 km along the shore, down-drift, where the recorded current and wind do not bring them back.',
  },
];

const SAFETY: Array<{ tone: TileTone; icon: ReactNode; title: string; body: string }> = [
  {
    tone: 'cyan',
    icon: <Icon name="curtain" size={18} />,
    title: 'SweepLine guidance',
    body: 'Curtain, water jets, throat and low-shear transfer move the bloom alive around the intake.',
  },
  {
    tone: 'amber',
    icon: <ShieldAlert size={17} />,
    title: 'SafeOpen and standby path',
    body: `A standby transfer path takes over on a fault. Outside the operating envelope the curtain retracts, upstream end first. If air or power is lost it sinks onto its seabed anchors (every ${C.intermediateAnchorSpacing} m), never toward the intake.`,
  },
  {
    tone: 'teal',
    icon: <Icon name="intake" size={18} />,
    title: 'Existing intake protection',
    body: "The plant's screens and procedures stay unchanged — SweepLine is never worse than today.",
  },
];

const STATUS_TEXT: Record<ConstraintStatus, string> = { ok: 'text-teal', near: 'text-amber', out: 'text-red', na: 'text-dim' };

/** What it takes to build and run one line: throughput, power, people and approvals (from the twin and design assumptions). */
function BuildAndRun({ skirt, angle, jetLevel }: { skirt: number; angle: AnchorAngle; jetLevel: number }) {
  const f = feasibility(angle, skirt, jetLevel);
  const popUpMin = popUpDuration(getCurtainLayout(angle)) / 60;
  const T = ASSUMPTIONS.transfer;
  const cap = capexTotal();
  const tiles: Array<{ value: string; label: string; body: string; note: string }> = [
    {
      value: `${Math.round(f.capacity)} t/h`,
      label: 'Throughput per line',
      body: `A dense bloom on a spring tide brings ${f.bloomLoad[0].toFixed(0)}–${f.bloomLoad[1].toFixed(0)} t/h across the curtain (${SIZING_BLOOM.density[0]}–${SIZING_BLOOM.density[1]} per m³, ${SIZING_BLOOM.mass[0]}–${SIZING_BLOOM.mass[1]} kg each, ${f.current.toFixed(2)} m/s). The ${T.pipeBore} m transfer line carries about ${Math.round(f.capacity)} t/h at ${Math.round(T.maxJellyFraction * 100)}% jellyfish by volume.`,
      note: `Spring current: the recorded season’s 95th percentile. Catchment ${f.catchmentWidth.toFixed(0)} m × ${skirt.toFixed(1)} m skirt.`,
    },
    {
      value: `≈ ${Math.round(f.totalKW)} kW`,
      label: 'Power while running',
      body: `Transfer pump ${Math.round(f.pumpKW)} kW (${f.head.toFixed(1)} m head over the ${(f.lineLength / 1000).toFixed(1)} km release line) and jets ${Math.round(f.jetsKW)} kW. Nothing runs while the line is stowed. That is about ${((f.totalKW * 24) / 1000).toFixed(1)} MWh a day from the plant’s own low-carbon power, ${((f.totalKW / 1.4e6) * 100).toFixed(3)}% of a 1.4 GW unit.`,
      note: 'Darcy–Weisbach friction for a smooth HDPE line; jets scale with the cube of output.',
    },
    {
      value: `${popUpMin.toFixed(1)} min`,
      label: 'Deploy, no vessel',
      body: 'One command from the control room after the early warning; the line inflates and rises from its seabed anchors. One operator watches it; a small crew inspects each line monthly in season.',
      note: 'Pop-up timing from the twin; ascent speed to be confirmed in a flume.',
    },
    {
      value: `US$${cap.low.toFixed(0)}–${cap.high.toFixed(0)}M`,
      label: 'Hardware cost, both lines',
      body: `Sourced public prices (AED ${Math.round(cap.low * AED_PER_USD)}–${Math.round(cap.high * AED_PER_USD)}M): curtains, anchors, jet and transfer pumps, and one shared 2.4 km release line, which is the largest item. Not included: ${CAPEX_EXCLUDED.join(', ')}.`,
      note: 'Item-by-item ranges and sources in src/config/costs.ts and the README.',
    },
    {
      value: `${Math.max(1, Math.round(cap.low / UNIT_DAY.high))}–${Math.round(cap.high / UNIT_DAY.low)} unit-days`,
      label: 'Pays back after',
      body: `One lost day of a 1.4 GW unit is worth about US$${UNIT_DAY.low.toFixed(1)}–${UNIT_DAY.high.toFixed(1)}M. ${REFERENCE_EVENT.label} cost ${REFERENCE_EVENT.unitDays[0]}–${REFERENCE_EVENT.unitDays[1]} unit-days. Running costs are about US$${RUNNING.low}–${RUNNING.high}k a season, against ~US$${RUNNING.manualPerYear}M a year for boats and crews at Gravelines. Each unit-day saved also keeps about ${CO2_PER_UNIT_DAY.tonnes.toLocaleString('en-GB')} t of CO₂ out of the air.`,
      note: `${UNIT_DAY.basis} CO₂: ENEC, 22.4 Mt a year avoided by four units.`,
    },
    {
      value: 'Outside the plant',
      label: 'Approvals',
      body: 'Nothing in the intake, screens or plant systems changes. It goes through the operator’s modification programme as non-safety equipment in open water, plus two permits: Abu Dhabi Maritime’s NOC for a floating structure and its marker buoys, and an addition to the plant’s EAD operational environmental permit for seabed works and live release.',
      note: 'Precedent: buoyed silt curtains go in under Abu Dhabi Maritime notices (ADM/LMN/2026/30). Sources in the README.',
    },
  ];
  return (
    <Panel title="Build and run it" subtitle="What one guide line takes, from the twin’s geometry, the recorded tide and design assumptions" icon={<Gauge size={18} />} bodyClassName="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="card-inner flex flex-col gap-2 p-4">
          <div className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">{t.label}</div>
          <div className={cn('text-[26px] leading-none font-semibold tracking-tight text-white', /\d/.test(t.value) && 'num')}>{t.value}</div>
          <p className="text-[13px] leading-snug text-pretty text-ink-2">{t.body}</p>
          <p className="mt-auto text-[11.5px] leading-snug text-pretty text-muted">{t.note}</p>
        </div>
      ))}
    </Panel>
  );
}

/** Wildlife and side effects: what else lives at the site, and how the design answers it (live skirt gap from the twin). */
function WildlifePanel({ skirt, angle }: { skirt: number; angle: AnchorAngle }) {
  const W = WILDLIFE_DATA;
  const layout = getCurtainLayout(angle);
  let lo = Infinity;
  let hi = 0;
  for (let k = 0; k < layout.segCount; k++) {
    const gap = seabedDepth(layout.midX[k], layout.midZ[k]) - skirt;
    lo = Math.min(lo, gap);
    hi = Math.max(hi, gap);
  }
  const design = DRIFT_DATA.outcomes.find((o) => o.id === DRIFT_DATA.design)!;
  const items: Array<{ icon: ReactNode; title: string; body: string; source: string }> = [
    {
      icon: <Turtle size={18} />,
      title: 'Turtles and dugongs at the curtain',
      body: `A solid skirt with no mesh to tangle in, hanging from the surface. It leaves ${lo.toFixed(1)}–${hi.toFixed(1)} m of open water above the seabed (never under ${C.seabedClearance} m), so air-breathers dive under it. Taut moorings, no loose lines.`,
      source: `${W.turtles.within10km} tracked green-turtle positions within 10 km of the site, the closest ${(W.turtles.nearestKm ?? 0) * 1000} m away (${W.turtles.source.replace('OBIS · ', '')}).`,
    },
    {
      icon: <Grid3x3 size={18} />,
      title: 'At the recovery throat',
      body: `Smooth bars ${Math.round(ASSUMPTIONS.throat.excluderBarSpacing * 100)} cm apart let the 30–45 cm bells through and keep adult turtles and dugongs out. The mouth is open to the air, and a camera at the transfer inlet holds the pump while an air-breather is inside.`,
      source: 'Abu Dhabi waters hold the world’s second-largest dugong population (EAD).',
    },
    {
      icon: <Waves size={18} />,
      title: 'Jets, noise and light',
      body: `Water only, at walking pace (≤ ${J.conveyorSpeed} m/s along the face): no blades, no air bubbles, no acoustic deterrents. Navigation marks only at night, so nothing is drawn in.`,
      source: 'Jellyfish have no hearing; acoustic deterrents disturb dugongs and turtles.',
    },
    {
      icon: <Sprout size={18} />,
      title: 'Seabed and seagrass',
      body: `Stowed, each line lies on a strip about 1 m wide along its anchor line (${layout.length.toFixed(0)} m). Anchor lines are routed over bare sand after a seabed survey, away from the seagrass dugongs graze. Only the anchor blocks stay permanently.`,
      source: 'Footprint from the twin’s pre-engineered layouts.',
    },
    {
      icon: <Recycle size={18} />,
      title: 'Fouling and polyps',
      body: 'A biocide-free foul-release skin, monthly inspection in season, and the curtain is lifted and stored dry outside the bloom season, so it never becomes a nursery for jellyfish polyps on the seabed.',
      source: 'Fouling load is monitored; past its limit SweepLine retracts (Stress test → Curtain overload).',
    },
    {
      icon: <Icon name="release" size={18} />,
      title: 'Where the jellyfish go',
      body: `Released alive ${ASSUMPTIONS.release.design.along / 1000} km along the shore, down-drift, with no air or blades on the way. Only ${Math.round(design.backAtSite * 100)}% come back to the plant within ${DRIFT_DATA.horizonDays} days.`,
      source: 'Drift study on the recorded current and wind: see Evidence.',
    },
  ];
  return (
    <Panel title="Wildlife and side effects" subtitle="What else lives here, and how the design keeps it safe" icon={<Turtle size={18} />} bodyClassName="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((it) => (
        <div key={it.title} className="card-inner flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2.5">
            <IconTile size={32} tone="teal">
              {it.icon}
            </IconTile>
            <span className="text-[14px] font-semibold text-white">{it.title}</span>
          </div>
          <p className="text-[13px] leading-snug text-pretty text-ink-2">{it.body}</p>
          <p className="mt-auto text-[11.5px] leading-snug text-pretty text-muted">{it.source}</p>
        </div>
      ))}
      <SurvivalStrip />
    </Panel>
  );
}

/** Survival from curtain to outlet, stage by stage (fish and invertebrate analogues: no jellyfish data exist yet). */
function SurvivalStrip() {
  const total = survivalRange();
  const p = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="card-inner col-span-full flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[14px] font-semibold text-white">Alive on the way: lift once, then gravity</span>
        <span className="text-[12px] text-muted">
          End to end <span className="num text-[15px] font-semibold text-teal">{p(total.low)}–{p(total.high)}</span> on fish and invertebrate analogues
        </span>
      </div>
      <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {SURVIVAL.map((st, i) => (
          <li key={st.stage} className="flex flex-col gap-1 rounded-lg border border-line/70 px-3 py-2" title={`${st.basis} (${st.source})`}>
            <span className="text-[11.5px] text-muted">
              <span className="num mr-1 text-dim">{i + 1}</span>
              {st.stage}
            </span>
            <span className="num text-[16px] font-semibold text-ink">
              {p(st.low)}–{p(st.high)}
            </span>
            <span className="text-[11px] leading-snug text-dim">{st.source}</span>
          </li>
        ))}
      </ol>
      <p className="text-[12.5px] leading-snug text-pretty text-ink-2">
        No published study measures jellyfish through a pump or a long pipe, so this follows the US fish-bypass rules: one slow screw lift into a head
        tank, then gravity down a smooth line with wide bends, never below atmospheric pressure and with no air. {AIR_EVIDENCE}
      </p>
      <p className="text-[12px] leading-snug text-pretty text-muted">
        <span className="font-semibold text-amber">Decisive test: </span>
        {DECISIVE_TEST}
      </p>
    </div>
  );
}

function TechnicalDetails() {
  const snap = useSnap();
  const [open, setOpen] = useState(false);
  if (!snap) return null;
  const p = snap.params;
  const c = snap.curtain;
  const layout = getCurtainLayout(p.anchorAngle);
  const popUpMin = popUpDuration(layout) / 60;
  const T = ASSUMPTIONS.transfer;
  const spec: Array<[string, string]> = [
    ['Anchor layouts', '15° / 20° / 25° pre-engineered'],
    ['Curtain length (20°)', `${getCurtainLayout(20).length.toFixed(0)} m in ${C.moduleLength} m modules`],
    ['Skirt depth', `${C.skirtDepthMin}–${C.skirtDepthMax} m, ≥ ${C.seabedClearance} m above the seabed`],
    ['Deployment', `Pop-up, inflatable float line (~${popUpMin.toFixed(1)} min)`],
    ['Conveyor jets', `${J.conveyorSpeed} m/s at the face, ${J.conveyorBand} m wide`],
    ['Foot jets', `${J.footUplift} m/s upward at the hem`],
    ['Jet flow / power', `~${J.designFlowM3s} m³/s · ~${J.designPowerKW} kW at 100 %`],
    ['Throat mouth', `${(SITE.throat.halfWidth * 2).toFixed(1)} × ${(SITE.throat.halfHeight * 2).toFixed(1)} m bellmouth`],
    ['Transfer', `Screw lift into a head tank, then gravity: ${T.pipeBore} m bore at ${T.pipeVelocity} m/s, bends ≥ 5 bores`],
    ['In the animals’ path', 'No air, no impellers, no blades; one slow fish-friendly screw'],
  ];
  return (
    <section className="card overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02]">
        <span>
          <span className="block text-[16px] font-semibold text-white">Technical details</span>
          <span className="block text-[13px] text-muted">Side section, specification and operating envelope — all values are design assumptions</span>
        </span>
        <ChevronDown size={18} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="flex animate-fade-in flex-col gap-6 border-t border-line px-5 pt-4 pb-5">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-2">
              <h4 className="text-[13px] font-semibold text-ink">Section through the curtain (live values)</h4>
              <div className="overflow-hidden rounded-xl border border-line">
                <SideSchematic
                  skirt={c.skirtActual}
                  liftDeg={c.liftAngle}
                  seabed={layout.minSeabedDepth}
                  mean={p.bloomMeanDepth}
                  sd={p.bloomDepthSD}
                  p90={snap.bloom.p90}
                  hs={p.waveHeight}
                  current={p.currentSpeed}
                  underPct={snap.sweepline.underSkirtPct}
                  minClearance={OPERATING_ENVELOPE.seabedClearance.min}
                  jet={p.activeFlow ? Math.max(c.jetOutput, c.mode === 'STOWED' ? p.jetLevel : 0) : 0}
                />
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <div>
                <h4 className="text-[13px] font-semibold text-ink">Operating envelope (assumed limits)</h4>
                <p className="mt-0.5 text-[12px] text-muted">Outside these limits SweepLine does not deploy — or retracts — and says so.</p>
              </div>
              <div className="card-inner px-3.5 py-1">
                {snap.envelope.constraints.map((k, i) => (
                  <div key={k.key} className={cn('grid grid-cols-[minmax(0,1fr)_auto_96px] items-center gap-3 py-2 text-[13px]', i > 0 && 'border-t border-line/60')}>
                    <span className="min-w-0 truncate text-ink-2">
                      {k.label}
                      {k.kind === 'advisory' && <span className="ml-1.5 text-[10.5px] tracking-wide text-dim uppercase">advisory</span>}
                    </span>
                    <span className={cn('num text-right', STATUS_TEXT[k.status])}>{k.value}</span>
                    <span className="num text-right text-[11.5px] text-dim">{k.limit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-[13px] font-semibold text-ink">Specification</h4>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 lg:grid-cols-5">
              {spec.map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 border-t border-line/60 py-2">
                  <dt className="text-[12px] text-muted">{k}</dt>
                  <dd className="text-[13px] leading-snug text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </section>
  );
}

/** 02 — How It Works: why SweepLine is different from putting another net in front of the intake. */
export function HowItWorks() {
  const snap = useSnap();
  if (!snap) return null;
  const p = snap.params;
  const c = snap.curtain;
  const ut = p.currentSpeed * Math.cos((c.attackAngle * Math.PI) / 180);
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-6 py-6">
        <header className="max-w-[880px]">
          <div className="page-eyebrow">How it works</div>
          <h1 className="mt-1.5 text-[clamp(30px,2.6vw,42px)] leading-[1.08] font-bold tracking-tight text-balance text-white">
            Don’t stop the bloom. Give it another path.
          </h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-pretty text-ink-2">
            A net blocks the bloom and takes its full force. SweepLine guides it: a curtain that pops up from the seabed on the early warning, makes its
            own gentle current, and sweeps the jellyfish alive around the intake.
          </p>
        </header>

        <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card relative flex flex-col gap-3 p-4">
              <div className="flex items-center gap-3">
                <IconTile size={40}>{s.icon}</IconTile>
                <div className="min-w-0 leading-tight">
                  <div className="num text-[11.5px] text-dim">0{i + 1}</div>
                  <div className="text-[16px] font-semibold text-white">{s.title}</div>
                </div>
              </div>
              <p className="text-[13px] leading-snug text-pretty text-muted">{s.body}</p>
              {i < STEPS.length - 1 && <FlowArrow top={36} />}
            </li>
          ))}
        </ol>

        <AlertPlanner />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <Panel title="The site from above" subtitle="Schematic reference geometry from the simulation — not ENEC facility data" bodyClassName="flex flex-col justify-between gap-3">
            <div className="overflow-hidden rounded-xl border border-line">
              <PlanSchematic selected={p.anchorAngle} jets={p.activeFlow} />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-2">
              <span className="flex items-center gap-2">
                <span className="h-[3px] w-5 rounded bg-curtain" /> Guide curtain ({p.anchorAngle}°)
              </span>
              <span className="flex items-center gap-2">
                <span className="h-[2px] w-5 rounded bg-cyan" /> Conveyor jets
              </span>
              <span className="flex items-center gap-2">
                <span className="h-[2px] w-5 border-t-2 border-dashed border-cyan" /> Transfer line to release
              </span>
            </div>
          </Panel>

          <Panel title="Guide, don’t block" subtitle="Why an angled curtain carries so little load" bodyClassName="flex flex-col gap-3">
            <div className="card-inner flex flex-1 items-center px-2 py-2">
              <AngleDiagram angle={c.attackAngle} u={p.currentSpeed} un={c.normalVelocity} ut={ut} />
            </div>
            <p className="text-[13px] leading-relaxed text-pretty text-ink-2">
              At {c.attackAngle.toFixed(0)}°, only <span className="num whitespace-nowrap text-amber">{c.normalVelocity.toFixed(2)} m/s</span> pushes into the
              curtain while <span className="num whitespace-nowrap text-teal">{ut.toFixed(2)} m/s</span> carries the bloom along it
              {p.activeFlow ? (
                <>
                  {' '}
                  — plus <span className="num whitespace-nowrap text-cyan">{(p.jetLevel * J.conveyorSpeed).toFixed(2)} m/s</span> from the conveyor jets, even at
                  slack tide
                </>
              ) : null}
              . A net facing the flow takes the full <span className="whitespace-nowrap">{p.currentSpeed.toFixed(2)} m/s</span> and the bloom’s weight.
            </p>
          </Panel>
        </div>

        <Panel title="Safety story" subtitle="Three independent layers, and what happens when something fails" icon={<ShieldCheck size={18} />} bodyClassName="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {SAFETY.map((s, i) => (
              <div key={s.title} className="card-inner flex items-start gap-3 p-4">
                <IconTile size={36} tone={s.tone}>
                  {s.icon}
                </IconTile>
                <div className="min-w-0">
                  <div className="text-[14.5px] font-semibold text-white">
                    <span className="num mr-1.5 text-dim">{i + 1}.</span>
                    {s.title}
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-pretty text-muted">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
          <FailureModes />
        </Panel>

        <BuildAndRun skirt={c.skirtTarget} angle={p.anchorAngle} jetLevel={p.jetLevel} />

        <WildlifePanel skirt={c.skirtTarget} angle={p.anchorAngle} />

        <TechnicalDetails />
      </div>
    </div>
  );
}
