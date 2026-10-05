import * as THREE from 'three';

type StoneStyle = 'floor' | 'wall';
const surfaces = new Map<string, { color: HTMLCanvasElement; roughness: HTMLCanvasElement; occlusion: HTMLCanvasElement; normal: Uint8Array }>();
const SIZE = 256;

// Deterministic albedo, roughness and tangent-space normals; no remote assets needed.
function surface(color: number, style: StoneStyle) {
  const key = `${color}:${style}`, cached = surfaces.get(key); if (cached) return cached;
  const colorCanvas = document.createElement('canvas'), roughness = document.createElement('canvas'), occlusion = document.createElement('canvas');
  for (const canvas of [colorCanvas, roughness, occlusion]) canvas.width = canvas.height = SIZE;
  const ctx = colorCanvas.getContext('2d')!, rough = roughness.getContext('2d')!, ao = occlusion.getContext('2d')!;
  const albedo = ctx.createImageData(SIZE, SIZE), gloss = rough.createImageData(SIZE, SIZE), shadows = ao.createImageData(SIZE, SIZE);
  const heights = new Float32Array(SIZE * SIZE), normal = new Uint8Array(SIZE * SIZE * 4);
  const rgb = [color >>> 16 & 255, color >>> 8 & 255, color & 255];
  const tileW = style === 'floor' ? 128 : 256, tileH = 128;
  const hash = (x: number, y: number) => {
    let n = Math.imul(x + 37, 374761393) ^ Math.imul(y + 11, 668265263);
    n = Math.imul(n ^ n >>> 13, 1274126177); return (n ^ n >>> 16) >>> 0;
  };
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const row = Math.floor(y / tileH), stagger = style === 'wall' && row % 2 ? tileW / 2 : 0;
    const tx = (x + stagger) % tileW, ty = y % tileH;
    const edge = Math.min(tx, tileW - tx, ty, tileH - ty);
    const grain = hash(x, y) % 100 / 100, tile = hash(Math.floor((x + stagger) / tileW), row) % 100 / 100;
    // Periodic weathering avoids seams when the stone repeats across a large room.
    const weather = (Math.sin(x * Math.PI / 128 + Math.sin(y * Math.PI / 64))
      + Math.cos(y * Math.PI / 128 - Math.sin(x * Math.PI / 64))) * .5;
    const vein = Math.sin((tx + ty * .38) * .18 + tile * 17) * .03;
    const moss = rgb[1] >= rgb[0] && rgb[1] >= rgb[2] - 5 ? Math.max(0, weather - .25) * .22 : 0;
    const crack = Math.abs(tx - (tile * tileW + Math.sin(ty * 0.06 + tile * 15) * 8)) < 0.8 && ty > 34;
    const joint = edge < 3, bevel = Math.min(1, Math.max(0, edge - 3) / 5);
    const h = joint ? 0.12 : 0.66 + bevel * 0.16 + grain * 0.05 + vein - (crack ? 0.28 : 0);
    heights[y * SIZE + x] = h;
    const value = joint ? 0.32 : 0.68 + tile * 0.32 + grain * 0.12 + weather * .09 + vein - (crack ? 0.24 : 0);
    const i = (y * SIZE + x) * 4;
    for (let c = 0; c < 3; c++) {
      albedo.data[i + c] = rgb[c] * value * (1 - moss) + [49, 67, 40][c] * moss;
      gloss.data[i + c] = joint || moss > .06 ? 245 : 150 + grain * 52 + tile * 32;
      shadows.data[i + c] = joint ? 112 : crack ? 168 : 212 + bevel * 43;
    }
    albedo.data[i + 3] = gloss.data[i + 3] = shadows.data[i + 3] = 255;
  }
  const height = (x: number, y: number) => heights[((y + SIZE) % SIZE) * SIZE + (x + SIZE) % SIZE];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = (height(x - 1, y) - height(x + 1, y)) * 3.5;
    const dy = (height(x, y - 1) - height(x, y + 1)) * 3.5;
    const length = Math.hypot(dx, dy, 1), i = (y * SIZE + x) * 4;
    normal[i] = (dx / length * 0.5 + 0.5) * 255;
    normal[i + 1] = (dy / length * 0.5 + 0.5) * 255;
    normal[i + 2] = (1 / length * 0.5 + 0.5) * 255; normal[i + 3] = 255;
  }
  ctx.putImageData(albedo, 0, 0); rough.putImageData(gloss, 0, 0); ao.putImageData(shadows, 0, 0);
  const result = { color: colorCanvas, roughness, occlusion, normal }; surfaces.set(key, result); return result;
}

export function stoneMaterial(color: number, style: StoneStyle, repeatX = 1, repeatY = 1) {
  const source = surface(color, style);
  const map = new THREE.CanvasTexture(source.color), roughnessMap = new THREE.CanvasTexture(source.roughness);
  const aoMap = new THREE.CanvasTexture(source.occlusion);
  const normalMap = new THREE.DataTexture(source.normal, SIZE, SIZE, THREE.RGBAFormat); normalMap.needsUpdate = true;
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, roughnessMap, normalMap, aoMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY);
    t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  }
  return new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, aoMap, aoMapIntensity: .7, roughness: 0.96,
    normalScale: new THREE.Vector2(0.6, 0.6), metalness: 0.025 });
}
