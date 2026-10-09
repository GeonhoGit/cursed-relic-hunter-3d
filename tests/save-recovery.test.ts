import 'fake-indexeddb/auto';
import {describe,expect,it,vi} from 'vitest';
import {SaveRecovery} from '../src/persistence/save-recovery';
import {SaveStore,ConflictError,defaultSettings} from '../src/persistence/save';
import {createDungeonRun} from '../src/core/simulation';
import {emptyInvestment} from '../src/core/growth';

const payload=()=>({run:createDungeonRun(42,3),settings:defaultSettings()});
describe('save error recovery ownership',()=>{
 it('retries an initial read without writing a null memory run',async()=>{
  const old={run:{player:{hp:80}}},store={load:vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(old),save:vi.fn()},recovery=new SaveRecovery();
  await expect(recovery.read(store as never)).rejects.toThrow('offline');expect(recovery.mode).toBe('read');expect(await recovery.retry(store as never)).toEqual({kind:'loaded',record:old});expect(store.save).not.toHaveBeenCalled();
 });
 it('retries the immutable original write payload and all configuration arguments without refreshing the revision',async()=>{
  const p={...payload(),investment:{...emptyInvestment(),health:1},weapon:'W01' as const},store={load:vi.fn(),save:vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({revision:2})},recovery=new SaveRecovery();p.run.player.hp=57;
  await expect(recovery.save(store as never,p)).rejects.toThrow('offline');p.run.player.hp=1;p.settings.fps=120;p.investment.health=45;
  expect((await recovery.retry(store as never)).kind).toBe('saved');expect(store.load).not.toHaveBeenCalled();expect(store.save.mock.calls[1][0].player.hp).toBe(57);expect(store.save.mock.calls[1][1].fps).toBe(60);expect(store.save.mock.calls[1][2].health).toBe(1);expect(store.save.mock.calls[1][3]).toBe('W01');
 });
 it('retries a repeated write error but switches to read-only recovery after a revision conflict',async()=>{
  const store={load:vi.fn().mockResolvedValue({revision:9}),save:vi.fn().mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline again')).mockRejectedValueOnce(new ConflictError())},r=new SaveRecovery();
  await expect(r.save(store as never,payload())).rejects.toThrow();await expect(r.retry(store as never)).rejects.toThrow('offline again');expect(r.mode).toBe('write');await expect(r.retry(store as never)).rejects.toBeInstanceOf(ConflictError);expect(r.mode).toBe('conflict');expect(await r.retry(store as never)).toEqual({kind:'loaded',record:{revision:9}});expect(store.save).toHaveBeenCalledTimes(3);
 });
 it('does not clear the newer pending snapshot when an older queued write completes',async()=>{
  let first!:(r:unknown)=>void,second!:(e:unknown)=>void;const store={load:vi.fn(),save:vi.fn().mockImplementationOnce(()=>new Promise(r=>first=r)).mockImplementationOnce(()=>new Promise((_,r)=>second=r)).mockResolvedValue({revision:2})},r=new SaveRecovery(),a=payload(),b=payload();b.run.player.hp=63;
  const one=r.save(store as never,a),two=r.save(store as never,b);first({revision:1});await one;second(new Error('offline'));await expect(two).rejects.toThrow('offline');await r.retry(store as never);expect(store.save.mock.calls[2][0].player.hp).toBe(63);
 });
 it('keeps the latest actual IndexedDB checkpoint after a stale writer conflicts and recovers',async()=>{
  const name='report-conflict-recovery',fresh=new SaveStore(name),stale=new SaveStore(name),r=new SaveRecovery();await fresh.load();const p=payload();p.run.player.hp=80;await fresh.save(p.run,p.settings);await r.read(stale);const latest=structuredClone(p.run);latest.player.hp=61;const written=await fresh.save(latest,p.settings);
  await expect(r.save(stale,p)).rejects.toBeInstanceOf(ConflictError);expect(r.mode).toBe('conflict');expect((await r.retry(stale)).record).toEqual(written);expect(await fresh.load()).toEqual(written);
 });
});
