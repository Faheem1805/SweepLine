import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useApp, type UIState, type SelectionKind } from '../app/store';
import { ASSUMPTIONS } from '../config/assumptions';
import { basinX, SITE } from '../config/site';
import { S_APPROACHING, S_TRANSFERRED } from '../simulation/Agent';
import { NETS, pointOnNet } from '../simulation/geometry';
import type { SimController, SimSnapshot } from '../simulation/SimController';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import type { EngineKind } from '../simulation/types';
import { AssetLoader } from './assets/AssetLoader';
import { adaptExternalJellyGeometry, buildJellyfishGeometry, FAR_LOD, NEAR_LOD } from './assets/procedural/jellyfishGeometry';
import { CameraRig, type CameraPreset } from './cameras/CameraRig';
import { buildCoast } from './environment/Coast';
import { Seabed } from './environment/Seabed';
import { SHARED } from './environment/shaderChunks';
import { SkyDome } from './environment/Sky';
import { UnderwaterFx } from './environment/Underwater';
import { Water } from './environment/Water';
import { Annotations } from './systems/Annotations';
import { CollectorSystem } from './systems/CollectorSystem';
import { FishSystem } from './systems/FishSystem';
import { CurrentField } from './systems/CurrentField';
import { jellyShader, JellyfishSystem } from './systems/JellyfishSystem';
import { LabelSystem, type LabelViewport } from './systems/LabelSystem';
import { NetSystem } from './systems/NetSystem';
import { PostPipeline, type ViewState } from './post/PostPipeline';
import { iconSvg } from '../components/ui/icons';
import { ReleaseSystem } from './systems/ReleaseSystem';
import { SonarSystem } from './systems/SonarSystem';

const WORLDS: EngineKind[] = ['baseline', 'sweepline'];
/** Time constant (real seconds) of the shown sea state following the simulated wave height. */
const SEA_STATE_TAU = 1.6;
/** Centre of the shadow map: the channel. */
const SHADOW_FOCUS = new THREE.Vector3(240, 0, 180);

/**
 * Owns the WebGL renderer and the 3D digital twin. One renderer serves both the single view and the
 * split Without | With compare view (scissor viewports). Simulation state is read straight from the
 * engines each frame.
 */
export class SceneManager {
  readonly container: HTMLDivElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly rig: CameraRig;
  readonly labels = new LabelSystem();
  private readonly ctrl: SimController;
  private readonly sky: SkyDome;
  private readonly water: Water;
  private readonly underwaterFx = new UnderwaterFx();
  private readonly nets = new NetSystem(NETS);
  private readonly collector = new CollectorSystem(NETS);
  private readonly fish = new FishSystem(ASSUMPTIONS.bycatch.fish, ASSUMPTIONS.bycatch.turtles);
  private readonly release = new ReleaseSystem();
  private readonly sonar = new SonarSystem();
  private readonly annotations = new Annotations();
  private readonly sweepGroup = new THREE.Group();
  private readonly coast: ReturnType<typeof buildCoast>;
  private jellies!: Record<EngineKind, JellyfishSystem>;
  private readonly flows: Record<EngineKind, CurrentField>;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sunBase: number;
  private slot: HTMLElement | null = null;
  private readonly resizeObs: ResizeObserver;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private ui: UIState;
  private infoTimer = 0;
  private bloomTimer = 0;
  private captureTimer = 0;
  private readonly bloomAnchor = new THREE.Vector3(-300, 1, 640);
  private bloomAnchorValid = false;
  private readonly raycaster = new THREE.Raycaster();
  private pointerDown: { x: number; y: number } | null = null;
  private shadowFrames = 0;
  private shadowTimer = 0;
  private shadowCompare = false;
  private shadowWorld: EngineKind = 'sweepline';
  private realTime = 0;
  private lastMarkerSeq = -1;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly post: PostPipeline;
  private readonly view: ViewState = { underwater: false, targetDistance: 100, pitchDeg: 30, focus: new THREE.Vector3() };
  readonly assets = new AssetLoader();
  /** Skip drawing (simulation visuals still update) — set while an opaque overlay covers the view. */
  renderSuspended = false;
  private precompiling: Promise<void> | null = null;
  /** Wave height (Hs) the scene shows, easing toward the simulated value (-1 until the first frame). */
  private seaState = -1;
  /** Night in the scene, 0..1, easing toward the run's setting. */
  private night = 0;

