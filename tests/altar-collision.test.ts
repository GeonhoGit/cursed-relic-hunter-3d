import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { adjacentRooms, currentRoom } from '../src/core/dungeon';
import { chooseRelic, leaveAltar } from '../src/core/expedition';

function altar() {
  const s = createDungeonRun(2), from = adjacentRooms(s, 9)[0].room;
  from.visited = from.cleared = true; s.expedition!.room = from.id;
  expect(travel(s, adjacentRooms(s).find(d => d.room.id === 9)!.direction)).toBe(true);
  expect(leaveAltar(s)).toBe(true);
  return s;
}

const approaches = [
  { side: 'west', x: 270, y: 185, moveX: 1, moveY: 0, stopX: 283, stopY: 185 },
  { side: 'east', x: 370, y: 185, moveX: -1, moveY: 0, stopX: 357, stopY: 185 },
  { side: 'north', x: 320, y: 150, moveX: 0, moveY: 1, stopX: 320, stopY: 164 },
  { side: 'south', x: 320, y: 220, moveX: 0, moveY: -1, stopX: 320, stopY: 207 },
];

describe('altar body collision', () => {
  for (const dodge of [false, true]) {
    it.each(approaches)(`${dodge ? 'dodge' : 'walking'} stops at the $side face`, a => {
      const s = altar(); Object.assign(s.player, { x: a.x, y: a.y });
      for (let tick = 0; tick < 15; tick++) step(s, { ...emptyInput(), moveX: a.moveX, moveY: a.moveY, dodge: dodge && tick === 0 });
      expect(s.player.x).toBeCloseTo(a.stopX); expect(s.player.y).toBeCloseTo(a.stopY);
    });
  }

  it('slides along the pedestal and can walk around it across the decorative circle', () => {
    const s = altar(); Object.assign(s.player, { x: 310, y: 207 });
    for (let tick = 0; tick < 15; tick++) step(s, { ...emptyInput(), moveX: 1, moveY: -1 });
    expect(s.player.x).toBeGreaterThan(330); expect(s.player.y).toBe(207);
    for (let tick = 0; tick < 14; tick++) step(s, { ...emptyInput(), moveX: 1 });
    for (let tick = 0; tick < 28; tick++) step(s, { ...emptyInput(), moveY: -1 });
    expect(s.player.y).toBe(137); expect(s.expedition!.room).toBe(9);
  });

  it('moves an old overlapping saved position to the nearest outside edge without trapping it', () => {
    const s = altar(); Object.assign(s.player, { x: 320, y: 196 });
    const restored = JSON.parse(JSON.stringify(s)) as typeof s;
    step(restored, emptyInput());
    expect(restored.player).toMatchObject({ x: 320, y: 207, hp: 100 });
    step(restored, { ...emptyInput(), moveY: 1 });
    expect(restored.player.y).toBe(209.5);
  });

  it('keeps collision after taking a relic and revisiting, without blocking other room centers', () => {
    const s = altar(); s.phase = 'cleared';
    expect(chooseRelic(s, 'R43')).toBe(true);
    const exit = adjacentRooms(s)[0];
    expect(travel(s, exit.direction)).toBe(true);
    currentRoom(s)!.cleared = true; s.phase = 'explore'; s.enemies = [];
    Object.assign(s.player, { x: 320, y: 210 });
    for (let tick = 0; tick < 15; tick++) step(s, { ...emptyInput(), moveY: -1 });
    expect(s.player.y).toBe(172.5);
    expect(travel(s, adjacentRooms(s).find(d => d.room.id === 9)!.direction)).toBe(true);
    Object.assign(s.player, { x: 320, y: 220 });
    for (let tick = 0; tick < 15; tick++) step(s, { ...emptyInput(), moveY: -1 });
    expect(s.player.y).toBe(207);
  });
});
