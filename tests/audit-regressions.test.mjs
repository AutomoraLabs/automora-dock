import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {Library,empty} from '../dev/core.mjs';
import {fetchLocal} from '../src/model.ts';

test('an empty stale connection is reopened before publishing a saved library',()=>{
 const dir=fs.mkdtempSync(path.join(tmpdir(),'profiledock-stale-'));const store=new Library(dir);
 try{
  const state=empty();state.folders.push({id:'saved',name:'Saved',parentId:null,pinned:true});store.save(state);
  const read=store.readRaw.bind(store);let first=true;store.readRaw=()=>{if(first){first=false;return empty();}return read();};
  assert.equal(store.read().folders[0].id,'saved');assert.equal(store.read().revision,1);
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('an unexpectedly empty database with saved recovery copies cannot be shown or overwritten',()=>{
 const dir=fs.mkdtempSync(path.join(tmpdir(),'profiledock-missing-'));let store=new Library(dir);
 try{
  const state=empty();state.folders.push({id:'saved',name:'Saved',parentId:null,pinned:true});store.save(state);store.close();
  fs.unlinkSync(path.join(dir,'library.sqlite'));store=new Library(dir);
  assert.throws(()=>store.read(),/Recovery copies are preserved/);
  assert.throws(()=>store.save(empty()),/Recovery copies are preserved/);
  const backups=fs.readdirSync(path.join(dir,'backups')).map(file=>JSON.parse(fs.readFileSync(path.join(dir,'backups',file),'utf8')));
  assert(backups.some(item=>item.library.folders.some(folder=>folder.id==='saved')));
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('a genuinely new library still loads and saves normally',()=>{
 const dir=fs.mkdtempSync(path.join(tmpdir(),'profiledock-first-run-'));const store=new Library(dir);
 try{assert.equal(store.read().revision,0);assert.equal(store.save(empty()).revision,1);}
 finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('a writer that commits just before lock acquisition cannot be overwritten by stale data',()=>{
 const dir=fs.mkdtempSync(path.join(tmpdir(),'profiledock-writer-'));const first=new Library(dir),second=new Library(dir);
 try{
  const stale=empty();const winner=empty();winner.folders=[{id:'winner',name:'Preserved',parentId:null,pinned:false}];
  const original=first.db.exec.bind(first.db);first.db.exec=sql=>{if(sql==='BEGIN IMMEDIATE'){first.db.exec=original;second.save(winner);}return original(sql)};
  assert.throws(()=>first.save(stale),/Library changed/);assert.equal(first.read().folders[0].id,'winner');assert.equal(first.read().revision,1);
 }finally{first.close();second.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test('recovery backups are complete atomic files with distinct retained revisions',()=>{
 const dir=fs.mkdtempSync(path.join(tmpdir(),'profiledock-backup-'));const store=new Library(dir);
 try{
  let state=empty();for(let i=0;i<13;i++)state=store.save(state);
  const files=fs.readdirSync(path.join(dir,'backups'));assert.equal(files.length,10);assert(files.every(file=>file.endsWith('.json')));
  const revisions=files.map(file=>JSON.parse(fs.readFileSync(path.join(dir,'backups',file),'utf8')).library.revision);assert.equal(new Set(revisions).size,10);assert(revisions.includes(13));
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test('failed atomic backup leaves the live database untouched and removes temporary files',()=>{
 const dir=fs.mkdtempSync(path.join(tmpdir(),'profiledock-backup-failure-'));const store=new Library(dir),rename=fs.renameSync;
 try{fs.renameSync=()=>{throw Error('Simulated disk error')};assert.throws(()=>store.save(empty()),/Simulated disk/);assert.equal(store.read().revision,0);assert.equal(fs.readdirSync(path.join(dir,'backups')).length,0);}
 finally{fs.renameSync=rename;store.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test('unresponsive local service times out instead of leaving actions busy indefinitely',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('Aborted'))));await assert.rejects(fetchLocal('/api/session',{},10),/timed out/);}
 finally{globalThis.fetch=original}
});
test('native bridge post failures clean up response listeners immediately',async()=>{
 const original=globalThis.window,handlers=new Set();globalThis.window={location:{search:'?launcher=1'},chrome:{webview:{addEventListener:(_,handler)=>handlers.add(handler),removeEventListener:(_,handler)=>handlers.delete(handler),postMessage:()=>{throw Error('Bridge disconnected')}}}};
 try{const {nativeRequest}=await import('../src/native.ts?audit');await assert.rejects(nativeRequest('folder-list'),/Bridge disconnected/);assert.equal(handlers.size,0);}
 finally{if(original===undefined)delete globalThis.window;else globalThis.window=original}
});
