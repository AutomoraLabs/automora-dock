import type { Library, PinGroup } from "./model";
export const pinKinds = [
  "bookmarks",
  "folders",
  "profiles",
  "workspaces",
] as const;
export function pinGroupsFor(state: Library): PinGroup[] {
  const nested=new Set(state.folders.filter(folder=>folder.pinned).flatMap(folder=>folder.shortcutIds||[]));
  const keys = pinKinds.flatMap((kind) =>
    state[kind]
      .filter((item) => item.pinned && !("trashed" in item && item.trashed) && !(kind==='bookmarks'&&nested.has(item.id)))
      .map((item) => `${kind}:${item.id}`),
  );
  const valid = new Set(keys),
    seen = new Set<string>();
  const groups = (state.pinGroups || []).map((group) => ({
    ...group,
    itemKeys: group.itemKeys.filter((key) => {
      if (!valid.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  }));
  const remaining = keys.filter((key) => !seen.has(key));
  if (remaining.length || !groups.length) {
    let ungrouped = groups.find((g) => g.id === "ungrouped");
    if (!ungrouped) {
      ungrouped = { id: "ungrouped", name: "Pinned", itemKeys: [] };
      groups.push(ungrouped);
    }
    ungrouped.itemKeys.push(...remaining);
  }
  return groups;
}
export function stackPin(state:Library,sourceKey:string,targetKey:string,id:string) {
  const source=state.bookmarks.find(bookmark=>'bookmarks:'+bookmark.id===sourceKey&&bookmark.pinned&&!bookmark.trashed);
  if(!source||sourceKey===targetKey)throw Error('Choose two different pinned bookmarks.');
  const groups=pinGroupsFor(state),targetGroup=groups.find(group=>group.itemKeys.includes(targetKey));
  if(!targetGroup)throw Error('The target pin is no longer available.');
  const existing=state.folders.find(folder=>'folders:'+folder.id===targetKey&&folder.pinned&&folder.shortcutIds);
  const target=state.bookmarks.find(bookmark=>'bookmarks:'+bookmark.id===targetKey&&bookmark.pinned&&!bookmark.trashed);
  if(!existing&&!target)throw Error('Drop onto a bookmark or a shortcut folder.');
  for(const folder of state.folders)if(folder.shortcutIds)folder.shortcutIds=folder.shortcutIds.filter(item=>item!==source.id);
  const folder=existing||{id,name:'Folder',parentId:null,pinned:true,shortcutIds:[target!.id]};
  if(!existing)state.folders.push(folder);
  folder.shortcutIds!.push(source.id);
  for(const group of groups)group.itemKeys=group.itemKeys.filter(key=>key!==sourceKey);
  if(!existing)targetGroup.itemKeys=targetGroup.itemKeys.map(key=>key===targetKey?'folders:'+folder.id:key);
  state.pinGroups=groups;
  return folder.id;
}
export function removeFolderShortcut(state:Library,folderId:string,bookmarkId:string) {
  const folder=state.folders.find(folder=>folder.id===folderId&&folder.shortcutIds);
  if(!folder)throw Error('Folder no longer exists.');
  folder.shortcutIds=folder.shortcutIds!.filter(id=>id!==bookmarkId);
  const groups=pinGroupsFor(state),group=groups.find(group=>group.itemKeys.includes('folders:'+folderId));
  const bookmark=state.bookmarks.find(bookmark=>bookmark.id===bookmarkId);
  if(group&&bookmark?.pinned&&!bookmark.trashed){
    for(const candidate of groups)candidate.itemKeys=candidate.itemKeys.filter(key=>key!=='bookmarks:'+bookmarkId);
    group.itemKeys.splice(group.itemKeys.indexOf('folders:'+folderId)+1,0,'bookmarks:'+bookmarkId);
  }
  state.pinGroups=groups;
}
export function movePin(
  state: Library,
  key: string,
  targetId: string,
  beforeKey?: string,
) {
  const groups = pinGroupsFor(state);
  if (key === beforeKey) return groups;
  const target = groups.find((g) => g.id === targetId);
  if (!target || !groups.some((g) => g.itemKeys.includes(key)))
    throw Error("Pinned item or group no longer exists.");
  for (const group of groups)
    group.itemKeys = group.itemKeys.filter((k) => k !== key);
  const index = beforeKey ? target.itemKeys.indexOf(beforeKey) : -1;
  target.itemKeys.splice(index < 0 ? target.itemKeys.length : index, 0, key);
  return groups;
}
