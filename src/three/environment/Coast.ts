import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SITE, seabedDepth } from '../../config/site';
import { SeededRandom } from '../../simulation/seededRandom';
import { makeRockGeometry } from '../assets/procedural/rocks';
import { applyMedium, mediumMaterial } from './shaderChunks';
import { makeConcreteTextures, makeLandTexture, makeRockTexture, makeScreenMeshTexture } from './textures';

/** Collects box geometries per material and merges them into a few draw calls. */
class MergeBuilder {
  private readonly parts = new Map<string, THREE.BufferGeometry[]>();

  box(key: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(key, g);
  }

  add(key: string, g: THREE.BufferGeometry): void {
    const list = this.parts.get(key) ?? [];
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    list.push(g.index ? g.toNonIndexed() : g);
    this.parts.set(key, list);
  }

  build(materials: Record<string, THREE.Material>, group: THREE.Group, shadows = true): void {
    for (const [key, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, materials[key]);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.name = `coast-${key}`;
      group.add(mesh);
    }
  }
}

export interface CoastParts {
  group: THREE.Group;
  /** The intake structure (pickable; replaceable by GLB). */
  intake: THREE.Group;
  /** The revetment / breakwater (replaceable by GLB). */
  breakwater: THREE.Group;
}

export function buildCoast(): CoastParts {
  const group = new THREE.Group();
  group.name = 'coast';
  const concreteTex = makeConcreteTextures(256);

  const mats = {
    concrete: mediumMaterial({ map: concreteTex.map, normalMap: concreteTex.normal, roughness: 0.88, metalness: 0, color: 0xdedbd2 }),
    concreteDark: mediumMaterial({ map: concreteTex.map, normalMap: concreteTex.normal, roughness: 0.9, color: 0x9c9890 }),
    land: mediumMaterial({ map: makeLandTexture(512), color: 0xe8d6b0, roughness: 0.97 }, false),
    steel: mediumMaterial({ color: 0x3d4a52, roughness: 0.55, metalness: 0.55 }),
    yellow: mediumMaterial({ color: 0xe8b23a, roughness: 0.5, metalness: 0.2 }, false),
    glass: mediumMaterial({ color: 0x1a3442, roughness: 0.12, metalness: 0.75, emissive: 0x081820, emissiveIntensity: 0.6 }, false),
    cladding: mediumMaterial({ color: 0xc4c8c6, roughness: 0.7, metalness: 0.05 }, false),
    claddingBlue: mediumMaterial({ color: 0x6f93ab, roughness: 0.6, metalness: 0.1 }, false),
    rockCore: mediumMaterial({ color: 0x6f6a60, roughness: 0.98 }),
  };

  // ------------------------------------------------------------ land + crown wall
  (mats.land.map as THREE.Texture).repeat.set(24000 / 90, 14000 / 90);
  const landMesh = new THREE.Mesh(new THREE.PlaneGeometry(24000, 14000).rotateX(-Math.PI / 2), mats.land);
  landMesh.position.set(0, SITE.shore.landY, SITE.shore.crestZ - 7000 - 2);
  landMesh.receiveShadow = true;
  group.add(landMesh);
  const mb = new MergeBuilder();
  const ix0 = SITE.intake.x0 - 2.4;
  const ix1 = SITE.intake.x1 + 2.4;
  const crest = SITE.shore.crestZ;
  for (const [a, b] of [
    [-4500, ix0],
    [ix1, 4500],
  ]) {
    mb.box('concrete', a, b, SITE.shore.landY - 0.5, SITE.shore.crestY + 1.0, crest - 2.2, crest + 0.2);
  }
  mb.build(mats, group, true);

  // ------------------------------------------------------------ revetment (breakwater)
  const breakwater = new THREE.Group();
  breakwater.name = 'breakwater';
  const toe = SITE.shore.toeZ + 0.5;
  const toeY = -seabedDepth(0, SITE.shore.toeZ + 1) - 0.3;
  const slope = new MergeBuilder();
  for (const [a, b] of [
    [-4500, ix0],
    [ix1, 4500],
  ]) {
    const w = b - a;
    const g = new THREE.PlaneGeometry(w, Math.hypot(crest - toe, SITE.shore.crestY - toeY), 1, 1);
    const ang = Math.atan2(SITE.shore.crestY - toeY, toe - crest);
    g.rotateX(-Math.PI / 2 + ang);
    g.translate((a + b) / 2, (SITE.shore.crestY + toeY) / 2, (crest + toe) / 2);
    slope.add('rockCore', g);
  }
  slope.build(mats, breakwater, false);

  const rockTex = makeRockTexture(256);
  const rockMat = applyMedium(new THREE.MeshStandardMaterial({ map: rockTex, color: 0xffffff, roughness: 0.95, flatShading: true }), {
    caustics: true,
    key: 'armour',
  });
  const rockGeos = [makeRockGeometry(1, 1), makeRockGeometry(2, 1), makeRockGeometry(3, 1)];
  const rng = new SeededRandom(1234);
  const perVariant = 2600;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  rockGeos.forEach((geo, vi) => {
    const mesh = new THREE.InstancedMesh(geo, rockMat, perVariant);
    let n = 0;
    while (n < perVariant) {
      const x = rng.range(-1100, 1100);
      if (x > ix0 - 1 && x < ix1 + 1) {
        rng.next();
        continue;
      }
      const t = Math.pow(rng.next(), 0.85);
      const z = THREE.MathUtils.lerp(crest + 0.6, toe + 1.2, t) + rng.range(-0.5, 0.5);
      const y = THREE.MathUtils.lerp(SITE.shore.crestY - 0.1, toeY + 0.4, t);
      const sc = rng.range(0.9, 1.75) * (vi === 2 ? 0.85 : 1);
      p.set(x, y + sc * 0.35, z);
      e.set(rng.next() * Math.PI, rng.next() * Math.PI, rng.next() * Math.PI);
      q.setFromEuler(e);
      s.set(sc * rng.range(0.9, 1.3), sc * rng.range(0.7, 1.0), sc * rng.range(0.9, 1.25));
      m.compose(p, q, s);
      mesh.setMatrixAt(n, m);
      const shade = rng.range(0.78, 1.08);
      col.setRGB(shade, shade * rng.range(0.96, 1.0), shade * rng.range(0.9, 0.98));
      mesh.setColorAt(n, col);
      n++;
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `armour-${vi}`;
    breakwater.add(mesh);
  });
  group.add(breakwater);
  group.add(buildBreakwaters(mats, rockMat, rockGeos));

  // ------------------------------------------------------------ intake structure
  const intake = buildIntake(mats);
  group.add(intake);

  // ------------------------------------------------------------ schematic plant backdrop
  group.add(buildPlantBackdrop(mats));

  return { group, intake, breakwater };
}

/**
 * The two rock breakwaters that form the intake channel: a core mound under armour stone, a concrete
 * crest road with lamp posts, and a harbour light on each head.
 */
function buildBreakwaters(mats: Record<string, THREE.Material>, rockMat: THREE.Material, rockGeos: THREE.BufferGeometry[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'breakwaters';
  const C = SITE.channel;
  const B = SITE.breakwater;
  const hw = C.halfWidth;
  const crestY = B.crestY;
  // The armour meets still water at the channel wall; its toe runs on under the water.
  const crestIn = hw + crestY * B.slope;
  const crestOut = crestIn + B.crestWidth;
  const toe = B.outerToe;
  const z0 = SITE.shore.crestZ;
  const z1 = C.mouthZ;
  const bottom = -C.depth - 1.5;
  const headTop = B.crestWidth / 2;
  const headX = (crestIn + crestOut) / 2;
  const headBase = 24;
  const innerToe = crestIn - (crestY - bottom) * B.slope;
  // Where the armour stone stops, 3 m under water.
  const armourOut = crestOut + ((crestY + 3) / (crestY - bottom)) * (toe + 3 - crestOut);
  const mb = new MergeBuilder();
  for (const side of [-1, 1]) {
    // Core mound: two armour slopes and the crest, extruded along the channel.
    const prof: Array<[number, number]> = [
      [innerToe, bottom],
      [crestIn, crestY],
      [crestOut, crestY],
      [toe + 3, bottom],
    ];
    for (let i = 0; i < prof.length - 1; i++) {
      const [a, ay] = prof[i];
      const [b, by] = prof[i + 1];
      const pos = [side * a, ay, z0, side * b, by, z0, side * b, by, z1, side * a, ay, z0, side * b, by, z1, side * a, ay, z1];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
      geo.computeVertexNormals();
      if (side > 0) {
        // Flip the winding so the mound faces outward on both sides.
        const flip = geo.attributes.position.array as Float32Array;
        for (let k = 0; k < 18; k += 9) {
          for (let c = 0; c < 3; c++) {
            const t = flip[k + 3 + c];
            flip[k + 3 + c] = flip[k + 6 + c];
            flip[k + 6 + c] = t;
          }
        }
        geo.computeVertexNormals();
      }
      mb.add('rockCore', geo);
    }
    // Rounded head.
    const head = new THREE.CylinderGeometry(headTop, headBase + 3, crestY - bottom, 40, 1, false);
    head.scale(1, 1, B.headRadius / headBase);
    head.translate(side * headX, (crestY + bottom) / 2, z1);
    mb.add('rockCore', head);
    // Crest road.
    mb.box('concrete', side > 0 ? crestIn + 0.8 : -crestOut + 0.8, side > 0 ? crestOut - 0.8 : -crestIn - 0.8, crestY - 0.1, crestY + 0.22, z0, z1 + 4);
    // Lamp posts along the road.
    for (let z = 0; z <= z1; z += 60) {
      const x = side * (crestIn + 1.6);
      mb.box('steel', x - 0.1, x + 0.1, crestY, crestY + 7, z - 0.1, z + 0.1);
      mb.box('steel', x - 0.1, x + 0.1, crestY + 6.9, crestY + 7.05, z - 0.8, z + 0.8);
    }
    // Harbour light on the head.
    const lx = side * headX;
    mb.add('concrete', new THREE.CylinderGeometry(1.6, 2.2, 9, 20).translate(lx, crestY + 4.5, z1));
    mb.add(side > 0 ? 'lightGreen' : 'lightRed', new THREE.CylinderGeometry(0.9, 0.9, 1.6, 16).translate(lx, crestY + 9.8, z1));
    mb.add('steel', new THREE.CylinderGeometry(1.2, 1.0, 0.5, 16).translate(lx, crestY + 10.9, z1));
  }
  mats.lightGreen ??= mediumMaterial({ color: 0x1f9e6a, emissive: 0x25d58c, emissiveIntensity: 1.6, roughness: 0.4 }, false);
  mats.lightRed ??= mediumMaterial({ color: 0xa8332b, emissive: 0xff4a3a, emissiveIntensity: 1.6, roughness: 0.4 }, false);
  mb.build(mats, g, true);

  // Armour stone over both slopes and around the heads.
  const rng = new SeededRandom(9191);
  const perVariant = 6500;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc3 = new THREE.Vector3();
  const col = new THREE.Color();
  rockGeos.forEach((geo, vi) => {
    const mesh = new THREE.InstancedMesh(geo, rockMat, perVariant);
    for (let n = 0; n < perVariant; n++) {
      const side = rng.next() < 0.5 ? -1 : 1;
      const onHead = rng.next() < 0.07;
      let x: number;
      let y: number;
      let z: number;
      const t = Math.pow(rng.next(), 0.8);
      if (onHead) {
        const a = rng.next() * Math.PI;
        const r = headTop + (1 - t) * 0 + t * headBase;
        x = side * headX + Math.cos(a) * r * 0.55;
        z = z1 + Math.sin(a) * r * (B.headRadius / headBase);
        y = crestY - t * (crestY + 3);
      } else {
        z = rng.range(SITE.shore.toeZ, z1);
        const inner = rng.next() < 0.45;
        const a = inner ? THREE.MathUtils.lerp(crestIn, hw, t) : THREE.MathUtils.lerp(crestOut, armourOut, t);
        x = side * a;
        y = crestY - t * (crestY + 3);
        // Keep the slope clear under the collector platform.
        if (side > 0 && z > 54 && z < 96) y -= 9;
      }
      const sc = rng.range(1.1, 2.3) * (vi === 2 ? 0.85 : 1);
      p.set(x, y + sc * 0.3, z);
      e.set(rng.next() * Math.PI, rng.next() * Math.PI, rng.next() * Math.PI);
      q.setFromEuler(e);
      sc3.set(sc * rng.range(0.9, 1.3), sc * rng.range(0.7, 1.0), sc * rng.range(0.9, 1.25));
      m.compose(p, q, sc3);
      mesh.setMatrixAt(n, m);
      const shade = rng.range(0.78, 1.08);
      col.setRGB(shade, shade * rng.range(0.96, 1.0), shade * rng.range(0.9, 0.98));
      mesh.setColorAt(n, col);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `breakwater-armour-${vi}`;
    g.add(mesh);
  });
  return g;
}

function buildIntake(mats: Record<string, THREE.Material>): THREE.Group {
  const I = SITE.intake;
  const g = new THREE.Group();
  g.name = 'intake';
  g.userData.pick = 'intake';
  const bottom = -seabedDepth(I.x0, I.mouthZ) - 1.2;
  const deck = I.deckY;
  const mb = new MergeBuilder();
  // Side walls.
  mb.box('concrete', I.x0 - 2.4, I.x0, bottom, deck + 0.6, I.backZ, I.mouthZ + 0.4);
  mb.box('concrete', I.x1, I.x1 + 2.4, bottom, deck + 0.6, I.backZ, I.mouthZ + 0.4);
  // Piers between bays (with rounded noses).
  const bayW = (I.x1 - I.x0 - (I.bays - 1) * I.pierWidth) / I.bays;
  const bays: Array<[number, number]> = [];
  let x = I.x0;
  for (let b = 0; b < I.bays; b++) {
    bays.push([x, x + bayW]);
    x += bayW;
    if (b < I.bays - 1) {
      mb.box('concrete', x, x + I.pierWidth, bottom, deck, I.mouthZ - 16, I.mouthZ - 0.2);
      const nose = new THREE.CylinderGeometry(I.pierWidth / 2, I.pierWidth / 2, deck - bottom, 16, 1, false, -Math.PI / 2, Math.PI);
      nose.rotateY(Math.PI);
      nose.translate(x + I.pierWidth / 2, (deck + bottom) / 2, I.mouthZ - 0.2);
      mb.add('concrete', nose);
      x += I.pierWidth;
    }
  }
  // Sill, lintel (skimmer) beam and deck slab.
  mb.box('concreteDark', I.x0, I.x1, bottom, -I.sillDepth, I.mouthZ - 2.0, I.mouthZ + 0.2);
  mb.box('concrete', I.x0, I.x1, 1.9, deck, I.mouthZ - 1.6, I.mouthZ + 0.1);
  mb.box('concrete', I.x0 - 2.4, I.x1 + 2.4, deck, deck + 0.6, I.backZ, I.mouthZ + 0.4);
  // Interior back wall of the forebay.
  mb.box('concreteDark', I.x0, I.x1, bottom, deck, I.mouthZ - 22, I.mouthZ - 21);
  // Screen house.
  const hz0 = I.mouthZ - 46;
  const hz1 = I.mouthZ - 17;
  mb.box('cladding', I.x0 + 1.5, I.x1 - 1.5, deck + 0.6, deck + 8.2, hz0, hz1);
  mb.box('claddingBlue', I.x0 + 1.2, I.x1 - 1.2, deck + 8.2, deck + 8.8, hz0 - 0.3, hz1 + 0.3);
  for (let wx = I.x0 + 3; wx < I.x1 - 3; wx += 4.2) mb.box('glass', wx, wx + 2.8, deck + 3.2, deck + 5.4, hz1, hz1 + 0.08);
  mb.box('glass', I.x0 + 2.5, I.x1 - 2.5, deck + 6.3, deck + 7.3, hz1, hz1 + 0.08);
  mb.box('steel', I.x0 + 6, I.x0 + 10, deck + 8.8, deck + 10.2, hz0 + 6, hz0 + 10);
  mb.box('steel', I.x1 - 12, I.x1 - 7, deck + 8.8, deck + 9.9, hz0 + 4, hz0 + 9);
  // Gantry crane over the screen bays.
  const railZ0 = I.mouthZ - 2.2;
  const railZ1 = I.mouthZ - 14.5;
  mb.box('steel', I.x0 - 2, I.x1 + 2, deck + 0.6, deck + 0.85, railZ0 - 0.2, railZ0 + 0.2);
  mb.box('steel', I.x0 - 2, I.x1 + 2, deck + 0.6, deck + 0.85, railZ1 - 0.2, railZ1 + 0.2);
  const cx = I.x0 + 13;
  for (const z of [railZ0, railZ1]) {
    mb.box('yellow', cx - 0.35, cx + 0.35, deck + 0.85, deck + 7.5, z - 0.35, z + 0.35);
    mb.box('yellow', cx + 5.65, cx + 6.35, deck + 0.85, deck + 7.5, z - 0.35, z + 0.35);
  }
  mb.box('yellow', cx - 0.5, cx + 6.5, deck + 7.5, deck + 8.4, railZ1 - 0.5, railZ0 + 0.5);
  mb.box('yellow', cx + 2.2, cx + 4.0, deck + 6.0, deck + 7.5, railZ0 - 6.5, railZ0 - 4.5);
  // Railings along the front and sides.
  const rail = new THREE.CylinderGeometry(0.035, 0.035, 1.1, 5);
  for (let rx = I.x0 - 2.2; rx <= I.x1 + 2.2; rx += 1.6) mb.add('yellow', rail.clone().translate(rx, deck + 0.6 + 0.55, I.mouthZ + 0.25));
  mb.box('yellow', I.x0 - 2.3, I.x1 + 2.3, deck + 1.62, deck + 1.7, I.mouthZ + 0.2, I.mouthZ + 0.3);
  mb.box('yellow', I.x0 - 2.3, I.x1 + 2.3, deck + 1.1, deck + 1.16, I.mouthZ + 0.2, I.mouthZ + 0.3);
  mb.build(mats, g, true);

  // Coarse bar racks across every bay (instanced).
  const barGeo = new THREE.BoxGeometry(0.09, 1.9 - -I.sillDepth, 0.16);
  barGeo.translate(0, (1.9 + -I.sillDepth) / 2, 0);
  const barsPerBay = Math.floor(bayW / 0.24);
  const bars = new THREE.InstancedMesh(barGeo, mats.steel, barsPerBay * bays.length);
  const bm = new THREE.Matrix4();
  let bi = 0;
  for (const [b0, b1] of bays) {
    for (let k = 0; k < barsPerBay; k++) {
      const bx = b0 + ((k + 0.5) / barsPerBay) * (b1 - b0);
      bm.makeTranslation(bx, 0, I.mouthZ - 0.35);
      bars.setMatrixAt(bi++, bm);
    }
  }
  bars.castShadow = true;
  bars.receiveShadow = true;
  bars.userData.pick = 'intake';
  g.add(bars);

  // Travelling band screens behind the racks (wire-mesh panels in steel frames).
  const meshTex = makeScreenMeshTexture(64);
  meshTex.repeat.set(bayW / 0.5, (deck + I.sillDepth) / 0.5);
  const screenMat = applyMedium(
    new THREE.MeshStandardMaterial({ map: meshTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5, color: 0xc8d2d8 }),
    { caustics: true, key: 'screen' },
  );
  const frame = new MergeBuilder();
  for (const [b0, b1] of bays) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(b1 - b0 - 0.4, deck + I.sillDepth - 0.2), screenMat);
    panel.position.set((b0 + b1) / 2, (deck - I.sillDepth) / 2, I.mouthZ - 5.5);
    panel.userData.pick = 'intake';
    g.add(panel);
    frame.box('steel', b0 + 0.05, b0 + 0.3, -I.sillDepth, deck, I.mouthZ - 5.7, I.mouthZ - 5.3);
    frame.box('steel', b1 - 0.3, b1 - 0.05, -I.sillDepth, deck, I.mouthZ - 5.7, I.mouthZ - 5.3);
    frame.box('steel', b0, b1, deck - 0.4, deck, I.mouthZ - 5.8, I.mouthZ - 5.2);
  }
  frame.build(mats, g, true);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.userData.pick = 'intake';
  });
  return g;
}

