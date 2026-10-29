import React,{useEffect,useRef,useState} from 'react';
import type {Workspace,Bookmark} from './model';
import {Icon,WorkspaceIcon} from './ui';
export default function WorkspaceRail({all,pinned,bookmarks,busy,onOpen,onPin,onCreate,onContext}:{all:Workspace[];pinned:Workspace[];bookmarks:Bookmark[];busy:boolean;onOpen:(w:Workspace)=>void;onPin:(id:string)=>void;onCreate:()=>void;onContext:(w:Workspace,x:number,y:number)=>void}){
 const [open,setOpen]=useState(false);const root=useRef<HTMLElement>(null);
 useEffect(()=>{const close=()=>setOpen(false);window.addEventListener('profiledock:refresh',close);window.addEventListener('profiledock:close-popups',close);window.addEventListener('blur',close);return()=>{window.removeEventListener('profiledock:refresh',close);window.removeEventListener('profiledock:close-popups',close);window.removeEventListener('blur',close);};},[]);
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[open]);
 return <aside ref={root} className="workspace-rail" aria-label="Pinned workspaces">
  <header>Workspaces</header>
  <div className="workspace-rail-list">
   {pinned.map(workspace=><button className="workspace-rail-item" key={workspace.id} disabled={busy} title={workspace.name+' · '+workspace.bookmarkIds.length+' bookmarks'} aria-label={'Open workspace '+workspace.name} onClick={()=>{setOpen(false);onOpen(workspace)}} onContextMenu={e=>{e.preventDefault();setOpen(false);onContext(workspace,e.clientX,e.clientY)}}><WorkspaceIcon workspace={workspace} bookmarks={bookmarks}/><span>{workspace.name}</span></button>)}
   {!pinned.length&&<p className="workspace-rail-empty">Pin your workspaces here</p>}
  </div>
  <button className="icon-button workspace-pin-button" aria-label="Pin workspaces" aria-expanded={open} title="Pin workspaces" onClick={()=>setOpen(!open)}><Icon name="plus"/></button>
  {open&&<div className="workspace-pin-menu" role="menu" aria-label="Pin workspaces" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);root.current?.querySelector<HTMLButtonElement>('.workspace-pin-button')?.focus();}}}>
   <strong>Pin workspaces</strong>
   {all.map(workspace=><button role="menuitemcheckbox" aria-checked={workspace.pinned} key={workspace.id} disabled={busy} onClick={()=>onPin(workspace.id)}><Icon name={workspace.pinned?'thumbtack':'plus'}/><span>{workspace.name}</span></button>)}
   {!all.length&&<p>Create a workspace with your favourite bookmarks.</p>}
   <button className="workspace-create" role="menuitem" disabled={busy} onClick={()=>{setOpen(false);onCreate()}}><Icon name="layer-group"/>New workspace</button>
  </div>}
 </aside>;
}
