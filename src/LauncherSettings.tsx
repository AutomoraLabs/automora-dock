import React,{useEffect,useRef,useState} from 'react';
import {Icon} from './ui';
import BackgroundThemes,{useBackgroundTheme} from './BackgroundThemes';
import {nativeRequest} from './native';
type Positions={main:number;folderX:number;folderY:number;workspace:number};
const key='pd-remember-scroll',positionsKey='pd-scroll-positions';
function read():Positions{try{return {...{main:0,folderX:0,folderY:0,workspace:0},...JSON.parse(localStorage.getItem(positionsKey)||'{}')};}catch{return {main:0,folderX:0,folderY:0,workspace:0};}}
export default function LauncherSettings({loaded,theme,onThemeChange,forceMaximized,onForceMaximizedChange,workspaceRail,onWorkspaceRailChange}:{loaded:boolean;theme:string;onThemeChange:(theme:string)=>void;forceMaximized:boolean;onForceMaximizedChange:(enabled:boolean)=>void;workspaceRail:boolean;onWorkspaceRailChange:(enabled:boolean)=>void}){
 const [open,setOpen]=useState(false),[remember,setRemember]=useState(localStorage.getItem(key)==='true');
 const [linkError,setLinkError]=useState('');
 async function openLink(event:React.MouseEvent<HTMLAnchorElement>,url:string){
  const request=nativeRequest('open-link',{url});if(!request)return;
  event.preventDefault();setLinkError('');
  try{await request;setOpen(false);}catch{setLinkError('Could not open your browser. Please try again.');}
 }
 const background=useBackgroundTheme();
 const root=useRef<HTMLDivElement>(null);
 const foldersLoaded=useRef(false);
 useEffect(()=>{const close=()=>setOpen(false);window.addEventListener('profiledock:close-popups',close);window.addEventListener('profiledock:refresh',close);window.addEventListener('blur',close);return()=>{window.removeEventListener('profiledock:close-popups',close);window.removeEventListener('profiledock:refresh',close);window.removeEventListener('blur',close);};},[]);
 useEffect(()=>{
  const apply=(foldersOnly=false)=>{
   const enabled=localStorage.getItem(key)==='true',saved=enabled?read():{main:0,folderX:0,folderY:0,workspace:0};
   const main=document.querySelector('main'),folders=document.querySelector('.favorite-folder-list'),rail=document.querySelector('.workspace-rail-list');
   if(main&&!foldersOnly)main.scrollTo({top:saved.main,behavior:'instant'});
   if(folders&&foldersLoaded.current)folders.scrollTo({left:saved.folderX,top:saved.folderY,behavior:'instant'});
   if(rail&&!foldersOnly)rail.scrollTo({top:saved.workspace,behavior:'instant'});
  };
  const refresh=()=>apply(),foldersReady=()=>{foldersLoaded.current=true;apply(true);};
  const save=(event:Event)=>{
   if(localStorage.getItem(key)!=='true')return;
   const target=event.target;if(!(target instanceof HTMLElement))return;
   const saved=read();
   if(target.matches('main')){if(!loaded)return;saved.main=target.scrollTop;}
   else if(target.matches('.favorite-folder-list')){if(!foldersLoaded.current)return;saved.folderX=target.scrollLeft;saved.folderY=target.scrollTop;}else if(target.matches('.workspace-rail-list'))saved.workspace=target.scrollTop;else return;
   localStorage.setItem(positionsKey,JSON.stringify(saved));
  };
  window.addEventListener('profiledock:refresh',refresh);window.addEventListener('profiledock:folders-ready',foldersReady);document.addEventListener('scroll',save,true);
  if(loaded)apply();
  return()=>{window.removeEventListener('profiledock:refresh',refresh);window.removeEventListener('profiledock:folders-ready',foldersReady);document.removeEventListener('scroll',save,true);};
 },[loaded]);
 useEffect(()=>{
  if(!open)return;
  const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);root.current?.querySelector<HTMLButtonElement>('button')?.focus();}};
  document.addEventListener('pointerdown',close);root.current?.addEventListener('keydown',escape);
  const element=root.current;return()=>{document.removeEventListener('pointerdown',close);element?.removeEventListener('keydown',escape);};
 },[open]);
 return <div ref={root} className="launcher-settings">
  <button className="icon-button" aria-label="Launcher settings" aria-expanded={open} title="Launcher settings" onClick={()=>{setLinkError('');setOpen(!open);}}><Icon name="gear"/></button>
  {open&&<div className="launcher-settings-popup" role="dialog" aria-label="Launcher settings">
   <strong>Launcher settings</strong>
   <label className="scroll-memory-setting"><span><b>Workspace section</b><small>Show pinned workspaces in a fixed right-side section.</small></span><input type="checkbox" role="switch" aria-label="Workspace section" checked={workspaceRail} onChange={e=>onWorkspaceRailChange(e.target.checked)}/></label>
   <label className="scroll-memory-setting"><span><b>Force window to max</b><small>Maximize Chrome windows opened from the Dock.</small></span><input type="checkbox" role="switch" aria-label="Force window to max" checked={forceMaximized} onChange={e=>onForceMaximizedChange(e.target.checked)}/></label>
   <div className="launcher-theme-setting"><span>Appearance</span><div role="group" aria-label="Theme">{[['light','sun','Light'],['dark','moon','Dark'],['system','desktop','System']].map(([id,icon,label])=><button key={id} aria-label={label+' theme'} aria-pressed={theme===id} onClick={()=>onThemeChange(id)}><Icon name={icon}/>{label}</button>)}</div></div>
   <label className="scroll-memory-setting"><span><b>Remember scroll position</b><small>Resume bookmarks and folders where you left off.</small></span><input type="checkbox" role="switch" aria-label="Remember scroll position" checked={remember} onChange={e=>{
    const next=e.target.checked;setRemember(next);localStorage.setItem(key,String(next));
    if(next){const main=document.querySelector('main'),folders=document.querySelector('.favorite-folder-list'),rail=document.querySelector('.workspace-rail-list');localStorage.setItem(positionsKey,JSON.stringify({main:main?.scrollTop||0,folderX:folders?.scrollLeft||0,folderY:folders?.scrollTop||0,workspace:rail?.scrollTop||0}));}
    else localStorage.removeItem(positionsKey);
   }}/></label>
   <p>{remember?'On · Keep your last position when reopening.':'Off · Start from the top each time.'}</p>
   <BackgroundThemes id={background.id} intensity={background.intensity} onSelect={background.setId} onIntensity={background.setIntensity}/>
   <div className="launcher-settings-links">
    <a href="https://automoralabs.store/" target="_blank" rel="noopener noreferrer" onClick={event=>void openLink(event,'https://automoralabs.store/')}><Icon name="compass"/><span>Explore More Softwares</span><Icon name="arrow-up-right-from-square"/></a>
    <a href="https://buymeacoffee.com/rishichaurasiya" target="_blank" rel="noopener noreferrer" onClick={event=>void openLink(event,'https://buymeacoffee.com/rishichaurasiya')}><Icon name="mug-hot"/><span>Buy me a Coffee</span><Icon name="arrow-up-right-from-square"/></a>
   </div>
   {linkError&&<p role="alert">{linkError}</p>}
  </div>}
 </div>;
}
