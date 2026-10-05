import { validMouseSensitivity } from '../core/settings';
import type { Investment, RunState, WeaponId } from '../core/model';
import { defaultProfile, earnedPoints, investedPoints, recordGrowth, validProfile } from '../core/growth';
import { weaponUnlocked } from '../core/weapons';
import { validRecord, validRun } from './save-validation';
import type { SaveRecord, Settings } from './save-types';

export { defaultSettings } from './save-types';
export type { SaveRecord, Settings } from './save-types';
export { validRun } from './save-validation';

export class ConflictError extends Error { constructor() { super('다른 창에서 더 최신 기록을 저장했습니다. 최신 기록을 불러오세요.'); } }
export class CorruptSaveError extends Error { constructor() { super('이 저장 기록을 읽을 수 없습니다. 기존 기록은 보존했습니다.'); } }

export class SaveStore {
  private dbPromise?: Promise<IDBDatabase>;
  private revision = 0;
  private queue: Promise<void> = Promise.resolve();
  private blocked = false;
  constructor(private name = 'cursed-relic-hunter-3d-v1') {}
  private db() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      let failed = false;
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('save');
      request.onsuccess = () => {
        const db = request.result;
        if (failed) { db.close(); return; }
        db.onversionchange = () => { db.close(); this.dbPromise = undefined; }; resolve(db);
      };
      request.onerror = () => { failed = true; reject(request.error); };
      request.onblocked = () => { failed = true; reject(new Error('다른 창이 저장소를 사용하고 있습니다.')); };
    });
    this.dbPromise.catch(() => { this.dbPromise = undefined; });
    return this.dbPromise;
  }
  async load(): Promise<SaveRecord | null> {
    await this.queue;
    const db = await this.db();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('save', 'readonly'), request = tx.objectStore('save').get('current');
      tx.oncomplete = () => resolve(request.result ?? null);
      tx.onabort = () => reject(tx.error ?? new Error('저장 읽기 실패'));
    });
    if (value !== null && !validRecord(value)) { this.blocked = true; throw new CorruptSaveError(); }
    this.blocked = false; this.revision = value?.revision ?? 0;
    return value;
  }
  save(run: RunState | null, settings: Settings, investment?: Investment, weapon?: WeaponId): Promise<SaveRecord> {
    // Immutable capture, with the expected disk revision read only when the queued write executes.
    const copy = structuredClone({ run, settings, investment, weapon });
    const result = this.queue.then(async () => {
      if (this.blocked) throw new CorruptSaveError();
      if (copy.run && !validRun(copy.run)) throw new CorruptSaveError();
      if (copy.settings.mouseSensitivity !== undefined && !validMouseSensitivity(copy.settings.mouseSensitivity)) throw new CorruptSaveError();
      const db = await this.db();
      return new Promise<SaveRecord>((resolve, reject) => {
        const tx = db.transaction('save', 'readwrite'), objectStore = tx.objectStore('save');
        let error: Error | null = null, record: SaveRecord;
        const request = objectStore.get('current');
        request.onsuccess = () => {
          const previous = request.result;
          if (previous && !validRecord(previous)) { this.blocked = true; error = new CorruptSaveError(); tx.abort(); return; }
          if ((previous?.revision ?? 0) !== this.revision) { error = new ConflictError(); tx.abort(); return; }
          // Reconcile completed snapshots from earlier versions before replacing the run.
          const profile = recordGrowth(recordGrowth(previous?.profile ?? defaultProfile(), previous?.run ?? null), copy.run);
          if (copy.investment !== undefined) profile.investment = copy.investment;
          if (copy.weapon !== undefined) profile.selectedWeapon = copy.weapon;
          const continuedStaff = copy.run?.weapon === 'W04' && previous?.run?.weapon === 'W04'
            && (copy.run.growth && previous.run.growth ? copy.run.growth.id === previous.run.growth.id
              : !copy.run.growth && !previous.run.growth && copy.run.seed === previous.run.seed);
          if (!validProfile(profile) || (copy.run?.growth?.firstRoomCleared && !profile.rooms.length) || (copy.weapon !== undefined && !weaponUnlocked(profile, copy.weapon))
            || (copy.run?.weapon && !weaponUnlocked(profile, copy.run.weapon) && !continuedStaff)
            || (copy.run?.growth && investedPoints(copy.run.growth.investment) > earnedPoints(profile))) {
            error = new CorruptSaveError(); tx.abort(); return;
          }
          record = { schema: 1, content: 'prototype-0.13', revision: this.revision + 1,
            savedAt: new Date().toISOString(), run: copy.run, settings: copy.settings, profile };
          objectStore.put(record, 'current');
        };
        tx.oncomplete = () => { this.revision = record.revision; resolve(record); };
        tx.onabort = () => reject(error ?? tx.error ?? new Error('저장 실패'));
      });
    });
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}
