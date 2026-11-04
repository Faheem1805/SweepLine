import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SITE, seabedDepth } from '../../config/site';
import { NETS, pointOnNet } from '../../simulation/geometry';

export type CameraPreset = 'aerial' | 'top' | 'mouth' | 'net' | 'underwater' | 'collector' | 'intake' | 'release' | 'compare' | 'free';

export const CAMERA_PRESETS: Array<{ key: Exclude<CameraPreset, 'free' | 'compare'>; label: string }> = [
  { key: 'aerial', label: 'Overview' },
  { key: 'top', label: 'Top' },
  { key: 'mouth', label: 'Channel mouth' },
  { key: 'net', label: 'Along the net' },
  { key: 'underwater', label: 'Underwater' },
  { key: 'collector', label: 'Collector' },
  { key: 'intake', label: 'Intake' },
  { key: 'release', label: 'Release' },
];

export interface CameraPose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

/** Camera presets on the reference site. The overview stands offshore to the west, looking along the channel to the plant. */
export function presetPose(key: Exclude<CameraPreset, 'free'>): CameraPose {
  const L = NETS[0];
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  switch (key) {
    case 'top':
      return { pos: v(0, 1120, 300.01), target: v(0, 0, 300) };
    case 'compare':
      return { pos: v(-300, 640, 760), target: v(10, 0, 250) };
    case 'mouth':
      return { pos: v(-250, 86, 760), target: v(20, 0, 500) };
    case 'net': {
      const p = pointOnNet(L, L.length * 0.42);
      return { pos: v(p.x - L.tx * 70 + L.nx * 28, 15, p.z - L.tz * 70 + L.nz * 28), target: v(p.x + L.tx * 70, 0, p.z + L.tz * 70) };
    }
    case 'underwater': {
      const p = pointOnNet(L, L.length * 0.74);
      return {
        pos: v(p.x + L.nx * 7 - L.tx * 12, -4.2, p.z + L.nz * 7 - L.tz * 12),
        target: v(p.x + L.tx * 14 + L.nx * 0.6, -3.6, p.z + L.tz * 14 + L.nz * 0.6),
      };
    }
    case 'collector':
      return { pos: v(26, 19, 44), target: v(70, 2.5, 76) };
    case 'intake':
      return { pos: v(-70, 34, 120), target: v(0, 1, -30) };
    case 'release': {
      const r = SITE.release;
      return { pos: v(r.x - 46, 22, r.z + 44), target: v(r.x + 8, 0, r.z + 4) };
    }
    case 'aerial':
    default:
      return { pos: v(-430, 200, 800), target: v(30, 0, 250) };
  }
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Quintic ease (zero speed and acceleration at both ends) for long orbit swings. */
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Flight paths: 'arc' lifts the camera along a quadratic curve (preset changes);
 * 'orbit' interpolates distance, tilt and heading around a moving target, so a
 * straight-down view can swing into a perspective view without spinning.
 */
export type FlightPath = 'arc' | 'orbit';

interface Tween {
  from: CameraPose;
  to: CameraPose;
  ctrl: THREE.Vector3;
  t: number;
  duration: number;
  path: FlightPath;
}

const _sphA = new THREE.Spherical();
const _sphB = new THREE.Spherical();
const _off = new THREE.Vector3();

/**
 * Pose at linear progress t (0..1) of an orbit flight — the curve flyTo(…, 'orbit')
 * follows: target lerped, distance in log space, shortest heading turn, eased.
 */
export function orbitPose(from: CameraPose, to: CameraPose, t: number, out: CameraPose): CameraPose {
  const k = smoother(t);
  _sphA.setFromVector3(_off.subVectors(from.pos, from.target));
  _sphB.setFromVector3(_off.subVectors(to.pos, to.target));
  let dTheta = _sphB.theta - _sphA.theta;
  while (dTheta > Math.PI) dTheta -= Math.PI * 2;
  while (dTheta < -Math.PI) dTheta += Math.PI * 2;
  const r = Math.exp(THREE.MathUtils.lerp(Math.log(_sphA.radius), Math.log(_sphB.radius), k));
  const phi = THREE.MathUtils.lerp(_sphA.phi, _sphB.phi, k);
  out.target.lerpVectors(from.target, to.target, k);
  out.pos.setFromSphericalCoords(r, phi, _sphA.theta + dTheta * k).add(out.target);
  return out;
}

/**
 * Smooth camera transitions between presets (no hard cuts). A quadratic arc
 * lifts long moves and dives cleanly through the surface for underwater views.
 * Any user interaction cancels the tween and hands control to OrbitControls.
 */
export class CameraRig {
  private tween: Tween | null = null;
  private readonly orbitOut: CameraPose = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  current: CameraPreset = 'aerial';
  /** World position to follow (e.g. a selected jellyfish). */
  followTarget: THREE.Vector3 | null = null;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  onPresetChange: ((p: CameraPreset) => void) | null = null;

  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera;
    this.controls = controls;
    controls.addEventListener('start', () => {
      if (this.tween) this.tween = null;
      if (this.current !== 'free') {
        this.current = 'free';
        this.onPresetChange?.('free');
      }
    });
  }

  get transitioning(): boolean {
    return this.tween !== null;
  }

  /** Preset pose. */
  pose(key: Exclude<CameraPreset, 'free'>): CameraPose {
    return presetPose(key);
  }

  goTo(key: Exclude<CameraPreset, 'free'>, duration = 1.7): void {
    const to = this.pose(key);
    this.flyTo(to, duration);
    this.current = key;
    this.onPresetChange?.(key);
  }

  flyTo(to: CameraPose, duration = 1.6, path: FlightPath = 'arc'): void {
    const from: CameraPose = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    const mid = from.pos.clone().lerp(to.pos, 0.5);
    const dist = from.pos.distanceTo(to.pos);
    const crossing = (from.pos.y > 0) !== (to.pos.y > 0);
    const lift = Math.min(160, dist * 0.25);
    if (crossing) mid.y = Math.max(from.pos.y, to.pos.y, 6) + lift * 0.3;
    else if (to.pos.y > 0) mid.y = Math.max(mid.y, Math.max(from.pos.y, to.pos.y) + lift * 0.4);
    this.tween = { from, to: { pos: to.pos.clone(), target: to.target.clone() }, ctrl: mid, t: 0, duration, path };
  }

  /** Place the camera at an exact pose (no transition; the active preset is unchanged). */
  setPose(pose: CameraPose): void {
    this.tween = null;
    this.camera.position.copy(pose.pos);
    this.controls.target.copy(pose.target);
    this.controls.update();
  }

  private applyTween(tw: Tween): void {
    if (tw.path === 'orbit') {
      orbitPose(tw.from, tw.to, tw.t, this.orbitOut);
      this.camera.position.copy(this.orbitOut.pos);
      this.controls.target.copy(this.orbitOut.target);
      return;
    }
    const k = ease(tw.t);
    const a = tw.from.pos;
    const b = tw.to.pos;
    const c = tw.ctrl;
    const u = 1 - k;
    this.camera.position.set(u * u * a.x + 2 * u * k * c.x + k * k * b.x, u * u * a.y + 2 * u * k * c.y + k * k * b.y, u * u * a.z + 2 * u * k * c.z + k * k * b.z);
    this.controls.target.lerpVectors(tw.from.target, tw.to.target, k);
  }

  snap(key: Exclude<CameraPreset, 'free'>): void {
    const p = this.pose(key);
    this.camera.position.copy(p.pos);
    this.controls.target.copy(p.target);
    this.current = key;
    this.tween = null;
    this.controls.update();
  }

  update(dt: number): void {
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      this.applyTween(tw);
      if (tw.t >= 1) this.tween = null;
    } else if (this.followTarget) {
      const delta = this.followTarget.clone().sub(this.controls.target).multiplyScalar(Math.min(1, dt * 2.5));
      this.controls.target.add(delta);
      this.camera.position.add(delta);
    }
    this.controls.update();
    // Never below the seabed.
    const floor = -seabedDepth(this.camera.position.x, this.camera.position.z) + 0.6;
    if (this.camera.position.y < floor) this.camera.position.y = floor;
  }
}
