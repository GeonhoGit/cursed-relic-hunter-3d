import 'fake-indexeddb/auto';
import {describe,expect,it} from 'vitest';
import {SaveStore,defaultSettings} from '../src/persistence/save';
import {validRecord} from '../src/persistence/save-validation';
import {DEFAULT_BINDINGS} from '../src/core/keybindings';
import {createDungeonRun,travel} from '../src/core/simulation';
import {adjacentRooms} from '../src/core/dungeon';
describe('key binding persistence',()=>{
 it('captures immutable valid bindings in the same atomic save and writes content0.16',async()=>{
  const store=new SaveStore('bindings-save');await store.load();const settings={...defaultSettings(),bindings:{...DEFAULT_BINDINGS,jump:'KeyJ'}};const pending=store.save(null,settings);settings.bindings.jump='KeyK';
  const record=await pending;expect(record.content).toBe('prototype-0.16');expect(record.settings.bindings!.jump).toBe('KeyJ');expect((await store.load())!.settings.bindings).toEqual(record.settings.bindings);
 });
 it('rejects duplicate, partial and reserved mappings before writing and keeps existing settings',async()=>{
  const store=new SaveStore('bindings-corrupt');await store.load();const before=await store.save(null,defaultSettings());
  for(const bindings of [{...DEFAULT_BINDINGS,jump:'Shift'},{...DEFAULT_BINDINGS,interact:'Escape'},{forward:'KeyW'}])await expect(store.save(null,{...defaultSettings(),bindings:bindings as never})).rejects.toThrow();
  expect(await store.load()).toEqual(before);expect(validRecord({...before,settings:{...before.settings,bindings:null}})).toBe(false);
 });
 it('saves changed controls while preserving the old twelve-room combat and enemy roster',async()=>{
  const s=createDungeonRun(42,2);expect(travel(s,adjacentRooms(s).find(d=>d.room.kind==='combat')!.direction)).toBe(true);
  const store=new SaveStore('bindings-old-layout');await store.load();await store.save(s,{...defaultSettings(),bindings:{...DEFAULT_BINDINGS,jump:'KeyJ'}});
  const restored=(await store.load())!;expect(restored.run).toEqual(s);expect(restored.run!.expedition!.dungeon!.layoutVersion).toBe(2);expect(restored.run!.expedition!.dungeon!.rooms).toHaveLength(12);expect(restored.run!.wave).toBe(1);expect(restored.settings.bindings!.jump).toBe('KeyJ');
 });
});
