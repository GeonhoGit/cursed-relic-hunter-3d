import { describe, expect, it } from 'vitest';
import { createDungeonRun } from '../src/core/simulation';
import { beginGrowthRun, emptyInvestment } from '../src/core/growth';
import { grantRelic, canAcquireRelic } from '../src/core/relic-acquisition';
import { prepareReward, rerollReward, chooseRelic } from '../src/core/expedition';
import { refreshShop, buyFromShop, purchaseIssue } from '../src/core/shop';
import { shopMarkup } from '../src/game/shop-ui';
import { RELIC_IDS, RELICS } from '../src/core/relics';
import { validRun } from '../src/persistence/save';
import { shopPayment } from '../src/core/shop';
import { attackStats } from '../src/core/attack-relics';
import { createBoss } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import 'fake-indexeddb/auto';
import { SaveStore, defaultSettings } from '../src/persistence/save';

function run(wallet = true) {
  const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'blood-wallet-run');
  if (wallet) { const r = s.expedition!.dungeon!.rooms[6]; r.visited = r.cleared = true; r.reward = { room: 6, candidates: ['R37' as any], choice: 'R37' as any }; grantRelic(s, 'R37' as any); }
  return s;
}
function shop(s: ReturnType<typeof run>) {
  s.expedition!.room = 10; const r = s.expedition!.dungeon!.rooms[10]; r.visited = r.cleared = true; s.phase = 'explore'; s.player.x = 320; s.player.y = 238; s.gold = 100; refreshShop(s); return r.shop!;
}
describe('blood wallet', () => {
  it('registers an initially available legendary passive', () => {
    expect(RELIC_IDS).toHaveLength(57); expect((RELICS as any).R37.rarity).toBe('legendary'); expect(canAcquireRelic(createDungeonRun(42), 'R37' as any)).toBe(true);
  });
  it('pays twenty health for an ordinary relic and keeps gold, damage and chance records unchanged', () => {
    const s = run(), offer = shop(s); offer.slots[0].relic = 'R24'; s.gold = 0; const before = structuredClone(s);
    expect(purchaseIssue(s, 0)).toBe(''); expect(buyFromShop(s, 0, offer.revision)).toBe('bought'); expect(s.player.hp).toBe(80); expect(s.gold).toBe(0);
    expect(s.stats).toEqual(before.stats); expect(s.player.invulnerable).toBe(before.player.invulnerable); expect(s.player.teleportTick).toBeUndefined(); expect(s.cues).toEqual(before.cues);
    expect(s.expedition!.relics).toContain('R24'); expect(s.growth!.auxiliaryUsed).toBeUndefined(); expect(validRun(s)).toBe(true);
  });
  it('pays fifteen health for the curse stock and refuses healing stock without a transaction', () => {
    const s = run(), offer = shop(s); offer.slots[3].relic = 'R43'; expect(buyFromShop(s, 3, offer.revision)).toBe('bought'); expect(s.player.hp).toBe(85); expect(s.gold).toBe(100);
    s.player.hp = 50; const before = structuredClone(s); expect(purchaseIssue(s, 2)).toContain('회복품'); expect(buyFromShop(s, 2, offer.revision)).toBe('unavailable'); expect(s).toEqual(before);
  });
  it('allows exactly one health after buying and blocks fractional values below the minimum', () => {
    const s = run(), offer = shop(s); offer.slots[0].relic = 'R01'; s.player.hp = 20.5; const before = structuredClone(s);
    expect(purchaseIssue(s, 0)).toContain('21'); expect(buyFromShop(s, 0, offer.revision)).toBe('unavailable'); expect(s).toEqual(before);
    s.player.hp = 21; expect(buyFromShop(s, 0, offer.revision)).toBe('bought'); expect(s.player.hp).toBe(1);
    const curse = run(), c = shop(curse); c.slots[3].relic = 'R43'; curse.player.hp = 16; expect(buyFromShop(curse, 3, c.revision)).toBe('bought'); expect(curse.player.hp).toBe(1);
  });
  it('charges the wallet itself by the payment mode before acquisition and changes later transactions', () => {
    const s = run(false), offer = shop(s); offer.slots[0].relic = 'R37' as any; offer.slots[1].relic = 'R01';
    expect(buyFromShop(s, 0, offer.revision)).toBe('bought'); expect(s.gold).toBe(76); expect(s.player.hp).toBe(100);
    expect(buyFromShop(s, 1, offer.revision)).toBe('bought'); expect(s.gold).toBe(76); expect(s.player.hp).toBe(80); expect(validRun(s)).toBe(true);
  });
  it('shows the same health price and preserves old discounted gold prices after wallet loss', () => {
    const s = run(), offer = shop(s); offer.slots[0].relic = 'R01'; expect(shopMarkup(s)).toContain('20 생명력'); expect(shopMarkup(s)).toContain('15 생명력');
    s.expedition!.relics = []; expect(shopMarkup(s)).toContain('24 금화'); s.player.hp = 50; expect(buyFromShop(s, 0, offer.revision)).toBe('bought'); expect(s.gold).toBe(76); expect(s.player.hp).toBe(50);
  });
  it('does not insert a new scale candidate while the wallet is held but preserves existing scale stock', () => {
    for (let i = 1; i <= 100; i++) {
      const s = run(); s.seed = Math.imul(i, 0x9e3779b9) >>> 0; s.rng = s.seed; s.growth!.relicUnlocks = ['R33'];
      s.expedition!.room = 7; const r = s.expedition!.dungeon!.rooms[7]; r.visited = r.cleared = true; s.phase = 'cleared'; prepareReward(s); expect(r.reward!.candidates).not.toContain('R33');
      rerollReward(s); expect(r.reward!.candidates).not.toContain('R33'); chooseRelic(s, 'skip'); const offer = shop(s); expect(offer.slots.some(q => q.relic === 'R33')).toBe(false);
    }
    const old = run(), offer = shop(old); old.growth!.relicUnlocks = ['R33']; offer.slots[0].relic = 'R33'; const revision = offer.revision;
    expect(refreshShop(old)).toBe(false); expect(offer.slots[0].relic).toBe('R33'); expect(offer.revision).toBe(revision); expect(buyFromShop(old, 0, offer.revision)).toBe('bought'); expect(old.player.hp).toBe(80);
  });
  it('rejects a stale purchase and a duplicate click without spending either resource twice', () => {
    const s = run(), offer = shop(s); offer.slots[0].relic = 'R01'; const revision = offer.revision, before = structuredClone(s);
    expect(buyFromShop(s, 0, revision - 1)).toBe('changed'); expect(s).toEqual(before); expect(buyFromShop(s, 0, revision)).toBe('bought'); const after = structuredClone(s);
    expect(buyFromShop(s, 0, offer.revision)).toBe('unavailable'); expect(s).toEqual(after);
  });
  it('buys the wallet with an existing scale discount but never discounts later health costs', () => {
    const s = run(false); s.growth!.relicUnlocks = ['R33']; const r = s.expedition!.dungeon!.rooms[6]; r.visited = r.cleared = true; r.reward = { room: 6, candidates: ['R33'], choice: 'R33' }; grantRelic(s, 'R33');
    const offer = shop(s); offer.slots[0].relic = 'R37'; offer.slots[1].relic = 'R01'; s.gold = 20;
    expect(buyFromShop(s, 0, offer.revision)).toBe('bought'); expect(s.gold).toBe(0); expect(s.player.hp).toBe(100); expect(shopPayment(s, offer.slots[1])).toEqual({ resource: 'health', amount: 20 });
    expect(buyFromShop(s, 1, offer.revision)).toBe('bought'); expect(s.player.hp).toBe(80); expect(s.gold).toBe(0); expect(shopMarkup(s)).not.toContain('금화 가격 20% 할인'); expect(validRun(s)).toBe(true);
  });
  it('restores a held scale and gold healing prices when the wallet is lost', () => {
    const s = run(); s.growth!.relicUnlocks = ['R33']; const r = s.expedition!.dungeon!.rooms[7]; r.visited = r.cleared = true; r.reward = { room: 7, candidates: ['R33'], choice: 'R33' }; grantRelic(s, 'R33');
    const offer = shop(s); s.player.hp = 50; expect(shopPayment(s, offer.slots[2])).toBeNull(); s.expedition!.relics = s.expedition!.relics.filter(id => id !== 'R37');
    expect(shopPayment(s, offer.slots[2])).toEqual({ resource: 'gold', amount: 16 }); refreshShop(s);
    expect(buyFromShop(s, 2, offer.revision)).toBe('bought'); expect(s.player.hp).toBe(65); expect(s.gold).toBe(84); expect(validRun(s)).toBe(true);
  });
  it('preserves a scale that was already in an old chest rather than treating it as a newly generated candidate', () => {
    const s = run(); s.growth!.relicUnlocks = ['R33']; s.expedition!.room = 7; const r = s.expedition!.dungeon!.rooms[7]; r.visited = r.cleared = true; s.phase = 'cleared';
    r.reward = { room: 7, candidates: ['R33', 'R01', 'R02'], choice: null }; expect(chooseRelic(s, 'R33')).toBe(true); expect(s.expedition!.relics).toEqual(['R37', 'R33']); expect(validRun(s)).toBe(true);
  });
  it('does not trigger bandage, revival, retaliation or evacuation at the exact health boundary', () => {
    const s = run(), r = s.expedition!.dungeon!.rooms[7]; r.visited = r.cleared = true; r.reward = { room: 7, candidates: ['R24'], choice: 'R24' }; grantRelic(s, 'R24');
    let offer = shop(s); offer.slots[0].relic = 'R20'; offer.slots[1].relic = 'R23'; expect(buyFromShop(s, 0, offer.revision)).toBe('bought'); expect(buyFromShop(s, 1, offer.revision)).toBe('bought');
    s.expedition!.room = 9; const altar = s.expedition!.dungeon!.rooms[9]; altar.visited = altar.cleared = true; s.phase = 'cleared'; prepareReward(s); expect(chooseRelic(s, 'R38')).toBe(true);
    s.expedition!.room = 8; s.expedition!.dungeon!.rooms[8].visited = s.expedition!.dungeon!.rooms[8].cleared = true; s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared'; expect(enterNextRegion(s)).toBe(true);
    offer = shop(s); offer.slots[0].relic = 'R01'; s.player.hp = 21; const before = structuredClone(s);
    expect(buyFromShop(s, 0, offer.revision)).toBe('bought'); expect(s.player.hp).toBe(1); expect(s.player.invulnerable).toBe(before.player.invulnerable); expect(s.stats).toEqual(before.stats); expect(s.cues).toEqual(before.cues);
    expect(s.expedition!.relics).toEqual(expect.arrayContaining(['R20', 'R38', 'R23', 'R24'])); expect(s.revival).toBeUndefined(); expect(s.player.teleportTick).toBeUndefined(); expect(s.player.thornsCooldown).toBeUndefined();
    expect(s.expedition!.dungeon!.rooms.some(q => q.featherUsed)).toBe(false); expect(validRun(s)).toBe(true);
  });
  it('still updates health-dependent attack relics when health is paid quietly', () => {
    const s = run(), r = s.expedition!.dungeon!.rooms[7]; r.visited = r.cleared = true; r.reward = { room: 7, candidates: ['R57'], choice: 'R57' }; grantRelic(s, 'R57');
    const offer = shop(s); offer.slots[0].relic = 'R51'; offer.slots[1].relic = 'R06'; offer.slots[3].relic = 'R43';
    expect(buyFromShop(s, 0, offer.revision)).toBe('bought'); expect(attackStats(s).crownActive).toBe(true);
    expect(buyFromShop(s, 1, offer.revision)).toBe('bought'); expect(attackStats(s).crownActive).toBe(false); expect(buyFromShop(s, 3, offer.revision)).toBe('bought');
    expect(attackStats(s).fangActive).toBe(true); expect(s.stats.hits).toBe(0); expect(validRun(s)).toBe(true);
  });
  it('persists the actual currency, health and sold slots without charging again after reload', async () => {
    const store = new SaveStore('blood-wallet-live'); await store.load(); const s = run(), offer = shop(s); offer.slots[0].relic = 'R01'; s.player.hp = 91.5; s.gold = 0;
    expect(buyFromShop(s, 0, offer.revision)).toBe('bought'); expect(s.player.hp).toBe(71.5); await store.save(s, defaultSettings()); const restored = (await store.load())!.run!;
    expect(restored).toEqual(s); const before = structuredClone(restored); expect(buyFromShop(restored, 0, offer.revision)).toBe('unavailable'); expect(restored).toEqual(before);
  });
  it('keeps the old gold mode for earlier saves and refuses buying the wallet on insufficient gold', () => {
    const s = run(false), offer = shop(s); offer.slots[0].relic = 'R37'; s.gold = 23; const before = structuredClone(s);
    expect(purchaseIssue(s, 0)).toBe('금화 부족'); expect(buyFromShop(s, 0, offer.revision)).toBe('unavailable'); expect(s).toEqual(before); expect(validRun(s)).toBe(true);
    expect(validRun(createDungeonRun(42))).toBe(true);
  });
  it('reaches the wallet in real initial chest, refresh and shop pools with actual acquisition', () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 500; i++) {
      const s = createDungeonRun(Math.imul(i, 0x9e3779b9) >>> 0); beginGrowthRun(s, emptyInvestment(), `wallet-pool-${i}`); s.expedition!.room = 6; s.phase = 'cleared';
      const r = s.expedition!.dungeon!.rooms[6]; r.visited = r.cleared = true; prepareReward(s);
      if (r.reward!.candidates.includes('R37')) { seen.add('chest'); const q = structuredClone(s); expect(chooseRelic(q, 'R37')).toBe(true); expect(validRun(q)).toBe(true); }
      rerollReward(s); if (r.reward!.candidates.includes('R37')) { seen.add('refresh'); const q = structuredClone(s); expect(chooseRelic(q, 'R37')).toBe(true); expect(validRun(q)).toBe(true); }
      chooseRelic(s, 'skip'); const offer = shop(s), slot = offer.slots.findIndex(q => q.relic === 'R37');
      if (slot >= 0) { seen.add('shop'); expect(buyFromShop(s, slot, offer.revision)).toBe('bought'); expect(s.player.hp).toBe(100); expect(s.gold).toBe(76); expect(validRun(s)).toBe(true); }
    }
    expect([...seen].sort()).toEqual(['chest', 'refresh', 'shop']);
  });
});
