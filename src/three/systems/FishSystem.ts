import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BycatchState } from '../../simulation/bycatch';
import { mediumMaterial } from '../environment/shaderChunks';

/** Paint every vertex of a geometry one colour (for one merged, vertex-coloured mesh). */
function paint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Shade a geometry dark on top and silver below, as a fish is (countershading). */
function countershade(g: THREE.BufferGeometry, top: number, belly: number): THREE.BufferGeometry {
  const t = new THREE.Color(top);
  const b = new THREE.Color(belly);
  const p = g.attributes.position;
  const a = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(b).lerp(t, THREE.MathUtils.smoothstep(p.getY(i), -0.01, 0.03));
    a.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** A thin flat triangle fan in the x-y plane (a fin), from a list of points. */
function fin(points: Array<[number, number]>): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ShapeGeometry(shape);
}

/** A small fish along +x (head forward): a body tapered to the tail, a forked tail fin, and a dorsal fin. */
function fishGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.5, 16, 10);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    // Fuller at the head, narrowing to a slim tail stock.
    const taper = x < 0 ? 0.35 + 0.65 * (1 + x * 2) : 1;
    p.setXYZ(i, x * 0.36, p.getY(i) * 0.1 * taper, p.getZ(i) * 0.055 * taper);
  }
  body.computeVertexNormals();
  const tail = fin([
    [-0.16, 0],
    [-0.27, 0.075],
    [-0.235, 0],
    [-0.27, -0.075],
  ]);
  const dorsal = fin([
    [0.02, 0.045],
    [-0.07, 0.09],
    [-0.08, 0.035],
  ]);
  return mergeGeometries([
    countershade(body.toNonIndexed(), 0x3d5866, 0xd9e2e6),
    paint(tail.toNonIndexed(), 0x6f8792),
    paint(dorsal.toNonIndexed(), 0x4d6672),
  ])!;
}

/** A sea turtle along +x: a domed shell over a flat plastron, a head on a short neck, long front flippers and small rear ones. */
function turtleGeometry(): THREE.BufferGeometry {
  const shell = new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.0, 0.42, 0.78);
  const plastron = new THREE.CircleGeometry(0.5, 20).rotateX(Math.PI / 2).scale(0.96, 1, 0.74).translate(0, 0.001, 0);
  const head = new THREE.SphereGeometry(0.13, 12, 8).scale(1.35, 0.85, 1).translate(0.6, 0.04, 0);
  const neck = new THREE.CylinderGeometry(0.08, 0.1, 0.16, 10).rotateZ(Math.PI / 2).translate(0.48, 0.03, 0);
  const flipper = (len: number, wide: number) => new THREE.SphereGeometry(0.5, 10, 6).scale(len, 0.05, wide);
  const fl = (g: THREE.BufferGeometry, x: number, z: number, yaw: number) => g.rotateY(yaw).translate(x, -0.01, z);
  const skin = 0x8f8a63;
  return mergeGeometries([
    paint(shell.toNonIndexed(), 0x5b5530),
    paint(plastron.toNonIndexed(), 0xc9c08a),
    paint(head.toNonIndexed(), skin),
    paint(neck.toNonIndexed(), skin),
    paint(fl(flipper(0.62, 0.17), 0.18, 0.5, -0.75).toNonIndexed(), skin),
    paint(fl(flipper(0.62, 0.17), 0.18, -0.5, 0.75).toNonIndexed(), skin),
    paint(fl(flipper(0.26, 0.12), -0.36, 0.3, 0.6).toNonIndexed(), skin),
    paint(fl(flipper(0.26, 0.12), -0.36, -0.3, -0.6).toNonIndexed(), skin),
  ])!;
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
  private readonly side = new THREE.Vector3(1, 0, 0);

  constructor(fish: number, turtles: number) {
    this.group.name = 'fish';
    this.fish = new THREE.InstancedMesh(fishGeometry(), mediumMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.25, side: THREE.DoubleSide }), fish);
    this.turtles = new THREE.InstancedMesh(turtleGeometry(), mediumMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.02, side: THREE.DoubleSide }), turtles);
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
      // Face the way it swims; a fish sways its body, a turtle rolls gently with each flipper stroke.
      const yaw = Math.atan2(-b.vz[i], b.vx[i]);
      this.q.setFromAxisAngle(this.up, yaw + (turtle ? 0 : Math.sin(time * 7 + i) * 0.12));
      if (turtle) {
        this.qw.setFromAxisAngle(this.side, Math.sin(time * 1.6 + i) * 0.08);
        this.q.multiply(this.qw);
      }
      const size = turtle ? 1.0 : 0.75 + 0.5 * ((i * 0.618) % 1);
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
