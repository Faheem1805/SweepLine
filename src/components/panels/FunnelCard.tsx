import { ChevronDown, Wind } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../app/store';
import { ASSUMPTIONS, SPECIES } from '../../config/assumptions';
import { SITE } from '../../config/site';
import { ASSIST_STUDY } from '../../data/assist.generated';
import { assistFlowM3s, assistPowerKW } from '../../simulation/assist';
import { controller } from '../../simulation/SimController';
import type { AssistMode } from '../../simulation/types';
import { cn } from '../../utils/format';
import { Segmented } from '../ui/Controls';

const A = ASSUMPTIONS.assist;

/** Whether the funnel card belongs on screen: the collector close-up, the funnel scenario, or the assist in use. */
export function useFunnelCardShown(): boolean {
  return useApp((s) => s.ui.camera === 'collector' || s.activeChallenge === 'stall' || s.snap?.scenarioId === 'funnel' || (s.snap?.params.assistMode ?? 'off') !== 'off');
}

function Cell({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10.5px] text-muted">{k}</div>
      <div className={cn('num text-[15px] leading-tight font-semibold', tone ?? 'text-white')}>{v}</div>
      {sub && <div className="truncate text-[10px] text-dim">{sub}</div>}
    </div>
  );
}

const fmtS = (s: number | null) => (s === null ? '–' : s >= 100 ? `${Math.round(s)} s` : `${s.toFixed(0)} s`);

/**
 * Net A's funnel: what is in it and in the pocket (kept apart from collected, in the line and
 * released), and the experimental sweep assist with its mode, the reason it is on, off or held off,
 * its interlocks, and the same-seed Off-against-Auto result from the study.
 */
