import { Banknote, Calculator, CircleHelp, Map as MapIcon, Workflow } from 'lucide-react';
import { useState } from 'react';
import { PlanSchematic } from '../components/charts/PlanSchematic';
import { FlowSplit, NetSection } from '../components/charts/SideSchematic';
import { ComparisonPanel } from '../components/panels/Comparison';
import { FailureModes } from '../components/panels/FailureModes';
import { FlowArrow, Panel } from '../components/ui/Panel';
import { ASSUMPTIONS } from '../config/assumptions';
import { CAPEX, CAPEX_EXCLUDED, capexAllIn, capexTotal, MANUAL_PER_YEAR, RUNNING, runningTotal, UNIT_DAY } from '../config/costs';
import { SITE } from '../config/site';
import { STUDY } from '../data/study.generated';
import { sizeLine, sizeNet } from '../simulation/sizing';
import { cn } from '../utils/format';

const DESIGN_FLOW = ASSUMPTIONS.plant.unitFlowM3s * ASSUMPTIONS.plant.units;
const LIMIT = ASSUMPTIONS.screenCriteria.approachMax;

function Slider({ label, value, min, max, step, unit, onChange, digits = 0 }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; digits?: number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between text-[12.5px] text-ink-2">
        {label}
        <span className="num font-semibold text-white">
          {value.toFixed(digits)} {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#2dd4bf]" aria-label={label} />
    </label>
  );
}

function Readout({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card-inner flex flex-col gap-0.5 px-3 py-2">
      <span className="text-[11.5px] text-muted">{label}</span>
      <span className={cn('num text-[18px] leading-tight font-semibold text-white', tone)}>{value}</span>
    </div>
  );
}

/** Size a net for any channel: nothing here depends on the reference site. */
function SizingTool() {
  const [flow, setFlow] = useState(2);
  const [width, setWidth] = useState<number>(SITE.channel.halfWidth * 2);
  const [depth, setDepth] = useState<number>(SITE.channel.depth);
  const [angle, setAngle] = useState<number>(SITE.net.angle);
  const s = sizeNet((flow * 1e6) / 3600, width, depth, angle);
  return (
    <Panel title="Size it for a real channel" subtitle="Change the channel and see what net it needs. The sums are the ones the simulation uses" icon={<Calculator size={18} />}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,300px)]">
        <div className="flex flex-col gap-3">
          <Slider label="Plant flow" value={flow} min={1} max={3} step={0.1} unit="million m³/h" digits={1} onChange={setFlow} />
          <Slider label="Channel width" value={width} min={100} max={500} step={10} unit="m" onChange={setWidth} />
          <Slider label="Channel depth" value={depth} min={6} max={18} step={1} unit="m" onChange={setDepth} />
          <Slider label="Net angle" value={angle} min={10} max={45} step={1} unit="°" onChange={setAngle} />
        </div>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
            <Readout label="Down the channel" value={`${s.channelSpeed.toFixed(2)} m/s`} />
            <Readout label="Through the mesh" value={`${s.through.toFixed(3)} m/s`} tone={s.through <= LIMIT ? 'text-teal' : 'text-red'} />
            <Readout label="Along the net" value={`${s.sweep.toFixed(2)} m/s`} />
            <Readout label="Net length" value={`${s.netLength.toFixed(0)} m`} />
            <Readout label="Panels, each net" value={`${Math.ceil(s.netLength / SITE.net.panelLength)}`} />
            <Readout label="Ride to the collector" value={`${s.rideMin.toFixed(0)} min`} />
          </div>
          <p className={cn('rounded-lg border px-3 py-2 text-[13px] text-pretty', s.ok ? 'border-teal/40 bg-teal/[0.06] text-ink' : 'border-red/40 bg-red/[0.06] text-ink')}>
            {s.ok ? (
              <>
                Inside the {LIMIT} m/s limit used for fish screens.
              </>
            ) : (
              <>
                Over the {LIMIT} m/s limit. This channel needs an angle of {s.maxAngle.toFixed(0)}° or less.
              </>
            )}{' '}
            In any channel this deep, the net must be at least <span className="num font-semibold text-white">{s.minNetLength.toFixed(0)} m</span> long. Width only sets the angle.
          </p>
        </div>
        <FlowSplit angle={angle} channel={s.channelSpeed} through={s.through} sweep={s.sweep} />
      </div>
    </Panel>
  );
}

const LINE = sizeLine();
const net = sizeNet(DESIGN_FLOW, SITE.channel.halfWidth * 2, SITE.channel.depth, SITE.net.angle);
const liftKW = Math.round(LINE.kW / 10) * 10;

