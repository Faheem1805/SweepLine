import { Crosshair } from 'lucide-react';
import * as THREE from 'three';
import { getScene } from '../../app/runtime';
import { useApp } from '../../app/store';
import { S_LIFT } from '../../simulation/Agent';
import { controller } from '../../simulation/SimController';
import { TAIL } from '../../simulation/lift';
import { cn } from '../../utils/format';

const kg = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} t` : `${Math.round(v)} kg`);

/**
 * Pick the jellyfish about to be scooped (in the hopper, else at the head of the funnel), select it
 * and ride along with it: hopper, bucket, chute, head tank.
 */
function followOne(): boolean {
  const e = controller.sweepline;
  const p = e.pool;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < p.capacity; i++) {
    if (p.state[i] !== S_LIFT || p.queueIndex[i] !== 0) continue;
    const d = Math.hypot(p.px[i] - TAIL.x, p.pz[i] - TAIL.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) best = e.transfer?.queues[1][0] ?? -1;
  if (best < 0) return false;
  const at = new THREE.Vector3(p.px[best], p.py[best], p.pz[best]);
  // Side-on to the elevator from downstream, a little above.
  getScene().rig.flyTo({ pos: at.clone().add(new THREE.Vector3(1.5, 5.0, -10.5)), target: at }, 1.2);
  useApp.getState().setUI({ selection: { kind: 'jelly', engine: 'sweepline', agentId: p.id[best] }, follow: true });
  if (controller.speed > 1) controller.setSpeed(1);
  return true;
}

/** The bucket elevator, section by section, shown with the lift camera. */
export function LiftCard() {
  const camera = useApp((s) => s.ui.camera);
  const compare = useApp((s) => s.ui.compare);
  const lift = useApp((s) => s.snap?.lift);
  const showToast = useApp((s) => s.showToast);
  if (camera !== 'lift' || compare || !lift) return null;
  const turning = lift.speed > 0.02;
  const state = lift.hold ? 'Waiting: turtle' : turning ? `Running · ${lift.chainMs.toFixed(1)} m/s` : lift.on ? 'Starting' : 'Idle';
  const rows: Array<[string, string, string]> = [
    ['1', 'Funnel, both nets', kg(lift.funnelKg)],
    ['2', 'Hopper', kg(lift.hopperKg)],
    ['3', 'In buckets', kg(lift.bucketsKg)],
    ['4', 'Chute', kg(lift.chuteKg)],
    ['5', 'Line, 2.2 km', kg(lift.inLineKg)],
  ];
  return (
    <div data-hud className="glass pointer-events-auto w-[248px] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10.5px] font-semibold tracking-[0.12em] text-cyan">BUCKET ELEVATOR · {lift.drive.toUpperCase()} DRIVE</div>
        <span className={cn('rounded-full px-2 py-[1px] text-[10.5px] font-medium', lift.hold ? 'bg-amber/15 text-amber' : turning ? 'bg-teal/15 text-teal' : 'bg-line text-ink-2')}>{state}</span>
      </div>
      <div className="mt-1 text-[11px] text-ink-2">
        Funnel sensor: <span className={lift.seen ? 'text-teal' : 'text-muted'}>{lift.seen ? 'sees jellyfish' : 'sees none'}</span>
      </div>
      {!turning && !lift.on && <div className="mt-0.5 text-[10.5px] text-muted">The buckets stay still until jellyfish reach the funnel; the view drops to real time when they start.</div>}
      <div className="mt-1.5 flex flex-col gap-0.5">
        {rows.map(([n, l, v]) => (
          <div key={n} className="flex items-center gap-2 text-[11.5px]">
            <span className="w-3 text-muted">{n}</span>
            <span className="flex-1 text-ink-2">{l}</span>
            <span className="tabular-nums text-ink">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 text-[10.5px] leading-snug text-muted">
        Each bucket scoops water with the jellyfish in it and carries up to {Math.round(lift.bucketKg)} kg. {Math.round(lift.powerKW)} kW now · ran {lift.turningMin.toFixed(0)} min, {lift.starts} start{lift.starts === 1 ? '' : 's'} · {lift.energyKWh.toFixed(0)} kWh
      </div>
      <div className="mt-1.5 border-t border-line pt-1.5 text-[10.5px] leading-snug text-ink-2">
        Jets: {lift.jets.bursts} burst{lift.jets.bursts === 1 ? '' : 's'}, {lift.jets.freed} stuck bells freed{lift.jets.firing > 0 ? ' · firing now' : ''}
        <br />
        Fish turned back at the nets: {lift.bycatch.turnedBack} · lifted to sea alive: {lift.bycatch.lifted} · waits for a turtle: {lift.bycatch.turtlePauses}
      </div>
      <button
        type="button"
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-cyan/40 bg-cyan/10 px-2 py-1 text-[11.5px] font-medium text-cyan hover:bg-cyan/20"
        onClick={() => {
          if (!followOne()) showToast('No jellyfish at the funnel yet: the elevator is idle until its sensor sees some');
        }}
      >
        <Crosshair size={12} /> Follow one jellyfish up the elevator
      </button>
    </div>
  );
}