function buildPlantBackdrop(mats: Record<string, THREE.Material>): THREE.Group {
  const g = new THREE.Group();
  g.name = 'plant-backdrop';
  const mb = new MergeBuilder();
  const y0 = SITE.shore.landY;
  // Generic industrial blocks (schematic — not facility data).
  const blocks: Array<[number, number, number, number, number, string]> = [
    [10, 70, -112, -92, 7, 'cladding'],
    [-70, 40, -260, -205, 16, 'cladding'],
    [60, 150, -300, -250, 12, 'claddingBlue'],
    [-210, -130, -330, -280, 10, 'cladding'],
    [180, 250, -230, -195, 9, 'claddingBlue'],
    [-300, -240, -250, -215, 8, 'cladding'],
    [-120, -80, -170, -150, 6, 'claddingBlue'],
  ];
  for (const [x0, x1, z0, z1, h, mat] of blocks) {
    mb.box(mat, x0, x1, y0, y0 + h, z0, z1);
    mb.box('steel', x0 + 2, x1 - 2, y0 + h, y0 + h + 0.8, z0 + 2, z1 - 2);
  }
  // Tanks.
  for (const [tx, tz, r, h] of [
    [-170, -205, 8, 10],
    [-150, -205, 8, 10],
    [215, -150, 6, 8],
    [231, -150, 6, 8],
  ] as const) {
    mb.add('cladding', new THREE.CylinderGeometry(r, r, h, 28).translate(tx, y0 + h / 2, tz));
  }
  // Pipe rack.
  mb.box('steel', 20, 160, y0 + 4, y0 + 4.5, -132, -130);
  for (let px = 20; px <= 160; px += 10) mb.box('steel', px, px + 0.4, y0, y0 + 4, -132, -131.6);
  mb.build(mats, g, true);
  return g;
}

