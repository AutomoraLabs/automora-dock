import React,{useCallback,useEffect,useRef,useState} from 'react';
import {nativeRequest} from './native';
import {Icon} from './ui';

export default function LauncherPinButton({enabled,disabled,notify}:{enabled:boolean;disabled:boolean;notify:(text:string,error?:boolean)=>void}){
  const [pinned,setPinned]=useState<boolean|null>(null),[pinning,setPinning]=useState(false);
  const alive=useRef(true),generation=useRef(0),checking=useRef(false),pinningRef=useRef(false);
  const refresh=useCallback(async()=>{
    if(checking.current||pinningRef.current||document.hidden)return;
    const request=nativeRequest('launcher-pin-status');if(!request)return;
    checking.current=true;const current=generation.current;
    try{const result=await request as {pinned:boolean|null};if(alive.current&&current===generation.current&&typeof result.pinned==='boolean')setPinned(result.pinned);}catch{}finally{checking.current=false;}
  },[]);
  useEffect(()=>{alive.current=true;if(!enabled)return;void refresh();
    const tick=()=>void refresh();window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);window.addEventListener('profiledock:refresh',tick);
    const timer=setInterval(tick,10000);
    return()=>{alive.current=false;generation.current++;clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick);window.removeEventListener('profiledock:refresh',tick);};
  },[enabled,refresh]);
  async function pin(){
    if(pinningRef.current)return;
    pinningRef.current=true;generation.current++;setPinning(true);
    try{
      const request=nativeRequest('pin-launcher');if(!request)throw Error('Open the Automora Dock desktop app to pin its Launcher.');
      const result=await request as {status:string};if(!alive.current)return;
      if(result.status==='pinned'){setPinned(true);notify('Launcher pinned to taskbar.');}
      else if(result.status==='shortcut')notify('Right-click the selected Launcher shortcut → Show more options → Pin to taskbar.');
      else notify('Pin request cancelled.');
    }catch(error){if(alive.current)notify(error instanceof Error?error.message:String(error),true);}
    finally{pinningRef.current=false;if(alive.current){setPinning(false);void refresh();}}
  }
  const state=pinned===true?'pinned':pinned===false?'unpinned':'checking';
  return <button className="button secondary pin-launcher-button" data-pin-state={state} disabled={disabled||!enabled||pinning} onClick={()=>void pin()} title={pinned===true?'Launcher is pinned to taskbar':pinned===false?'Launcher is not pinned. Click to pin to taskbar.':'Pin Launcher to taskbar'} aria-label={pinned===true?'Launcher pinned to taskbar':'Pin Launcher to taskbar'}>
    <span className="launcher-pin-dot" aria-hidden="true"/><Icon name="thumbtack"/><span>{pinning?'Pinning…':pinned===true?'Pinned':'Pin Launcher'}</span>
  </button>;
}