export function FunnelCard() {
  const s = useApp((st) => st.snap);
  const [open, setOpen] = useState(true);
  if (!s || !s.funnels.length) return null;
  const f = s.funnels[0];
  const a = f.assist;
  const w = s.sweepline;
  const mode = s.params.assistMode;
  const sp = SPECIES[s.params.species];
  const gap = SITE.collector.rackGap * 100;
  const blocks = SITE.collector.rackGap < sp.bellMin;
  const locks: Array<{ key: string; label: string; on: boolean }> = [
    { key: 'pocket', label: 'Pocket full', on: f.pocketT >= f.pocketCapT * 0.999 },
    { key: 'lift', label: 'Lift down', on: s.transfer.path === 'NONE' },
    { key: 'head', label: `Head ≥ ${A.headLimit * 1000} mm`, on: s.nets[0].head >= A.headLimit },
    { key: 'relief', label: 'Relief open', on: s.nets[0].relief > 0 },
  ];
  const running = a.speed > 0.01;
  const held = mode !== 'off' && a.interlock !== null;
  const st = ASSIST_STUDY;
  const rows: Array<[string, string, string]> = [
    ['Mouth to throat, weak sweep', fmtS(st.off.transitMean), fmtS(st.auto.transitMean)],
    ['Stalled + snagged', `${Math.round((st.off.stalledKg ?? 0) + (st.off.snaggedKg ?? 0))} kg`, `${Math.round((st.auto.stalledKg ?? 0) + (st.auto.snaggedKg ?? 0))} kg`],
    ['Collected', `${(st.off.collectedT ?? 0).toFixed(1)} t`, `${(st.auto.collectedT ?? 0).toFixed(1)} t`],
    ['At the screens', `${(st.off.screensT ?? 0).toFixed(2)} t`, `${(st.auto.screensT ?? 0).toFixed(2)} t`],
    ['Assist pump', '–', `${Math.round((st.auto.runtimeS ?? 0) / 60)} min, ${(st.auto.energyKWh ?? 0).toFixed(1)} kWh`],
  ];
  return (
    <div data-hud className="glass pointer-events-auto w-[372px] max-w-full !rounded-xl">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
          <Wind size={13} className="text-cyan" /> Net A funnel
        </span>
        <span className={cn('flex items-center gap-1 text-[11.5px]', running ? 'text-amber' : held ? 'text-amber' : 'text-muted')}>
          Assist {mode === 'off' ? 'off' : running ? `${Math.round(a.speed * 100)} %` : held ? 'held off' : 'idle'}
          <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      <div className="grid grid-cols-4 gap-2 border-t border-line px-3.5 py-2">
        <Cell k="In funnel" v={`${f.funnelT.toFixed(2)} t`} sub="not counted yet" tone="text-[#8fa5ff]" />
        <Cell k="Collected" v={`${w.collectedT.toFixed(1)} t`} sub={`${f.pocketT.toFixed(2)} t in pocket`} tone="text-teal" />
        <Cell k="In the line" v={`${w.inPipeT.toFixed(1)} t`} sub="in transfer" />
        <Cell k="Released" v={`${w.releasedT.toFixed(1)} t`} sub="2 km down-drift" tone="text-teal" />
      </div>
      {open && (
        <>
          <div className="grid grid-cols-3 gap-2 border-t border-line px-3.5 py-2">
            <Cell k="Mouth to throat" v={fmtS(f.mouthToThroatS)} sub="latest animals" />
            <Cell k="Stalled" v={`${Math.round(f.stalledT * 1000)} kg`} tone={f.stalledT > 0 ? 'text-amber' : undefined} sub={`< ${ASSUMPTIONS.collector.stallSpeed} m/s, ${ASSUMPTIONS.collector.stallAfter} s`} />
            <Cell k="Snagged" v={`${Math.round(f.snaggedT * 1000)} kg`} tone={f.snaggedT > 0 ? 'text-[#f472b6]' : undefined} sub="on the mesh" />
          </div>
          <div className="border-t border-line px-3.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] font-semibold text-white">
                Sweep assist <span className="font-normal text-amber">experimental</span>
              </span>
              <Segmented<AssistMode>
                size="sm"
                className="w-[200px]"
                value={mode}
                onChange={(v) => controller.setParams({ assistMode: v })}
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'auto', label: 'Auto' },
                  { value: 'manual', label: 'Test' },
                ]}
              />
            </div>
            <div className={cn('mt-1.5 text-[12px] leading-snug', held ? 'text-amber' : running ? 'text-white' : 'text-ink-2')}>{a.reason}</div>
            <div className="num mt-1 text-[11px] text-muted">
              Pump {Math.round(a.speed * 100)} % · {a.powerKW.toFixed(1)} of {assistPowerKW().toFixed(1)} kW · run {Math.round(a.runtimeS / 60)} min · {a.energyKWh.toFixed(2)} kWh
              {a.sweep !== null && ` · sweep ${a.sweep.toFixed(2)} m/s`}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {locks.map((l) => (
                <span key={l.key} className={cn('rounded-md border px-1.5 py-0.5 text-[10.5px]', l.on ? 'border-amber/60 bg-amber/10 text-amber' : 'border-line-strong text-dim')}>
                  {l.on ? '■' : '□'} {l.label}
                </span>
              ))}
            </div>
          </div>
          <div className="border-t border-line px-3.5 py-2">
            <table className="num w-full text-[11.5px]">
              <thead>
                <tr className="text-[10.5px] text-muted">
                  <th className="pb-0.5 text-left font-normal">Same {st.seeds.length} seeds, model</th>
                  <th className="pb-0.5 text-right font-normal">Off</th>
                  <th className="pb-0.5 pl-2 text-right font-normal">Auto</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([k, off, auto]) => (
                  <tr key={k}>
                    <td className="py-[1px] pr-2 whitespace-nowrap text-ink-2">{k}</td>
                    <td className="py-[1px] text-right whitespace-nowrap text-muted">{off}</td>
                    <td className="py-[1px] pl-2 text-right whitespace-nowrap text-white">{auto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-1 border-t border-line px-3.5 py-2 text-[11px] leading-snug text-pretty text-muted">
            <p className={blocks ? 'text-red' : 'text-amber'}>
              Rack gap {gap} cm, {sp.name} bells {Math.round(sp.bellMin * 100)}–{Math.round(sp.bellMax * 100)} cm{blocks ? ': as drawn it would stop them' : ''}. The model lets them through. Rack size and turtle bycatch not validated.
            </p>
            <p>
              Untested: jets add up to {A.addSpeed} m/s along the mesh ({(assistFlowM3s() * 3600).toFixed(0)} m³/h at {A.head} m head) and free no snagged animal. On site Auto needs a mouth sonar, a current meter ahead of the bar, a pocket level, and lift, head and float-line signals.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
