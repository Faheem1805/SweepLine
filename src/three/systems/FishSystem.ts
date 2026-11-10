import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BycatchState } from '../../simulation/bycatch';
import { mediumMaterial } from '../environment/shaderChunks';

/** A small fish along +x: a slim body and a forked tail. */
function fishGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.5, 12, 8).scale(0.34, 0.085, 0.06);
  const tail = new THREE.ConeGeometry(0.07, 0.14, 4).rotateZ(Math.PI / 2).scale(1, 1, 0.3).translate(-0.2, 0, 0);
  return mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()])!;
}

/** A sea turtle along +x: a domed shell, a head and four flippers. */
function turtleGeometry(): THREE.BufferGeometry {
  const shell = new THREE.SphereGeometry(0.5, 16, 10).scale(1.0, 0.32, 0.8);
  const head = new THREE.SphereGeometry(0.13, 10, 8).scale(1.3, 0.9, 1).translate(0.58, 0.02, 0);
  const flip = (x: number, z: number, a: number) => new THREE.BoxGeometry(0.42, 0.04, 0.16).rotateY(a).translate(x, -0.02, z);
  const parts = [shell, head, flip(0.22, 0.46, -0.5), flip(0.22, -0.46, 0.5), flip(-0.32, 0.34, 0.3), flip(-0.32, -0.34, -0.3)].map((g) => g.toNonIndexed());
  return mergeGeometries(parts)!;
}

/** Fish and turtles in the SweepLine world, from {@link BycatchState}, drawn between simulation steps. */
export class FishSystem {
  readonly group = new THREE.Group();
  private readonly fish: THREE.InstancedMesh;
  private readonly turtles: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qw = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(fish: number, turtles: number) {
    this.group.name = 'fish';
    this.fish = new THREE.InstancedMesh(fishGeometry(), mediumMaterial({ color: 0xb8c6cf, roughness: 0.3, metalness: 0.65 }), fish);
    this.turtles = new THREE.InstancedMesh(turtleGeometry(), mediumMaterial({ color: 0x6b6a3e, roughness: 0.7, metalness: 0.05 }), turtles);
    for (const m of [this.fish, this.turtles]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    this.group.add(this.fish, this.turtles);
  }

  update(b: BycatchState | null, alpha: number, time: number): void {
    this.group.visible = !!b;
    if (!b) return;
    let nf = 0;
    let nt = 0;
    for (let i = 0; i < b.n; i++) {
      if (b.state[i] !== 0) continue;
      const turtle = b.isTurtle(i);
      const x = b.ox[i] + (b.px[i] - b.ox[i]) * alpha;
      const y = b.oy[i] + (b.py[i] - b.oy[i]) * alpha;
      const z = b.oz[i] + (b.pz[i] - b.oz[i]) * alpha;
      // Face the way it swims, with a beat of the tail or flippers.
      const yaw = Math.atan2(-b.vz[i], b.vx[i]);
      this.q.setFromAxisAngle(this.up, yaw);
      this.qw.setFromAxisAngle(this.up, Math.sin(time * (turtle ? 2.2 : 9) + i) * (turtle ? 0.05 : 0.18));
      this.q.multiply(this.qw);
      const size = turtle ? 1.0 : 0.7 + 0.6 * ((i * 0.618) % 1);
      this.m.compose(this.p.set(x, y, z), this.q, this.s.set(size, size, size));
      if (turtle) this.turtles.setMatrixAt(nt++, this.m);
      else this.fish.setMatrixAt(nf++, this.m);
    }
    this.fish.count = nf;
    this.turtles.count = nt;
    this.fish.instanceMatrix.needsUpdate = true;
    this.turtles.instanceMatrix.needsUpdate = true;
  }
}
