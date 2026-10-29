import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
test('native favourite folder persistence and safe removal',{skip:process.platform!=='win32'},()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'profiledock-folders-'));
 try{
  const exe=path.join(directory,'FolderFavoritesTest.exe');
  const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const build=spawnSync(compiler,['/nologo','/target:exe','/out:'+exe,'/r:System.Web.Extensions.dll',fileURLToPath(new URL('../native-launcher/FolderFavorites.cs',import.meta.url)),fileURLToPath(new URL('./FolderFavoritesTest.cs',import.meta.url))],{encoding:'utf8'});
  assert.equal(build.status,0,build.stdout+build.stderr);
  const result=spawnSync(exe,[directory],{encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
