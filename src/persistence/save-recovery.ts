import {ConflictError,type SaveStore,type SaveRecord,type Settings} from './save';
import type {Investment,RunState,WeaponId} from '../core/model';

type Store=Pick<SaveStore,'load'|'save'>;
type Payload={run:RunState|null;settings:Settings;investment?:Investment;weapon?:WeaponId};
export class SaveRecovery{
 private pending:Payload|null=null;
 mode:'read'|'write'|'conflict'='read';
 async read(store:Store):Promise<SaveRecord|null>{
  this.mode='read';const record=await store.load();this.pending=null;return record;
 }
 async save(store:Store,payload:Payload):Promise<SaveRecord>{
  const copy=structuredClone(payload);this.pending=copy;this.mode='write';return this.write(store,copy);
 }
 private async write(store:Store,payload:Payload):Promise<SaveRecord>{
  try{const record=await store.save(payload.run,payload.settings,payload.investment,payload.weapon);if(this.pending===payload){this.pending=null;this.mode='read';}return record;}
  catch(error){if(this.pending===payload&&error instanceof ConflictError)this.mode='conflict';throw error;}
 }
 async retry(store:Store):Promise<{kind:'loaded';record:SaveRecord|null}|{kind:'saved';record:SaveRecord}>{
  if(this.mode!=='write')return{kind:'loaded',record:await this.read(store)};
  if(!this.pending)throw new Error('다시 저장할 진행이 없습니다.');
  return{kind:'saved',record:await this.write(store,this.pending)};
 }
}
