import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// GLTFExporter only needs FileReader for the final binary blob in this script.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(buffer => { this.result = buffer; this.onloadend?.(); });
  }
};

const mat = (color, metalness = 0, roughness = .65, glow = 0) => new THREE.MeshStandardMaterial({
  color, metalness, roughness, emissive: glow, emissiveIntensity: glow ? .75 : 0,
});
const iron = mat(0x283c3d, .78, .36);
const steel = mat(0x758584, .85, .28);
const gold = mat(0xc6a474, .75, .34);
const darkGold = mat(0x796044, .74, .45);
const wood = mat(0x644737, .1, .84);
const leather = mat(0x352e2c, .02, .95);
const teal = mat(0x75e1c9, .18, .2, 0x236f61);
const amber = mat(0xffc77d, .15, .22, 0x9d4d16);
const purple = mat(0xc3a1ee, .2, .18, 0x654080);

function mesh(parent, geometry, material, name, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name; object.position.set(x, y, z); parent.add(object); return object;
}
function block(parent, w, h, d, x, y, z, material, name = 'forged plate') {
  return mesh(parent, new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * .12), material, name, x, y, z);
}
function rod(parent, a, b, radius, material, name = 'metal rod', sides = 10) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const delta = end.clone().sub(start);
  const object = mesh(parent, new THREE.CylinderGeometry(radius, radius, delta.length(), sides), material, name);
  object.position.copy(start.add(end).multiplyScalar(.5));
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return object;
}
function curve(parent, points, radius, material, name = 'curved metal') {
  const shape = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  return mesh(parent, new THREE.TubeGeometry(shape, 20, radius, 7, false), material, name);
}
function gem(parent, x, y, z, sx, sy, sz, material, name = 'relic crystal') {
  const object = mesh(parent, new THREE.OctahedronGeometry(1, 0), material, name, x, y, z);
  object.scale.set(sx, sy, sz); return object;
}
function cylinder(parent, radius, length, x, y, z, material, name = 'barrel', sides = 16) {
  const object = mesh(parent, new THREE.CylinderGeometry(radius, radius, length, sides), material, name, x, y, z);
  object.rotation.x = Math.PI / 2; return object;
}
function ring(parent, radius, tube, x, y, z, material, name = 'metal ring') {
  return mesh(parent, new THREE.TorusGeometry(radius, tube, 8, 24), material, name, x, y, z);
}

function sidearm() {
  const g = new THREE.Group(); g.name = 'weapon-W01';
  block(g, .42, .22, .68, 0, .06, -.18, iron, 'relic sidearm receiver');
  block(g, .33, .12, .57, 0, .19, -.21, steel, 'sliding upper rail');
  block(g, .36, .13, .47, 0, -.095, -.08, darkGold, 'brass lower frame');
  const grip = block(g, .22, .42, .21, .035, -.35, .17, wood, 'angled walnut grip'); grip.rotation.x = -.22;
  block(g, .24, .065, .22, .035, -.565, .22, gold, 'grip pommel');
  cylinder(g, .083, .53, 0, .04, -.66, steel, 'long rifled barrel');
  cylinder(g, .11, .095, 0, .04, -.9, gold, 'octagonal muzzle collar', 8);
  ring(g, .067, .012, 0, .04, -.954, iron, 'dark muzzle aperture');
  for (const sign of [-1, 1]) {
    block(g, .04, .16, .31, sign * .225, .025, -.17, gold, 'engraved side plate');
    block(g, .015, .025, .2, sign * .25, .065, -.17, steel, 'side plate inlay');
    gem(g, sign * .253, .025, -.04, .028, .055, .07, teal, 'charged relic bead');
    for (let i = 0; i < 3; i++) block(grip, .017, .028, .025, sign * .112, .07 - i * .073, .035, gold, 'grip rivet');
  }
  block(g, .16, .04, .13, 0, .27, .075, gold, 'rear sight');
  block(g, .04, .06, .045, 0, .15, -.66, gold, 'front sight');
  rod(g, [0, -.11, .01], [0, -.27, -.03], .015, gold, 'trigger guard');
  return g;
}

