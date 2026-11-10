import { X } from 'lucide-react';
import { useApp } from '../../app/store';
import { ASSUMPTIONS, SPECIES } from '../../config/assumptions';
import { cn } from '../../utils/format';

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[12.5px]">
      <span className="text-muted">{k}</span>
      <span className={cn('num text-right text-ink', tone)}>{v}</span>
    </div>
  );
}

/** Details of what was clicked in the 3D view. */
export function Inspector() {
  const sel = useApp((s) => s.ui.selection);
  const snap = useApp((s) => s.snap);
  const setUI = useApp((s) => s.setUI);
  if (!sel || !snap) return null;
  const close = () => setUI({ selection: null, follow: false });
  let title = '';
  let rows: Array<{ k: string; v: string; tone?: string }> = [];
  let note = '';
  const a = snap.nets[0];
  const b = snap.nets[1];
  const w = snap.sweepline;
  if (sel.kind === 'net') {
    title = 'Guide nets';
    rows = [
      { k: 'Length, each', v: `${a.length.toFixed(0)} m, ${a.panels} panels` },
      { k: 'Mesh', v: `${ASSUMPTIONS.net.meshBar * 1000} mm bar` },
      { k: 'Through the mesh', v: `${a.through.toFixed(3)} m/s` },
      { k: 'Along the face', v: `${a.sweep.toFixed(2)} m/s` },
      { k: 'Head, net A', v: `${(a.head * 1000).toFixed(1)} mm` },
      { k: 'Load on a panel', v: `${a.panelLoadKN.toFixed(1)} kN` },
      { k: 'Marine growth', v: `${a.foulPct.toFixed(0)} % added solidity` },
      { k: 'On net A / net B', v: `${a.onNetT.toFixed(1)} / ${b.onNetT.toFixed(1)} t` },
      { k: 'Margin to relief', v: `${a.marginT.toFixed(0)} t` },
    ];
    note = 'Water passes through the mesh. Animals cannot, so the flow sweeps them along the face.';
  } else if (sel.kind === 'collector') {
    const t = snap.transfer;
    const lift = (i: number) => {
      const x = snap.lift.stations[i];
      return x.speed > 0.02 ? `Turning, ${x.rpm.toFixed(0)} rpm` : x.on ? 'Starting' : x.seen ? 'Sensor sees jellyfish' : 'Idle, funnel clear';
    };
    title = 'Collector';
    rows = [
      { k: 'Lift A', v: lift(0), tone: snap.lift.stations[0].speed > 0.02 ? 'text-teal' : undefined },
      { k: 'Lift B', v: lift(1), tone: snap.lift.stations[1].speed > 0.02 ? 'text-teal' : undefined },
      { k: 'Duty screws', v: t.primary, tone: t.primary === 'FAULT' ? 'text-red' : 'text-teal' },
      { k: 'Standby screws', v: t.standby, tone: t.standby === 'FAULT' ? 'text-red' : undefined },
      { k: 'Power now', v: `${Math.round(snap.lift.powerKW)} kW` },
      { k: 'Capacity now', v: `${t.capacityTph.toFixed(0)} t/h` },
      { k: 'Collecting', v: `${w.collectTph.toFixed(1)} t/h` },
      { k: 'Funnels full', v: `${Math.round(t.pocketFill * 100)} %` },
    ];
    note = 'Enclosed screws: no impeller, no gap. Each lift turns only while its funnel sensor sees jellyfish, and runs on until its pockets and the line are clear. Capacity is the line’s water flow at 5 % jellyfish by volume.';
  } else if (sel.kind === 'intake') {
    title = 'Plant screens';
    rows = [
      { k: 'With SweepLine', v: `${w.screenTph.toFixed(1)} t/h, ${w.screenStatus.toLowerCase()}` },
      { k: 'Without', v: `${snap.baseline.screenTph.toFixed(1)} t/h, ${snap.baseline.screenStatus.toLowerCase()}` },
      { k: 'Channel flow', v: `${snap.channel.flow.toFixed(0)} m³/s` },
      { k: 'Units behind the nets', v: 'All four' },
    ];
    note = 'Unchanged by SweepLine. The screens stay the last line of defence.';
  } else if (sel.kind === 'release') {
    title = 'Release';
    rows = [
      { k: 'Released', v: `${w.releasedT.toFixed(1)} t` },
      { k: 'In the line', v: `${w.inPipeT.toFixed(1)} t` },
      { k: 'Line length', v: `${(ASSUMPTIONS.transfer.length / 1000).toFixed(1)} km` },
      { k: 'Time in the line', v: `${Math.round(ASSUMPTIONS.transfer.length / ASSUMPTIONS.transfer.pipeVelocity / 60)} min` },
    ];
  } else if (sel.kind === 'jelly' && snap.selectedAgent) {
    const g = snap.selectedAgent;
    title = SPECIES[snap.params.species].name;
    rows = [
      { k: 'State', v: g.state.replaceAll('_', ' ').toLowerCase() },
      { k: 'Depth', v: `${g.depth.toFixed(1)} m` },
      { k: 'Speed', v: `${g.speed.toFixed(2)} m/s` },
      { k: 'Bell', v: `${Math.round(g.size * 100)} cm` },
    ];
  } else return null;
  return (
    <div data-hud className="glass pointer-events-auto w-[300px] animate-fade-in !rounded-xl px-3.5 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[13.5px] font-semibold text-white">{title}</span>
        <button type="button" onClick={close} aria-label="Close" className="text-muted hover:text-white">
          <X size={14} />
        </button>
      </div>
      <div className="mt-1">
        {rows.map((r) => (
          <Row key={r.k} {...r} />
        ))}
      </div>
      {note && <p className="mt-1.5 text-[11.5px] leading-snug text-pretty text-muted">{note}</p>}
    </div>
  );
}
