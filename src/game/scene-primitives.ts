import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function material(color: number, glow = 0, transparent = false) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.08,
    emissive: glow, emissiveIntensity: glow ? 2 : 0, transparent, opacity: transparent ? 0.4 : 1 });
}
export function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: number, glow = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color, glow));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
export function orb(parent: THREE.Object3D, radius: number, x: number, y: number, z: number, color: number, glow = 0) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 2), material(color, glow));
  m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
}
export function ring(parent: THREE.Object3D, radius: number, color: number, x = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 5, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
  m.rotation.x = Math.PI / 2; m.position.set(x, 0.03, z); parent.add(m); return m;
}
export function label(parent: THREE.Object3D, text: string, x: number, y: number, z: number, color: number) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d')!; ctx.textAlign = 'center'; ctx.font = '500 37px sans-serif';
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`; ctx.fillText(text, 256, 62);
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
  m.scale.set(2.9, 0.55, 1); m.position.set(x, y, z); parent.add(m);
}
export function dispose(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points) object.geometry.dispose();
    if (object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Points) {
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const mat of list) {
        materials.add(mat);
        for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  }); textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); root.clear();
}

export function bevel(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: number, metal: boolean | number = false) {
  const mat = material(color, typeof metal === 'number' ? metal : 0);
  mat.metalness = metal === true ? 0.75 : 0.08; mat.roughness = metal === true ? 0.32 : 0.86;
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.1), mat);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
