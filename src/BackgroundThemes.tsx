import React,{useLayoutEffect,useState} from 'react';
import {backgroundThemes,themeArtwork} from './backgroundCatalog';
import {Icon} from './ui';
const properties=['--bg','--panel','--raised','--sidebar','--border','--text','--muted','--faint','--accent','--accent-bg','--button','--button-text','--hover','--scroll-thumb','--theme-art','--theme-glow','--theme-strength'];
export function useBackgroundTheme(){
 const [id,setId]=useState(()=>{const saved=localStorage.getItem('pd-background')||'classic';return backgroundThemes.some(t=>t.id===saved)?saved:'classic'});
 const [intensity,setIntensity]=useState(()=>{const value=localStorage.getItem('pd-background-intensity');const parsed=value===null?45:Number(value);return Number.isFinite(parsed)?Math.max(0,Math.min(100,parsed)):45});
 useLayoutEffect(()=>{
  const root=document.documentElement;
  const apply=()=>{
   const theme=backgroundThemes.find(t=>t.id===id)!;root.dataset.background=id;properties.forEach(key=>root.style.removeProperty(key));if(id==='classic')return;
   const dark=root.dataset.theme==='dark',[bg,ink,accent,panel]=dark?theme.dark:theme.light;
   const mix=(a:string,p:number,b:string)=>`color-mix(in srgb, ${a} ${p}%, ${b})`;
   const values:Record<string,string>={'--bg':bg,'--panel':panel,'--raised':mix(panel,75,accent),'--sidebar':panel,'--border':mix(bg,80,ink),'--text':ink,'--muted':mix(ink,72,bg),'--faint':mix(ink,64,bg),'--accent':accent,'--accent-bg':mix(bg,85,accent),'--button':accent,'--button-text':dark?'#14202a':'#ffffff','--hover':mix(bg,89,accent),'--scroll-thumb':mix(bg,63,ink),'--theme-art':themeArtwork(theme,accent),'--theme-glow':'none','--theme-strength':String(intensity/100)};
   Object.entries(values).forEach(([key,value])=>root.style.setProperty(key,value));
  };
  apply();localStorage.setItem('pd-background',id);localStorage.setItem('pd-background-intensity',String(intensity));const observer=new MutationObserver(apply);observer.observe(root,{attributes:true,attributeFilter:['data-theme']});return()=>observer.disconnect();
 },[id,intensity]);
 return {id,intensity,setId,setIntensity};
}
export default function BackgroundThemes({id,intensity,onSelect,onIntensity}:{id:string;intensity:number;onSelect:(id:string)=>void;onIntensity:(value:number)=>void}){
 const selected=backgroundThemes.find(t=>t.id===id)!;
 const tile=(theme:typeof selected)=>{const [bg,,accent]=theme.light;return <button key={theme.id} className="background-theme-tile" aria-label={theme.name+' background'} aria-pressed={id===theme.id} onClick={()=>onSelect(theme.id)}><span className="background-theme-preview" style={{backgroundColor:bg,backgroundImage:themeArtwork(theme,accent)}}>{id===theme.id&&<span className="theme-selected"><Icon name="check"/></span>}</span><span>{theme.name}</span></button>};
 return <details className="background-themes"><summary><span>Background themes</span><small>{selected.name}</small><Icon name="chevron-down"/></summary>
  <div className="background-theme-classic">{tile(backgroundThemes[0])}<p>Original clean appearance</p></div>
  {(['Soft','Bold'] as const).map(group=><section key={group}><h3>{group==='Soft'?'Soft / Girly':'Bold / Boys'}</h3><div className="background-theme-grid">{backgroundThemes.filter(theme=>theme.group===group).map(tile)}</div></section>)}
  <label className="background-intensity"><span>Background intensity <b>{intensity}%</b></span><input type="range" aria-label="Background intensity" min="0" max="100" step="5" value={intensity} disabled={id==='classic'} onChange={e=>onIntensity(Number(e.target.value))}/></label>
 </details>;
}
