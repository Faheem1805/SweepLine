import { Activity, ChevronDown, Play, RotateCcw, ScrollText, ShieldQuestion, SlidersHorizontal, Zap } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../app/store';
import { SPECIES, type SpeciesKey } from '../../config/assumptions';
import { CHALLENGES, type Challenge } from '../../config/challenges';
import { controller, FAILURE_LABELS, type Constraint } from '../../simulation/SimController';
import type { AssistMode, FailureKey } from '../../simulation/types';
import { cn, mmss } from '../../utils/format';
import { useOutsideClose } from '../layout/TopBar';
import { Segmented, Slider, Toggle } from '../ui/Controls';

const tones = {
  ok: 'text-teal',
  info: 'text-cyan',
  warn: 'text-amber',
  alarm: 'text-red',
} as const;

/** The result, big: tonnes at the screens with and without, on the same bloom. */
export function LiveHeadline() {
  const s = useApp((st) => st.snap);
  if (!s) return null;
  const w = s.sweepline;
  const b = s.baseline;
  const st = s.status;
  return (
    <div data-hud className="glass pointer-events-auto w-[372px] max-w-full !rounded-2xl px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className={cn('flex items-center gap-1.5 text-[12px] font-semibold', tones[st.tone])}>
          <span className={cn('h-2 w-2 rounded-full bg-current', st.tone === 'alarm' && 'animate-pulse-soft')} />
          {st.label}
        </span>
        <span className="num text-[11.5px] text-muted">
          T+{mmss(s.simTime)} · {Math.round(s.speed)}×
        </span>
      </div>
      <div className="mt-0.5 truncate text-[12.5px] text-ink-2">{st.detail}</div>
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
        <div>
          <div className="text-[11px] text-muted">At the screens, with SweepLine</div>
          <div className="num text-[33px] leading-none font-semibold text-teal">
            {w.screensT < 0.05 ? '0.0' : w.screensT.toFixed(1)}
            <span className="ml-1 text-[15px] text-ink-2">t</span>
          </div>
        </div>
        <div>
          <div className="text-[11px] text-muted">Same bloom, without</div>
          <div className="num text-[33px] leading-none font-semibold text-red">
            {b.screensT.toFixed(1)}
            <span className="ml-1 text-[15px] text-ink-2">t</span>
          </div>
        </div>
      </div>
      <div className="mt-2 text-[11.5px] text-muted">{s.scenarioName} · model estimate, not a field result</div>
    </div>
  );
}

function statusTone(c: Constraint): string {
  return c.status === 'out' ? 'text-red' : c.status === 'near' ? 'text-amber' : 'text-teal';
}

