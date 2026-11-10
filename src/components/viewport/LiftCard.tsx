import { Crosshair } from 'lucide-react';
import * as THREE from 'three';
import { getScene } from '../../app/runtime';
import { useApp } from '../../app/store';
import { S_LIFT } from '../../simulation/Agent';
import { controller } from '../../simulation/SimController';
import { collectorPoint, NETS } from '../../simulation/geometry';
import { cn } from '../../utils/format';

const kg = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} t` : `${Math.round(v)} kg`);

/**
 * Pick the jellyfish about to go up net A's lift (in the hopper, else at the head of the funnel),
 * select it and ride along with it: hopper, pocket, launder, head tank.
 */
function followOne(): boolean {
  const e = controller.sweepline;
  const p = e.pool;
  const end = collectorPoint(NETS[0]);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < p.capacity; i++) {
    if (p.state[i] !== S_LIFT || (p.lane[i] & 1) !== 0 || p.queueIndex[i] !== 0) continue;
    const d = Math.hypot(p.px[i] - end.x, p.pz[i] - end.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) best = e.transfer?.queues[0][0] ?? -1;
  if (best < 0) return false;
  const at = new THREE.Vector3(p.px[best], p.py[best], p.pz[best]);
  getScene().rig.flyTo({ pos: at.clone().add(new THREE.Vector3(-8.5, 6.5, 3)), target: at }, 1.2);
  useApp.getState().setUI({ selection: { kind: 'jelly', engine: 'sweepline', agentId: p.id[best] }, follow: true });
  if (controller.speed > 1) controller.setSpeed(1);
  return true;
}

/** Net A's screw lift, section by section, shown with the lift camera. */
export function LiftCard() {
  const camera = useApp((s) => s.ui.camera);
  const compare = useApp((s) => s.ui.compare);
  const lift = useApp((s) => s.snap?.lift);
  const showToast = useApp((s) => s.showToast);
  if (camera !== 'lift' || compare || !lift) return null;
  const a = lift.stations[0];
  const turning = a.speed > 0.02;
  const state = turning ? `Turning · ${a.rpm.toFixed(0)} rpm` : a.on ? 'Starting' : 'Idle';
  const rows: Array<[string, string, string]> = [
    ['1', 'Funnel', kg(a.funnelKg)],
    ['2', 'Hopper', kg(a.hopperKg)],
    ['3', 'In pockets', kg(a.pocketsKg)],
    ['4', 'Launder', kg(a.launderKg)],
    ['5', 'Line, 2.2 km', kg(lift.inLineKg)],
  ];
  return (
    <div data-hud className="glass pointer-events-auto w-[248px] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10.5px] font-semibold tracking-[0.12em] text-cyan">LIFT A · {a.screw.toUpperCase()} SCREW</div>
        <span className={cn('rounded-full px-2 py-[1px] text-[10.5px] font-medium', turning ? 'bg-teal/15 text-teal' : a.strandedKg > 0 ? 'bg-amber/15 text-amber' : 'bg-line text-ink-2')}>{state}</span>
      </div>
      <div className="mt-1 text-[11px] text-ink-2">
        Funnel sensor: <span className={a.seen ? 'text-teal' : 'text-muted'}>{a.seen ? 'sees jellyfish' : 'sees none'}</span>
      </div>
      {!turning && !a.on && <div className="mt-0.5 text-[10.5px] text-muted">The screws stay still until jellyfish reach the funnel; the view drops to real time when they start.</div>}
      <div className="mt-1.5 flex flex-col gap-0.5">
        {rows.map(([n, l, v]) => (
          <div key={n} className="flex items-center gap-2 text-[11.5px]">
            <span className="w-3 text-muted">{n}</span>
            <span className="flex-1 text-ink-2">{l}</span>
            <span className="tabular-nums text-ink">{v}</span>
          </div>
        ))}
      </div>
      {a.strandedKg > 0 && <div className="mt-1 text-[11px] text-amber">{kg(a.strandedKg)} held in water in the stopped duty screw</div>}
      <div className="mt-1.5 text-[10.5px] leading-snug text-muted">
        Each pocket carries water and up to {Math.round(lift.pocketKg)} kg of jellyfish. {Math.round(lift.powerKW)} kW now · turned {a.turningMin.toFixed(0)} min, {a.starts} start{a.starts === 1 ? '' : 's'} · {lift.energyKWh.toFixed(0)} kWh both lifts
      </div>
      <button
        type="button"
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-cyan/40 bg-cyan/10 px-2 py-1 text-[11.5px] font-medium text-cyan hover:bg-cyan/20"
        onClick={() => {
          if (!followOne()) showToast('No jellyfish at lift A yet: the lift is idle until the funnel sensor sees some');
        }}
      >
        <Crosshair size={12} /> Follow one jellyfish up the lift
      </button>
    </div>
  );
}
