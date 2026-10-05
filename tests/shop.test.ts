import { describe, expect, it } from 'vitest';
import { createDungeonRun, travel } from '../src/core/simulation';
import { adjacentRooms, currentRoom } from '../src/core/dungeon';
import { buyFromShop, purchaseIssue, refreshShop } from '../src/core/shop';
import { grantRelic } from '../src/core/relic-acquisition';
import { reviveContract } from '../src/core/curses';
import { chooseRelic, prepareReward } from '../src/core/expedition';
import { isCurse, RELIC_IDS } from '../src/core/relics';

function visit(seed = 42) {
  const s = createDungeonRun(seed), from = adjacentRooms(s, 10).find(d => d.room.kind === 'combat')!.room;
  from.visited = from.cleared = true; s.expedition!.room = from.id; s.gold = 40;
  expect(travel(s, adjacentRooms(s).find(d => d.room.id === 10)!.direction)).toBe(true);
  return s;
}
describe('ruins shop', () => {
  it('opens a safe optional eleventh room with stable stock and no extra rewards', () => {
    const s = visit(), stock = structuredClone(currentRoom(s)!.shop!); expect(s.expedition!.dungeon!.rooms).toHaveLength(11);
    expect(s.phase).toBe('explore'); expect(s.enemies).toHaveLength(0); expect(s.gold).toBe(40); expect(s.stats.kills).toBe(0);
    expect(stock.slots.map(x => x.kind)).toEqual(['relic', 'relic', 'heal', 'curse']);
    expect(stock.slots[3].relic).toBe('R43'); expect(new Set(stock.slots.filter(x => x.relic).map(x => x.relic)).size).toBe(3);
    const rng = s.rng; expect(refreshShop(s)).toBe(false); expect(s.rng).toBe(rng);
    travel(s, adjacentRooms(s)[0].direction); travel(s, adjacentRooms(s).find(d => d.room.id === 10)!.direction);
    expect(currentRoom(s)!.shop).toEqual(stock); expect(s.gold).toBe(40);
  });
  it('charges once and uses the same relic acquisition effects as a treasure', () => {
    const s = visit(), shop = currentRoom(s)!.shop!; shop.slots[0].relic = 'R13'; shop.slots[1].relic = 'R25';
    const revision = shop.revision;
    expect(buyFromShop(s, 0, revision)).toBe('bought'); expect(s.gold).toBe(16); expect(s.player.equippedAux).toBe('R13');
    expect(s.expedition!.relics).toContain('R13'); expect(shop.slots[0].purchased).toBe(true);
    expect(buyFromShop(s, 0, revision)).not.toBe('bought'); expect(buyFromShop(s, 0, shop.revision)).toBe('unavailable'); expect(s.gold).toBe(16);
  });
  it('rejects insufficient funds and full health without consuming the item, then heals up to max HP once', () => {
    const s = visit(), shop = currentRoom(s)!.shop!; expect(purchaseIssue(s, 2)).toContain('최대');
    expect(buyFromShop(s, 2, shop.revision)).toBe('unavailable'); expect(s.gold).toBe(40);
    s.player.hp = 94; s.gold = 19; expect(buyFromShop(s, 2, shop.revision)).toBe('unavailable'); expect(s.player.hp).toBe(94);
    s.gold = 20; expect(buyFromShop(s, 2, shop.revision)).toBe('bought'); expect(s.player.hp).toBe(100); expect(s.gold).toBe(0);
    s.player.hp = 50; s.gold = 20; expect(buyFromShop(s, 2, shop.revision)).toBe('unavailable'); expect(s.player.hp).toBe(50);
  });
  it('repairs only an externally acquired slot, preserves other stock and refuses payment for the stale displayed revision', () => {
    const s = visit(), shop = currentRoom(s)!.shop!, before = structuredClone(shop), rng = s.rng;
    grantRelic(s, shop.slots[0].relic!); const copy = structuredClone(s);
    expect(buyFromShop(s, 0, before.revision)).toBe('changed'); expect(s.gold).toBe(40);
    expect(shop.slots[0].relic).not.toBe(before.slots[0].relic); expect(shop.slots[0].repairCounter).toBe(before.slots[0].repairCounter + 1);
    expect(shop.slots.slice(1)).toEqual(before.slots.slice(1)); expect(s.rng).toBe(rng);
    refreshShop(copy); expect(currentRoom(copy)!.shop).toEqual(shop);
    expect(refreshShop(s)).toBe(false); expect(buyFromShop(s, 0, shop.revision)).toBe('bought');
  });
  it('offers a contract only when eligible and never refills a purchased relic after consumption or loss', () => {
    const s = visit(), shop = currentRoom(s)!.shop!;
    grantRelic(s, 'R01'); grantRelic(s, 'R02'); grantRelic(s, 'R43'); refreshShop(s);
    expect(shop.slots[3].relic).toBe('R38'); const revision = shop.revision;
    expect(buyFromShop(s, 3, revision)).toBe('bought'); expect(s.gold).toBe(10);
    s.player.hp = 0; expect(reviveContract(s)).toBe(true); refreshShop(s);
    expect(shop.slots[3].relic).toBe('R38'); expect(shop.slots[3].purchased).toBe(true);
    expect(s.expedition!.acquired).toContain('R38'); expect(buyFromShop(s, 3, shop.revision)).toBe('unavailable');
  });
  it('rechecks a contract condition before payment and blocks a now-ineligible displayed offer', () => {
    const s = visit(), shop = currentRoom(s)!.shop!; grantRelic(s, 'R01'); grantRelic(s, 'R20'); grantRelic(s, 'R43'); refreshShop(s);
    expect(shop.slots[3].relic).toBe('R38'); const revision = shop.revision;
    s.expedition!.relics = s.expedition!.relics.filter(id => id !== 'R20');
    expect(buyFromShop(s, 3, revision)).toBe('changed'); expect(shop.slots[3].relic).toBeNull(); expect(s.gold).toBe(40);
    grantRelic(s, 'R02'); refreshShop(s); expect(shop.slots[3].relic).toBe('R38');
  });
  it('does not refill valid or purchased slots when there are no remaining candidates', () => {
    const s = visit(), shop = currentRoom(s)!.shop!;
    for (const id of RELIC_IDS.filter(id => !isCurse(id))) grantRelic(s, id);
    refreshShop(s); expect(shop.slots.slice(0, 2).every(x => x.relic === null)).toBe(true);
    const before = structuredClone(shop); expect(refreshShop(s)).toBe(false); expect(shop).toEqual(before);
  });
  it('never charges outside safe shop exploration and forbids acquiring a purchased curse again from the altar', () => {
    const s = visit(), shop = currentRoom(s)!.shop!; s.phase = 'combat';
    expect(buyFromShop(s, 3, shop.revision)).toBe('unavailable'); expect(s.gold).toBe(40);
    s.phase = 'explore'; expect(buyFromShop(s, 3, shop.revision)).toBe('bought');
    s.expedition!.room = 9; const altar = currentRoom(s)!; altar.visited = altar.cleared = true; s.phase = 'cleared'; prepareReward(s);
    expect(chooseRelic(s, 'R43')).toBe(false); expect(chooseRelic(s, 'skip')).toBe(true);
  });
});