const STEPS = [
  { title: 'Warning', value: '30 min', text: 'Offshore detection gives hours. In the model, sonar at the mouth sees a bloom at least 30 minutes before it reaches the net, day or night, and arms the lifts.' },
  { title: 'Net', value: `${net.through.toFixed(2)} m/s`, text: `Water passes through ${ASSUMPTIONS.net.meshBar * 1000} mm mesh. Jellyfish are held back, and the flow sweeps them along the face.` },
  { title: 'Pocket', value: `${Math.round(net.rideMin)} min ride`, text: 'They arrive at a funnel where each net meets the wall. A second net 60 m behind takes what gets past.' },
  { title: 'Screw lift', value: `≈ ${liftKW} kW`, text: `At each net's end an inclined screw lifts them ${LINE.lift.toFixed(1)} m in pockets of water to a head tank. It turns only while a sensor sees jellyfish in its funnel. Duty and standby.` },
  { title: 'Release', value: `${LINE.transitMin.toFixed(0)} min`, text: `A ${ASSUMPTIONS.transfer.pipeBore} m line over the breakwater and ${ASSUMPTIONS.transfer.length / 1000} km along the bed, with no air, to the sea down-drift.` },
];

const QUESTIONS: Array<{ q: string; a: string }> = [
  {
    q: 'Can it take a peak day?',
    a: `The line carries ${LINE.capacityTph.toFixed(0)} t/h, over ${Math.round((LINE.capacityTph * 24) / 100) * 100} tonnes a day, at ${ASSUMPTIONS.transfer.maxJellyFraction * 100} % jellyfish by volume. The model runs ${STUDY.bloomTph} t/h, or 600 t a day, and the head stays below 2 mm on clean panels.`,
  },
  {
    q: 'Where exactly does it go?',
    a: 'Across the intake channel, ahead of every unit. The layout here is a reference. The real line needs the plant’s channel survey, and the sizing tool above takes any channel.',
  },
  {
    q: 'What does it do to the animals?',
    a: 'The screw has no impeller and no gap: its flights are welded inside a tube that turns. Each animal rides up in a pocket of water, spills into a launder, and the line runs full with no air. Screws like this pass live fish. Survival of jellyfish is not yet measured, which is why it is an early test.',
  },
  {
    q: 'What about fish and turtles?',
    a: 'The mesh runs at fish-screen speed, so a swimming animal can turn away, and taut mesh is not a gill net. A camera at each hopper mouth lets the operator stop a lift if a turtle comes into the funnel, which is open water it can swim back out of. That is a design argument, not a test: bycatch is watched in the panel test at sea.',
  },
  {
    q: 'Haven’t nets failed at other plants?',
    a: 'Yes. A net set square to the flow takes the whole load and can tear. Ours stands at 20°, so the flow carries the bloom off it, and with the lifts down and three times the bloom the head stays near 16 mm. A second net stands behind it, and the float line dips before the load gets high.',
  },
  {
    q: 'Won’t the piles grow more jellyfish?',
    a: 'They could: hard surfaces give jellyfish polyps somewhere to settle. So panels come out off-season, piles are inspected and cleaned in the diver round, and a settlement check is part of the panel test at sea.',
  },
  {
    q: 'Who approves it, and who runs it?',
    a: 'It needs a nuclear safety review of any change at the intake (FANR), a permit for the marine works and for live release (EAD), and the plant’s own modification process. Once built, the control room watches load cells and sonar, and a small maintenance crew swaps panels.',
  },
  {
    q: 'Does it leave debris?',
    a: 'Anything that fragments is carried down the line with the rest. Mesh sheds nothing. If a bell does break up at the net, the second net and the plant’s own screens are still behind it.',
  },
  {
    q: 'What does it run on?',
    a: `The nets need no power. The lifts draw about ${liftKW} kW while collecting, from a shore feed on the plant’s non-safety supply. If that is lost, the net goes on holding the bloom.`,
  },
  {
    q: 'Is it permanent?',
    a: 'The piles are. The panels are not: they slide down pile guides in season and come out afterwards, so nothing but steel stays in the water for the rest of the year.',
  },
  {
    q: 'How do you keep it clean?',
    a: `A clean panel goes in every ${ASSUMPTIONS.net.swapWeeks} weeks, by workboat and crane, one at a time, and the fouled one is washed ashore. The net never comes out of service. Load cells show when a panel is due. The fouling rate is an assumption until a panel test at the site.`,
  },
  {
    q: 'What changes at the plant?',
    a: 'Nothing. The screens, pumps and intake stay as they are. The head across a clean net is under 2 mm, and at 0.12 m the float line dips, so cooling flow always comes first.',
  },
];

