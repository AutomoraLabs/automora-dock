import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {tmpdir} from 'node:os';
import {Library,empty} from '../dev/core.mjs';import {Favorites} from '../dev/favorites.mjs';import {exportBackup,restoreBackup,recoverRestore} from '../dev/backup.mjs';import {initializePreferences,defaultPreferences} from '../src/preferences.ts';
function fixture(fn){const dir=fs.mkdtempSync(path.join(tmpdir(),'pd-full-backup-')),store=new Library(dir),favorites=new Favorites(dir);try{return fn({dir,store,favorites});}finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}}
const folders=dir=>[{id:'lab',name:'My lab',path:path.join(dir,'offline-drive','Lab'),color:'teal'},{id:'docs',name:'Docs',path:path.join(dir,'Documents'),color:'rose'}];
test('fresh install defaults match the requested settings without overwriting user choices',()=>{
 const values=new Map(),storage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,value)};initializePreferences(storage);assert.deepEqual(Object.fromEntries(values),defaultPreferences);assert.equal(values.get('pd-workspace-rail'),'true');assert.equal(values.get('pd-background'),'blush');
 storage.setItem('pd-theme','dark');storage.setItem('pd-workspace-rail','false');initializePreferences(storage);assert.equal(values.get('pd-theme'),'dark');assert.equal(values.get('pd-workspace-rail'),'false');
});
test('full backup restores PC folder names, paths, colors and order alongside the library',()=>fixture(({dir,store,favorites})=>{
 const state=empty();state.folders=[{id:'root',name:'Original',parentId:null,pinned:true}];store.save(state);favorites.save(folders(dir));const backup=exportBackup(store,favorites);assert.equal(backup.version,2);
 const next=store.read();next.folders[0].name='Changed';store.save(next);favorites.save([]);const restored=restoreBackup(store,favorites,backup,store.read().revision);
 assert.equal(restored.folders[0].name,'Original');assert.deepEqual(favorites.read(),folders(dir));assert(!fs.existsSync(path.join(dir,'pending-restore.json')));
}));
test('old version-one backups preserve current PC folder shortcuts',()=>fixture(({dir,store,favorites})=>{
 favorites.save(folders(dir));restoreBackup(store,favorites,{format:'profiledock',version:1,library:empty()},0);assert.deepEqual(favorites.read(),folders(dir));
}));
test('invalid folder backup and stale revision cannot modify either saved resource',()=>fixture(({dir,store,favorites})=>{
 favorites.save(folders(dir));const backup=exportBackup(store,favorites);backup.favoriteFolders[0].path='relative';assert.throws(()=>restoreBackup(store,favorites,backup,0));assert.equal(store.read().revision,0);assert.deepEqual(favorites.read(),folders(dir));
 assert.throws(()=>restoreBackup(store,favorites,exportBackup(store,favorites),4),/changed/);assert(!fs.existsSync(path.join(dir,'pending-restore.json')));
}));
test('SQLite commit failure rolls the PC folder file back too',()=>fixture(({dir,store,favorites})=>{
 favorites.save(folders(dir));const before=exportBackup(store,favorites),backup=structuredClone(before);backup.favoriteFolders=[];backup.library.folders=[{id:'new',name:'New',parentId:null,pinned:false}];
 const exec=store.db.exec.bind(store.db);store.db.exec=sql=>{if(sql==='COMMIT')throw Error('Simulated commit failure');return exec(sql)};
 assert.throws(()=>restoreBackup(store,favorites,backup,0),/commit failure/);assert.deepEqual(store.read(),before.library);assert.deepEqual(favorites.read(),before.favoriteFolders);assert(!fs.existsSync(path.join(dir,'pending-restore.json')));
}));
test('startup recovers interrupted restore according to the SQLite commit marker',()=>fixture(({dir,store,favorites})=>{
 const before=folders(dir),after=[];favorites.save(after);const journal=path.join(dir,'pending-restore.json');fs.writeFileSync(journal,JSON.stringify({id:'uncommitted',before,after}));recoverRestore(store,favorites);assert.deepEqual(favorites.read(),before);
 store.db.prepare("INSERT INTO metadata(key,value) VALUES('restore_token',?)").run('committed');fs.writeFileSync(journal,JSON.stringify({id:'committed',before,after}));recoverRestore(store,favorites);assert.deepEqual(favorites.read(),after);
}));
test('automatic library recovery copies also contain PC folders',()=>fixture(({dir,store,favorites})=>{
 favorites.save(folders(dir));store.save(empty());const copies=fs.readdirSync(path.join(dir,'backups')).map(name=>JSON.parse(fs.readFileSync(path.join(dir,'backups',name),'utf8')));assert(copies.every(copy=>copy.version===2));assert(copies.some(copy=>copy.library.revision===1&&copy.favoriteFolders.length===2));
}));
