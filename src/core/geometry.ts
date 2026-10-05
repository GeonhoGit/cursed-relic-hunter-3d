import { BOUNDS, BOUNDARY_WALLS, WALLS, PILLARS, type Box, type Point } from './model';

export function segmentCircle(x: number, y: number, nx: number, ny: number, cx: number, cy: number, radius: number): number | null {
  const dx = nx - x, dy = ny - y, ox = x - cx, oy = y - cy;
  const c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return null;
  const b = 2 * (ox * dx + oy * dy), discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

export function segmentBox(x: number, y: number, nx: number, ny: number, box: Box, radius = 0): number | null {
  let near = 0, far = 1;
  for (const [p, d, lo, hi] of [
    [x, nx - x, box.x - radius, box.x + box.w + radius],
    [y, ny - y, box.y - radius, box.y + box.h + radius],
  ]) {
    if (Math.abs(d) < 1e-10) { if (p < lo || p > hi) return null; }
    else {
      const t1 = (lo - p) / d, t2 = (hi - p) / d;
      near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2));
      if (near > far) return null;
    }
  }
  return near;
}

export function moveBody(body: Point, dx: number, dy: number, radius: number, obstacles: readonly Box[] = PILLARS) {
  // A saved position may overlap adjoining props. Resolve against all objects together
  // so leaving the counter cannot push the player back inside the merchant.
  const overlaps = (p: Point) => obstacles.some(b => p.x > b.x - radius && p.x < b.x + b.w + radius
    && p.y > b.y - radius && p.y < b.y + b.h + radius);
  if (overlaps(body)) {
    const candidates = obstacles.flatMap(b => [
      { x: b.x - radius, y: body.y }, { x: b.x + b.w + radius, y: body.y },
      { x: body.x, y: b.y - radius }, { x: body.x, y: b.y + b.h + radius },
    ]).filter(p => p.x >= BOUNDS.x + radius && p.x <= BOUNDS.x + BOUNDS.w - radius
      && p.y >= BOUNDS.y + radius && p.y <= BOUNDS.y + BOUNDS.h - radius && !overlaps(p));
    candidates.sort((a, b) => distance(a, body) - distance(b, body));
    if (candidates[0]) { body.x = candidates[0].x; body.y = candidates[0].y; }
  }
  // Axis sweep prevents tunneling while letting bodies slide along walls.
  let x = Math.max(BOUNDS.x + radius, Math.min(BOUNDS.x + BOUNDS.w - radius, body.x + dx));
  for (const b of obstacles) if (body.y > b.y - radius && body.y < b.y + b.h + radius) {
    if (dx > 0 && body.x <= b.x - radius && x > b.x - radius) x = b.x - radius;
    if (dx < 0 && body.x >= b.x + b.w + radius && x < b.x + b.w + radius) x = b.x + b.w + radius;
  }
  body.x = x;
  let y = Math.max(BOUNDS.y + radius, Math.min(BOUNDS.y + BOUNDS.h - radius, body.y + dy));
  for (const b of obstacles) if (body.x > b.x - radius && body.x < b.x + b.w + radius) {
    if (dy > 0 && body.y <= b.y - radius && y > b.y - radius) y = b.y - radius;
    if (dy < 0 && body.y >= b.y + b.h + radius && y < b.y + b.h + radius) y = b.y + b.h + radius;
  }
  body.y = y;
}

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const visible = (a: Point, b: Point, radius = 0, walls: readonly Box[] = WALLS) => !walls.some(w => segmentBox(a.x, a.y, b.x, b.y, w, radius) !== null);

export function nextWaypoint(from: Point, to: Point, radius: number, obstacles: readonly Box[] = PILLARS): Point {
  // Navigation may leave or slide along a contact face. Projectile sight tests stay exact.
  const walls = obstacles === PILLARS ? WALLS : [...BOUNDARY_WALLS, ...obstacles];
  const clear = (a: Point, b: Point) => visible(a, b, Math.max(0, radius - 0.001), walls);
  if (clear(from, to)) return to;
  const r = radius + 2;
  const points = [from, to, ...obstacles.flatMap(b => [
    { x: b.x - r, y: b.y - r }, { x: b.x + b.w + r, y: b.y - r },
    { x: b.x - r, y: b.y + b.h + r }, { x: b.x + b.w + r, y: b.y + b.h + r },
  ])];
  const costs = points.map(() => Infinity), previous = points.map(() => -1), done = new Set<number>();
  costs[0] = 0;
  for (let n = 0; n < points.length; n++) {
    let current = -1;
    for (let i = 0; i < points.length; i++) if (!done.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
    if (current < 0 || !Number.isFinite(costs[current])) break;
    if (current === 1) {
      let next = 1; while (previous[next] > 0) next = previous[next];
      return points[next];
    }
    done.add(current);
    for (let i = 1; i < points.length; i++) if (!done.has(i) && clear(points[current], points[i])) {
      const cost = costs[current] + distance(points[current], points[i]);
      if (cost < costs[i]) { costs[i] = cost; previous[i] = current; }
    }
  }
  return from;
}
