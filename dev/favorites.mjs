import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
export function validateFavorites(rows){
 const ids=new Set();if(!Array.isArray(rows)||rows.length>10000)throw Error('Invalid PC folder shortcuts.');
 for(const row of rows){
  if(!row||typeof row.id!=='string'||!row.id||ids.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>80||/[\r\n\0]/.test(row.name)||typeof row.path!=='string'||row.path.length>32767||!path.isAbsolute(row.path)||row.path.includes('\0')||(row.color!==undefined&&!['amber','sage','blue','lavender','rose','clay','teal'].includes(row.color)))throw Error('Invalid PC folder shortcut.');
  ids.add(row.id);
 }
 return rows;
}
export class Favorites {
 constructor(directory){this.file=path.join(directory,'favorite-folders.json');}
 read(){
  if(!fs.existsSync(this.file))return [];
  return validateFavorites(JSON.parse(fs.readFileSync(this.file,'utf8').replace(/^\uFEFF/,'')));
 }
 save(rows){
  validateFavorites(rows);
  const temporary=this.file+'.'+randomUUID()+'.tmp';let fd;
  try{fs.mkdirSync(path.dirname(this.file),{recursive:true});fd=fs.openSync(temporary,'wx');fs.writeFileSync(fd,JSON.stringify(rows));fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.bak');fs.renameSync(temporary,this.file);}
  finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  return rows;
 }
 action(action,args={}){
  const rows=this.read();if(action==='folder-list')return rows;
  if(action==='folder-add'){
   if(typeof args.path!=='string'||!path.isAbsolute(args.path)||!fs.existsSync(args.path)||!fs.statSync(args.path).isDirectory())throw Error('Choose an existing folder on your PC.');
   const selected=path.resolve(args.path),normalized=selected.replace(/[\\/]+$/,'').toLowerCase();
   if(!rows.some(row=>row.path.replace(/[\\/]+$/,'').toLowerCase()===normalized))rows.push({id:randomUUID().replaceAll('-',''),name:path.basename(selected)||selected,path:selected,color:'amber'});
   return this.save(rows);
  }
  if(action==='folder-reorder'){
   if(!Array.isArray(args.ids)||args.ids.length!==rows.length||new Set(args.ids).size!==rows.length||args.ids.some(id=>!rows.some(row=>row.id===id)))throw Error('Folder list changed. Refresh before arranging it.');
   return this.save(args.ids.map(id=>rows.find(row=>row.id===id)));
  }
  const folder=rows.find(row=>row.id===args.id);if(!folder)throw Error('Folder shortcut no longer exists.');
  if(action==='folder-remove')return this.save(rows.filter(row=>row.id!==args.id));
  if(action==='folder-rename'){
   if(typeof args.name!=='string'||!args.name.trim()||args.name.trim().length>80||/[\r\n\0]/.test(args.name))throw Error('Enter a shortcut name between 1 and 80 characters.');
   folder.name=args.name.trim();return this.save(rows);
  }
  if(action==='folder-color'){
   if(!['amber','sage','blue','lavender','rose','clay','teal'].includes(args.color))throw Error('Choose an available folder color.');
   folder.color=args.color;return this.save(rows);
  }
  if(action==='folder-open'){
   if(!fs.existsSync(folder.path)||!fs.statSync(folder.path).isDirectory())throw Error('Folder unavailable. Reconnect its drive.');
   return new Promise((resolve,reject)=>{const child=spawn(path.join(process.env.WINDIR||'C:/Windows','explorer.exe'),[folder.path],{detached:true,stdio:'ignore',windowsHide:true});child.once('error',reject);child.once('spawn',()=>{child.unref();resolve({requested:true});});});
  }
  throw Error('Unknown folder action.');
 }
 async pick(){
  const script="[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $owner=New-Object System.Windows.Forms.Form; $owner.ShowInTaskbar=$false; $owner.TopMost=$true; $owner.Opacity=0; $owner.Show(); $owner.Activate(); $picker=New-Object System.Windows.Forms.FolderBrowserDialog; $picker.Description='Choose a favourite folder for Automora Dock'; $picker.ShowNewFolderButton=$false; try{if($picker.ShowDialog($owner) -eq [Windows.Forms.DialogResult]::OK){[Console]::Write($picker.SelectedPath)}}finally{$picker.Dispose();$owner.Dispose()}";
  const selected=await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-STA','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:600000,encoding:'utf8'},(error,stdout)=>error?reject(Error('Folder picker could not open. Paste the folder path instead.')):resolve(stdout.trim())));
  return selected?this.action('folder-add',{path:selected}):this.read();
 }
}
