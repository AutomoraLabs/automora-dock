import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { Library, empty, validate } from "../dev/core.mjs";
import { pinGroupsFor, movePin, stackPin, removeFolderShortcut } from "../src/pins.ts";
function fixture() {
  const s = empty();
  s.profiles = [
    {
      id: "p",
      name: "Work",
      directory: "Default",
      root: "C:/fixture",
      executable: "C:/Chrome.exe",
      pinned: true,
    },
  ];
  s.bookmarks = ["a", "b", "c"].map((id) => ({
    id,
    name: id,
    url: "https://example.com/" + id,
    profileId: "p",
    folderId: null,
    tags: [],
    notes: "",
    pinned: true,
    created: 1,
  }));
  s.folders = [{ id: "f", name: "Folder", parentId: null, pinned: true }];
  s.workspaces = [
    { id: "w", name: "Workspace", bookmarkIds: ["a"], pinned: true },
  ];
  return s;
}
test('dropping bookmarks creates a persisted shortcut folder without changing original folders or profile routing',()=>{
 const s=fixture();const original=structuredClone(s.bookmarks);s.pinGroups=pinGroupsFor(s);
 stackPin(s,'bookmarks:b','bookmarks:a','stack');s.pinGroups=pinGroupsFor(s);
 assert.deepEqual(s.folders.find(f=>f.id==='stack').shortcutIds,['a','b']);assert.deepEqual(s.bookmarks,original);
 assert(s.pinGroups.some(g=>g.itemKeys.includes('folders:stack')));assert(!s.pinGroups.some(g=>g.itemKeys.some(k=>['bookmarks:a','bookmarks:b'].includes(k))));
 const dir=fs.mkdtempSync(path.join(tmpdir(),'profiledock-stack-'));const store=new Library(dir);
 try{store.save(s);assert.deepEqual(store.read().folders.find(f=>f.id==='stack').shortcutIds,['a','b']);}finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('existing shortcut folders accept another bookmark; moving out restores a single root pin',()=>{
 const s=fixture();stackPin(s,'bookmarks:b','bookmarks:a','stack');s.pinGroups=pinGroupsFor(s);
 stackPin(s,'bookmarks:c','folders:stack','unused');s.pinGroups=pinGroupsFor(s);
 assert.deepEqual(s.folders.find(f=>f.id==='stack').shortcutIds,['a','b','c']);
 removeFolderShortcut(s,'stack','b');s.pinGroups=pinGroupsFor(s);
 assert.deepEqual(s.folders.find(f=>f.id==='stack').shortcutIds,['a','c']);assert.equal(s.pinGroups.flatMap(g=>g.itemKeys).filter(k=>k==='bookmarks:b').length,1);validate(s);
});
test('invalid folder references and self drops cannot corrupt pins',()=>{
 const s=fixture();assert.throws(()=>stackPin(s,'bookmarks:a','bookmarks:a','stack'));
 s.folders[0].shortcutIds=['missing'];assert.throws(()=>validate(s),/folder shortcut/);
 s.folders[0].shortcutIds=['a','a'];assert.throws(()=>validate(s),/folder shortcut/);
});
test("legacy pins acquire arranged groups without losing any pin types", () => {
  const s = fixture();
  delete s.pinGroups;
  const groups = pinGroupsFor(s);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    new Set(groups[0].itemKeys),
    new Set([
      "bookmarks:a",
      "bookmarks:b",
      "bookmarks:c",
      "folders:f",
      "profiles:p",
      "workspaces:w",
    ]),
  );
  assert.equal(s.pinGroups, undefined);
});
test("drag moves and reorders pins deterministically without coordinate storage", () => {
  const s = fixture();
  s.pinGroups = [
    ...pinGroupsFor(s),
    { id: "productivity", name: "Productivity", itemKeys: [] },
  ];
  s.pinGroups = movePin(s, "bookmarks:b", "productivity");
  assert.deepEqual(s.pinGroups[1].itemKeys, ["bookmarks:b"]);
  s.pinGroups = movePin(s, "bookmarks:c", "productivity", "bookmarks:b");
  assert.deepEqual(s.pinGroups[1].itemKeys, ["bookmarks:c", "bookmarks:b"]);
  assert.equal(s.pinGroups[0].itemKeys.includes("bookmarks:c"), false);
  assert.deepEqual(
    movePin(s, "bookmarks:c", "productivity", "bookmarks:c"),
    s.pinGroups,
  );
  validate(s);
});
test("unpin and trash remove group membership while preserving labels", () => {
  const s = fixture();
  s.pinGroups = pinGroupsFor(s);
  s.bookmarks[0].pinned = false;
  s.bookmarks[1].trashed = true;
  const groups = pinGroupsFor(s);
  assert.equal(groups[0].name, "Pinned");
  assert(!groups[0].itemKeys.includes("bookmarks:a"));
  assert(!groups[0].itemKeys.includes("bookmarks:b"));
  assert(groups[0].itemKeys.includes("bookmarks:c"));
});
test("group names and mixed pin order survive SQLite close and reopen", () => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), "profiledock-groups-"));
  let store;
  try {
    store = new Library(directory);
    const s = fixture();
    s.pinGroups = pinGroupsFor(s);
    s.pinGroups[0].name = "Explore";
    s.pinGroups[0].itemKeys.reverse();
    const expected = structuredClone(s.pinGroups);
    store.save(s);
    store.close();
    store = new Library(directory);
    assert.deepEqual(store.read().pinGroups, expected);
  } finally {
    store?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test("duplicate and invalid group assignments are rejected before save", () => {
  const s = fixture();
  s.pinGroups = [
    { id: "one", name: "One", itemKeys: ["bookmarks:a"] },
    { id: "two", name: "Two", itemKeys: ["bookmarks:a"] },
  ];
  assert.throws(() => validate(s), /duplicate/);
  s.pinGroups[1].itemKeys = ["bookmarks:missing"];
  assert.throws(() => validate(s), /Invalid/);
});
