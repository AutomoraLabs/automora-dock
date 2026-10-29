import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bootstrapDocument} from '../dev/bootstrap.mjs';
import {AssetCache,loadAsset} from '../src/assetCache.ts';
const png='data:image/png;base64,AAAA';
const storage=()=>{let value=null;return {getItem:()=>value,setItem:(_key,text)=>{value=text},value:()=>value}};
test('startup HTML carries the current saved snapshot and token without executable bookmark markup',()=>{
 const library={revision:17,profiles:[],folders:[],workspaces:[],bookmarks:[{name:'</script><script>bad()</script>\u2028',url:'https://example.com/?x=<tag>'}]};
 const html=bootstrapDocument('<body><div id="root"></div></body>',library,'session-token');
 const data=html.match(/id="automora-bootstrap">([\s\S]*?)<\/script>/)[1];
 assert(!data.includes('<'));assert(!data.includes('\u2028'));assert.deepEqual(JSON.parse(data),{library,token:'session-token'});
 assert.equal((html.match(/<script/g)||[]).length,1);
});
test('saved icons survive a new cache instance while malformed or unsafe cached assets are rejected',()=>{
 const saved=storage();const first=new AssetCache(saved);first.set('site-a',png);first.save();assert.equal(new AssetCache(saved).get('site-a'),png);
 const invalid=new AssetCache({getItem:()=>'{broken',setItem:()=>{}});assert.equal(invalid.get('site-a'),null);
 first.set('unsafe','data:image/svg+xml,<svg onload="bad()"/>');assert.equal(first.get('unsafe'),null);
 first.set('oversized','data:image/png;base64,'+'A'.repeat(190000));assert.equal(first.get('oversized'),null);
});
test('persistent icon cache stays within its size bound and preserves recently used icons',()=>{
 const saved=storage(),cache=new AssetCache(saved);for(let i=0;i<250;i++)cache.set('asset-'+i,'data:image/png;base64,'+'A'.repeat(12000));
 cache.save();assert(saved.value().length<=1200000);assert.equal(cache.get('asset-0'),null);assert(cache.get('asset-249'));
 const restored=new AssetCache(saved);assert(restored.get('asset-249'));
});
test('icon loading limits parallel work, deduplicates repeated requests and recovers from a throwing loader',async()=>{
 let running=0,peak=0,calls=0;const prefix='qa-'+Date.now();
 const loader=async()=>{calls++;running++;peak=Math.max(peak,running);await new Promise(resolve=>setTimeout(resolve,8));running--;return png;};
 const requests=Array.from({length:12},(_,i)=>loadAsset(prefix+i,loader));requests.push(loadAsset(prefix+'0',loader));
 await Promise.all(requests);assert.equal(calls,12);assert(peak<=4);
 assert.equal(await loadAsset(prefix+'bad',()=>{throw Error('missing icon')}),null);assert.equal(await loadAsset(prefix+'after',async()=>png),png);
});
