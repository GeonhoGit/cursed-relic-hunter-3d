import type {BufferGeometry} from 'three';

type Disposable={dispose():void};
type Entry={key:string;geometry:BufferGeometry;references:number};
const geometries=new Map<string,Entry>(),owners=new WeakMap<BufferGeometry,Entry>();
const retired=new Set<Entry>(),deferred=new Set<Disposable>();
let depth=0;

// Share immutable buffers. Materials and object transforms retain separate ownership.
export function sharedGeometry(key:string,create:()=>BufferGeometry):BufferGeometry{
 let entry=geometries.get(key);
 if(!entry){entry={key,geometry:create(),references:0};geometries.set(key,entry);owners.set(entry.geometry,entry);}
 entry.references++;retired.delete(entry);return entry.geometry;
}
export function releaseGeometry(geometry:BufferGeometry){
 const entry=owners.get(geometry);
 if(!entry){releaseRenderResource(geometry);return;}
 if(--entry.references>0)return;
 if(depth){retired.add(entry);return;}
 geometries.delete(entry.key);owners.delete(geometry);geometry.dispose();
}
export function releaseRenderResource(resource:Disposable){
 if(depth)deferred.add(resource);else resource.dispose();
}
export function withRenderResources<T>(paint:()=>T):T{
 depth++;
 try{return paint();}finally{
  if(--depth===0){
   for(const entry of retired)if(entry.references===0){geometries.delete(entry.key);owners.delete(entry.geometry);entry.geometry.dispose();}
   retired.clear();for(const resource of deferred)resource.dispose();deferred.clear();
  }
 }
}
