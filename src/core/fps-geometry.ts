import { segmentBox, segmentCircle } from './geometry';
import type { Box, Player } from './model';

export const EYE_HEIGHT = 34;
export const PLAYER_BODY_HEIGHT = 44;
export const playerEyeHeight = (p: Player) => EYE_HEIGHT + (p.height ?? 0);
export const CEILING_HEIGHT = 140;
export function boxHit3D(from: { x: number; y: number }, to: { x: number; y: number }, height: number | undefined,
  nextHeight: number | undefined, box: Box, top: number, radius = 2): number | null {
  const enter = segmentBox(from.x, from.y, to.x, to.y, box, radius);
  if (enter === null || height === undefined || nextHeight === undefined) return enter;
  const exit = 1 - (segmentBox(to.x, to.y, from.x, from.y, box, radius) ?? 0), dh = nextHeight - height;
  if (Math.abs(dh) < 1e-9) return height >= -radius && height <= top + radius ? enter : null;
  const a = (-radius - height) / dh, b = (top + radius - height) / dh;
  const start = Math.max(enter, Math.min(a, b), 0), end = Math.min(exit, Math.max(a, b), 1);
  return start <= end ? start : null;
}
export const BODY_HEIGHT = { decoy: 44, rat: 18, archer: 46, guard: 52, shield: 48, ashpriest: 48, watcher: 54, heartguard: 56, riftshaman: 50, voidknight: 58, sealcaster: 50, chainhound: 28, readerstatue: 60, gatekeeper: 92, chainpriest: 84, relicheart: 90 } as const;

// Intersect the horizontal circle interval with the vertical body interval.
export function cylinderHit(x: number, y: number, nx: number, ny: number, height: number | undefined,
  nextHeight: number | undefined, cx: number, cy: number, radius: number, top: number): number | null {
  const enter = segmentCircle(x, y, nx, ny, cx, cy, radius);
  if (enter === null || height === undefined || nextHeight === undefined) return enter;
  const exit = 1 - (segmentCircle(nx, ny, x, y, cx, cy, radius) ?? 0);
  const dh = nextHeight - height;
  if (Math.abs(dh) < 1e-9) return height >= -2 && height <= top + 2 ? enter : null;
  const a = (-2 - height) / dh, b = (top + 2 - height) / dh;
  const start = Math.max(enter, Math.min(a, b), 0), end = Math.min(exit, Math.max(a, b), 1);
  return start <= end ? start : null;
}
