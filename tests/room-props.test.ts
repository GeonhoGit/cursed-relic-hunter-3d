import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { adjacentRooms, currentRoom } from '../src/core/dungeon';
import { buyFromShop } from '../src/core/shop';

function visit(kind: 'shop' | 'treasure', legacy = false) {
  const s = createDungeonRun(42), id = kind === 'shop' ? 10 : 6;
  if (legacy) delete s.expedition!.dungeon!.layoutVersion;
  const from = adjacentRooms(s, id)[0].room; from.visited = from.cleared = true; s.expedition!.room = from.id;
  expect(travel(s, adjacentRooms(s).find(d => d.room.id === id)!.direction)).toBe(true);
  if (kind === 'treasure') expect(s.phase).toBe('explore');
  return s;
}

const approaches = [
  { kind: 'shop', side: 'counter west', x: 260, y: 187, moveX: 1, moveY: 0, endX: 277, endY: 187 },
  { kind: 'shop', side: 'counter east', x: 380, y: 187, moveX: -1, moveY: 0, endX: 363, endY: 187 },
  { kind: 'shop', side: 'counter south', x: 320, y: 225, moveX: 0, moveY: -1, endX: 320, endY: 210 },
  { kind: 'shop', side: 'merchant north', x: 320, y: 120, moveX: 0, moveY: 1, endX: 320, endY: 138 },
  { kind: 'shop', side: 'merchant west', x: 280, y: 155, moveX: 1, moveY: 0, endX: 299, endY: 155 },
  { kind: 'shop', side: 'merchant east', x: 360, y: 155, moveX: -1, moveY: 0, endX: 341, endY: 155 },
  { kind: 'treasure', side: 'west', x: 280, y: 180, moveX: 1, moveY: 0, endX: 296, endY: 180 },
  { kind: 'treasure', side: 'east', x: 360, y: 180, moveX: -1, moveY: 0, endX: 344, endY: 180 },
  { kind: 'treasure', side: 'north', x: 320, y: 145, moveX: 0, moveY: 1, endX: 320, endY: 163 },
  { kind: 'treasure', side: 'south', x: 320, y: 220, moveX: 0, moveY: -1, endX: 320, endY: 198 },
] as const;

describe('solid room props', () => {
  for (const dodge of [false, true]) it.each(approaches)(`${dodge ? 'dodge' : 'walk'} stops at $kind $side`, a => {
    const s = visit(a.kind); Object.assign(s.player, { x: a.x, y: a.y });
    for (let t = 0; t < 15; t++) step(s, { ...emptyInput(), moveX: a.moveX, moveY: a.moveY, dodge: dodge && t === 0 });
    expect(s.player.x).toBeCloseTo(a.endX); expect(s.player.y).toBeCloseTo(a.endY);
  });

  it.each([false, true])('resolves overlap with the merchant-counter seam without oscillation (legacy=%s)', legacy => {
    const s = visit('shop', legacy); Object.assign(s.player, { x: 320, y: 175 });
    const restored = JSON.parse(JSON.stringify(s)) as typeof s;
    step(restored, emptyInput()); expect(restored.player).toMatchObject({ x: 320, y: 210 });
    for (let t = 0; t < 20; t++) step(restored, emptyInput());
    expect(restored.player).toMatchObject({ x: 320, y: 210, hp: 100 });
    step(restored, { ...emptyInput(), moveY: 1 }); expect(restored.player.y).toBe(212.5);
  });

  it('restores an old position inside the treasure pedestal to a free edge', () => {
    const s = visit('treasure', true); Object.assign(s.player, { x: 320, y: 180 });
    step(s, emptyInput()); expect(s.player).toMatchObject({ x: 320, y: 163 });
    step(s, { ...emptyInput(), moveY: -1 }); expect(s.player.y).toBe(160.5);
  });

  it('allows sliding around the counter and behind the merchant', () => {
    const s = visit('shop'); Object.assign(s.player, { x: 320, y: 210 });
    for (let t = 0; t < 12; t++) step(s, { ...emptyInput(), moveX: 1, moveY: -1 });
    expect(s.player.y).toBe(210); expect(s.player.x).toBeGreaterThan(340);
    for (let t = 0; t < 14; t++) step(s, { ...emptyInput(), moveX: 1 });
    for (let t = 0; t < 34; t++) step(s, { ...emptyInput(), moveY: -1 });
    expect(s.player.y).toBe(125);
    for (let t = 0; t < 30; t++) step(s, { ...emptyInput(), moveX: -1 });
    expect(s.player.x).toBeLessThan(310); expect(s.player.y).toBe(125); expect(s.expedition!.room).toBe(10);
  });

  it('keeps the counter solid after buying and revisiting without changing the purchase', () => {
    const s = visit('shop'); s.gold = 40;
    expect(buyFromShop(s, 0, currentRoom(s)!.shop!.revision)).toBe('bought');
    const stock = structuredClone(currentRoom(s)!.shop!);
    travel(s, adjacentRooms(s)[0].direction); travel(s, adjacentRooms(s).find(d => d.room.id === 10)!.direction);
    Object.assign(s.player, { x: 320, y: 225 });
    for (let t = 0; t < 15; t++) step(s, { ...emptyInput(), moveY: -1 });
    expect(s.player.y).toBe(210); expect(currentRoom(s)!.shop).toEqual(stock);
  });

  it('does not put invisible furniture in ordinary rooms', () => {
    const s = createDungeonRun(42); s.player.y = 220;
    for (let t = 0; t < 40; t++) step(s, { ...emptyInput(), moveY: -1 });
    expect(s.player.y).toBe(120);
  });
});
