import { Radar } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ASSUMPTIONS } from '../../config/assumptions';
import { SITE } from '../../config/site';
import { forecastArrival } from '../../simulation/drift';
import { popUpDuration } from '../../simulation/curtain';
import { getCurtainLayout } from '../../simulation/geometry';
import { TIDE, tideCurrent, tideDate } from '../../simulation/tide';
import { cn } from '../../utils/format';
import { Panel } from '../ui/Panel';

const HORIZON = 96;
/** Arm both lines this long (h) before the first forecast arrival. */
const ARM_MARGIN = 2;

const clock = (d: Date) =>
  `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })}`;

function Slider({ id, label, value, min, max, step, format, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2 text-[12.5px] text-ink-2">
        {label}
        <span className="num text-[13px] text-white">{format(value)}</span>
      </span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-cyan" />
    </label>
  );
}

/**
 * Decision support from ENEC's early warning: where a bloom has been reported, when (and how much
 * of it) reaches the intake on the recorded current and wind, which guide line will be on duty
 * then, and when to arm. Uses the release study's drift model and coastline.
 */
export function AlertPlanner() {
  // Opens on a representative report: 3 km out and 3 km ENE on 31 Oct 2025, 12:00 UTC (about a third arrives, over four tide turns).
  const [offshore, setOffshore] = useState(3);
  const [along, setAlong] = useState(-3);
  const [size, setSize] = useState(1.5);
  const [hour, setHour] = useState(732);
  const xc = (SITE.intake.x0 + SITE.intake.x1) / 2;
  const f = useMemo(() => forecastArrival({ x: xc + along * 1000, z: offshore * 1000, radius: size * 1000 }, hour, HORIZON, 400), [offshore, along, size, hour, xc]);
  const share = f.arrivals.length / f.followed;
  const first = f.arrivals[0] ?? null;
  const median = f.arrivals.length ? f.arrivals[Math.floor(f.arrivals.length / 2)] : null;
  const last = f.arrivals.length ? f.arrivals[Math.floor(f.arrivals.length * 0.9)] : null;
  const reportAt = tideDate(hour);
  const at = (h: number) => clock(tideDate(hour + h));
  // Duty line by hour (the line laid for the current), and the turns within the arrival window.
  const duty = Array.from({ length: HORIZON }, (_, h) => (tideCurrent(hour + h + 0.5) >= 0 ? 0 : 1));
  const turns: number[] = [];
  for (let h = 1; h < HORIZON; h++) if (duty[h] !== duty[h - 1]) turns.push(h);
  const windowTurns = first === null ? [] : turns.filter((t) => t >= first && t <= (last ?? first));
  const maxBar = Math.max(...f.perHour, 0.001);
  const popUp = popUpDuration(getCurtainLayout(20)) / 60;
  const lineName = (s: number) => (s === 0 ? 'Line A' : 'Line B');
  const W = 960;
  const H = 120;
  const x = (h: number) => (h / HORIZON) * W;
  return (
    <Panel
      title="From the early warning: when does it arrive?"
      subtitle="A bloom reported by the offshore detection programme, drifted on the recorded current and wind against the real coast"
      icon={<Radar size={18} />}
      bodyClassName="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]"
    >
      <div className="flex flex-col gap-3.5">
        <Slider id="ap-offshore" label="Reported distance offshore" value={offshore} min={1} max={10} step={0.5} format={(v) => `${v} km`} onChange={setOffshore} />
        <Slider
          id="ap-along"
          label="Along the shore"
          value={along}
          min={-6}
          max={6}
          step={0.5}
          format={(v) => (v === 0 ? 'off the intake' : `${Math.abs(v)} km ${v < 0 ? 'ENE' : 'WSW'}`)}
          onChange={setAlong}
        />
        <Slider id="ap-size" label="Patch radius" value={size} min={0.5} max={3} step={0.25} format={(v) => `${v} km`} onChange={setSize} />
        <Slider id="ap-hour" label="Reported at (UTC)" value={hour} min={0} max={TIDE.u.length - 1 - HORIZON} step={1} format={(v) => clock(tideDate(v))} onChange={setHour} />
        <p className="text-[11.5px] leading-snug text-pretty text-muted">
          Hindcast on the recorded 2025 season. In operation the same model runs on the live Copernicus forecast for the next days.
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="grid grid-cols-3 gap-3">
          {[
            { k: 'Reaches the intake', v: `${Math.round(share * 100)}%`, tone: share > 0.05 ? 'text-amber' : 'text-teal' },
            { k: 'First arrival', v: first === null ? '—' : `${first.toFixed(0)} h`, tone: 'text-white' },
            { k: 'Most arrive by', v: last === null ? '—' : `${last.toFixed(0)} h`, tone: 'text-white' },
          ].map((m) => (
            <div key={m.k} className="card-inner px-3 py-2.5">
              <div className="text-[11.5px] text-muted">{m.k}</div>
              <div className={cn('num text-[22px] leading-tight font-semibold', m.tone)}>{m.v}</div>
            </div>
          ))}
        </div>

        <figure className="card-inner overflow-hidden px-3 pt-3 pb-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Forecast arrivals at the intake by hour, over the line on duty">
            {duty.map((s, h) => (
              <rect key={h} x={x(h)} y={H - 18} width={x(1) + 0.5} height={14} fill={s === 0 ? 'rgba(34,211,238,0.35)' : 'rgba(245,185,76,0.35)'} />
            ))}
            {f.perHour.map((v, h) =>
              v > 0 ? <rect key={`a${h}`} x={x(h) + 1} y={H - 22 - (v / maxBar) * (H - 34)} width={Math.max(1, x(1) - 2)} height={(v / maxBar) * (H - 34)} fill="#f87171" opacity={0.85} /> : null,
            )}
            {first !== null && <line x1={x(Math.max(0, first - ARM_MARGIN))} x2={x(Math.max(0, first - ARM_MARGIN))} y1={4} y2={H - 4} stroke="#2dd4bf" strokeWidth={2} strokeDasharray="5 4" />}
            {[0, 24, 48, 72, 96].map((h) => (
              <text key={h} x={Math.min(W - 4, x(h) + 2)} y={12} fill="#7f97a5" fontSize={12} textAnchor={h === 96 ? 'end' : 'start'}>
                +{h} h
              </text>
            ))}
          </svg>
          <figcaption className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] text-muted">
            <span>
              <span className="mr-1.5 inline-block h-2 w-3 rounded-sm bg-red/80 align-middle" />
              Arriving at the intake
            </span>
            <span>
              <span className="mr-1.5 inline-block h-2 w-3 rounded-sm bg-cyan/40 align-middle" />
              Line A on duty
            </span>
            <span>
              <span className="mr-1.5 inline-block h-2 w-3 rounded-sm bg-amber/40 align-middle" />
              Line B on duty
            </span>
            {first !== null && (
              <span>
                <span className="mr-1.5 inline-block h-0 w-3 border-t-2 border-dashed border-teal align-middle" />
                Arm both lines
              </span>
            )}
          </figcaption>
        </figure>

        <div className={cn('rounded-xl border px-4 py-3 text-[13.5px] leading-relaxed text-pretty', first === null ? 'border-teal/40 bg-teal/[0.06]' : 'border-cyan/40 bg-cyan/[0.06]')}>
          {first === null ? (
            <>
              <span className="font-semibold text-teal">No arrival forecast within {HORIZON} h.</span> Reported {clock(reportAt)} UTC:{' '}
              {Math.round((f.stranded / f.followed) * 100)}% of the patch reaches the shore elsewhere first. Keep SweepLine stowed and update with the next
              detection report.
            </>
          ) : (
            <>
              <span className="font-semibold text-white">Arm both lines by {at(Math.max(0, first - ARM_MARGIN))} UTC.</span> The first jellyfish are forecast
              at the intake {at(first)}, most by {at(last ?? first)}. {lineName(duty[Math.floor(first)])} pops up when they are close; it takes{' '}
              {popUp.toFixed(1)} min, so there is no need to deploy early.
              {windowTurns.length > 0
                ? ` The tide turns ${windowTurns.length === 1 ? 'once' : `${windowTurns.length} times`} in that window (${windowTurns.map((t) => at(t).split(' ').pop()).join(', ')}): the other line takes over each time.`
                : ''}
              {median !== null && ` Median arrival ${median.toFixed(0)} h after the report.`}
            </>
          )}
        </div>
        <p className="text-[11.5px] text-muted">
          {f.followed} animals followed for {HORIZON} h · windage {Math.round(ASSUMPTIONS.drift.windage * 100)}% · same drift model as the release study
          (Evidence). A first estimate to check against drifters and the detection programme’s own tracks.
        </p>
      </div>
    </Panel>
  );
}
