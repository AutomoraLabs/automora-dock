import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {tmpdir} from 'node:os';
import {Favorites} from '../dev/favorites.mjs';
test('main app and launcher read and mutate one existing folder list without renaming actual folders',()=>{
 const dir=fs.mkdtempSync(path.join(tmpdir(),'profiledock-shared-folders-'));
 try{
  const one=path.join(dir,'Automora Labs'),two=path.join(dir,'Documents');fs.mkdirSync(one);fs.mkdirSync(two);fs.writeFileSync(path.join(one,'keep.txt'),'keep');
  const legacy=[{id:'legacy',name:'Automora Labs',path:one,color:'amber'}];fs.writeFileSync(path.join(dir,'favorite-folders.json'),JSON.stringify(legacy));
  const main=new Favorites(dir),dock=new Favorites(dir);assert.deepEqual(main.read(),legacy);
  main.action('folder-rename',{id:'legacy',name:'My lab'});assert.equal(dock.read()[0].name,'My lab');assert(fs.existsSync(one));
  dock.action('folder-color',{id:'legacy',color:'teal'});assert.equal(main.read()[0].color,'teal');
  main.action('folder-add',{path:two});main.action('folder-add',{path:two});assert.equal(dock.read().length,2);
  const ids=dock.read().map(row=>row.id).reverse();dock.action('folder-reorder',{ids});assert.deepEqual(main.read().map(row=>row.id),ids);
  assert.throws(()=>main.action('folder-reorder',{ids:['legacy']}),/changed/);assert.throws(()=>main.action('folder-color',{id:'legacy',color:'invalid'}));
  main.action('folder-remove',{id:'legacy'});assert.equal(dock.read().length,1);assert.equal(fs.readFileSync(path.join(one,'keep.txt'),'utf8'),'keep');
  assert(fs.existsSync(path.join(dir,'favorite-folders.json.bak')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('malformed favorites and unavailable additions cannot overwrite existing shortcuts',()=>{
 const dir=fs.mkdtempSync(path.join(tmpdir(),'profiledock-folder-invalid-'));
 try{const store=new Favorites(dir);assert.throws(()=>store.action('folder-add',{path:path.join(dir,'missing')}),/existing folder/);fs.writeFileSync(store.file,'broken');assert.throws(()=>store.action('folder-remove',{id:'x'}));assert.equal(fs.readFileSync(store.file,'utf8'),'broken');}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
