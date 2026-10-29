import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {validate} from './core.mjs';import {validateFavorites} from './favorites.mjs';
export function exportBackup(store,favorites){return {format:'profiledock',version:2,library:store.read(),favoriteFolders:favorites.read()};}
export function validateBackup(data){
 if(!data||data.format!=='profiledock'||![1,2].includes(data.version))throw Error('Unsupported backup format.');
 validate(data.library);if(data.version===2)validateFavorites(data.favoriteFolders);return data;
}
export function recoverRestore(store,favorites){
 const journal=path.join(store.directory,'pending-restore.json');if(!fs.existsSync(journal))return;
 const data=JSON.parse(fs.readFileSync(journal,'utf8'));validateFavorites(data.before);validateFavorites(data.after);
 if(typeof data.id!=='string'||!data.id)throw Error('Invalid pending backup restore.');
 const marker=store.db.prepare("SELECT value FROM metadata WHERE key='restore_token'").get();
 favorites.save(marker?.value===data.id?data.after:data.before);fs.unlinkSync(journal);
}
export function restoreBackup(store,favorites,data,revision){
 validateBackup(data);if(revision!==store.read().revision)throw Error('Library changed in another window. Reload before restoring.');
 if(data.version===1)return store.save({...data.library,revision}); // Legacy backups never erase PC folders.
 const journal=path.join(store.directory,'pending-restore.json');
 if(fs.existsSync(journal))recoverRestore(store,favorites);
 const before=favorites.read(),id=randomUUID(),temporary=journal+'.'+id+'.tmp',fd=fs.openSync(temporary,'wx');
 try{fs.writeFileSync(fd,JSON.stringify({id,before,after:data.favoriteFolders}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 try{fs.renameSync(temporary,journal);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
 let result;
 try{
  result=store.save({...data.library,revision},()=>{
   favorites.save(data.favoriteFolders);
   store.db.prepare("INSERT INTO metadata(key,value) VALUES('restore_token',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(id);
  });
 }catch(error){try{recoverRestore(store,favorites);}catch(recoveryError){throw Error(error.message+' Recovery pending: '+recoveryError.message);}throw error;}
 // Failure to remove the journal does not turn a successful commit into a failed restore.
 try{fs.unlinkSync(journal);}catch{}
 return result;
}
