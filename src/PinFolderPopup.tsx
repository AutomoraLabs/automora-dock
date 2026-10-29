import React,{useEffect,useRef,useState} from 'react';
import type {Bookmark,Folder,Profile} from './model';
import {Icon,SiteIcon} from './ui';

export default function PinFolderPopup({folder,bookmarks,profiles,busy,onClose,onOpen,onRename,onRemove,onReorder}:{folder:Folder;bookmarks:Bookmark[];profiles:Profile[];busy:boolean;onClose:()=>void;onOpen:(bookmark:Bookmark)=>void;onRename:(name:string)=>void;onRemove:(id:string)=>void;onReorder:(ids:string[])=>void}){
 const [name,setName]=useState(folder.name),[dragging,setDragging]=useState<string|null>(null);
 const panel=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
 const byId=new Map(bookmarks.filter(bookmark=>!bookmark.trashed&&bookmark.pinned).map(bookmark=>[bookmark.id,bookmark]));
 const items=(folder.shortcutIds||[]).map(id=>byId.get(id)).filter((bookmark):bookmark is Bookmark=>!!bookmark);
 useEffect(()=>{setName(folder.name)},[folder.name]);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement;
  panel.current?.querySelector<HTMLButtonElement>('.pin-folder-close')?.focus({preventScroll:true});
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close.current();return;}
   if(event.key!=='Tab')return;
   const nodes=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')||[]);
   const first=nodes[0],last=nodes.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  };
  window.addEventListener('keydown',key,true);
  return()=>{window.removeEventListener('keydown',key,true);if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[folder.id]);
 function reorder(source:string,target:string){if(source===target)return;const ids=(folder.shortcutIds||[]).filter(id=>id!==source);ids.splice(ids.indexOf(target),0,source);onReorder(ids);}
 return <div className="pin-folder-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <div className="pin-folder-popup" ref={panel} role="dialog" aria-modal="true" aria-label={'Folder '+folder.name}>
   <header><form onSubmit={event=>{event.preventDefault();if(name.trim()&&name.trim()!==folder.name)onRename(name.trim());}}><input aria-label="Shortcut folder name" maxLength={120} value={name} disabled={busy} onChange={event=>setName(event.target.value)} onBlur={()=>{if(!name.trim())setName(folder.name);}}/><button className="icon-button" type="submit" aria-label="Save folder name" disabled={busy||!name.trim()||name.trim()===folder.name}><Icon name="check"/></button></form><button className="icon-button pin-folder-close" aria-label="Close folder" onClick={onClose}><Icon name="xmark"/></button></header>
   <div className="pin-folder-grid">{items.map(bookmark=><div className="pin-folder-entry" key={bookmark.id} draggable={!busy} onDragStart={event=>{event.dataTransfer.setData('application/x-profiledock-folder-item',bookmark.id);setDragging(bookmark.id);}} onDragEnd={()=>setDragging(null)} onDragOver={event=>{if(dragging&&!busy)event.preventDefault();}} onDrop={event=>{event.preventDefault();if(!busy&&(folder.shortcutIds||[]).includes(event.dataTransfer.getData('application/x-profiledock-folder-item')))reorder(event.dataTransfer.getData('application/x-profiledock-folder-item'),bookmark.id);setDragging(null);}}>
    <button className="pin-folder-bookmark" disabled={busy} title={bookmark.name+'\n'+bookmark.url} onClick={()=>onOpen(bookmark)} onKeyDown={event=>{if(event.altKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const ids=folder.shortcutIds||[],at=ids.indexOf(bookmark.id),to=at+(event.key==='ArrowLeft'?-1:1);if(to>=0&&to<ids.length){const next=[...ids];[next[at],next[to]]=[next[to],next[at]];onReorder(next);}}}}><SiteIcon bookmark={bookmark} profile={profiles.find(profile=>profile.id===bookmark.profileId)}/><span>{bookmark.name}</span></button>
    <button className="icon-button pin-folder-remove" aria-label={'Move '+bookmark.name+' out of folder'} title="Move out of folder" disabled={busy} onClick={()=>onRemove(bookmark.id)}><Icon name="arrow-up-right-from-square"/></button>
   </div>)}</div>
   {!items.length&&<p className="pin-folder-empty">Drop bookmarks onto this folder to add them.</p>}
  </div>
 </div>;
}
