type Entry={value:string};
const storageKey='automora-icon-cache-v1',maxChars=1200000,maxEntries=160,maxAssetChars=180000;
export class AssetCache {
  private entries=new Map<string,Entry>();
  private chars=2;
  private storage?:Pick<Storage,'getItem'|'setItem'>;
  constructor(storage?:Pick<Storage,'getItem'|'setItem'>){
    this.storage=storage;
    try{const raw=storage?.getItem(storageKey);if(!raw||raw.length>maxChars)return;
      const parsed=JSON.parse(raw);if(!Array.isArray(parsed))return;
      for(const row of parsed.slice(-maxEntries))if(Array.isArray(row)&&typeof row[0]==='string'&&row[0].length<10000&&typeof row[1]?.value==='string')this.set(row[0],row[1].value);
    }catch{}
  }
  private valid(value:string){return value.length<=maxAssetChars&&/^data:image\/(png|jpeg|x-icon|vnd.microsoft.icon|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(value);}
  private cost(key:string,entry:Entry){return JSON.stringify([key,entry]).length+1;}
  get(key:string){const entry=this.entries.get(key);if(!entry)return null;this.entries.delete(key);this.entries.set(key,entry);return entry.value;}
  set(key:string,value:string){if(key.length>10000||!this.valid(value))return;const previous=this.entries.get(key);if(previous)this.chars-=this.cost(key,previous);this.entries.delete(key);const entry={value};this.entries.set(key,entry);this.chars+=this.cost(key,entry);this.trim();}
  private trim(){while(this.entries.size>maxEntries||this.chars>maxChars){const [key,entry]=this.entries.entries().next().value!;this.chars-=this.cost(key,entry);this.entries.delete(key);}}
  save(){try{this.storage?.setItem(storageKey,JSON.stringify([...this.entries]));}catch{}}
}
let storage:Storage|undefined;try{if(typeof localStorage!=='undefined')storage=localStorage;}catch{}
const assets=new AssetCache(storage),requests=new Map<string,Promise<string|null>>();
let writing:ReturnType<typeof setTimeout>|undefined,active=0;
const pending:Array<()=>void>=[];
function pump(){while(active<4&&pending.length){active++;pending.shift()!();}}
function queued(load:()=>Promise<string|null>):Promise<string|null>{return new Promise(resolve=>{pending.push(()=>{void Promise.resolve().then(load).then(resolve,()=>resolve(null)).finally(()=>{active--;pump();});});pump();});}
export const cachedAsset=(key:string)=>assets.get(key);
export function loadAsset(key:string,load:()=>Promise<string|null>){
  if(!requests.has(key)){
    const cached=assets.get(key);
    requests.set(key,(async()=>{
      if(cached)await new Promise(resolve=>setTimeout(resolve,1200));
      const fresh=await queued(load);
      if(fresh){assets.set(key,fresh);if(writing)clearTimeout(writing);writing=setTimeout(()=>assets.save(),500);}
      return fresh||cached;
    })());
  }
  return requests.get(key)!;
}