  constructor(ctrl: SimController) {
    this.ctrl = ctrl;
    this.ui = useApp.getState().ui;
    this.container = document.createElement('div');
    this.container.className = 'sl-viewport-root';
    // No canvas MSAA: the scene is drawn into the post-processing buffers (2× MSAA, then SMAA) and only a full-screen pass reaches the canvas.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.localClippingEnabled = true;
    this.renderer.domElement.className = 'sl-canvas';
    this.container.appendChild(this.renderer.domElement);
    this.container.appendChild(this.labels.layer);

    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.3, 16000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxDistance = 2400;
    this.controls.minDistance = 2;
    this.controls.zoomSpeed = 0.9;
    this.controls.rotateSpeed = 0.6;
    this.controls.panSpeed = 0.8;
    this.controls.screenSpacePanning = true;
    this.rig = new CameraRig(this.camera, this.controls);
    this.rig.onPresetChange = (p) => {
      if (p === 'free' && useApp.getState().ui.camera !== 'free') useApp.getState().setUI({ camera: 'free' });
    };

    // ------------------------------------------------ lighting & sky
    this.sky = new SkyDome(this.renderer);
    this.scene.add(this.sky.mesh);
    SHARED.uHazeColor.value.copy(this.sky.horizon);
    SHARED.uHazeDensity.value = 0.00022;
    this.scene.environment = this.sky.envMap;
    this.scene.environmentIntensity = 0.6;
    this.sunBase = 2.65;
    this.sun = new THREE.DirectionalLight(0xffeed4, this.sunBase);
    const sd = SHARED.uSunDir.value;
    this.sun.position.set(SHADOW_FOCUS.x + sd.x * 1100, sd.y * 1100, SHADOW_FOCUS.z + sd.z * 1100);
    this.sun.target.position.copy(SHADOW_FOCUS);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -470;
    sc.right = 470;
    sc.top = 470;
    sc.bottom = -470;
    sc.near = 100;
    sc.far = 2400;
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 1.2;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x9fcbed, 0x84714f, 0.9);
    this.scene.add(this.hemi);

    // ------------------------------------------------ environment
    this.water = new Water(this.sky.cubeTarget.texture);
    this.scene.add(this.water.mesh, this.water.depthCap);
    this.scene.add(new Seabed().group);
    this.coast = buildCoast();
    this.scene.add(this.coast.group);
    this.scene.add(this.underwaterFx.group);

    // ------------------------------------------------ SweepLine installation (its world only)
    this.sweepGroup.name = 'sweepline-installation';
    this.sweepGroup.add(this.nets.group, this.collector.group, this.release.group, this.fish.group);
    this.scene.add(this.sweepGroup);
    this.scene.add(this.sonar.mesh);
    this.scene.add(this.annotations.group);

    // ------------------------------------------------ agents and flow (one per world)
    this.buildJellies(null, null);
    this.flows = {
      baseline: new CurrentField('flow-baseline'),
      sweepline: new CurrentField('flow-sweepline'),
    };
    for (const w of WORLDS) this.scene.add(this.flows[w].group);

    this.setupLabels();
    this.rig.snap('aerial');

    // ------------------------------------------------ post-processing
    this.post = new PostPipeline(this.renderer, this.scene, this.camera, this.sun);
    this.water.backdropSource = () => this.post.sceneTarget;
    this.post.beforeRender = (target) => this.water.prepare(this.renderer, target);