function Costs() {
  const c = capexTotal();
  const r = runningTotal();
  return (
    <Panel title="What it costs" subtitle="Order of magnitude, US$ 2025. Not quotes. Marked items are our own build-up, to be replaced by a contractor’s number" icon={<Banknote size={18} />}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-[13.5px] font-semibold text-white">To build</h3>
            <span className="num text-[16px] font-semibold text-white">
              ${c.low.toFixed(1)}–{c.high.toFixed(1)}M
            </span>
          </div>
          <ul className="divide-y divide-line text-[12.5px]">
            {CAPEX.map((i) => (
              <li key={i.item} className="flex items-baseline justify-between gap-3 py-1.5" title={i.basis}>
                <span className="text-ink-2">
                  {i.item}
                  {i.estimate && <span className="ml-1.5 text-[11px] text-amber">estimate</span>}
                </span>
                <span className="num shrink-0 text-white">
                  {i.low.toFixed(2)}–{i.high.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11.5px] text-muted">
            {CAPEX_EXCLUDED} All in, about US${capexAllIn().low.toFixed(0)}–{capexAllIn().high.toFixed(0)}M.
          </p>
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-[13.5px] font-semibold text-white">To run, a year</h3>
            <span className="num text-[16px] font-semibold text-white">
              ${(r.low / 1000).toFixed(1)}–{(r.high / 1000).toFixed(1)}M
            </span>
          </div>
          <ul className="divide-y divide-line text-[12.5px]">
            {RUNNING.map((i) => (
              <li key={i.item} className="flex items-baseline justify-between gap-3 py-1.5" title={i.basis}>
                <span className="text-ink-2">{i.item}</span>
                <span className="num shrink-0 text-white">
                  {i.low}–{i.high}k
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] leading-snug text-pretty text-ink">
            That is the same order as boats and crews, about ${MANUAL_PER_YEAR.value}M a year at one European plant. It is not cheaper to run. It pays through the output it protects: one lost unit-day is worth about ${UNIT_DAY.low.toFixed(1)}–{UNIT_DAY.high.toFixed(1)}M.
          </p>
        </div>
      </div>
    </Panel>
  );
}

/** 02 — How It Works: where it sits, what happens to a jellyfish, the sums, and the hard questions. */
export function HowItWorks() {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-6 py-6">
        <header className="max-w-[900px]">
          <div className="page-eyebrow">How it works</div>
          <h1 className="mt-1.5 text-[clamp(28px,2.4vw,38px)] leading-[1.1] font-bold tracking-tight text-balance text-white">One way in for the water. One way out for the jellyfish.</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-pretty text-ink-2">
            Everything the plant pumps comes down one channel between two breakwaters, then along a basin to the intakes, so inside it the water always runs the same way. Two nets stand across that channel, ahead of every intake. The plant’s own flow does the sweeping.
          </p>
        </header>

        <Panel title="Where it sits" subtitle="To scale, from the same geometry the simulation uses. A reference layout, not a survey of any real plant" icon={<MapIcon size={18} />}>
          <div className="overflow-hidden rounded-xl border border-line">
            <PlanSchematic />
          </div>
        </Panel>

        <Panel title="What happens to a jellyfish" subtitle={`At ${(DESIGN_FLOW * 0.0036).toFixed(1)} million m³/h through a channel ${SITE.channel.halfWidth * 2} × ${SITE.channel.depth} m`} icon={<Workflow size={18} />}>
          <ol className="grid gap-3 md:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card-inner relative flex flex-col gap-1 px-3.5 py-3">
                <span className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">{s.title}</span>
                <span className="num text-[22px] leading-tight font-semibold text-white">{s.value}</span>
                <p className="text-[12.5px] leading-snug text-pretty text-ink-2">{s.text}</p>
                {i < STEPS.length - 1 && <FlowArrow top={34} />}
              </li>
            ))}
          </ol>
        </Panel>

        <SizingTool />

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <Panel title="The net" subtitle="A coarse fence, not a filter">
            <NetSection depth={SITE.channel.depth} />
          </Panel>
          <Panel title="The questions we get" subtitle="Short answers. Each one is shown in the twin or sized on this page" icon={<CircleHelp size={18} />}>
            <dl className="grid gap-x-5 gap-y-3 md:grid-cols-2">
              {QUESTIONS.map((x) => (
                <div key={x.q}>
                  <dt className="text-[13.5px] font-semibold text-white">{x.q}</dt>
                  <dd className="mt-0.5 text-[12.5px] leading-snug text-pretty text-ink-2">{x.a}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>

        <FailureModes />

        <ComparisonPanel />

        <Costs />
      </div>
    </div>
  );
}
