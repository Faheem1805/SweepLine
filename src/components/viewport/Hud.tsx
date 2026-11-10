import { ArrowUp, ChevronDown, Crosshair, Eye, EyeOff, Maximize2, Minimize2, RotateCcw, SlidersHorizontal, Split, Workflow } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { getScene } from '../../app/runtime';
import { useApp } from '../../app/store';
import { compassLabel } from '../../config/site';
import { CAMERA_PRESETS, type CameraPreset } from '../../three/cameras/CameraRig';
import { cn } from '../../utils/format';
import { useOutsideClose } from '../layout/TopBar';

/** Current direction & speed card with a compass that follows the camera heading. */
export function CurrentCard() {
  const p = useApp((s) => s.snap?.params);
  const heading = useApp((s) => s.ui.cameraHeading);
  if (!p) return null;
  const rel = p.currentBearing - heading;
  return (
    <div data-hud className="glass pointer-events-auto flex items-center gap-2.5 !rounded-xl py-1.5 pr-3.5 pl-1.5" title="Current speed and direction (simulation input)">
      <div className="relative h-8 w-8 shrink-0 rounded-full border border-cyan/30 bg-base/60">
        <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `rotate(${rel}deg)` }}>
          <ArrowUp size={15} className="text-cyan" strokeWidth={2.4} />
        </div>
        <div className="absolute inset-0" style={{ transform: `rotate(${-heading}deg)` }}>
          <span className="absolute top-[-3px] left-1/2 -translate-x-1/2 text-[8px] font-bold text-red">N</span>
        </div>
      </div>
      <div className="leading-none">
        <div className="text-[10.5px] text-muted">Current</div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="num text-[16px] font-medium text-white">{p.currentSpeed.toFixed(2)}</span>
          <span className="text-[11px] text-ink-2">m/s</span>
          <span className="num ml-1.5 text-[12px] text-ink">
            {compassLabel(p.currentBearing)} {p.currentBearing.toFixed(0)}°
          </span>
        </div>
      </div>
    </div>
  );
}