function scattergun() {
  const g = new THREE.Group(); g.name = 'weapon-W02';
  block(g, .58, .3, .59, 0, .015, -.09, iron, 'heavy relic chamber');
  block(g, .65, .085, .43, 0, .19, -.2, gold, 'five-shot top rail');
  const grip = block(g, .27, .42, .23, .02, -.34, .19, wood, 'short walnut grip'); grip.rotation.x = -.17;
  block(g, .29, .075, .25, .02, -.54, .23, steel, 'grip heel');
  block(g, .63, .21, .44, 0, -.045, -.48, darkGold, 'wide muzzle shroud');
  for (const x of [-.16, 0, .16]) {
    cylinder(g, .073, .55, x, .035, -.67, steel, 'relic scatter barrel');
    ring(g, .07, .013, x, .035, -.952, gold, 'muzzle rim');
    ring(g, .047, .01, x, .035, -.96, iron, 'muzzle bore');
  }
  for (const sign of [-1, 1]) {
    block(g, .05, .19, .41, sign * .315, .016, -.12, gold, 'reinforced chamber cheek');
    gem(g, sign * .345, .047, -.2, .032, .08, .1, amber, 'ember chamber lens');
    curve(g, [[sign * .26, .07, .16], [sign * .35, -.01, .04], [sign * .34, -.07, -.29]], .018, steel, 'heat pipe');
    for (let i = 0; i < 3; i++) block(g, .032, .03, .035, sign * .22, .247, -.08 - i * .115, iron, 'top rail notch');
  }
  block(g, .2, .045, .11, 0, .276, .08, steel, 'rear sight');
  return g;
}

function crossbow() {
  const g = new THREE.Group(); g.name = 'weapon-W03';
  block(g, .21, .16, 1.04, 0, -.035, -.17, wood, 'long ash stock');
  block(g, .16, .045, .97, 0, .075, -.2, gold, 'bolt guide');
  block(g, .16, .29, .22, 0, -.28, .21, leather, 'wrapped hand grip');
  block(g, .3, .21, .25, 0, -.01, -.47, iron, 'bow mounting socket');
  for (const sign of [-1, 1]) {
    const s = sign;
    curve(g, [[s * .09, .025, -.5], [s * .37, .08, -.55], [s * .62, .11, -.48], [s * .83, .085, -.32]], .045, steel, 'swept steel limb');
    curve(g, [[s * .11, -.035, -.5], [s * .43, -.02, -.55], [s * .74, .035, -.38]], .018, gold, 'limb filigree');
    rod(g, [s * .83, .085, -.32], [0, .09, .05], .009, mat(0xe7dbc2, 0, .9), 'bow string', 6);
    gem(g, s * .83, .085, -.32, .045, .055, .05, teal, 'limb tip crystal');
    block(g, .04, .1, .19, s * .16, .03, .08, gold, 'cocking gear');
  }
  block(g, .28, .065, .1, 0, .08, .29, steel, 'bolt catch');
  rod(g, [0, .11, .2], [0, .11, -.69], .019, gold, 'loaded bolt');
  const tip = mesh(g, new THREE.ConeGeometry(.05, .14, 4), steel, 'bolt head', 0, .11, -.74); tip.rotation.x = -Math.PI / 2;
  for (const sign of [-1, 1]) block(g, .075, .045, .14, sign * .04, .11, .17, teal, 'bolt fletching');
  return g;
}

function staff() {
  const g = new THREE.Group(); g.name = 'weapon-W04';
  rod(g, [.015, -.82, .17], [-.035, .46, -.2], .065, wood, 'darkwood staff', 12);
  for (let i = 0; i < 7; i++) {
    const y = -.72 + i * .17, z = .17 - (y + .82) * .29;
    ring(g, .075, .018, .015 - (y + .82) * .039, y, z, i % 2 ? gold : steel, 'binding ring');
  }
  block(g, .19, .12, .2, -.04, .4, -.18, darkGold, 'relic socket');
  gem(g, -.04, .74, -.18, .19, .35, .19, purple, 'floating rift crystal');
  gem(g, -.04, .74, -.18, .09, .21, .1, mat(0xf2d8ff, .05, .18, 0x9870c5), 'crystal heart');
  for (const sign of [-1, 1]) {
    curve(g, [[sign * .09, .35, -.18], [sign * .2, .55, -.18], [sign * .21, .77, -.18], [sign * .14, .95, -.18]], .039, steel, 'forked crystal claw');
    gem(g, sign * .14, .99, -.18, .045, .1, .045, gold, 'claw finial');
    curve(g, [[sign * .09, -.31, .02], [sign * .18, -.16, -.03], [sign * .14, .05, -.08]], .019, gold, 'spiral brass inlay');
  }
  const halo = mesh(g, new THREE.TorusGeometry(.26, .02, 8, 36), gold, 'rift focus halo', -.04, .74, -.18);
  halo.rotation.x = .33;
  gem(g, .015, -.88, .19, .075, .11, .075, purple, 'staff pommel');
  return g;
}

const base = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(base, '../public/models/weapons');
await mkdir(outDir, { recursive: true });
const exporter = new GLTFExporter();
for (const [id, build] of [['w01', sidearm], ['w02', scattergun], ['w03', crossbow], ['w04', staff]]) {
  const output = await exporter.parseAsync(build(), { binary: true, onlyVisible: true });
  await writeFile(path.join(outDir, `${id}.glb`), Buffer.from(output));
  console.log(`${id}.glb: ${output.byteLength} bytes`);
}
