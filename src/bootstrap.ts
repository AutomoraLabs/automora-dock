import type {Library} from './model';
export function readBootstrap():{library:Library;token:string}|null{
  if(typeof document==='undefined')return null;
  try{
    const value=JSON.parse(document.getElementById('automora-bootstrap')?.textContent||'null');
    if(!value||typeof value.token!=='string'||!value.token||!Number.isInteger(value.library?.revision))return null;
    if(!['profiles','bookmarks','folders','workspaces'].every(key=>Array.isArray(value.library[key])))return null;
    return value;
  }catch{return null;}
}
export const bootstrap=readBootstrap();
