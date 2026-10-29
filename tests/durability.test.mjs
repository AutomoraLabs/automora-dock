import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Library} from '../dev/core.mjs';
test('committed pins survive abrupt process termination without sidecar files',async()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'profiledock-durability-'));
 const moduleUrl=new URL('../dev/core.mjs',import.meta.url).href;
 const source=`import {Library} from ${JSON.stringify(moduleUrl)};const l=new Library(process.argv[1]);const s=l.read();s.folders.push({id:'pin',name:'Pinned folder',parentId:null,pinned:true});s.pinGroups.push({id:'group',name:'Work',itemKeys:['folders:pin']});l.save(s);console.log('committed');setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,['--input-type=module','-e',source,directory],{stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Commit timeout')),10000);child.stdout.once('data',()=>{clearTimeout(timer);resolve()});child.once('error',reject);child.once('exit',code=>{if(code)reject(Error('Child exited: '+code))})});
  const closed=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await closed;
  const library=new Library(directory);
  assert.equal(library.db.prepare('PRAGMA journal_mode').get().journal_mode,'delete');
  assert.equal(library.read().folders[0].pinned,true);
  assert.deepEqual(library.read().pinGroups[0].itemKeys,['folders:pin']);library.close();
  const backups=readdirSync(path.join(directory,'backups')).sort();
  const states=backups.map(file=>JSON.parse(readFileSync(path.join(directory,'backups',file),'utf8')).library);
  assert(states.some(state=>state.revision===1&&state.folders.length===1));
 }finally{child.kill();rmSync(directory,{recursive:true,force:true})}
});