    // ------------------------------------------------ interaction
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => (this.pointerDown = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      if (!this.pointerDown) return;
      const moved = Math.hypot(e.clientX - this.pointerDown.x, e.clientY - this.pointerDown.y);
      this.pointerDown = null;
      if (moved < 5) this.pick(e);
    });
    // Resizing clears the canvas: draw the new frame before it is painted, so no black frame shows.
    this.resizeObs = new ResizeObserver(() => {
      if (this.resize() && !this.renderSuspended) this.frame(0);
    });

    useApp.subscribe((s, prev) => {
      if (s.ui !== prev.ui) this.onUI(s.ui, prev.ui);
      if (s.snap !== prev.snap && s.snap) this.onSnapshot(s.snap);
    });
    this.applyFlowView(this.ui.flowView);
    this.labels.onPick = (kind) => this.select({ kind: kind as SelectionKind });
    void this.loadAssets();
  }

  // ------------------------------------------------------------------ assets

  private buildJellies(nearGeo: THREE.BufferGeometry | null, map: THREE.Texture | null): void {
    const near = nearGeo ?? buildJellyfishGeometry(NEAR_LOD);
    const far = buildJellyfishGeometry(FAR_LOD);
    const mat = jellyShader(map);
    if (this.jellies) for (const w of WORLDS) this.scene.remove(this.jellies[w].group);
    this.jellies = {
      baseline: new JellyfishSystem(near, far, mat, this.ctrl.baseline.pool.capacity, 'jellies-baseline'),
      sweepline: new JellyfishSystem(near, far, mat, this.ctrl.sweepline.pool.capacity, 'jellies-sweepline'),
    };
    for (const w of WORLDS) this.scene.add(this.jellies[w].group);
  }

  private async loadAssets(): Promise<void> {
    const jelly = await this.assets.load('jellyfish');
    if (jelly) {
      const ex = AssetLoader.extractGeometry(jelly);
      if (ex) this.buildJellies(adaptExternalJellyGeometry(ex.geometry), ex.map);
    }
    this.shadowFrames = 0;
  }

  // ------------------------------------------------------------------ DOM attachment

  attach(slot: HTMLElement): void {
    if (this.slot === slot) return;
    this.slot = slot;
    slot.prepend(this.container);
    this.resizeObs.disconnect();
    this.resizeObs.observe(slot);
    this.resize();
  }

  detach(slot: HTMLElement): void {
    if (this.slot !== slot) return;
    this.resizeObs.disconnect();
    if (this.container.parentElement === slot) slot.removeChild(this.container);
    this.slot = null;
  }

  get attached(): boolean {
    return this.slot !== null;
  }

  /** Re-measure the host slot (ResizeObserver does not fire while the page is hidden). */
  forceResize(): void {
    this.resize();
  }

  /** Compile the scene's shaders in the background, so the first frames do not stall on compilation. */
  precompile(): Promise<void> {
    if (!this.precompiling) {
      const r = this.renderer;
      const prev = r.getRenderTarget();
      r.setRenderTarget(this.post.sceneTarget);
      this.precompiling = r.compileAsync(this.scene, this.camera).then(() => undefined);
      r.setRenderTarget(prev);
    }
    return this.precompiling;
  }

  /** Match the canvas to the slot; false when its size has not changed (resizing would clear it). */
  private resize(): boolean {
    if (!this.slot) return false;
    const w = Math.max(1, this.slot.clientWidth);
    const h = Math.max(1, this.slot.clientHeight);
    if (w === this.width && h === this.height) return false;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    return true;
  }

  // ------------------------------------------------------------------ store sync

  private onUI(ui: UIState, prev: UIState): void {
    this.ui = ui;
    if (ui.compare !== prev.compare) {
      if (ui.compare) this.rig.goTo('compare', 1.6);
      else if (ui.camera !== 'free') this.rig.goTo(ui.camera as Exclude<CameraPreset, 'free'>, 1.6);
    }
    // The lift view runs in real time while the elevator runs, so a jellyfish can be followed bucket by bucket.
    if (ui.camera === 'lift' && prev.camera !== 'lift' && this.ctrl.sweepline.transfer?.lift.turning && this.ctrl.speed > 1) this.ctrl.setSpeed(1);
    if ((ui.camera !== prev.camera || ui.cameraNonce !== prev.cameraNonce) && ui.camera !== 'free') {
      if (!(ui.compare && ui.camera === prev.camera)) this.rig.goTo(ui.camera as Exclude<CameraPreset, 'free'>, 1.9);
    }
    if (ui.flowView !== prev.flowView) this.applyFlowView(ui.flowView);
    this.labels.enabled = ui.labels;
    this.labels.topReserved = 10;
    this.labels.page = ui.page;
    for (const w of WORLDS) this.jellies[w].selectedId = ui.selection?.kind === 'jelly' && ui.selection.engine === w ? ui.selection.agentId ?? -1 : -1;
    if (!ui.follow || ui.selection?.kind !== 'jelly') this.rig.followTarget = null;
  }

  private applyFlowView(on: boolean): void {
    SHARED.uFlowDim.value = on ? 1 : 0;
    for (const w of WORLDS) {
      this.flows[w].setFlowMode(on);
      this.jellies[w].setStateColors(on);
    }
    this.annotations.captureLine.visible = on;
  }

  private onSnapshot(s: SimSnapshot): void {
    const a = s.nets[0];
    const netBody = a.torn > 0 ? 'Panel out, net B catching' : a.relief > 0 ? 'Relief open' : `${s.sweepline.onNetT[0].toFixed(1)} t on the net · ${(a.head * 1000).toFixed(1)} mm head`;
    this.labels.setContent('net', 'Net A', netBody, a.torn > 0 || a.relief > 0 ? 'red' : a.loadFraction > 0.5 ? 'amber' : 'default');
    const collectorBody = s.transfer.path === 'NONE' ? (s.transfer.primary === 'FAULT' ? 'Elevator stopped' : 'Elevator not armed') : s.lift.speed > 0.02 ? `Elevator running · ${s.sweepline.collectTph.toFixed(1)} t/h` : 'Elevator idle: funnel clear';
    this.labels.setContent('collector', 'Collector', collectorBody, s.transfer.path === 'NONE' ? 'amber' : 'teal');
    this.setLiftLabels(s);
    const body = (m: typeof s.baseline) => `${m.screenTph.toFixed(1)} t/h · ${m.screenStatus === 'CLEAR' ? 'clear' : m.screenBacklogT.toFixed(1) + ' t backlog'}`;
    const tone = (m: typeof s.baseline) => (m.screenStatus === 'CLEAR' ? 'teal' : m.screenStatus === 'LOADED' ? 'amber' : 'red');
    this.labels.setContent('intake', 'Plant screens', body(s.sweepline), tone(s.sweepline));
    this.labels.setContent('intake-base', 'Plant screens', body(s.baseline), tone(s.baseline));
    this.labels.setContent('intake-left', 'Plant screens', body(s.baseline), tone(s.baseline));
    this.labels.setContent('intake-right', 'Plant screens', body(s.sweepline), tone(s.sweepline));
  }

  private liftWasTurning = false;

  /** Section-by-section labels on the elevator, for the close-up lift view. */
  private setLiftLabels(s: SimSnapshot): void {
    const a = s.lift;
    // Watching an idle elevator at speed: drop to real time the moment it starts.
    const turningNow = a.speed > 0.02;
    if (turningNow && !this.liftWasTurning && this.ui.camera === 'lift' && this.ctrl.speed > 1) this.ctrl.setSpeed(1);
    this.liftWasTurning = turningNow;
    const kg = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)} t` : `${Math.round(v)} kg`);
    const on = turningNow;
    this.labels.setContent('lift-funnel', '1 · Funnel', `${kg(a.funnelKg)} here, from both nets · sensor ${a.seen ? 'sees jellyfish' : 'sees none'}`, a.seen ? 'teal' : 'default');
    this.labels.setContent('lift-hopper', '2 · Hopper', a.hold ? 'Turtle in the hopper: elevator waits' : on || a.hopperKg > 0 ? `${kg(a.hopperKg)} drawn to the scoop` : 'Waiting: elevator idle', a.hold ? 'amber' : on ? 'teal' : 'default');
    this.labels.setContent(
      'lift-screw',
      `3 · Buckets (${a.drive} drive)`,
      on ? `${a.chainMs.toFixed(1)} m/s · ${kg(a.bucketsKg)} riding up in water, up to ${Math.round(a.bucketKg)} kg a bucket` : a.on ? 'Starting' : 'Stopped: nothing to lift',
      on ? 'teal' : 'default',
    );
    this.labels.setContent('lift-launder', '4 · Head and chute', `${kg(a.chuteKg)} tipping into the chute`, a.chuteKg > 0 ? 'teal' : 'default');
    this.labels.setContent('lift-line', '5 · Head tank and line', `${kg(a.inLineKg)} in the 2.2 km line · ${Math.round(a.powerKW)} kW now`, a.inLineKg > 0 ? 'teal' : 'default');
  }

  private setupLabels(): void {
    const above = 'above' as const;
    const L = NETS[0];
    this.labels.add({
      id: 'net',
      title: 'Net A',
      icon: iconSvg('curtain', 22),
      anchor: () => {
        const p = pointOnNet(L, L.length * 0.36);
        return this.tmpAnchor('net', p.x, 6, p.z);
      },
      viewports: ['single'],
      view: above,
      pick: 'net',
    });
    this.labels.add({
      id: 'collector',
      title: 'Collector',
      icon: iconSvg('throat', 22),
      anchor: () => this.collector.anchor,
      viewports: ['single'],
      view: above,
      minDistance: 70,
      pick: 'collector',
    });
    const K = this.collector.sections;
    for (const [id, title, anchor] of [
      ['lift-funnel', '1 · Funnel', K.funnel],
      ['lift-hopper', '2 · Hopper', K.hopper],
      ['lift-screw', '3 · Buckets', K.screw],
      ['lift-launder', '4 · Head and chute', K.launder],
      ['lift-line', '5 · Head tank and line', K.tank],
    ] as const) {
      this.labels.add({ id, title, anchor: () => anchor, viewports: ['single'], view: above, maxDistance: 70, pick: 'collector' });
    }
    const intakeAnchor = new THREE.Vector3(basinX(SITE.basin.units[1]), SITE.intake.deckY + 16, SITE.basin.wallZ);
    for (const [id, vp] of [
      ['intake', ['single']],
      ['intake-base', ['base']],
      ['intake-left', ['left']],
      ['intake-right', ['right']],
    ] as const) {
      this.labels.add({
        id,
        title: 'Plant screens',
        icon: iconSvg('intake', 22),
        anchor: () => intakeAnchor,
        viewports: [...vp] as LabelViewport[],
        view: above,
        pick: 'intake',
      });
    }
  }

  private readonly anchorCache = new Map<string, THREE.Vector3>();
  private tmpAnchor(key: string, x: number, y: number, z: number): THREE.Vector3 {
    let v = this.anchorCache.get(key);
    if (!v) {
      v = new THREE.Vector3();
      this.anchorCache.set(key, v);
    }
    return v.set(x, y, z);
  }

  // ------------------------------------------------------------------ selection

  private select(sel: { kind: SelectionKind; engine?: EngineKind; agentId?: number }): void {
    const ui = useApp.getState().ui;
    if (sel.kind === 'jelly' && sel.engine && sel.agentId !== undefined) this.ctrl.select(sel.engine, sel.agentId);
    else this.ctrl.select('sweepline', null);
    useApp.getState().setUI({ selection: sel, follow: sel.kind === 'jelly' ? ui.follow : false });
  }

  private pick(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    let x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let world: EngineKind = this.ui.displayed;
    let w = rect.width;
    if (this.ui.compare) {
      const half = rect.width / 2;
      world = x < half ? 'baseline' : 'sweepline';
      if (x >= half) x -= half;
      w = half;
      this.camera.aspect = half / rect.height;
      this.camera.updateProjectionMatrix();
    }
    const ndc = new THREE.Vector2((x / w) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets: THREE.Object3D[] = [this.coast.intake];
    const jel = this.jellies[world];
    jel.near.mesh.computeBoundingSphere();
    jel.far.mesh.computeBoundingSphere();
    targets.push(jel.near.mesh, jel.far.mesh);
    if (world === 'sweepline') targets.push(...this.nets.pickables(), this.collector.group, this.release.group);
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      if (h.object === jel.near.mesh || h.object === jel.far.mesh) {
        const slot = jel.slotFor(h.object, h.instanceId ?? -1);
        const engine = this.ctrl.engine(world);
        if (slot >= 0 && engine.pool.state[slot] !== 0) {
          this.select({ kind: 'jelly', engine: world, agentId: engine.pool.id[slot] });
          return;
        }
        continue;
      }
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o && o.userData.pick) {
        this.select({ kind: o.userData.pick as SelectionKind });
        return;
      }
    }
    this.ctrl.select('sweepline', null);
    useApp.getState().setUI({ selection: null, follow: false });
  }

  // ------------------------------------------------------------------ per-frame

  private configureForCamera(cam: THREE.Camera): boolean {
    const underwater = cam.position.y < 0;
    this.water.configureForCamera(underwater);
    this.sky.follow(cam);
    this.underwaterFx.update(underwater, this.pixelRatio);
    return underwater;
  }

  private setWorld(world: EngineKind): void {
    this.sweepGroup.visible = world === 'sweepline';
    for (const w of WORLDS) {
      this.jellies[w].group.visible = w === world;
      this.flows[w].group.visible = w === world;
    }
    this.annotations.setWorld(world);
  }

  /** Night: the sun goes, the sky darkens, and the lamps, sonar and bloom carry the picture. */
  private updateNight(dt: number): void {
    const target = this.ctrl.params.night ? 1 : 0;
    if (Math.abs(this.night - target) < 0.001 && this.night === target) return;
    this.night += Math.sign(target - this.night) * Math.min(Math.abs(target - this.night), dt / 1.4);
    const k = 1 - this.night;
    this.sun.intensity = this.sunBase * (0.03 + 0.97 * k);
    this.hemi.intensity = 0.9 * (0.1 + 0.9 * k);
    this.scene.environmentIntensity = 0.6 * (0.07 + 0.93 * k);
    SHARED.uHazeColor.value.copy(this.sky.horizon).multiplyScalar(0.06 + 0.94 * k);
    SHARED.uSunColor.value.setRGB(1, 0.93, 0.8).multiplyScalar(0.08 + 0.92 * k);
    this.sky.setBrightness(0.035 + 0.965 * k);
    this.water.setSkyBright(0.06 + 0.94 * k);
  }

  frame(dtReal: number): void {
    const dt = Math.min(dtReal, 0.1);
    this.realTime += dt;
    SHARED.uTime.value = this.realTime;
    SHARED.uWaveTime.value = this.realTime;
    const ctrl = this.ctrl;
    const params = ctrl.params;
    this.seaState = this.seaState < 0 ? params.waveHeight : this.seaState + (params.waveHeight - this.seaState) * (1 - Math.exp(-dt / SEA_STATE_TAU));
    const hs = this.seaState;
    SHARED.uWaveAmp.value = hs * 0.5;
    const simDt = ctrl.ready && !ctrl.paused ? dt * ctrl.speed : 0;
    const sw = ctrl.sweepline;
    const tr = sw.transfer!;
    this.updateNight(dt);

    // A run restart resets the engines' marker sequence — forget stale flashes.
    if (sw.markerSeq < this.lastMarkerSeq) this.annotations.reset();
    this.lastMarkerSeq = sw.markerSeq;

    this.nets.update(sw.nets, this.realTime, hs, this.ui.flowView, this.camera, sw.jets.firing);
    const flowFraction = Math.min(1, tr.lineFlow() * (0.35 + (tr.processedEMA / Math.max(tr.capacityRate(), 1e-3)) * 4));
    this.collector.update(tr, flowFraction, this.realTime);
    this.fish.update(sw.bycatch, ctrl.alpha, this.realTime);
    this.release.update(sw.releaseEMA, tr.armed, this.realTime, this.realTime, hs);
    this.sonar.update((this.ui.flowView || params.night) && !ctrl.failures.sonarLoss, dt);

    const worlds: EngineKind[] = this.ui.compare ? ['baseline', 'sweepline'] : [this.ui.displayed];
    for (const w of worlds) this.flows[w].update(ctrl.engine(w), simDt, dt);

    this.annotations.ingestMarkers(ctrl.baseline, this.realTime);
    this.annotations.ingestMarkers(sw, this.realTime);
    this.annotations.update(this.realTime, this.camera);
    this.captureTimer -= dt;
    if (this.ui.flowView && this.captureTimer <= 0) {
      this.captureTimer = 0.7;
      this.annotations.updateCaptureLine(sw.flow);
    }

    this.bloomTimer -= dt;
    if (this.bloomTimer <= 0) {
      this.bloomTimer = 0.5;
      this.updateBloomAnchor(ctrl.engine(this.ui.compare ? 'sweepline' : this.ui.displayed));
    }

    // Selection marker and follow.
    let selPos: THREE.Vector3 | null = null;
    const sel = this.ui.selection;
    if (sel?.kind === 'jelly' && sel.engine && sel.agentId !== undefined) {
      const e = ctrl.engine(sel.engine);
      const slot = e.pool.findById(sel.agentId);
      if (slot >= 0 && e.pool.state[slot] !== S_TRANSFERRED) {
        selPos = this.tmpV.set(e.pool.px[slot], e.pool.py[slot], e.pool.pz[slot]);
        if (this.ui.follow) this.rig.followTarget = selPos.clone();
      } else this.rig.followTarget = null;
    }
    this.annotations.setSelection(selPos, this.camera);

    this.rig.update(dt);
    if (!this.slot || this.renderSuspended) return;
    this.adaptResolution(dtReal, ctrl.ready);
    this.gpuBegin();

    // Static shadow map: refresh for the first few frames, quickly while panels move, else about once a second.
    this.shadowTimer -= dt;
    let refreshShadows = this.ui.compare !== this.shadowCompare || this.ui.displayed !== this.shadowWorld;
    this.shadowCompare = this.ui.compare;
    this.shadowWorld = this.ui.displayed;
    if (this.shadowFrames < 3) {
      refreshShadows = true;
      this.shadowFrames++;
    } else if (this.shadowTimer <= 0 && sw.nets.some((n) => n.arming || n.reliefFraction > 0)) {
      // The shadow map is static: it is redrawn only while net panels move (going in, relief dipping),
      // not on a timer, which used to cost a visible hitch every second.
      refreshShadows = true;
      this.shadowTimer = 0.25;
    }
    if (refreshShadows && !this.ui.compare) this.renderer.shadowMap.needsUpdate = true;

    const underwater = this.configureForCamera(this.camera);
    this.labels.beginFrame();
    this.post.configure(this.viewState(underwater));
    if (this.ui.compare) {
      const half = Math.floor(this.width / 2);
      this.labels.setCompact(half < 640);
      this.camera.aspect = half / this.height;
      this.camera.updateProjectionMatrix();
      if (this.width !== half * 2) {
        this.renderer.setRenderTarget(null);
        this.renderer.clear();
      }
      for (const [i, w] of (['baseline', 'sweepline'] as EngineKind[]).entries()) {
        const x0 = i === 0 ? 0 : this.width - half;
        this.setWorld(w);
        this.jellies[w].alpha = ctrl.alpha;
        this.jellies[w].update(ctrl.engine(w), this.camera);
        if (i === 0 && refreshShadows) this.renderer.shadowMap.needsUpdate = true;
        this.post.render({ x: x0, y: 0, width: half, height: this.height }, dt, 0.5);
        this.labels.place(this.camera, i === 0 ? 'left' : 'right', x0, half, this.height, underwater);
      }
    } else {
      const w = this.ui.displayed;
      this.labels.setCompact(true);
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.setWorld(w);
      this.jellies[w].alpha = ctrl.alpha;
      this.jellies[w].update(ctrl.engine(w), this.camera);
      this.post.render({ x: 0, y: 0, width: this.width, height: this.height }, dt);
      this.labels.place(this.camera, w === 'sweepline' ? 'single' : 'base', 0, this.width, this.height, underwater);
    }
    this.gpuEnd();
    this.labels.endFrame();

    this.infoTimer -= dt;
    if (this.infoTimer <= 0) {
      this.infoTimer = 0.25;
      this.updateLabelObstacles();
      const t = this.controls.target;
      const dx = t.x - this.camera.position.x;
      const dz = t.z - this.camera.position.z;
      const heading = (((SITE.bearingOfPlusX + (Math.atan2(dz, dx) * 180) / Math.PI) % 360) + 360) % 360;
      const ui = useApp.getState().ui;
      const depth = Math.max(0, -this.camera.position.y);
      if (ui.underwater !== underwater || Math.abs(ui.cameraDepth - depth) > 0.15 || Math.abs(ui.cameraHeading - heading) > 2) {
        useApp.getState().setUI({ underwater, cameraDepth: depth, cameraHeading: heading });
      }
    }
  }

  private frameEMA = 1 / 60;
  private slowFor = 0;
  private fastFor = 0;
  /** GPU time of the 3D view (ms, smoothed), from a timer query where the browser has one, else -1. */
  gpuMs = -1;
  private gpuExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null | undefined;
  private readonly gpuQueue: WebGLQuery[] = [];
  private gpuQuery: WebGLQuery | null = null;

  private gpuBegin(): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (this.gpuExt === undefined) this.gpuExt = (gl.getExtension?.('EXT_disjoint_timer_query_webgl2') as typeof this.gpuExt) ?? null;
    const ext = this.gpuExt;
    if (!ext) return;
    // Read the finished queries from earlier frames without waiting for the GPU.
    while (this.gpuQueue.length) {
      const q = this.gpuQueue[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.gpuQueue.shift();
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      gl.deleteQuery(q);
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) continue;
      const ms = ns / 1e6;
      this.gpuMs = this.gpuMs < 0 ? ms : this.gpuMs + (ms - this.gpuMs) * 0.1;
    }
    if (this.gpuQueue.length > 8) return;
    this.gpuQuery = gl.createQuery();
    if (this.gpuQuery) gl.beginQuery(ext.TIME_ELAPSED_EXT, this.gpuQuery);
  }

  private gpuEnd(): void {
    if (!this.gpuQuery || !this.gpuExt) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    gl.endQuery(this.gpuExt.TIME_ELAPSED_EXT);
    this.gpuQueue.push(this.gpuQuery);
    this.gpuQuery = null;
  }

  /**
   * Keep the frame rate up on a slower GPU: when the 3D view takes too long for a while, draw it at
   * a lower internal resolution (down to half); when there is headroom again, step back up. Reads
   * the GPU timer where there is one, so loading and other CPU work never blur the picture.
   */
  private adaptResolution(dtReal: number, ready: boolean): void {
    if (!ready || dtReal <= 0 || dtReal > 0.5) {
      this.slowFor = 0;
      this.fastFor = 0;
      return;
    }
    this.frameEMA += (dtReal - this.frameEMA) * 0.1;
    const gpu = this.gpuMs >= 0;
    // A 60 Hz frame is 16.7 ms: keep the GPU between about 12 and 15 ms of it.
    const slow = gpu ? this.gpuMs > 15 : this.frameEMA > 1 / 45;
    const fast = gpu ? this.gpuMs < 12 : this.frameEMA < 1 / 57;
    const post = this.post;
    if (slow) {
      this.slowFor += dtReal;
      this.fastFor = 0;
      if (this.slowFor > 0.8 && post.renderScale > 0.5) {
        post.renderScale = Math.max(0.5, post.renderScale * 0.88);
        this.slowFor = 0;
      }
    } else if (fast) {
      this.fastFor += dtReal;
      this.slowFor = 0;
      if (this.fastFor > 1.5 && post.renderScale < 1) {
        post.renderScale = Math.min(1, post.renderScale * 1.1);
        this.fastFor = 0;
      }
    } else {
      this.slowFor = 0;
      this.fastFor = 0;
    }
  }

  /** Camera-dependent inputs for the post-processing chain. */
  private viewState(underwater: boolean): ViewState {
    const v = this.view;
    const t = this.controls.target;
    const p = this.camera.position;
    v.underwater = underwater;
    v.targetDistance = p.distanceTo(t);
    const dir = this.camera.getWorldDirection(this.tmpDir);
    v.pitchDeg = (Math.asin(Math.min(1, Math.max(-1, -dir.y))) * 180) / Math.PI;
    v.focus.copy(t);
    return v;
  }

  /** Collect the HUD overlays in the current viewport ([data-hud]) so labels avoid them. */
  private updateLabelObstacles(): void {
    const obs = this.labels.obstacles;
    obs.length = 0;
    if (!this.slot) return;
    const base = this.renderer.domElement.getBoundingClientRect();
    for (const el of this.slot.querySelectorAll<HTMLElement>('[data-hud]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      obs.push({ l: r.left - base.left, r: r.right - base.left, t: r.top - base.top, b: r.bottom - base.top });
    }
  }

  /** Anchor the bloom label at the centroid of the approaching bloom that is visible in the current view. */
  private updateBloomAnchor(e: SimulationEngine): void {
    const p = e.pool;
    const v = this.tmpV;
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (let i = 0; i < p.capacity; i++) {
      if (p.state[i] !== S_APPROACHING) continue;
      const x = p.px[i];
      v.set(x, 0.5, p.pz[i]).project(this.camera);
      if (v.z > 1 || v.x < -0.78 || v.x > 0.55 || v.y < -0.72 || v.y > 0.45) continue;
      sx += x;
      sz += p.pz[i];
      n++;
    }
    if (n > 10) {
      const tx = sx / n;
      const tz = sz / n;
      if (!this.bloomAnchorValid) this.bloomAnchor.set(tx, 1, tz);
      else this.bloomAnchor.lerp(v.set(tx, 1, tz), 0.25);
      this.bloomAnchorValid = true;
    } else this.bloomAnchorValid = false;
  }

  /** Reset the camera to the active preset (or the overview). */
  resetView(): void {
    const preset = this.ui.compare ? 'compare' : this.ui.camera === 'free' ? 'aerial' : this.ui.camera;
    this.rig.goTo(preset as Exclude<CameraPreset, 'free'>, 1.4);
  }
}