/** Along-shore current trace (m/s) from −6 h to +6 h: toward WSW above the line, toward ENE below, now in the middle. */
function TideTrace({ trace }: { trace: number[] }) {
  const W = 220;
  const H = 34;
  const max = 0.22;
  const n = trace.length - 1;
  const x = (i: number) => (i / n) * W;
  const y = (u: number) => H / 2 - (Math.max(-max, Math.min(max, u)) / max) * (H / 2 - 2);
  const line = trace.map((u, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(u).toFixed(1)}`).join('');
  const area = `${line}L${W},${H / 2}L0,${H / 2}Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-[34px] w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <clipPath id="tide-above">
          <rect x="0" y="0" width={W} height={H / 2} />
        </clipPath>
        <clipPath id="tide-below">
          <rect x="0" y={H / 2} width={W} height={H / 2} />
        </clipPath>
      </defs>
      <path d={area} fill="rgba(34,211,238,0.22)" clipPath="url(#tide-above)" />
      <path d={area} fill="rgba(245,185,76,0.22)" clipPath="url(#tide-below)" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgba(150,200,220,0.35)" strokeWidth="1" strokeDasharray="2 3" />
      <path d={line} fill="none" stroke="#bfefff" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      <line x1={W / 2} x2={W / 2} y1="0" y2={H} stroke="#ffffff" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The recorded tide outside against the steady flow inside the channel. Shown only for tide runs. */
export function TideCard() {
  const s = useApp((st) => st.snap);
  if (!s || !s.tide.on) return null;
  const t = s.tide;
  const toward = compassLabel(s.params.currentBearing);
  const when = new Date(t.date);
  const date = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const time = when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  const turn = t.turnIn === null ? null : t.turnIn < 1 ? `${Math.max(1, Math.round(t.turnIn * 60))} min` : `${Math.floor(t.turnIn)} h ${String(Math.round((t.turnIn % 1) * 60)).padStart(2, '0')} min`;
  return (
    <div data-hud className="glass pointer-events-auto w-[300px] max-w-full animate-fade-in !rounded-xl px-3.5 py-2.5" title="Copernicus SMOC surface current at the site, along the shore: fitted tide plus its slow residual (simulation input)">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold tracking-[0.12em] text-cyan uppercase">Recorded tide</span>
        <span className="num text-[10.5px] text-muted">
          {date} · {time} UTC
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="num text-[18px] leading-none font-semibold text-white">{Math.abs(t.u).toFixed(2)}</span>
        <span className="text-[11px] text-ink-2">m/s toward {toward}</span>
        <span className="ml-auto text-[11px] text-muted">{turn ? `turns in ${turn}` : ''}</span>
      </div>
      <div className="relative mt-1.5">
        <TideTrace trace={t.trace} />
        <span className="absolute top-0 left-0.5 text-[9px] text-cyan/80">WSW</span>
        <span className="absolute bottom-0 left-0.5 text-[9px] text-amber/80">ENE</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[9.5px] text-dim">
        <span>−6 h</span>
        <span>now</span>
        <span>+6 h</span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between border-t border-line pt-1.5 text-[11.5px]">
        <span className="text-ink-2">Inside the channel</span>
        <span className="num font-semibold text-cyan">{s.channel.speed.toFixed(2)} m/s, one way</span>
      </div>
    </div>
  );
}

const MAIN_PRESETS: Array<{ key: CameraPreset; label: string }> = [
  { key: 'aerial', label: 'Overview' },
  { key: 'net', label: 'Net' },
  { key: 'underwater', label: 'Underwater' },
  { key: 'collector', label: 'Collector' },
  { key: 'lift', label: 'Lift' },
];

const MORE_PRESETS = CAMERA_PRESETS.filter((p) => !MAIN_PRESETS.some((m) => m.key === p.key));

function ToolIcon({ title, active, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg transition-colors duration-150',
        active ? 'bg-cyan/20 text-cyan shadow-[inset_0_0_0_1px_rgba(34,211,238,0.55)]' : 'text-ink-2 hover:bg-white/5 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

/** Camera preset switcher and viewport tools. */
export function ViewportToolbar() {
  const ui = useApp((s) => s.ui);
  const setUI = useApp((s) => s.setUI);
  const setCamera = useApp((s) => s.setCamera);
  const [fs, setFs] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useOutsideClose(moreOpen, () => setMoreOpen(false));
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  const presets = MAIN_PRESETS;
  const toggleFs = () => {
    const el = document.querySelector('[data-viewport]') as HTMLElement | null;
    if (!document.fullscreenElement && el) void el.requestFullscreen();
    else void document.exitFullscreen();
  };
  const moreActive = MORE_PRESETS.find((p) => p.key === ui.camera);
  const segBtn = (active: boolean) =>
    cn(
      'h-[30px] rounded-lg px-3 text-[13px] whitespace-nowrap transition-colors duration-150',
      active ? 'bg-[linear-gradient(180deg,#22c6e0,#129fb8)] font-semibold text-[#03121a] shadow-[0_0_12px_rgba(34,211,238,0.3)]' : 'text-ink-2 hover:text-white',
    );
  return (
    <div className="pointer-events-auto flex items-center gap-1.5">
      <div data-hud className="glass flex items-center gap-0.5 !rounded-xl p-[3px]">
        {presets.map((p) => (
          <button key={p.key} type="button" onClick={() => setCamera(p.key)} className={segBtn(ui.camera === p.key && !ui.compare)}>
            {p.label}
          </button>
        ))}
        <div className="relative" ref={moreRef}>
            <button type="button" onClick={() => setMoreOpen((o) => !o)} className={cn(segBtn(!!moreActive && !ui.compare), 'flex items-center gap-1 !px-3')}>
              {moreActive ? moreActive.label : 'More'} <ChevronDown size={13} />
            </button>
            {moreOpen && (
              <div className="glass absolute top-[38px] right-0 z-50 w-[170px] animate-fade-in p-1 shadow-2xl">
                {MORE_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      setCamera(p.key);
                      setMoreOpen(false);
                    }}
                    className={cn('flex w-full rounded-md px-3 py-2 text-left text-[13px] hover:bg-panel-3', ui.camera === p.key ? 'text-cyan' : 'text-ink-2')}
                  >
                    {p.label} camera
                  </button>
                ))}
              </div>
            )}
        </div>
      </div>
      <div data-hud className="glass flex items-center gap-0.5 !rounded-xl p-[3px]">
        <ToolIcon title={ui.flowView ? 'Engineering view on — back to the real view' : 'Engineering view: flow, net load, sonar and the water the plant draws in'} active={ui.flowView} onClick={() => setUI({ flowView: !ui.flowView })}>
          <SlidersHorizontal size={15} />
        </ToolIcon>
        <>
            <ToolIcon title={ui.compare ? 'Exit compare mode' : 'Compare without and with SweepLine (same bloom)'} active={ui.compare} onClick={() => setUI({ compare: !ui.compare })}>
              <Split size={15} />
            </ToolIcon>
            <ToolIcon title={ui.labels ? 'Hide labels' : 'Show labels'} active={!ui.labels} onClick={() => setUI({ labels: !ui.labels })}>
              {ui.labels ? <Eye size={15} /> : <EyeOff size={15} />}
            </ToolIcon>
            <ToolIcon title="Reset view" onClick={() => getScene().resetView()}>
              <RotateCcw size={15} />
            </ToolIcon>
        </>
        <ToolIcon title={fs ? 'Exit full screen' : 'Full screen'} onClick={toggleFs}>
          {fs ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </ToolIcon>
      </div>
    </div>
  );
}

/** Split-view headers and live metrics for compare mode (values from both simulations). */
export function CompareOverlay() {
  const snap = useApp((s) => s.snap);
  const compare = useApp((s) => s.ui.compare);
  if (!compare || !snap) return null;
  const b = snap.baseline;
  const s = snap.sweepline;
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-cyan/0 via-cyan/50 to-cyan/0" />
      <div data-hud className="absolute right-[calc(50%+12px)] bottom-3 left-3 grid grid-cols-2 gap-2">
        <CompareStat label="Without SweepLine, at the screens" value={`${b.screensT.toFixed(1)} t`} sub={`${b.screenTph.toFixed(1)} t/h`} tone="alarm" />
        <CompareStat label="Screens" value={b.screenStatus === 'CLEAR' ? 'Clear' : b.screenStatus === 'LOADED' ? 'Loaded' : 'Past capacity'} sub={`${b.screenBacklogT.toFixed(1)} t backlog`} tone={b.screenStatus === 'CLEAR' ? 'ok' : 'warn'} />
      </div>
      <div data-hud className="absolute right-3 bottom-3 left-[calc(50%+12px)] grid grid-cols-2 gap-2">
        <CompareStat label="With SweepLine, at the screens" value={`${s.screensT.toFixed(1)} t`} sub={`${s.screenTph.toFixed(1)} t/h`} tone="ok" />
        <CompareStat label="Collected" value={`${s.collectedT.toFixed(1)} t`} sub={`${s.collectTph.toFixed(1)} t/h`} tone="info" />
      </div>
    </div>
  );
}

