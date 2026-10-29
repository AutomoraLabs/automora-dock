import React, { useState, useEffect } from "react";
import { command } from "./model";
import type { Bookmark,Profile,Workspace } from "./model";
import {ProfileAvatar} from './profiles';
import {cachedAsset,loadAsset} from './assetCache';
export const Icon = ({
  name,
  ...rest
}: { name: string } & React.HTMLAttributes<HTMLElement>) => (
  <i aria-hidden="true" className={"fa-solid fa-" + name} {...rest} />
);
export const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
export function WorkspaceIcon({workspace,bookmarks,badge=true}:{workspace:Workspace;bookmarks:Bookmark[];badge?:boolean}) {
  const byId=new Map(bookmarks.filter(bookmark=>!bookmark.trashed).map(bookmark=>[bookmark.id,bookmark]));
  const items=workspace.bookmarkIds.map(id=>byId.get(id)).filter((bookmark):bookmark is Bookmark=>!!bookmark).slice(0,4);
  if(!items.length)return <Icon name={badge?'layer-group':'folder'}/>;
  return <div className="workspace-mosaic" aria-hidden="true">{Array.from({length:4},(_,index)=><div className="workspace-mosaic-cell" key={index}>{items[index]&&<SiteIcon bookmark={items[index]}/>}</div>)}{badge&&<span className="workspace-type-badge"><Icon name="layer-group"/></span>}</div>;
}
export function SiteIcon({ bookmark,profile }: { bookmark: Bookmark;profile?:Profile }) {
  const key='site|'+bookmark.profileId+'|'+bookmark.url;
  const [src, setSrc] = useState<string | null>(()=>cachedAsset(key));
  useEffect(() => {
    let alive = true;
    setSrc(cachedAsset(key));
    loadAsset(key,()=>command<string | null>("favicon", {
          profileId: bookmark.profileId,
          url: bookmark.url,
        })).then((value) => {
      if (alive) setSrc(value);
    });
    return () => {
      alive = false;
    };
  }, [bookmark.profileId, bookmark.url]);
  return (
    <div className="site-icon">
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          width="22"
          height="22"
          onError={() => setSrc(null)}
        />
      ) : (
        <Icon name="globe" />
      )}
      {profile&&<span className="icon-avatar-badge"><ProfileAvatar profile={profile} size={17}/></span>}
    </div>
  );
}
