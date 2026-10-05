import * as THREE from 'three';
import { adjacentRooms, currentRoom, DIRECTIONS } from '../core/dungeon';
import { roomLayout } from '../core/room-layout';
import { BOUNDS, ALTAR_PEDESTAL, TREASURE_PEDESTAL, SHOP_COUNTER, SHOP_MERCHANT, isBoss, type Box, type RunState, type Enemy, type Boss } from '../core/model';
import { spikeTraps, trapStage } from '../core/traps';
import { BODY_HEIGHT, EYE_HEIGHT, CEILING_HEIGHT, playerEyeHeight } from '../core/fps-geometry';
import { ENEMY_ATTACK } from '../core/enemy-balance';
import { shieldHealth } from '../core/enemy-special';
import { BOMB } from '../core/bombs';
import { TIME } from '../core/time-debt';
import { HEART, heartLaserEnd, linkedPillar } from '../core/heart-boss';
import { attackStats } from '../core/attack-relics';
import { statueLaserEnd } from '../core/reader-statue';
import { stoneMaterial } from './ruins-materials';
import { wallGeometry } from './wall-geometry';
import type { MotionFrame } from './render-motion';
import type { GraphicsLevel } from '../core/render-timing';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { SCALE, wx, wz } from './world-space';
import { bevel, box, dispose, label, material, orb, ring, spikeField } from './scene-primitives';
import { figure } from './enemy-models';

export { SCALE } from './world-space';