function CompareStat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'ok' | 'info' | 'warn' | 'alarm' | 'muted' }) {
  const color = tone === 'alarm' ? 'text-red' : tone === 'warn' ? 'text-amber' : tone === 'ok' ? 'text-teal' : tone === 'info' ? 'text-cyan' : 'text-ink';
  return (
    <div className="glass px-3 py-2">
      <div className="text-[10.5px] text-muted">{label}</div>
      <div className={cn('num text-[19px] leading-tight', color)}>{value}</div>
      <div className="num text-[10.5px] text-dim">{sub}</div>
    </div>
  );
}

/** Underwater HUD: depth readout. */
export function UnderwaterHud() {
  const underwater = useApp((s) => s.ui.underwater);
  const depth = useApp((s) => s.ui.cameraDepth);
  if (!underwater) return null;
  return (
    <>
      <div className="sl-vignette" />
      <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2">
        <div data-hud className="glass flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-cyan">
          <Crosshair size={12} /> UNDERWATER · {depth.toFixed(1)} m
        </div>
      </div>
    </>
  );
}

/** Legend for the engineering view. */
export function FlowLegend() {
  const flow = useApp((s) => s.ui.flowView);
  if (!flow) return null;
  const items: Array<[string, string]> = [
    ['#bfdbfe', 'Drifting in'],
    ['#26d9f2', 'On the net'],
    ['#ffb84a', 'In the pocket'],
    ['#4df29a', 'Released'],
    ['#ff5c4d', 'Past a net, or at the screens'],
  ];
  return (
    <div data-hud className="glass pointer-events-auto px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-cyan">
        <Workflow size={11} /> ENGINEERING VIEW
      </div>
      <div className="flex flex-col gap-0.5">
        {items.map(([c, l]) => (
          <div key={l} className="flex items-center gap-2 text-[11px] text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: c }} />
            {l}
          </div>
        ))}
        <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-2">
          <span className="h-[2px] w-4 bg-gradient-to-r from-cyan/30 to-white" /> Flow
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-2">
          <span className="h-0 w-4 border-t-2 border-dashed border-red/80" /> Water the plant draws in
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-2">
          <span className="h-2 w-4 rounded-sm bg-gradient-to-r from-teal via-amber to-red" /> Net load
        </div>
      </div>
    </div>
  );
}

/** Footer note inside the viewport. */
export function ViewportFooter() {
  const compare = useApp((s) => s.ui.compare);
  if (compare) return null;
  return (
    <div
      data-hud
      className="pointer-events-auto absolute right-3 bottom-2.5 text-right text-[10.5px] text-ink-2/55"
      title="Reference coastal intake geometry is schematic and does not represent any real plant. Agent-based engineering simulation, not validated field performance. Agents are drawn enlarged at distance for legibility."
    >
      Schematic reference geometry · simulation estimate · agents enlarged for legibility
    </div>
  );
}

/** Pre-roll / initialisation overlay (the opening intro shows its own progress instead). */
export function LoadingOverlay() {
  const loading = useApp((s) => s.loading);
  const intro = useApp((s) => s.intro);
  if (!loading.active || intro) return null;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-base/70 backdrop-blur-sm">
      <div className="glass w-[380px] px-5 py-4">
        <div className="eyebrow">SweepLine digital twin</div>
        <div className="mt-1 text-[14px] text-ink">{loading.label || 'Initialising'}</div>
        <div className="mt-3 h-[4px] overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan to-teal transition-[width] duration-200" style={{ width: `${loading.progress * 100}%` }} />
        </div>
        <div className="mt-2 text-[11px] text-muted">The same bloom runs with and without SweepLine.</div>
      </div>
    </div>
  );
}
