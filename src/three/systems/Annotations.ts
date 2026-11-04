import * as THREE from 'three';
import { SITE } from '../../config/site';
import type { FlowField } from '../../simulation/flowField';
import type { Marker, SimulationEngine } from '../../simulation/SimulationEngine';
import type { EngineKind } from '../../simulation/types';
import { makeRingSprite, makeSoftSprite } from '../environment/textures';

const CAPTURE_POINTS = 240;

interface Flash {
  sprite: THREE.Sprite;
  born: number;
  life: number;
  kind: Marker['kind'];
}

const FLASH_COLORS: Record<Marker['kind'], number> = {
  leak: 0xffb347,
  intake: 0xf87171,
  release: 0x5eead4,
};

/**
 * Annotations in the 3D scene: event flashes (animals past a net, screen contacts, releases), the
 * band of passing water the plant draws in, and the selection marker for a picked jellyfish.
 */
export class Annotations {
  readonly group = new THREE.Group();
  /** Event flashes live in per-world groups so each world only shows its own events. */
  private readonly flashGroups: Record<EngineKind, THREE.Group> = { baseline: new THREE.Group(), sweepline: new THREE.Group() };
  private readonly flashes: Record<EngineKind, Flash[]> = { baseline: [], sweepline: [] };
  private readonly flashTex = makeSoftSprite(64, 1.6);
  private readonly lastSeq = new Map<SimulationEngine, number>();
  readonly selection: THREE.Sprite;
  /** Band of water the plant draws in: two lines traced through the flow, refreshed as the tide changes. */
  readonly captureLine: THREE.Line;

  constructor() {
    this.group.name = 'annotations';
    for (const world of ['baseline', 'sweepline'] as EngineKind[]) {
      for (let i = 0; i < 20; i++) {
        const mat = new THREE.SpriteMaterial({ map: this.flashTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const sprite = new THREE.Sprite(mat);
        sprite.visible = false;
        sprite.renderOrder = 40;
        this.flashGroups[world].add(sprite);
        this.flashes[world].push({ sprite, born: -1e9, life: 3, kind: 'leak' });
      }
      this.group.add(this.flashGroups[world]);
    }
    this.selection = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: makeRingSprite(128), color: 0x22d3ee, transparent: true, depthTest: false, depthWrite: false }),
    );
    this.selection.visible = false;
    this.selection.renderOrder = 50;
    this.group.add(this.selection);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CAPTURE_POINTS * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.captureLine = new THREE.LineLoop(g, new THREE.LineDashedMaterial({ color: 0xf87171, dashSize: 16, gapSize: 12, transparent: true, opacity: 0.9, depthWrite: false }));
    this.captureLine.frustumCulled = false;
    this.captureLine.renderOrder = 22;
    this.captureLine.visible = false;
    this.group.add(this.captureLine);
  }

  /** Trace the edges of the water that ends up at the plant, back upstream from the channel mouth. */
  updateCaptureLine(flow: FlowField): void {
    const arr = this.captureLine.geometry.attributes.position.array as Float32Array;
    const half = Math.floor(CAPTURE_POINTS / 2);
    const v = { x: 0, z: 0 };
    const M = SITE.channel.mouthZ;
    const hw = SITE.channel.halfWidth;
    for (const side of [-1, 1]) {
      let x = side * (hw - 2);
      let z = M + 4;
      for (let i = 0; i < half; i++) {
        const k = side < 0 ? i : CAPTURE_POINTS - 1 - i;
        arr.set([x, 0.9, z], k * 3);
        flow.sample(x, z, 2, v);
        x -= v.x * 26;
        z -= v.z * 26;
        if (z < M + 10 && Math.abs(x) > SITE.breakwater.outerToe - 10) z = M + 10;
      }
    }
    this.captureLine.geometry.attributes.position.needsUpdate = true;
    this.captureLine.computeLineDistances();
  }

  /** Spawn flashes for an engine's new markers (in that engine's world). */
  ingestMarkers(engine: SimulationEngine, now: number): void {
    const last = this.lastSeq.get(engine) ?? engine.markerSeq;
    const seq = engine.markerSeq;
    if (seq > last) {
      const cap = engine.markers.length;
      const from = Math.max(last, seq - cap);
      for (let s = from; s < seq; s++) {
        const m = engine.markers[s % Math.max(cap, 1)];
        if (m) this.spawn(engine.kind, m, now);
      }
    }
    this.lastSeq.set(engine, seq);
  }

  /** Show only the given world's event flashes. */
  setWorld(world: EngineKind): void {
    this.flashGroups.baseline.visible = world === 'baseline';
    this.flashGroups.sweepline.visible = world === 'sweepline';
  }

  /** Forget marker history (e.g. after a run restart). */
  reset(): void {
    this.lastSeq.clear();
    for (const list of Object.values(this.flashes)) for (const f of list) f.sprite.visible = false;
  }

  private spawn(world: EngineKind, m: Marker, now: number): void {
    const pool = this.flashes[world];
    let slot = pool[0];
    for (const f of pool) if (f.born < slot.born) slot = f;
    slot.born = now;
    slot.kind = m.kind;
    slot.life = m.kind === 'release' ? 2.2 : 3.2;
    slot.sprite.position.set(m.x, m.y, m.z);
    (slot.sprite.material as THREE.SpriteMaterial).color.set(FLASH_COLORS[m.kind]);
    slot.sprite.visible = true;
  }

  update(now: number, camera: THREE.Camera): void {
    for (const f of [...this.flashes.baseline, ...this.flashes.sweepline]) {
      if (!f.sprite.visible) continue;
      const t = (now - f.born) / f.life;
      if (t >= 1) {
        f.sprite.visible = false;
        continue;
      }
      const dist = camera.position.distanceTo(f.sprite.position);
      const base = Math.max(1.2, dist * 0.035);
      f.sprite.scale.setScalar(base * (0.6 + t * 1.6));
      (f.sprite.material as THREE.SpriteMaterial).opacity = (1 - t) * (1 - t) * 0.95;
    }
  }

  setSelection(pos: THREE.Vector3 | null, camera: THREE.Camera): void {
    if (!pos) {
      this.selection.visible = false;
      return;
    }
    this.selection.visible = true;
    this.selection.position.copy(pos);
    const d = camera.position.distanceTo(pos);
    this.selection.scale.setScalar(Math.max(0.9, d * 0.06));
    (this.selection.material as THREE.SpriteMaterial).rotation += 0.01;
  }
}
