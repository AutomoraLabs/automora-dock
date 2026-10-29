import {nativeLaunch} from "./native.ts";
import {bootstrap} from './bootstrap.ts';
export type Profile = {
  id: string;
  name: string;
  root: string;
  directory: string;
  executable: string;
  color: string;
  pinned: boolean;
};
export type Bookmark = {
  id: string;
  name: string;
  url: string;
  profileId: string;
  folderId: string | null;
  tags: string[];
  notes: string;
  pinned: boolean;
  created: number;
  opened?: number;
  trashed?: boolean;
  sourceId?: string;
};
export type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  pinned: boolean;
  shortcutIds?: string[];
};
export type Workspace = {
  id: string;
  name: string;
  bookmarkIds: string[];
  pinned: boolean;
};
export type Library = {
  profiles: Profile[];
  bookmarks: Bookmark[];
  folders: Folder[];
  workspaces: Workspace[];
  revision: number;
  pinGroups?: PinGroup[];
};
export type PinGroup = { id: string; name: string; itemKeys: string[] };
export type ImportItem = {
  sourceId: string;
  name: string;
  url: string;
  profileId: string;
  folderPath: string[];
};
export type ImportSource = {
  profileId: string;
  name: string;
  status: "ready" | "empty" | "missing" | "error" | "backup" | "partial";
  count: number;
  message: string;
};
export type ImportPreview = {
  items: ImportItem[];
  warnings: string[];
  sources: ImportSource[];
};
export const initial: Library = {
  profiles: [],
  bookmarks: [],
  folders: [],
  workspaces: [],
  revision: 0,
};
let token = bootstrap?.token || "";
export async function fetchLocal(url:string,options:RequestInit={},timeoutMs=20000):Promise<Response>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...options,signal:controller.signal});}
  catch(error){if(controller.signal.aborted)throw Error('Local service request timed out. Reopen Automora Dock and try again.');throw Error('Local service unavailable. Reopen Automora Dock and try again.');}
  finally{clearTimeout(timer);}
}
export async function command<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if(command === "launch") {
    const native = nativeLaunch(args);
    if(native) return await native as T;
  }
  if ("__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }
  if (!token) token = (await (await fetchLocal("/api/session")).json()).token;
  const send = () =>
    fetchLocal("/api/command", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ProfileDock-Token": token,
      },
      body: JSON.stringify({ command, args }),
    },command==='favorite_folder'&&args.action==='folder-pick'?600000:20000);
  let response = await send();
  if (response.status === 403) {
    token = (await (await fetchLocal("/api/session")).json()).token;
    response = await send();
  }
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Operation failed.");
  return data.result;
}
export function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const uid = () => crypto.randomUUID();
export function mergeImport(state: Library, items: ImportItem[]): Library {
  const next = structuredClone(state);
  for (const item of items) {
    const existing = next.bookmarks.find(
      (b) => b.profileId === item.profileId && b.sourceId === item.sourceId,
    );
    if (existing) {
      existing.url = item.url;
      continue;
    }
    let parentId: string | null = null;
    for (const name of item.folderPath) {
      let folder = next.folders.find(
        (f) => f.name === name && f.parentId === parentId,
      );
      if (!folder) {
        folder = { id: uid(), name, parentId, pinned: false };
        next.folders.push(folder);
      }
      parentId = folder.id;
    }
    next.bookmarks.push({
      id: uid(),
      name: item.name,
      url: item.url,
      profileId: item.profileId,
      sourceId: item.sourceId,
      folderId: parentId,
      tags: [],
      notes: "",
      pinned: false,
      created: Date.now(),
    });
  }
  return next;
}
