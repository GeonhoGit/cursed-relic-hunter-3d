import { describe, expect, it } from 'vitest';
import { RELIC_IDS } from '../src/core/relics';
import { createDungeon } from '../src/core/dungeon';
import { createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { defaultProfile, growthGoals, growthRelicUnlocks } from '../src/core/growth';
import { buyFromShop, refreshShop } from '../src/core/shop';

describe('remaining relic foundations', () => {
  it('provides all 57 distinct relics from the approved plan', () => {
    expect(new Set(RELIC_IDS).size).toBe(57);
    for (const id of ['R28','R35','R36','R39','R40','R41','R42','R47','R48']) expect(RELIC_IDS).toContain(id);
  });
  it('adds an optional locked treasure leaf while retaining the old eleven-room API', () => {
    expect(createDungeon(17).rooms).toHaveLength(11);
    const dungeon = createDungeon(17, 2);
    expect(dungeon.layoutVersion).toBe(2);
    expect(dungeon.rooms).toHaveLength(12);
    const room = dungeon.rooms[11];
    expect(room.kind).toBe('treasure'); expect(room.locked).toBe(true);
    expect(dungeon.rooms.filter(r => Math.abs(r.x-room.x)+Math.abs(r.y-room.y)===1)).toHaveLength(1);
  });
  it('uses new terrain only on new departures and blocks unopened locked rooms', () => {
    const s=createDungeonRun(17,2); expect(s.expedition!.dungeon!.layoutVersion).toBe(2);
    const lock=s.expedition!.dungeon!.rooms[11], parent=s.expedition!.dungeon!.rooms.find(r=>Math.abs(r.x-lock.x)+Math.abs(r.y-lock.y)===1)!;
    parent.visited=parent.cleared=true; s.expedition!.room=parent.id;
    const direction=lock.x>parent.x?'east':lock.x<parent.x?'west':lock.y>parent.y?'south':'north';
    expect(travel(s,direction)).toBe(false);
  });
  it('collects gold once and stores floor healing in FIFO instead of instant healing', () => {
    const s=createDungeonRun(17), room=s.expedition!.dungeon!.rooms[0];
    room.pickups=[{id:'coin',kind:'gold',amount:8,x:320,y:183},{id:'heal',kind:'heal',amount:10,x:320,y:183}];
    s.expedition!.relics=['R39'];s.expedition!.acquired=['R39'];s.player.hp=50;
    step(s,emptyInput());expect(s.gold).toBe(8);expect(s.player.hp).toBe(50);expect(s.recoveryItems?.map(i=>i.healAmount)).toEqual([10]);
    step(s,{...emptyInput(),heal:true});expect(s.recoveryCast?.ticks).toBe(30);
    for(let i=0;i<30;i++)step(s,emptyInput());expect(s.player.hp).toBe(60);expect(s.recoveryItems).toHaveLength(0);
  });
  it('stores shop healing at full HP and refuses payment with a full bag', () => {
    const s=createDungeonRun(17),room=s.expedition!.dungeon!.rooms[10];room.visited=room.cleared=true;s.expedition!.room=10;s.gold=100;
    s.expedition!.relics=['R39'];s.expedition!.acquired=['R39'];refreshShop(s);
    expect(buyFromShop(s,2,room.shop!.revision)).toBe('bought');expect(s.recoveryItems?.[0].healAmount).toBe(15);
    room.shop!.slots[2].purchased=false;s.recoveryItems=Array.from({length:3},(_,i)=>({pickupId:`h${i}`,healAmount:10,source:'floor' as const,order:i+1}));
    const gold=s.gold;expect(buyFromShop(s,2,room.shop!.revision)).toBe('unavailable');expect(s.gold).toBe(gold);
  });
  it('offers twelve goals and unlocks terrain relics from actual prior progress', () => {
    const p=defaultProfile();p.purchases=Array.from({length:5},(_,slot)=>({runId:`run${slot}`,room:10,slot:0}));
    p.relics=RELIC_IDS.slice(0,12);expect(growthGoals(p)).toHaveLength(12);
    expect(growthRelicUnlocks(p)).toEqual(expect.arrayContaining(['R28','R35','R36']));
  });
});