const DOOR_COLOR = { start: 0x92c8b3, combat: 0x83caba, treasure: 0xe4bf6e, boss: 0xe48b63, altar: 0xbfa1d5, shop: 0xe4bf6e };
const ATMOSPHERE = [
  { fog: 0x122326, sky: 0xb3d2cc, ground: 0x393c30, key: 0xffdfb4, torch: 0xffbd79 },
  { fog: 0x211a2c, sky: 0xc6b7db, ground: 0x3d3038, key: 0xe8c8e1, torch: 0xffa482 },
  { fog: 0x221322, sky: 0xc5b9d7, ground: 0x402833, key: 0xf4b6ca, torch: 0xf48cc0 },
];

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(78, 1, 0.04, 75);
  private weaponScene = new THREE.Scene();
  private weaponCamera = new THREE.PerspectiveCamera(78, 1, 0.04, 75);
  private scene = new THREE.Scene(); private room = new THREE.Group(); private entities = new Map<string, THREE.Group>();
  private roomKey = ''; private doors: THREE.Mesh[] = []; private relic?: THREE.Mesh; private chestLid?: THREE.Group;
  private gun = new THREE.Group(); private muzzle!: THREE.Mesh; private light: THREE.PointLight;
  private weaponViews: Record<'W01' | 'W02' | 'W03' | 'W04', THREE.Group> = {
    W01: new THREE.Group(), W02: new THREE.Group(), W03: new THREE.Group(), W04: new THREE.Group(),
  };
  private weaponLoader = new GLTFLoader();
  private weaponLoads = new Map<keyof typeof this.weaponViews, { loading: boolean; loaded: boolean; attempts: number; retryAt: number }>();
  private bolt: THREE.Object3D = new THREE.Group(); private staffFlash!: THREE.Mesh;
  private worldReady = true;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private flames: THREE.Mesh[] = []; private dust?: THREE.Points;
  private torchLights: THREE.PointLight[] = [];
  private ambient = new THREE.HemisphereLight(0xb6d1ca, 0x353628, .95);
  private keyLight = new THREE.DirectionalLight(0xffe2ba, 1.7);
  private reflectionTarget?: THREE.WebGLRenderTarget;
  private graphicsLevel: GraphicsLevel = 3;
  get ready() { return this.worldReady; }
  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1; this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('aria-label', '3D 1인칭 유적 탐험 화면'); host.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x0e191b); this.scene.fog = new THREE.FogExp2(0x0e191b, 0.017);
    this.scene.add(this.room, this.camera, this.ambient);
    const weaponLight = new THREE.DirectionalLight(0xffe2ba, 1.7);
    weaponLight.position.set(-4, 10, 3);
    this.weaponScene.add(this.weaponCamera, new THREE.HemisphereLight(0xb6d1ca, 0x353628, .95), weaponLight);
    this.buildReflections(); this.scene.environmentIntensity = .16;
    this.weaponScene.environmentIntensity = .16;
    const sun = this.keyLight; sun.position.set(-4, 10, 3); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 13; sun.shadow.camera.bottom = -13; sun.shadow.normalBias = 0.025; sun.shadow.bias = -0.00015;
    sun.shadow.radius = 3;
    this.scene.add(sun);
    this.light = new THREE.PointLight(0x91d6ca, 3.5, 9, 2); this.scene.add(this.light);
    this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Clear world depth while preserving its color; weapon parts still occlude each other.
    const weaponPass = new RenderPass(this.weaponScene, this.weaponCamera);
    weaponPass.clear = false; weaponPass.clearDepth = true;
    this.composer.addPass(weaponPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.4, 1.4); this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.weaponCamera.add(this.gun); this.gun.position.set(0.32, -0.25, -0.64); this.gun.scale.setScalar(0.6);
    this.gun.rotation.y = .12;
    for (const id of ['W01', 'W02', 'W03', 'W04'] as const) {
      const view = this.weaponViews[id]; view.name = `weapon-${id}`; this.gun.add(view);
      if (id === 'W04') { view.position.set(.13, -.28, 0); view.rotation.x = -.17; }
    }
    this.muzzle = orb(this.gun, .12, 0, .04, -.91, 0xcaffd5, 0xaaff9f); this.muzzle.visible = false;
    this.staffFlash = orb(this.gun, .22, .09, .46, -.18, 0xeddcff, 0x8961bd); this.staffFlash.visible = false;
    for (const flash of [this.muzzle, this.staffFlash]) {
      flash.renderOrder = 1001; flash.castShadow = false;
      const surfaces: THREE.Material[] = Array.isArray(flash.material) ? flash.material : [flash.material];
      for (const surface of surfaces) {
        surface.depthTest = false; surface.depthWrite = false;
      }
    }
    new ResizeObserver(() => {
      const { width, height } = host.getBoundingClientRect(); if (!width || !height) return;
      this.renderer.setSize(width, height); this.composer.setSize(width, height);
      this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
      this.weaponCamera.aspect = width / height; this.weaponCamera.updateProjectionMatrix();
    }).observe(host);
    this.renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); this.worldReady = false; });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => { this.buildReflections(); this.worldReady = true; this.roomKey = ''; });
  }
  private loadWeapon(id: keyof typeof this.weaponViews) {
    const view = this.weaponViews[id];
    let state = this.weaponLoads.get(id);
    if (!state) {
      state = { loading: false, loaded: false, attempts: 0, retryAt: 0 };
      this.weaponLoads.set(id, state);
      const fallback = new THREE.Group(); fallback.name = 'weapon-fallback';
      const part = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) => {
        const mesh = box(fallback, w, h, d, x, y, z, color);
        mesh.castShadow = mesh.receiveShadow = false;
        return mesh;
      };
      if (id === 'W04') {
        part(.07, .9, .07, 0, .18, 0, 0x6d537f);
        part(.18, .18, .18, 0, .7, 0, 0xc9a7e5);
      } else {
        part(id === 'W02' ? .23 : .14, .14, id === 'W01' ? .6 : .85, 0, .08, -.35, 0x647c78);
        const grip = part(.12, .28, .13, 0, -.1, -.02, 0x463e35); grip.rotation.x = -.2;
        if (id === 'W03') part(.75, .07, .09, 0, .08, -.56, 0x9e8f69);
      }
      view.add(fallback);
    }
    // Paint drives retries only when this weapon is in use; no background timers or per-frame requests.
    if (state.loading || state.loaded || state.attempts >= 3 || performance.now() < state.retryAt) return;
    const request = state;
    request.loading = true; request.attempts++;
    this.weaponLoader.load(`${import.meta.env.BASE_URL}models/weapons/${id.toLowerCase()}.glb`, asset => {
      const fallback = view.getObjectByName('weapon-fallback');
      if (fallback) { view.remove(fallback); dispose(fallback); }
      asset.scene.name = 'weapon-model';
      view.add(asset.scene);
      asset.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = false;
        const surfaces: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
        for (const surface of surfaces) {
          surface.depthTest = true; surface.depthWrite = true;
        }
      });
      if (id === 'W03') this.bolt = asset.scene.getObjectByName('loaded_bolt') ?? this.bolt;
      request.loading = false; request.loaded = true;
    }, undefined, error => {
      request.loading = false;
      request.retryAt = performance.now() + 1000 * 2 ** (request.attempts - 1);
      console.warn(`Could not load ${id} weapon model (attempt ${request.attempts}/3); using fallback`, error);
    });
  }
  setQuality(level: GraphicsLevel) {
    if (this.graphicsLevel === level) return;
    this.graphicsLevel = level;
    const ratio = level === 0 ? 0.6 : level === 1 ? 0.8 : level === 2 ? 1 : Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(ratio);
    this.composer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = level === 3;
    this.keyLight.castShadow = level === 3;
  }
  private buildReflections() {
    const environment = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(this.renderer);
    this.reflectionTarget?.dispose();
    // Reuse the same map through room travel; restore its rendered pixels after context loss.
    this.reflectionTarget = pmrem.fromScene(environment, .06);
    this.scene.environment = this.reflectionTarget.texture;
    this.weaponScene.environment = this.reflectionTarget.texture;
    environment.dispose(); pmrem.dispose();
  }
  private buildRoom(s: RunState) {
    for (const g of this.entities.values()) { this.scene.remove(g); dispose(g); }
    this.entities.clear();
    dispose(this.room); this.doors = []; this.relic = undefined; this.chestLid = undefined; this.flames = []; this.torchLights = []; this.dust = undefined;
    const layout = roomLayout(s), color = [0x657b7c,0x8e795b,0x657b65,0x70617d,0x807069,0x586979,0x80617b,0x586f8c,0x875765][layout.id];
    const atmosphere = ATMOSPHERE[(s.expedition?.region ?? 1) - 1];
    (this.scene.background as THREE.Color).setHex(atmosphere.fog);
    (this.scene.fog as THREE.FogExp2).color.setHex(atmosphere.fog);
    this.ambient.color.setHex(atmosphere.sky); this.ambient.groundColor.setHex(atmosphere.ground);
    this.keyLight.color.setHex(atmosphere.key);
    const width = BOUNDS.w * SCALE, depth = BOUNDS.h * SCALE, height = CEILING_HEIGHT * SCALE;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), stoneMaterial(color, 'floor', width / 4, depth / 4));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.room.add(floor);
    // Keep the underside aligned with projectile collision, overlapping the wall tops.
    const ceiling = box(this.room, width + 0.8, 0.3, depth + 0.8, 0, height + 0.15, 0, color);
    ceiling.name = 'stone-roof'; ceiling.material.dispose();
    ceiling.material = stoneMaterial(color, 'floor', (width + 0.8) / 4, (depth + 0.8) / 4);
    ceiling.material.emissive.setHex(color); ceiling.material.emissiveIntensity = 0.08;
    ceiling.castShadow = false;
    // Keep decorative coffers slightly clear of the roof to avoid depth flicker.
    const ribs = new THREE.Group(); ribs.name = 'ceiling-coffers'; this.room.add(ribs);
    for (let x = -width / 2 + 4.6; x < width / 2; x += 4.6) {
      const rib = box(ribs, .12, .014, depth, x, height - .013, 0, layout.trim);
      rib.castShadow = rib.receiveShadow = false;
      rib.material.polygonOffset = true; rib.material.polygonOffsetFactor = -2; rib.material.polygonOffsetUnits = -2;
    }
    for (let z = -depth / 2 + 4.5; z < depth / 2; z += 4.5) {
      const rib = box(ribs, width, .014, .12, 0, height - .013, z, layout.trim);
      rib.castShadow = rib.receiveShadow = false;
      rib.material.polygonOffset = true; rib.material.polygonOffsetFactor = -2; rib.material.polygonOffsetUnits = -2;
    }
    const connections = adjacentRooms(s), doorTypes = new Map(connections.map(d => [d.direction, d.room.kind]));
    const sides = [
      { direction: 'north' as const, length: width + 0.72, x: 0, z: -depth / 2 - 0.18, rotation: 0 },
      { direction: 'south' as const, length: width + 0.72, x: 0, z: depth / 2 + 0.18, rotation: 0 },
      { direction: 'east' as const, length: depth, x: width / 2 + 0.18, z: 0, rotation: Math.PI / 2 },
      { direction: 'west' as const, length: depth, x: -width / 2 - 0.18, z: 0, rotation: Math.PI / 2 },
    ];
    for (const side of sides) {
      const g = new THREE.Group(); g.position.set(side.x, 0, side.z); g.rotation.y = side.rotation; this.room.add(g);
      const type = doorTypes.get(side.direction), gap = type ? 2.15 : 0;
      const wall = (w: number, h: number, x: number, y: number) => {
        const mesh = box(g, w, h, 0.36, x, y, 0, color); mesh.material.dispose();
        mesh.material = stoneMaterial(color, 'wall', w / 4, h / 2); return mesh;
      };
      if (!type) wall(side.length, height, 0, height / 2);
      else {
        const part = (side.length - gap) / 2;
        for (const sign of [-1, 1]) wall(part, height, sign * (gap / 2 + part / 2), height / 2);
        wall(gap, height - 3.35, 0, (height + 3.35) / 2);
        for (const sign of [-1, 1]) {
          box(g, 0.22, 3.35, 0.6, sign * 1.12, 1.675, 0, 0x8e9787);
          box(g, 0.035, 2.8, 0.67, sign * 0.99, 1.55, 0, DOOR_COLOR[type], DOOR_COLOR[type]);
        }
        box(g, 2.42, 0.23, 0.6, 0, 3.33, 0, 0x8e9787);
        const panel = box(g, 1.92, 3.2, 0.1, 0, 1.6, 0, 0x324743); panel.name = side.direction; this.doors.push(panel);
        panel.material.metalness = .6; panel.material.roughness = .4;
        for (const sign of [-1, 1]) {
          bevel(panel, .045, 2.9, .04, sign * .78, 0, .07, layout.trim, true);
          bevel(panel, .045, 2.9, .04, sign * .78, 0, -.07, layout.trim, true);
          for (const face of [-1, 1]) {
            const seal = ring(panel, .32, DOOR_COLOR[type]); seal.rotation.x = 0; seal.position.set(0, sign * .45, face * .07);
          }
        }
        box(g, 2.06, 0.01, 1.3, 0, 0.015, 0, DOOR_COLOR[type], DOOR_COLOR[type]);
        label(g, { start: s.expedition?.region===3?'심장부의 문턱':s.expedition?.region===2?'회랑의 문턱':'길잡이의 방', combat: '전투 석실', treasure: '유물의 안식처', boss: s.expedition?.region===3?'심장의 성소':s.expedition?.region===2?'사슬의 성소':'문지기의 봉인', altar: '저주받은 제단', shop: '방랑 상인' }[type], 0, 3.83, side.direction === 'north' || side.direction === 'west' ? 0.45 : -0.45, DOOR_COLOR[type]);
      }
      for (let level = 1; level < 5; level++) {
        if (gap) for (const sign of [-1, 1]) box(g, (side.length - gap) / 2, 0.025, 0.38, sign * (side.length + gap) / 4, level * 1.1, 0, 0x425451);
        else box(g, side.length, 0.025, 0.38, 0, level * 1.1, 0, 0x425451);
      }
      const inside = side.direction === 'north' || side.direction === 'west' ? 1 : -1;
      // Shallow trim stays within the player's wall clearance; it adds no hidden obstacles.
      for (const y of [0.12, height - 0.2]) box(g, side.length, 0.24, 0.44, 0, y, 0, 0x6d7868);
      const count = Math.floor(side.length / 4.5);
      for (let i = 0; i <= count; i++) {
        const x = -side.length / 2 + (i + 0.5) * side.length / (count + 1);
        if (type && Math.abs(x) < 1.7) continue;
        bevel(g, 0.46, height - 0.48, 0.34, x, height / 2, inside * 0.03, 0x7e8879);
        for (const y of [0.35, height - 0.45]) bevel(g, 0.66, 0.26, 0.44, x, y, 0, 0xa39e85);
        if (layout.id === 2) {
          const vine = box(g, 0.035, 2.2 + i % 3 * 0.35, 0.015, x + 0.25, height - 1.4, inside * 0.22, 0x435a37);
          vine.rotation.z = Math.sin(i * 8) * 0.12;
          for (let leaf = 0; leaf < 4; leaf++) {
            const m = orb(g, 0.095, x + 0.25 + leaf % 2 * 0.13, height - 0.6 - leaf * 0.48, inside * 0.23, 0x637b44);
            m.scale.set(1, 0.45, 0.18);
          }
        }
        if (layout.id>=6 && i%2===0) {
          const seal=orb(g,.17,x,height-1.05,inside*.29,layout.trim,0x593857);seal.scale.set(.6,1.6,.6);
          bevel(g,.045,2.5,.04,x,height-2.15,inside*.25,layout.trim,true);
        } else if (layout.id>=3 && i%2===0) {
          for(let link=0;link<8;link++) {
            const chain = new THREE.Mesh(new THREE.TorusGeometry(0.09,0.018,6,10), material(0xb5a384));
            chain.position.set(x,height-0.4-link*0.16,inside*0.28); chain.rotation.y=link%2*Math.PI/2; g.add(chain);
          }
        }
      }
    }
    const wallBounds = layout.obstacles.map(b => ({ x: wx(b.x), y: wz(b.y), w: b.w * SCALE, h: b.h * SCALE }));
    const body = new THREE.Mesh(wallGeometry(wallBounds, 5.5), stoneMaterial(color, 'wall'));
    body.name = 'wall-body'; body.castShadow = body.receiveShadow = true; this.room.add(body);
    for (const y of [0.12, 1.3, 3.9, 5.3]) {
      const trim = new THREE.Mesh(wallGeometry(wallBounds, .14, y - .07, .07), material(0x929780));
      trim.name = 'wall-trim'; trim.castShadow = trim.receiveShadow = true; this.room.add(trim);
    }
    for (const b of layout.obstacles) {
      const g = new THREE.Group(); g.position.set(wx(b.x + b.w / 2), 0, wz(b.y + b.h / 2)); this.room.add(g);
      box(g, b.w * SCALE * 0.42, 1.3, 0.025, 0, 2.45, b.h * SCALE / 2 + 0.02, 0x425756);
      const inscription = g.children[g.children.length - 1] as THREE.Mesh;
      for (const sign of [-1, 1]) {
        const stroke = box(inscription, .035, .68, .014, sign * .13, 0, .022, layout.trim);
        stroke.rotation.z = sign * .45; stroke.castShadow = false;
      }
      box(inscription, .3, .035, .014, 0, -.16, .022, layout.trim).castShadow = false;
    }
    ring(this.room, 2, 0x6c8a7b); ring(this.room, 1.8, 0x6c8a7b);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3; const m = box(this.room, 3.6, 0.006, 0.015, 0, 0.018, 0, 0x6b887b); m.rotation.y = a;
    }
    if(s.expedition?.region===3) {
      ring(this.room,4.3,0xad6f99);ring(this.room,4.0,0xad6f99);
      for(let i=0;i<12;i++){const a=i*Math.PI/6;const m=box(this.room,.22,.01,.5,Math.cos(a)*4.15,.025,Math.sin(a)*4.15,0xd5a9c2);m.rotation.y=-a;}
    }
    for (const [x, z] of [[-width * 0.32, -depth / 2 + 0.17], [width * 0.32, -depth / 2 + 0.17], [-width * 0.32, depth / 2 - 0.17], [width * 0.32, depth / 2 - 0.17]]) {
      bevel(this.room, 0.24, 0.72, 0.22, x, 1.8, z, 0x8e7750, true);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.22, .12, .13, 12), material(0x957753));
      bowl.position.set(x, 2.05, z); bowl.castShadow = true; this.room.add(bowl);
      const flame = orb(this.room, 0.12, x, 2.2, z, 0xffd9af, atmosphere.torch); flame.scale.y = 2.1; this.flames.push(flame);
      const core = orb(flame, .065, 0, -.03, 0, 0xfff0c2, 0xffd39b); core.scale.y = 1.6;
      const light = new THREE.PointLight(atmosphere.torch, 31, 12, 2); light.position.set(x, 2.4, z * 0.96); this.room.add(light); this.torchLights.push(light);
    }
    const dustGeometry = new THREE.BufferGeometry(), motes = new Float32Array(120 * 3);
    for (let i = 0; i < 120; i++) {
      motes[i * 3] = Math.sin(i * 137.5) * width * 0.47;
      motes[i * 3 + 1] = 0.3 + (i * 0.618 % 1) * 4.8;
      motes[i * 3 + 2] = Math.cos(i * 71.3) * depth * 0.47;
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(motes, 3));
    this.dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xc7c19b, size: 0.027, transparent: true, opacity: 0.28, depthWrite: false }));
    this.room.add(this.dust);
    const prop = (b: Box, height: number, color: number) => {
      const x = wx(b.x + b.w / 2), z = wz(b.y + b.h / 2);
      bevel(this.room, b.w * SCALE, height, b.h * SCALE, x, height / 2, z, color);
      bevel(this.room, b.w * SCALE, 0.12, b.h * SCALE, x, height - 0.05, z, 0xb0a484, true);
      for (const sign of [-1, 1]) bevel(this.room, 0.04, height * 0.65, 0.015, x + sign * b.w * SCALE * 0.36, height / 2, z + b.h * SCALE / 2 + 0.006, 0xd3bf87, true);
    };
    const kind = currentRoom(s)?.kind;
    if (kind === 'treasure' || kind === 'altar') {
      if (kind === 'altar') prop(ALTAR_PEDESTAL, 0.92, 0x655c77);
      else {
        const b = TREASURE_PEDESTAL, width = b.w * SCALE, depth = b.h * SCALE;
        const chest = new THREE.Group(); chest.name = 'treasure-chest';
        chest.position.set(wx(b.x + b.w / 2), 0, wz(b.y + b.h / 2)); this.room.add(chest);
        bevel(chest, width, 0.1, depth, 0, 0.1, 0, 0x49362d);
        for (const sign of [-1, 1]) {
          bevel(chest, width, 0.65, 0.1, 0, 0.425, sign * (depth - 0.1) / 2, 0x70513b);
          bevel(chest, 0.1, 0.65, depth - 0.2, sign * (width - 0.1) / 2, 0.425, 0, 0x70513b);
          for (const side of [-1, 1]) bevel(chest, 0.08, 0.65, 0.025, sign * width * 0.3, 0.425, side * (depth / 2 + 0.01), 0xb5a06a, true);
        }
        bevel(chest, width + 0.04, 0.1, depth + 0.04, 0, 0.07, 0, 0x514937, true);
        const lid = new THREE.Group(); lid.name = 'treasure-chest-lid'; lid.position.set(0, 0.75, -depth / 2); chest.add(lid);
        bevel(lid, width + 0.04, 0.17, depth + 0.04, 0, 0.085, depth / 2, 0x8b6547);
        for (const sign of [-1, 1]) bevel(lid, 0.085, 0.025, depth + 0.055, sign * width * 0.3, 0.18, depth / 2, 0xc0ad77, true);
        bevel(lid, 0.18, 0.23, 0.055, 0, -0.025, depth + 0.035, 0xd0ba7c, true);
        this.chestLid = lid;
      }
      this.relic = orb(this.room, 0.25, 0, 1.7, 0, kind === 'altar' ? 0xd0b2ef : 0xf1d78c, kind === 'altar' ? 0x9b63bc : 0xcbad54);
      this.relic.geometry.dispose(); this.relic.geometry = new THREE.OctahedronGeometry(0.27);
      const light = new THREE.PointLight(kind === 'altar' ? 0xce9df1 : 0xffd18e, 8, 4, 2); light.position.set(0, 1.8, 0); this.room.add(light);
    }
    if (kind === 'shop') {
      prop(SHOP_COUNTER, 0.88, 0x7c6b4d); const merchant = figure('archer');
      merchant.getObjectByName('health')!.visible = false; merchant.getObjectByName('bow')!.visible = false;
      box(merchant, 0.06, 1.9, 0.06, 0.45, 0.95, 0, 0xc0ae7e);
      merchant.position.set(wx(SHOP_MERCHANT.x + SHOP_MERCHANT.w / 2), 0, wz(SHOP_MERCHANT.y + SHOP_MERCHANT.h / 2)); this.room.add(merchant);
      for (const [index, color] of [0x8ccfba, 0xd0b1df, 0xf3cf89].entries()) orb(this.room, 0.12, (index - 1) * 0.6, 1.1, 0.36, color, color);
      label(this.room, '방랑 상인 · E 거래', 0, 2.4, -0.8, 0xddc28d);
      this.room.children[this.room.children.length - 1].scale.set(1.6, 0.3, 1);
    }
  }
  private object(key: string, make: () => THREE.Group, present: Set<string>) {
    present.add(key); let g = this.entities.get(key);
    if (!g) { g = make(); this.entities.set(key, g); this.scene.add(g); } return g;
  }
  private lane(g: THREE.Group, x: number, y: number, tx: number, ty: number, width = 0.32) {
    const length = Math.hypot(tx - x, ty - y) * SCALE;
    const mesh = box(g, length, 0.016, width, wx((x + tx) / 2), 0.045, wz((y + ty) / 2), 0xf5aa63, 0x773319);
    mesh.rotation.y = -Math.atan2(ty - y, tx - x); mesh.material.transparent = true; mesh.material.opacity = 0.65; mesh.castShadow = false;
  }
  paint(s: RunState, yaw: number, pitch: number, moving: boolean, paused: boolean, visual: { reducedMotion?: boolean; motion?: MotionFrame } = {}) {
    if (!this.worldReady) return;
    const key = `${s.seed}:${s.expedition?.region}:${s.expedition?.room}:${roomLayout(s).id}:${currentRoom(s)?.structure ?? 'legacy'}`;
    if (key !== this.roomKey) { this.roomKey = key; this.buildRoom(s); }
    const reduced = !!visual.reducedMotion, p = s.player, pose = visual.motion?.player ?? p;
    const bob = !reduced && !paused && moving && !p.dodgeRemaining && !(p.height ?? 0) ? Math.sin(s.tick * 0.13) * 0.018 : 0;
    this.bloom.enabled = !reduced && this.graphicsLevel === 3;
    this.camera.position.set(wx(pose.x), playerEyeHeight({ ...p, height: pose.height }) * SCALE + bob, wz(pose.y));
    this.camera.lookAt(this.camera.position.x + Math.cos(yaw) * Math.cos(pitch), this.camera.position.y + Math.sin(pitch), this.camera.position.z + Math.sin(yaw) * Math.cos(pitch));
    this.light.position.copy(this.camera.position); this.light.position.y += 0.5;
    this.light.visible = this.graphicsLevel >= 2;
    this.gun.visible = !paused; this.gun.position.y = -0.25 + bob * 0.4;
    const recoil = reduced ? 0 : Math.min(1, Math.max(0, p.fireCooldown - (attackStats(s).fireInterval - 6)) / 6);
    this.gun.position.z = -0.64 + recoil * 0.035; this.gun.rotation.x = recoil * 0.05;
    const weapon = s.weapon ?? 'W01';
    this.loadWeapon(weapon);
    for (const [id, view] of Object.entries(this.weaponViews)) view.visible = weapon === id;
    this.bolt.visible=p.fireCooldown<=12;
    const fired = !reduced && s.cues.some(c => c.kind === 'shot' && s.tick - c.tick <= 2);
    this.muzzle.position.z = s.weapon === 'W03' ? -.75 : -.91;
    this.muzzle.visible = s.weapon !== 'W04' && fired;
    this.staffFlash.visible = s.weapon === 'W04' && fired;
    for (const door of this.doors) door.visible = s.phase !== 'explore';
    const reward = currentRoom(s)?.reward;
    if (this.chestLid) this.chestLid.rotation.x = reward ? -1.15 : 0;
    if (this.relic) { this.relic.visible = this.chestLid ? !!reward && reward.choice === null : reward?.choice == null; this.relic.rotation.y = s.tick * 0.015; this.relic.position.y = 1.7 + Math.sin(s.tick * 0.025) * 0.08; }
    const present = new Set<string>();
    this.flames.forEach((flame, i) => { flame.scale.y = reduced ? 1.8 : 1.8 + Math.sin(s.tick * 0.19 + i * 3) * 0.35; });
    this.torchLights.forEach((light, i) => {
      light.visible = i < (this.graphicsLevel === 0 ? 0 : this.graphicsLevel === 1 ? 1 : this.graphicsLevel === 2 ? 2 : 4);
      light.intensity = reduced ? 31 : 31 * (1 + Math.sin(s.tick * .11 + i * 2.7) * .045 + Math.sin(s.tick * .23 + i) * .025);
    });
    if (this.dust) { this.dust.visible = !reduced && this.graphicsLevel >= 2; this.dust.position.y = Math.sin(s.tick * 0.003) * 0.06; }
    for (const e of [...s.enemies, ...(s.boss && s.boss.hp > 0 ? [s.boss] : [])]) {
      const g = this.object(`enemy-${e.id}`, () => figure(e.kind), present);
      const pose = visual.motion?.enemies.get(e.id) ?? e;
      g.position.set(wx(pose.x), 0, wz(pose.y)); g.rotation.y = Math.PI / 2 - pose.angle;
      if (e.kind === 'rat') g.position.y = !paused && e.mode === 'move' ? Math.abs(Math.sin(s.tick * 0.3 + e.id)) * 0.035 : 0;
      for (const [index, name] of (e.kind === 'rat' || e.kind === 'chainhound' ? ['foot-0', 'foot-1', 'foot-2', 'foot-3'] : ['leg--1', 'leg-1']).entries()) {
        const limb = g.getObjectByName(name);
        if (limb) limb.rotation.x = !paused && ['move', 'charge', 'recover'].includes(e.mode) ? Math.sin(s.tick * 0.19 + e.id + index * Math.PI) * 0.24 : 0;
      }
      if (e.kind === 'chainhound') {
        const jaw = g.getObjectByName('hound-jaw')!;
        jaw.rotation.x = e.mode === 'windup' ? .15 + .25 * (1 - e.timer / ENEMY_ATTACK.chainhound.windupTicks)
          : e.mode === 'recover' && e.timer >= ENEMY_ATTACK.chainhound.cooldownTicks - ENEMY_ATTACK.chainhound.recoveryTicks ? .28 : 0;
      }
      if (e.kind === 'readerstatue') {
        const focus = g.getObjectByName('reader-focus')!;
        focus.visible = e.mode === 'windup' || !!e.laserTicks;
        focus.scale.setScalar(e.mode === 'windup' ? .6 + .4 * (1 - e.timer / ENEMY_ATTACK.readerstatue.windupTicks) : 1.3);
      }
      const health = g.getObjectByName('health')!; health.lookAt(this.camera.position); health.visible = e.hp < e.maxHp || isBoss(e);
      const fill = health.getObjectByName('fill')!; fill.scale.x = e.hp / e.maxHp;
      const shield = g.getObjectByName('shield'); if (shield) shield.visible = shieldHealth(e as Enemy) > 0 && !(e as Enemy).shieldDisabledTicks;
      if (e.kind === 'sealcaster') {
        const focus = g.getObjectByName('seal-focus')!; focus.visible = e.mode === 'windup';
        focus.rotation.z = s.tick * .025;
      }
      if (e.kind === 'heartguard') {
        const sword = g.getObjectByName('guardian-sword')!, attack = ENEMY_ATTACK.heartguard;
        const direction = e.comboStrike === 2 ? -1 : 1;
        if (e.mode === 'windup') {
          const duration = e.comboStrike === 2 ? attack.followupTicks : attack.windupTicks;
          sword.rotation.z = direction * (-.35 - (1 - e.timer / duration) * .8);
          sword.rotation.x = -.3;
        } else {
          const duration = e.comboStrike === 2 ? attack.comboPauseTicks : attack.recoveryTicks;
          const remaining = e.comboStrike === 2 ? e.timer : e.timer - (attack.cooldownTicks - duration);
          sword.rotation.z = e.mode === 'recover' ? .9 * Math.max(0, remaining / duration) : -.12;
          sword.rotation.x = 0;
        }
      }
      if (e.kind === 'voidknight') {
        const sword = g.getObjectByName('void-sword')!, attack = ENEMY_ATTACK.voidknight;
        const slash = e.mode === 'windup' && !e.blinkTarget;
        const recovery = Math.max(0, (e.timer - (attack.cooldownTicks - attack.recoveryTicks)) / attack.recoveryTicks);
        sword.rotation.set(slash ? -.4 : 0, 0, slash ? -.5 - (1 - e.timer / attack.windupTicks) : e.mode === 'recover' ? 1.2 * recovery : -.15);
        if (e.blinkTick !== undefined && s.tick - e.blinkTick >= 0 && s.tick - e.blinkTick < 18) {
          const age = (s.tick - e.blinkTick) / 18;
          const arrival = this.object(`void-arrival-${e.id}`, () => { const group = new THREE.Group(); ring(group, .6, 0xa4e9ec); return group; }, present);
          arrival.position.set(wx(e.x), .04, wz(e.y)); arrival.scale.setScalar(1 + age * 2);
          arrival.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial) o.material.opacity = (1 - age) * .8; });
        }
      }
      if ('spawnTicks' in e && e.spawnTicks) g.scale.setScalar(0.5 + (48 - e.spawnTicks) / 96); else g.scale.setScalar(1);
      if (e.frost?.freezeTicks || e.burnTicks || e.flash) {
        const aura = this.object(`aura-${e.id}`, () => { const g = new THREE.Group(); ring(g, isBoss(e) ? 1.2 : 0.55, e.frost?.freezeTicks ? 0x9ee1fa : 0xf8a276); return g; }, present);
        aura.position.set(wx(pose.x), 0, wz(pose.y));
      }
      if (e.kind === 'shield' && shield && shield.visible) {
        const durability = this.object(`shield-bar-${e.id}`, () => { const g = new THREE.Group(); box(g, 0.8, 0.045, 0.02, 0, 0, 0, 0x87d3ec, 0x245775); return g; }, present);
        durability.position.set(wx(pose.x), 2.16, wz(pose.y)); durability.lookAt(this.camera.position); durability.scale.x = shieldHealth(e) / 35;
      }
      if (e.silenceTicks) {
        const mark = this.object(`silence-${e.id}`, () => {
          const group = new THREE.Group(); group.name = 'silence-mark';
          ring(group, isBoss(e) ? 1.2 : .65, 0xe8d99f);
          box(group, .42, .07, .05, 0, 0, 0, 0xffe8a6, 0xb39246).rotation.z = -.7;
          box(group, .42, .07, .05, 0, 0, 0, 0xffe8a6, 0xb39246).rotation.z = .7;
          return group;
        }, present);
        mark.position.set(wx(pose.x), BODY_HEIGHT[e.kind] * SCALE + .35, wz(pose.y)); mark.lookAt(this.camera.position);
      }
      if ((e as Enemy).shieldDisabledTicks || e.kind === 'gatekeeper' && e.pattern === 'shield' && e.mode === 'recover' && (e.lensCooldown ?? 0) > 228) {
        const mark = this.object(`lens-${e.id}`, () => {
          const group = new THREE.Group(); group.name = 'lens-break';
          for (const side of [-1, 1]) {
            const shard = box(group, .15, .35, .055, side * .14, 0, 0, 0xe8b7f0, 0x724b88);
            shard.rotation.z = side * -.45;
          }
          return group;
        }, present);
        mark.position.set(wx(pose.x), BODY_HEIGHT[e.kind] * SCALE + .35, wz(pose.y)); mark.lookAt(this.camera.position);
      }
      this.paintThreat(s, e, present);
      if(e.kind==='relicheart') this.paintHeart(s,e,g,present);
    }
    spikeTraps(s).forEach((b,i)=> {
      const stage=trapStage(s,i), color=stage==='active'?0xed754b:stage==='warning'?0xe8c178:0x625a67;
      const g=this.object(`spikes-${i}-${stage}`,()=> {
        const g=new THREE.Group(); box(g,b.w*SCALE,0.035,b.h*SCALE,0,0.018,0,0x413a48);
        if(s.expedition?.region===3) {
          box(g,b.w*SCALE,stage==='active'?.64:.01,b.h*SCALE,0,stage==='active'?.32:.045,0,color,stage==='active'?0x913341:stage==='warning'?0x675628:0);return g;
        }
        g.add(spikeField(b.w * SCALE, b.h * SCALE, stage === 'active' ? 0.48 : 0.06, color, stage === 'active' ? 0.24 : 0.05));
        if(stage!=='rest') box(g,b.w*SCALE,0.006,b.h*SCALE,0,0.045,0,color,stage==='active'?0x9d3015:0x665220);
        return g;
      },present);
      g.position.set(wx(b.x+b.w/2),0,wz(b.y+b.h/2));
    });
    for (const b of s.bullets) {
      const color = b.owner === 'enemy' ? b.source === 'riftshaman' ? 0xd09cef : 0xffac62 : b.kind === 'reflected' ? 0xd4ffcc : s.expedition?.relics.includes('R08') ? 0xb2efff : s.expedition?.relics.includes('R05') ? 0xffd98a : s.weapon === 'W04' && !b.kind ? 0xcdabf5 : 0x9ef5d4;
      const bolt=s.weapon==='W03' && b.owner==='player' && !b.kind;
      const g = this.object(`bullet-${b.id}`, () => { const g = new THREE.Group(); if(bolt) bevel(g,0.025,0.025,0.22,0,0,0,color,color); else orb(g, 0.062, 0, 0, 0, color, color); return g; }, present);
      if(bolt) g.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(b.vx,b.heightVelocity??0,b.vy).normalize());
      const pose = visual.motion?.bullets.get(b.id);
      g.position.set(wx(pose?.x ?? b.x), (pose?.height ?? b.height ?? EYE_HEIGHT) * SCALE, wz(pose?.y ?? b.y));
    }
    for (const b of s.bombs ?? []) {
      const g = this.object(`bomb-${b.id}`, () => { const g = new THREE.Group(); orb(g, 0.18, 0, 0.18, 0, 0x4e6562); orb(g, 0.04, 0, 0.4, 0, 0xffc66e, 0xff9a35); ring(g, BOMB.radius * SCALE, 0xc4a470); return g; }, present);
      g.position.set(wx(b.x), 0, wz(b.y));
    }
    if (s.timeStop) {
      const g = this.object('time-stop', () => { const g = new THREE.Group(); ring(g, TIME.range * SCALE, 0xc9b2ef); return g; }, present);
      g.position.set(wx(s.timeStop.x), 0, wz(s.timeStop.y));
    }
    for (const c of s.cues) if (c.kind === 'stomp' && s.tick - c.tick < 20) {
      const age = (s.tick - c.tick) / 20;
      const g = this.object(`cue-${c.id}`, () => {
        const g = new THREE.Group(); ring(g, c.amount * SCALE, 0xe5ce91); ring(g, c.amount * SCALE * 0.65, 0xb6ebcb); return g;
      }, present);
      g.position.set(wx(c.x), 0, wz(c.y)); g.scale.setScalar(0.25 + age * 0.75);
      g.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial) o.material.opacity = (1 - age) * 0.8; });
    }
    for (const c of s.cues) if (!reduced && ['kill', 'hit', 'blast', 'parry'].includes(c.kind) && s.tick - c.tick < 20) {
      const age = (s.tick - c.tick) / 20;
      const g = this.object(`cue-${c.id}`, () => { const g = new THREE.Group(); for (let i = 0; i < 5; i++) orb(g, 0.035, Math.cos(i * 1.256) * 0.3, i % 2 * 0.2, Math.sin(i * 1.256) * 0.3, c.kind === 'blast' ? 0xffa760 : 0xbde9c0, 0x629978); return g; }, present);
      g.position.set(wx(c.x), 0.55 + age * 0.45, wz(c.y)); g.scale.setScalar(1 + age * (c.kind === 'blast' ? 10 : 2));
    }
    for (const [key, g] of this.entities) if (!present.has(key)) { this.scene.remove(g); dispose(g); this.entities.delete(key); }
    if (this.bloom.enabled) this.composer.render();
    else {
      this.renderer.render(this.scene, this.camera);
      const autoClear = this.renderer.autoClear;
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.weaponScene, this.weaponCamera);
      this.renderer.autoClear = autoClear;
    }
  }
  private paintHeart(s:RunState,e:Boss,g:THREE.Group,present:Set<string>) {
    const core=g.getObjectByName('heart-core')!;core.scale.set(.82,1.6+Math.sin(s.tick*.08)*.08,.82);
    for(let i=0;i<3;i++)g.getObjectByName(`heart-orbit-${i}`)!.rotation.z=s.tick*.008*(i%2?-1:1);
    if(e.pillarIndex!==undefined) {
      const shield=this.object(`heart-shield-${e.id}`,()=>{const group=new THREE.Group();const m=orb(group,1.12,0,1.82,0,0xc398e1,0x673c80);m.material.transparent=true;m.material.opacity=.22;return group;},present);
      shield.position.set(wx(e.x),0,wz(e.y));
      const p=linkedPillar(e)!,px=wx(p.x+p.w/2),pz=wz(p.y+p.h/2);
      const pillar=this.object(`heart-pillar-${e.pillarIndex}`,()=>{const group=new THREE.Group();ring(group,1.08,0xf5c29b);for(const x of [-.68,.68])for(const z of [-.82,.82])box(group,.045,5.45,.045,x,2.72,z,0xebc8e7,0x764763);return group;},present);
      pillar.position.set(px,0,pz);
      const bar=this.object(`heart-pillar-bar-${e.pillarIndex}`,()=>{const group=new THREE.Group();box(group,1.3,.1,.03,0,0,0,0xf2bd9e,0x79414c);return group;},present);
      const face=new THREE.Vector2(this.camera.position.x-px,this.camera.position.z-pz).normalize();
      bar.position.set(px+face.x*1.15,1.85,pz+face.y*1.15);bar.lookAt(this.camera.position);bar.scale.x=(e.pillarHp??0)/HEART.pillarHp;
      const link=this.object(`heart-link-${e.id}`,()=>{const group=new THREE.Group();box(group,.045,.045,1,0,0,0,0xf4bbde,0x784266);return group;},present);
      const a=new THREE.Vector3(px,2.7,pz),z=new THREE.Vector3(wx(e.x),1.82,wz(e.y)),dir=z.clone().sub(a);
      link.position.copy(a.clone().add(z).multiplyScalar(.5));link.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir.clone().normalize());link.scale.z=dir.length();
    }
    if(e.mode==='wave' && e.shockRadius!==undefined) {
      const wave=this.object(`heart-wave-${e.id}`,()=>{const group=new THREE.Group();const m=new THREE.Mesh(new THREE.RingGeometry(.01,.2,64),new THREE.MeshBasicMaterial({color:0xf298aa,transparent:true,opacity:.8,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.y=.05;group.add(m);return group;},present);
      const m=wave.children[0] as THREE.Mesh;if(wave.userData.radius!==e.shockRadius){m.geometry.dispose();m.geometry=new THREE.RingGeometry(Math.max(.01,e.shockRadius-HEART.waveHalfWidth)*SCALE,(e.shockRadius+HEART.waveHalfWidth)*SCALE,64);wave.userData.radius=e.shockRadius;}
      wave.position.set(wx(e.x),0,wz(e.y));
    }
  }
  private paintThreat(s: RunState, e: Enemy | Boss, present: Set<string>) {
    if (e.kind === 'rat') return;
    if (e.mode !== 'windup' && e.mode !== 'charge' && e.mode !== 'shield' && e.mode !== 'transition'
      && !(isBoss(e) && (e.pattern==='chains'||e.pattern==='laser') && e.impactTicks>0)
      && !(e.kind === 'readerstatue' && e.laserTicks)) return;
    const pattern = isBoss(e) ? e.pattern : e.kind;
    const key = `tell-${e.id}-${pattern}-${e.mode}-${e.targetX}-${e.targetY}${e.kind === 'heartguard' ? `-${e.comboStrike}` : e.kind === 'voidknight' ? e.blinkTarget ? '-blink' : '-slash' : e.kind === 'riftshaman' ? e.summonPoints ? '-summon' : '-seal' : ''}`;
    const tell = this.object(key, () => {
      const g = new THREE.Group();
      g.userData.origin = { x: e.x, y: e.y };
      if(e.mode==='transition') ring(g,1.5,0xd0b5ec,wx(e.x),wz(e.y));
      else if (pattern === 'rocks' && isBoss(e)) for (const p of e.rocks) ring(g, 36 * SCALE, 0xefaa68, wx(p.x), wz(p.y));
      else if (pattern === 'chains' && isBoss(e)) for(const c of e.chains??[]) this.lane(g,c.x,c.y,c.tx,c.ty,0.56);
      else if (pattern === 'ritual' && isBoss(e)) for(const p of e.rocks) ring(g,0.75,0xd0b5ec,wx(p.x),wz(p.y));
      else if (pattern === 'laser' && isBoss(e)) {const end=heartLaserEnd(s);this.lane(g,e.x,e.y,end.x,end.y,.48);}
      else if (pattern === 'shockwave') {
        ring(g,2.2,0xf3a2b5,wx(e.x),wz(e.y));
        for(let i=0;i<8;i++){const a=i*Math.PI/4;this.lane(g,e.x+Math.cos(a)*55,e.y+Math.sin(a)*55,e.x+Math.cos(a)*140,e.y+Math.sin(a)*140,.09);}
      }
      else if (pattern === 'pulse' || pattern === 'watcher') {
        const count=pattern==='pulse'?8:6;
        for(let i=0;i<count;i++){const a=e.angle+i*Math.PI*2/count;this.lane(g,e.x,e.y,e.x+Math.cos(a)*230,e.y+Math.sin(a)*230,.09);}
      }
      else if (pattern === 'ring' && isBoss(e)) {
        for(let i=0;i<10;i++) {
          const a=e.angle+i*Math.PI*2/10, safe=i===e.ringGap || i===((e.ringGap??0)+1)%10;
          if(safe) { const m=box(g,6,0.01,0.2,wx(e.x+Math.cos(a)*75),0.045,wz(e.y+Math.sin(a)*75),0x84d3aa,0x347350); m.rotation.y=-a; }
          else this.lane(g,e.x,e.y,e.x+Math.cos(a)*220,e.y+Math.sin(a)*220,0.1);
        }
      }
      else if (pattern === 'fan') {
        const count = e.kind === 'gatekeeper' && e.stage === 2 ? 7 : 5;
        for (let i = 0; i < count; i++) { const angle = e.angle + (i - (count - 1) / 2) * 0.22; this.lane(g, e.x, e.y, e.x + Math.cos(angle) * 360, e.y + Math.sin(angle) * 360, 0.07); }
      } else if (pattern === 'heartguard') {
        const attack = ENEMY_ATTACK.heartguard, color = !isBoss(e) && e.comboStrike === 2 ? 0xea849f : 0xf4aa64;
        const zone = new THREE.Group(); zone.position.set(wx(e.x), .055, wz(e.y)); zone.rotation.y = -e.angle;
        const sector = new THREE.Mesh(new THREE.CircleGeometry(attack.hitRange * SCALE, 40, -attack.halfAngle, attack.halfAngle * 2),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .28, side: THREE.DoubleSide, depthWrite: false }));
        sector.name = 'guardian-slash'; sector.rotation.x = -Math.PI / 2; zone.add(sector);
        const arc = new THREE.Mesh(new THREE.RingGeometry((attack.hitRange - 1) * SCALE, attack.hitRange * SCALE, 40, 1, -attack.halfAngle, attack.halfAngle * 2),
          new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
        arc.rotation.x = -Math.PI / 2; arc.position.y = .005; zone.add(arc); g.add(zone);
      } else if (pattern === 'readerstatue' && !isBoss(e)) {
        const attack = ENEMY_ATTACK.readerstatue, end = statueLaserEnd(s, e), fired = !!e.laserTicks;
        const length = Math.hypot(end.x - e.x, end.y - e.y) * SCALE;
        this.lane(g, e.x, e.y, end.x, end.y, attack.halfWidth * 2 * SCALE);
        const lane = g.children[g.children.length - 1] as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
        lane.name = fired ? 'reader-laser-floor' : 'reader-warning';
        lane.material.color.setHex(fired ? 0xee8bb4 : 0xffbc83);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(length, fired ? attack.halfHeight * 2 * SCALE : .025, fired ? attack.halfWidth * 2 * SCALE : .025),
          new THREE.MeshBasicMaterial({ color: fired ? 0xff8bbd : 0xffc6a0, transparent: true, opacity: fired ? .85 : .45, depthWrite: false }));
        beam.name = fired ? 'reader-laser' : 'reader-aim-ray';
        beam.position.set(wx((e.x + end.x) / 2), attack.beamHeight * SCALE, wz((e.y + end.y) / 2));
        beam.rotation.y = -e.angle; g.add(beam);
        if (fired) {
          const core = new THREE.Mesh(new THREE.BoxGeometry(length, .035, .05), new THREE.MeshBasicMaterial({ color: 0xfff0df }));
          core.name = 'reader-laser-core'; core.position.copy(beam.position); core.rotation.copy(beam.rotation); g.add(core);
        }
      } else if (pattern === 'chainhound') {
        const attack = ENEMY_ATTACK.chainhound;
        const zone = new THREE.Group(); zone.position.set(wx(e.x), .055, wz(e.y)); zone.rotation.y = -e.angle; g.add(zone);
        const sector = new THREE.Mesh(new THREE.CircleGeometry(attack.hitRange * SCALE, 40, -attack.halfAngle, attack.halfAngle * 2),
          new THREE.MeshBasicMaterial({ color: 0xe6a789, transparent: true, opacity: .2, side: THREE.DoubleSide, depthWrite: false }));
        sector.name = 'hound-pull-zone'; sector.rotation.x = -Math.PI / 2; zone.add(sector);
        const arc = new THREE.Mesh(new THREE.RingGeometry((attack.hitRange - 1) * SCALE, attack.hitRange * SCALE, 40, 1, -attack.halfAngle, attack.halfAngle * 2),
          new THREE.MeshBasicMaterial({ color: 0xffba93, side: THREE.DoubleSide }));
        arc.rotation.x = -Math.PI / 2; arc.position.y = .005; zone.add(arc);
        const arrows = new THREE.Group(); arrows.name = 'hound-pull-arrows'; zone.add(arrows);
        for (const side of [-1, 0, 1]) {
          const direction = side * attack.halfAngle * .55;
          const path = new THREE.Group(); path.rotation.y = -direction; arrows.add(path);
          for (let i = 0; i < 3; i++) {
            const x = (32 + i * 16) * SCALE;
            for (const sign of [-1, 1]) {
              const mark = box(path, .3, .012, .035, x, .04, sign * .1, 0xffc5a0);
              mark.rotation.y = sign * -Math.PI / 4;
            }
          }
        }
      } else if (pattern === 'sealcaster') {
        const zone = new THREE.Group(); zone.position.set(wx(e.targetX), .055, wz(e.targetY)); g.add(zone);
        const radius = ENEMY_ATTACK.sealcaster.radius * SCALE;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 64),
          new THREE.MeshBasicMaterial({ color: 0xffba72, transparent: true, opacity: .25, side: THREE.DoubleSide, depthWrite: false }));
        disc.name = 'seal-blast-zone'; disc.rotation.x = -Math.PI / 2; zone.add(disc);
        ring(zone, radius, 0xffc98a);
        const charge = ring(zone, radius, 0xe89461); charge.name = 'seal-charge'; charge.position.y = .045;
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3;
          const mark = box(zone, .12, .01, .28, Math.cos(a) * radius * .82, .04, Math.sin(a) * radius * .82, 0xffca86);
          mark.rotation.y = -a;
        }
      } else if (pattern === 'voidknight' && !isBoss(e)) {
        const point = e.blinkTarget ?? e, color = e.blinkTarget ? 0x9ed3f2 : 0xffae73;
        const zone = new THREE.Group(); zone.position.set(wx(point.x), .055, wz(point.y)); g.add(zone);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(ENEMY_ATTACK.voidknight.hitRange * SCALE, 64),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false }));
        disc.name = e.blinkTarget ? 'void-blink-zone' : 'void-slash-zone'; disc.rotation.x = -Math.PI / 2; zone.add(disc);
        ring(zone, ENEMY_ATTACK.voidknight.hitRange * SCALE, color);
        if (e.blinkTarget) {
          ring(zone, .45, 0xb5a0ee);
          for (const sign of [-1, 1]) {
            box(zone, .8, .01, .025, 0, .035, sign * .23, color);
            box(zone, .025, .01, .8, sign * .23, .035, 0, color);
          }
        }
      } else if (pattern === 'riftshaman' && !isBoss(e)) {
        if (e.summonPoints) for (const p of e.summonPoints) {
          const portal = ring(g, .68, 0xd1a4ee, wx(p.x), wz(p.y)); portal.name = 'rift-spawn';
          const inner = ring(g, .4, 0xab83ce, wx(p.x), wz(p.y)); inner.position.y = .06;
          for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2;
            orb(g, .045, wx(p.x) + Math.cos(a) * .53, .12, wz(p.y) + Math.sin(a) * .53, 0xd1a4ee, 0x764696);
          }
        } else this.lane(g, e.x, e.y, e.targetX, e.targetY, .14);
      } else if (pattern === 'ashpriest') {
        for(const offset of [-0.24,0,0.24]) { const a=e.angle+offset; this.lane(g,e.x,e.y,e.x+Math.cos(a)*280,e.y+Math.sin(a)*280,0.08); }
      } else if (pattern === 'charge' || pattern === 'guard' || pattern === 'archer' || pattern === 'shield') this.lane(g, e.x, e.y, e.targetX, e.targetY, pattern === 'charge' || pattern === 'guard' ? 0.75 : 0.13);
      else ring(g, 1.5, 0xd0b5ec, wx(e.x), wz(e.y));
      return g;
    }, present);
    if (pattern === 'fan' || e.mode === 'shield') tell.position.set((e.x - tell.userData.origin.x) * SCALE, 0, (e.y - tell.userData.origin.y) * SCALE);
    if (pattern === 'sealcaster') tell.getObjectByName('seal-charge')?.scale.setScalar(Math.max(.02, 1 - e.timer / ENEMY_ATTACK.sealcaster.windupTicks));
    tell.visible = e.mode !== 'charge';
  }
}
