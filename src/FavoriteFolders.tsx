import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {nativeRequest} from './native';
import {Icon} from './ui';
import {command} from './model';
type Folder={id:string;name:string;path:string;color?:string};
const colors=[['amber','Amber','#d5aa54'],['sage','Sage','#87a68c'],['blue','Blue','#7e9fc6'],['lavender','Lavender','#a18cbd'],['rose','Rose','#c58e9b'],['clay','Clay','#c18e72'],['teal','Teal','#7da9a6']];
export default function FavoriteFolders({manager=false}:{manager?:boolean}){
 const [folders,setFolders]=useState<Folder[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [status,setStatus]=useState('');
 useEffect(()=>{if(!status)return;const timer=setTimeout(()=>setStatus(''),2000);return()=>clearTimeout(timer);},[status]);
 const [favoriteLoaded,setFavoriteLoaded]=useState(false);const announced=useRef(false);
 const [expanded,setExpanded]=useState(manager||localStorage.getItem('pd-folders-expanded')==='true'),[columns,setColumns]=useState(7),[scroll,setScroll]=useState({thumb:100,position:0,value:0,max:0});
 const listRef=useRef<HTMLDivElement>(null);
 const [toolbar,setToolbar]=useState<HTMLElement|null>(null),[menu,setMenu]=useState<{id:string;x:number;bottom:number}|null>(null),[dialog,setDialog]=useState<{id:string;kind:'rename'|'remove'|'add';name:string}|null>(null),[dragging,setDragging]=useState<string|null>(null),[target,setTarget]=useState<string|null>(null);
 const epoch=useRef(0);
 async function send(type:string,args:Record<string,unknown>={}){
  if(manager){if(type==='folder-pick'){const native=nativeRequest(type,args);if(native)return native;}if(type==='folder-copy'){const selected=folders.find(folder=>folder.id===args.id);if(!selected)throw Error('Folder shortcut no longer exists.');await navigator.clipboard.writeText(selected.path);return {copied:true};}return command('favorite_folder',{...args,action:type});}
  const pending=nativeRequest(type,args);if(!pending)throw Error('Open the Windows launcher to use folder shortcuts.');return pending;
 }
 const menuRef=useRef<HTMLDivElement>(null),inputRef=useRef<HTMLInputElement>(null),suppressOpen=useRef(0),lock=useRef(false);
 async function request(type:string,args:Record<string,unknown>={}){
  if(lock.current)return false;lock.current=true;epoch.current++;setBusy(true);setError('');setStatus('');
  try{const result=await send(type,args);if(Array.isArray(result))setFolders(result as Folder[]);if(type==='folder-list')setFavoriteLoaded(true);if(type==='folder-copy')setStatus('Folder URL copied');return true;}
  catch(e){setError(e instanceof Error?e.message:String(e));return false;}finally{lock.current=false;setBusy(false);}
 }
 useEffect(()=>{if(!manager)setToolbar(document.getElementById('favorite-folder-toolbar'));void request('folder-list');},[]);
 useEffect(()=>{let active=true;const refresh=async()=>{if(lock.current)return;const version=epoch.current;try{const result=await send('folder-list');if(active&&!lock.current&&version===epoch.current&&Array.isArray(result))setFolders(result as Folder[]);}catch{}};const timer=setInterval(()=>{if(document.hasFocus()&&!menu&&!dialog)void refresh();},2000);window.addEventListener('focus',refresh);window.addEventListener('profiledock:refresh',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('profiledock:refresh',refresh);};},[manager,menu,dialog]);
 useEffect(()=>{const close=()=>{setMenu(null);setDialog(null);setError('');setStatus('');};window.addEventListener('profiledock:close-popups',close);window.addEventListener('profiledock:refresh',close);window.addEventListener('blur',close);return()=>{window.removeEventListener('profiledock:close-popups',close);window.removeEventListener('profiledock:refresh',close);window.removeEventListener('blur',close);};},[]);
 useEffect(()=>{
  const list=listRef.current;if(!list)return;
  let wheelDelta=0;
  const measure=()=>{setColumns(Math.max(1,Math.floor(list.clientWidth/74)));const max=Math.max(0,list.scrollWidth-list.clientWidth);setScroll({thumb:Math.min(100,list.clientWidth/Math.max(1,list.scrollWidth)*100),position:max?list.scrollLeft/max:0,value:Math.round(list.scrollLeft),max});};
  const wheel=(e:WheelEvent)=>{if(expanded||!folders.length)return;e.preventDefault();wheelDelta+=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(Math.abs(wheelDelta)<24)return;const cell=list.clientWidth/Math.max(1,Math.floor(list.clientWidth/74));list.scrollLeft=(Math.round(list.scrollLeft/cell)+Math.sign(wheelDelta)*Math.max(1,Math.floor(Math.abs(wheelDelta)/100)))*cell;wheelDelta=0;};
  const resize=new ResizeObserver(measure);resize.observe(list);list.addEventListener('scroll',measure);list.addEventListener('wheel',wheel,{passive:false});list.scrollLeft=0;list.scrollTop=0;measure();
  if(favoriteLoaded&&!announced.current){announced.current=true;window.dispatchEvent(new Event('profiledock:folders-ready'));}
  return()=>{resize.disconnect();list.removeEventListener('scroll',measure);list.removeEventListener('wheel',wheel);};
 },[expanded,folders.length,favoriteLoaded]);
 useEffect(()=>{listRef.current?.dispatchEvent(new Event('scroll'));},[columns]);
 function seekFolder(e:React.PointerEvent<HTMLDivElement>){const list=listRef.current;if(!list)return;const rect=e.currentTarget.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),cell=list.clientWidth/columns;list.scrollLeft=Math.round(ratio*(list.scrollWidth-list.clientWidth)/cell)*cell;}
 useEffect(()=>{if(!menu)return;menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();const close=(e:PointerEvent)=>{if(!menuRef.current?.contains(e.target as Node))setMenu(null)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[menu]);
 useEffect(()=>{if(dialog?.kind==='rename'){inputRef.current?.focus();inputRef.current?.select();}},[dialog?.id,dialog?.kind]);
 function context(folder:Folder,x:number,y=innerHeight-76){setMenu({id:folder.id,x:Math.max(8,Math.min(x,innerWidth-246)),bottom:Math.max(8,innerHeight-y+12)});}
 function move(id:string,to:string,after=false){if(id===to)return;const ids=folders.map(f=>f.id).filter(key=>key!==id),index=ids.indexOf(to);if(index<0||!folders.some(f=>f.id===id))return;ids.splice(index+(after?1:0),0,id);void request('folder-reorder',{ids});}
 const selected=folders.find(f=>f.id===menu?.id);
 return <>
 {manager&&<div className="favorite-manager-toolbar"><p>Your PC folder shortcuts · shared with the Dock</p><button className="button secondary" disabled={busy} onClick={()=>void request('folder-pick')}><Icon name="folder-open"/>Choose folder</button><button className="button primary" disabled={busy} onClick={()=>setDialog({id:'',kind:'add',name:''})}><Icon name="folder-plus"/>Add folder path</button></div>}
 {toolbar&&createPortal(<><button className="icon-button folder-expand-toggle" aria-label="Expand favourite folders" aria-pressed={expanded} title={expanded?'Collapse folder section':'Expand folder section'} onClick={()=>{setExpanded(!expanded);localStorage.setItem('pd-folders-expanded',String(!expanded));setMenu(null);}}><Icon name={expanded?'chevron-down':'chevron-up'}/></button><button className="favorite-folder-add icon-button" disabled={busy} title="Add favourite folder" aria-label="Add favourite folder" onClick={()=>void request('folder-add')}><Icon name={busy?'spinner':'folder-plus'}/></button></>,toolbar)}
 <section className={'favorite-folders'+(expanded?' expanded':'')+(manager?' favorite-folders-manager':'')} aria-label="Favourite folders" aria-busy={busy}>
  {status&&<div className="favorite-folder-notice" role="status"><Icon name="check"/>{status}</div>}
  {error&&<div className="favorite-folder-error" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss folder error" onClick={()=>setError('')}><Icon name="xmark"/></button></div>}
  <div ref={listRef} id="favorite-folder-list" className="favorite-folder-list" style={{'--folder-columns':columns} as React.CSSProperties}>
  {folders.length===0?<span className="favorite-folders-empty"><Icon name="folder"/>Favourite folders<span>Use Folder+ above to add your go-to folders</span></span>:folders.map(folder=><div key={folder.id} className={'favorite-folder'+(dragging===folder.id?' dragging':'')+(target===folder.id?' drop-target':'')} draggable={!busy}
   onContextMenu={e=>{e.preventDefault();context(folder,e.clientX,e.clientY)}}
   onDragStart={e=>{setMenu(null);setDragging(folder.id);e.dataTransfer.setData('application/x-profiledock-folder',folder.id);e.dataTransfer.effectAllowed='move';suppressOpen.current=Date.now()+1000;}}
   onDragEnd={()=>{setDragging(null);setTarget(null);suppressOpen.current=Date.now()+300;}}
   onDragOver={e=>{if(!e.dataTransfer.types.includes('application/x-profiledock-folder'))return;e.preventDefault();e.dataTransfer.dropEffect='move';setTarget(folder.id);const list=e.currentTarget.parentElement!,rect=list.getBoundingClientRect();if(expanded){if(e.clientY<rect.top+25)list.scrollTop-=15;else if(e.clientY>rect.bottom-25)list.scrollTop+=15;}else{if(e.clientX<rect.left+30)list.scrollLeft-=15;else if(e.clientX>rect.right-30)list.scrollLeft+=15;}}}
   onDrop={e=>{e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();move(e.dataTransfer.getData('application/x-profiledock-folder'),folder.id,e.clientX>rect.left+rect.width/2);setDragging(null);setTarget(null);suppressOpen.current=Date.now()+300;}}
  ><button className="favorite-folder-open" disabled={busy} title={folder.path} aria-label={'Open folder '+folder.name}
   onKeyDown={e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();context(folder,e.currentTarget.getBoundingClientRect().left);}else if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const index=folders.findIndex(f=>f.id===folder.id),to=folders[index+(e.key==='ArrowLeft'?-1:1)];if(to)move(folder.id,to.id,e.key==='ArrowRight');}}}
   onClick={()=>{if(Date.now()>=suppressOpen.current)void request('folder-open',{id:folder.id});}}><Icon name="folder" style={{color:colors.find(c=>c[0]===folder.color)?.[2]||colors[0][2]}}/><span>{folder.name}</span></button></div>)}
  </div>
  {!expanded&&scroll.max>0&&<div className="folder-scrollbar" role="scrollbar" aria-label="Scroll favourite folders" aria-controls="favorite-folder-list" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={scroll.max} aria-valuenow={scroll.value} tabIndex={0}
   onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);seekFolder(e)}} onPointerMove={e=>{if(e.buttons===1)seekFolder(e)}}
   onKeyDown={e=>{const list=listRef.current;if(!list)return;const cell=list.clientWidth/columns;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();list.scrollLeft+=cell*(e.key==='ArrowRight'?1:-1);}else if(e.key==='Home'||e.key==='End'){e.preventDefault();list.scrollLeft=e.key==='Home'?0:list.scrollWidth;}}}
  ><span style={{width:scroll.thumb+'%',left:scroll.position*(100-scroll.thumb)+'%'}}/></div>}
  {menu&&selected&&<div ref={menuRef} className="folder-context-menu" role="menu" aria-label="Folder shortcut options" style={{left:menu.x,bottom:menu.bottom}}
   onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setMenu(null);}else if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]')),index=items.indexOf(document.activeElement as HTMLElement);items[(index+(e.key==='ArrowDown'?1:items.length-1))%items.length]?.focus();}}}>
   <button role="menuitem" disabled={busy} onClick={()=>{setMenu(null);void request('folder-copy',{id:selected.id})}}><Icon name="copy"/>Copy Folder URL</button>
   <button role="menuitem" disabled={busy} onClick={()=>{setDialog({id:selected.id,kind:'rename',name:selected.name});setMenu(null)}}><Icon name="pen"/>Rename shortcut</button>
   <div className="folder-colors" role="group" aria-label="Folder colors"><span>Folder color</span><div>{colors.map(([id,label,color])=><button key={id} role="menuitemradio" aria-checked={(selected.color||'amber')===id} aria-label={'Set folder color '+label} title={label} disabled={busy} style={{background:color}} onClick={()=>{setMenu(null);void request('folder-color',{id:selected.id,color:id})}}>{(selected.color||'amber')===id&&<Icon name="check"/>}</button>)}</div></div>
   <button className="folder-remove-action" role="menuitem" disabled={busy} onClick={()=>{setDialog({id:selected.id,kind:'remove',name:selected.name});setMenu(null)}}><Icon name="trash-can"/>Remove shortcut</button>
  </div>}
  {dialog&&<form className="folder-shortcut-dialog" role="dialog" aria-label={dialog.kind==='add'?'Add folder shortcut':dialog.kind==='rename'?'Rename folder shortcut':'Remove folder shortcut'} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setDialog(null)}}} onSubmit={async e=>{e.preventDefault();if(await request(dialog.kind==='add'?'folder-add':dialog.kind==='rename'?'folder-rename':'folder-remove',{id:dialog.id,name:dialog.name.trim(),path:dialog.name.trim()}))setDialog(null)}}>
   <label>{dialog.kind==='add'?'Folder path':dialog.kind==='rename'?'Rename shortcut':'Remove '+dialog.name+' shortcut?'}{dialog.kind!=='remove'&&<input ref={inputRef} autoFocus aria-label={dialog.kind==='add'?'Folder path':'Shortcut name'} value={dialog.name} maxLength={dialog.kind==='add'?4096:80} required onChange={e=>setDialog({...dialog,name:e.target.value})}/>}</label>
   <p>{dialog.kind==='add'?'Paste the full path of an existing PC folder.':dialog.kind==='rename'?'Only the name in Automora Dock changes.':'Your actual folder and files stay on your PC.'}</p>
   <div><button type="button" className="button secondary" disabled={busy} onClick={()=>setDialog(null)}>Cancel</button><button type="submit" className="button primary" disabled={busy||(dialog.kind!=='remove'&&!dialog.name.trim())}>{dialog.kind==='add'?'Add folder':dialog.kind==='rename'?'Save':'Remove shortcut'}</button></div>
  </form>}
 </section></>;
}