/** Live margins: what an operator watches. */
export function MarginsCard() {
  const c = useApp((st) => st.snap?.constraints);
  const [open, setOpen] = useState(false);
  if (!c) return null;
  const worst = c.find((x) => x.status === 'out') ?? c.find((x) => x.status === 'near');
  return (
    <div data-hud className="glass pointer-events-auto w-[372px] max-w-full !rounded-xl">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
          <Activity size={13} className="text-cyan" /> Live margins
        </span>
        <span className={cn('flex items-center gap-1 text-[11.5px]', worst ? statusTone(worst) : 'text-teal')}>
          {worst ? `${worst.label} ${worst.value}` : 'All within limits'}
          <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open && (
        <div className="border-t border-line px-3.5 py-2">
          {c.map((x) => (
            <div key={x.key} className="flex items-baseline justify-between gap-3 py-0.5 text-[12px]">
              <span className="text-ink-2">{x.label}</span>
              <span className="flex items-baseline gap-2">
                <span className={cn('num font-medium', statusTone(x))}>{x.value}</span>
                <span className="num text-[10.5px] text-dim">{x.limit}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One live line of proof for the problem being shown. */
function useProof(id: string | null): string | null {
  const s = useApp((st) => st.snap);
  if (!s || !id) return null;
  const a = s.nets[0];
  const w = s.sweepline;
  const b = s.baseline;
  switch (id) {
    case 'tide':
      return s.tide.on ? `Outside ${Math.abs(s.tide.u).toFixed(2)} m/s, inside a steady ${s.channel.speed.toFixed(2)} m/s` : `Inside the channel: a steady ${s.channel.speed.toFixed(2)} m/s`;
    case 'under':
      return `${w.leakedT[0].toFixed(2)} t past net A, ${w.leakedT[1].toFixed(2)} t past net B`;
    case 'waves':
      return `Hs ${s.params.waveHeight.toFixed(1)} m offshore, ${s.channel.waveAtNet.toFixed(2)} m at the net`;
    case 'boats':
      return `Collecting ${w.collectTph.toFixed(1)} t/h of ${s.transfer.capacityTph.toFixed(0)} t/h capacity`;
    case 'release':
      return `${w.collectedT.toFixed(1)} t collected, ${w.releasedT.toFixed(1)} t released`;
    case 'plant':
      return `Screens carrying ${w.screenTph.toFixed(1)} t/h, against ${b.screenTph.toFixed(1)} t/h without`;
    case 'fail':
      return `${w.leakedT[0].toFixed(1)} t through the hole, ${w.leakedT[1].toFixed(2)} t past net B`;
    case 'dam':
      return `Head ${(a.head * 1000).toFixed(0)} mm, relief at 120 mm · ${a.onNetT.toFixed(1)} t on the net`;
    case 'pump':
      return `${w.onNetT[0].toFixed(1)} t held on the net · ${w.screensT.toFixed(1)} t at the screens`;
    case 'stall': {
      const f = s.funnels[0];
      if (!f) return null;
      const m2t = f.mouthToThroatS;
      return `Assist ${f.assist.mode === 'off' ? 'off' : Math.round(f.assist.speed * 100) + ' %'} · sweep ${f.assist.sweep === null ? '–' : f.assist.sweep.toFixed(2) + ' m/s'} · mouth to throat ${m2t === null ? '–' : Math.round(m2t) + ' s'} · ${f.assist.energyKWh.toFixed(1)} kWh`;
    }
    case 'fouling':
      return `Panels ${s.params.foulingWeeks} weeks old · head ${(a.head * 1000).toFixed(1)} mm · margin ${a.marginT.toFixed(0)} t`;
    case 'dark':
      return `Sonar ${s.sonar.inRangeT.toFixed(1)} t in range · ${a.onNetT.toFixed(1)} t on the net`;
    case 'species':
      return `${s.bloom.species}: ${w.leakedT[0].toFixed(2)} t past net A, ${w.leakedT[1].toFixed(2)} t past net B`;
    default:
      return null;
  }
}

/**
 * The problems this design was built around, each with a button that runs it. This is the page's
 * main thing: a judge picks the question, and the twin answers it live.
 */
export function ProblemRail() {
  const active = useApp((st) => st.activeChallenge);
  const setActive = useApp((st) => st.setActiveChallenge);
  const setUI = useApp((st) => st.setUI);
  const setCamera = useApp((st) => st.setCamera);
  const proof = useProof(active);

  const run = (c: Challenge) => {
    setActive(c.id);
    setUI({ flowView: !!c.engineering, compare: !!c.compare, selection: null, displayed: 'sweepline' });
    setCamera(c.camera);
    void controller.runScenario(c.scenario);
  };

  return (
    <div data-hud className="glass pointer-events-auto flex max-h-full w-[346px] flex-col !rounded-2xl">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-[14.5px] font-semibold text-white">
          <ShieldQuestion size={17} className="text-amber" /> Problems we designed for
        </div>
        <div className="mt-0.5 text-[12px] leading-snug text-muted">Where other approaches get caught out. Pick one and watch it run.</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {CHALLENGES.map((c) => {
          const on = c.id === active;
          return (
            <div key={c.id} className={cn('rounded-xl transition-colors', on ? 'bg-amber/[0.08] shadow-[inset_0_0_0_1px_rgba(245,185,76,0.4)]' : 'hover:bg-white/[0.04]')}>
              <button type="button" onClick={() => run(c)} className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left">
                <span className={cn('flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full', on ? 'bg-amber text-[#07141f]' : 'bg-white/[0.07] text-ink-2')}>
                  <Play size={12} className="ml-[1px]" fill="currentColor" />
                </span>
                <span className={cn('text-[13.5px] font-semibold', on ? 'text-white' : 'text-ink')}>{c.problem}</span>
              </button>
              {on && (
                <div className="animate-fade-in px-3 pb-3">
                  <div className="text-[12.5px] leading-snug text-pretty text-ink-2">
                    <span className="font-semibold text-red">The trap: </span>
                    {c.trap}
                  </div>
                  <div className="mt-1.5 text-[12.5px] leading-snug text-pretty text-ink">
                    <span className="font-semibold text-teal">What we did: </span>
                    {c.answer}
                  </div>
                  {proof && <div className="num mt-2 rounded-lg bg-base/60 px-2.5 py-1.5 text-[11.5px] text-cyan">{proof}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** From the sea to the release point, in tonnes, plus the stages reached. */
export function PipelineStrip() {
  const s = useApp((st) => st.snap);
  if (!s) return null;
  const w = s.sweepline;
  const stages = s.timeline;
  const cur = stages.findIndex((x) => x.key === s.stage);
  const cells: Array<{ label: string; value: string; tone: string }> = [
    { label: 'Sonar, in range', value: s.sonar.on ? `${s.sonar.inRangeT.toFixed(1)} t` : 'offline', tone: s.sonar.on ? 'text-white' : 'text-amber' },
    { label: 'On the nets', value: `${(w.onNetT[0] + w.onNetT[1]).toFixed(1)} t`, tone: 'text-amber' },
    { label: 'In the funnels', value: `${w.funnelT.toFixed(1)} t`, tone: 'text-[#8fa5ff]' },
    { label: 'Collected', value: `${w.collectedT.toFixed(1)} t`, tone: 'text-teal' },
    { label: 'In the line', value: `${w.inPipeT.toFixed(1)} t`, tone: 'text-white' },
    { label: 'Released', value: `${w.releasedT.toFixed(1)} t`, tone: 'text-teal' },
  ];
  return (
    <div data-hud className="glass pointer-events-auto !rounded-2xl px-4 py-2.5">
      <div className="flex items-center gap-1">
        {stages.map((st, i) => (
          <div key={st.key} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', st.at !== null ? (i === cur ? 'bg-amber shadow-[0_0_8px_rgba(245,185,76,0.8)]' : 'bg-teal') : 'bg-dim')} />
            <span className={cn('truncate text-[11.5px]', i === cur ? 'font-semibold text-white' : st.at !== null ? 'text-ink-2' : 'text-dim')}>{st.label}</span>
            {i < stages.length - 1 && <span className={cn('h-px min-w-3 flex-1', st.at !== null && stages[i + 1].at !== null ? 'bg-teal/60' : 'bg-line-strong')} />}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-6 gap-3 border-t border-line pt-2">
        {cells.map((c) => (
          <div key={c.label} className="min-w-0">
            <div className="truncate text-[11px] text-muted">{c.label}</div>
            <div className={cn('num text-[19px] leading-tight font-semibold', c.tone)}>{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const FAILURES: FailureKey[] = ['pumpPrimary', 'pumpStandby', 'panelTear', 'debris', 'unitTrip', 'storm', 'surge', 'sonarLoss'];

/** "What if?": change one condition or break one part while it runs. */
export function WhatIfMenu() {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const s = useApp((st) => st.snap);
  if (!s) return null;
  const p = s.params;
  const anyFailure = Object.values(s.failures).some(Boolean);
  return (
    <div className="pointer-events-auto relative" ref={ref}>
      <button data-hud type="button" onClick={() => setOpen((o) => !o)} className={cn('glass flex h-[38px] items-center gap-2 !rounded-xl px-3 text-[13px] font-semibold', anyFailure ? 'text-amber' : 'text-white')}>
        <Zap size={15} className="text-amber" /> What if?
      </button>
      {open && (
        <div className="glass absolute right-0 bottom-[46px] z-50 max-h-[62vh] w-[330px] animate-fade-in overflow-y-auto !rounded-2xl p-3.5 shadow-2xl">
          <div className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">Break a part</div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {FAILURES.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => (s.failures[k] ? controller.clearFailure(k) : controller.injectFailure(k))}
                className={cn('rounded-lg border px-2 py-1.5 text-left text-[12px] leading-tight transition-colors', s.failures[k] ? 'border-amber/60 bg-amber/10 text-amber' : 'border-line-strong text-ink-2 hover:border-cyan/40 hover:text-white')}
              >
                {FAILURE_LABELS[k]}
              </button>
            ))}
          </div>
          <div className="mt-3.5 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">Change a condition</div>
          <div className="mt-2 flex flex-col gap-2.5">
            <Segmented<SpeciesKey>
              size="sm"
              value={p.species}
              onChange={(v) => controller.setParams({ species: v, bloomMeanDepth: SPECIES[v].meanDepth, bloomDepthSD: SPECIES[v].depthSD })}
              options={(Object.keys(SPECIES) as SpeciesKey[]).map((k) => ({ value: k, label: SPECIES[k].name.split(' ')[0] }))}
            />
            <Slider label="Bloom" value={p.bloomRate} min={5} max={60} step={1} display={`${p.bloomRate} t/h`} onChange={(v) => controller.setParams({ bloomRate: v })} />
            <Slider label="Units running" value={p.unitsRunning} min={1} max={4} step={1} display={`${p.unitsRunning} of 4`} onChange={(v) => controller.setParams({ unitsRunning: v })} />
            <Slider label="Panel age" value={p.foulingWeeks} min={0} max={12} step={1} display={`${p.foulingWeeks} weeks`} onChange={(v) => controller.setParams({ foulingWeeks: v })} />
            <Toggle checked={p.secondNet} onChange={(v) => controller.setParams({ secondNet: v })} label="Second net" />
            <div className="flex items-center justify-between gap-2 text-[12.5px] text-ink-2">
              <span>
                Sweep assist <span className="text-[11px] text-amber">experimental</span>
              </span>
              <Segmented<AssistMode>
                size="sm"
                className="w-[180px]"
                value={p.assistMode}
                onChange={(v) => controller.setParams({ assistMode: v })}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'auto', label: 'Auto' },
                  { value: 'manual', label: 'Test' },
                ]}
              />
            </div>
            <Toggle checked={p.night} onChange={(v) => controller.setParams({ night: v })} label="Night, turbid water" />
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn !h-[32px] flex-1 !text-[12.5px]" onClick={() => controller.clearAllFailures()}>
              <SlidersHorizontal size={13} /> Clear faults
            </button>
            <button type="button" className="btn !h-[32px] flex-1 !text-[12.5px]" onClick={() => void controller.replay()}>
              <RotateCcw size={13} /> Replay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Everything that has happened in this run. */
export function EventLogMenu() {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const events = useApp((st) => st.snap?.events ?? []);
  const last = events[events.length - 1];
  const color: Record<string, string> = { info: 'text-ink-2', ok: 'text-teal', warn: 'text-amber', alarm: 'text-red' };
  return (
    <div className="pointer-events-auto relative min-w-0" ref={ref}>
      <button data-hud type="button" onClick={() => setOpen((o) => !o)} className="glass flex h-[38px] max-w-[420px] min-w-0 items-center gap-2 !rounded-xl px-3 text-[12.5px]">
        <ScrollText size={14} className="shrink-0 text-cyan" />
        <span className={cn('truncate', last ? color[last.level] : 'text-muted')}>{last ? last.message : 'Event log'}</span>
      </button>
      {open && (
        <div className="glass absolute right-0 bottom-[46px] z-50 max-h-[50vh] w-[430px] animate-fade-in overflow-y-auto !rounded-2xl p-3 shadow-2xl">
          {[...events].reverse().map((e) => (
            <div key={e.id} className="flex gap-2.5 py-0.5 text-[12px]">
              <span className="num shrink-0 text-dim">{mmss(e.t)}</span>
              <span className={color[e.level]}>{e.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
