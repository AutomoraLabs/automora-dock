import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import {Favorites} from './favorites.mjs';

export const empty = () => ({
  profiles: [],
  bookmarks: [],
  folders: [],
  workspaces: [],
  revision: 0,
  pinGroups: [],
});
export function validate(s) {
  if (s && s.pinGroups === undefined) s.pinGroups = [];
  if (!s || !Number.isInteger(s.revision) || s.revision < 0)
    throw Error("Invalid library revision.");
  for (const type of [
    "profiles",
    "bookmarks",
    "folders",
    "workspaces",
    "pinGroups",
  ]) {
    if (!Array.isArray(s[type]) || s[type].length > 100000)
      throw Error("Invalid " + type);
    const ids = new Set();
    for (const x of s[type]) {
      if (!x || typeof x.id !== "string" || !x.id || ids.has(x.id))
        throw Error("Invalid or duplicate item ID.");
      ids.add(x.id);
      if (typeof x.name !== "string" || x.name.length > 4096)
        throw Error("Invalid name.");
    }
  }
  const profiles = new Set(s.profiles.map((p) => p.id)),
    folders = new Map(s.folders.map((f) => [f.id, f]));
  for (const p of s.profiles)
    if (
      typeof p.root !== "string" ||
      typeof p.directory !== "string" ||
      !p.directory ||
      p.directory.includes("..") ||
      /[\\/]/.test(p.directory) ||
      typeof p.executable !== "string"
    )
      throw Error("Invalid profile location.");
  for (const b of s.bookmarks) {
    const u = new URL(b.url);
    if (!["http:", "https:"].includes(u.protocol))
      throw Error("Only HTTP and HTTPS bookmarks are supported.");
    if (!profiles.has(b.profileId)) throw Error("Choose an existing profile.");
    if (b.folderId && !folders.has(b.folderId))
      throw Error("Folder does not exist.");
    if (
      !Array.isArray(b.tags) ||
      b.tags.some((t) => typeof t !== "string") ||
      typeof b.notes !== "string" ||
      typeof b.pinned !== "boolean"
    )
      throw Error("Invalid bookmark fields.");
  }
  for (const f of s.folders) {
    let n = f;
    const seen = new Set();
    while (n?.parentId) {
      if (seen.has(n.id)) throw Error("Folders cannot contain themselves.");
      seen.add(n.id);
      n = folders.get(n.parentId);
      if (!n) throw Error("Parent folder missing.");
    }
  }
  const bookmarks = new Set(s.bookmarks.map((b) => b.id));
  const nested=new Set();
  for(const folder of s.folders)if(folder.shortcutIds!==undefined){
    if(!Array.isArray(folder.shortcutIds)||new Set(folder.shortcutIds).size!==folder.shortcutIds.length||folder.shortcutIds.some(id=>typeof id!=='string'||!bookmarks.has(id)||nested.has(id)))throw Error('Invalid or duplicate folder shortcut.');
    for(const id of folder.shortcutIds)nested.add(id);
  }
  const pinKeys = new Set(
      ["bookmarks", "folders", "profiles", "workspaces"].flatMap((kind) =>
        s[kind]
          .filter((item) => item.pinned && !item.trashed)
          .map((item) => `${kind}:${item.id}`),
      ),
    ),
    assigned = new Set();
  for (const group of s.pinGroups) {
    if (!Array.isArray(group.itemKeys))
      throw Error("Invalid pinned group items.");
    for (const key of group.itemKeys) {
      if (!pinKeys.has(key) || assigned.has(key))
        throw Error("Invalid or duplicate pinned group item.");
      assigned.add(key);
    }
  }
  for (const w of s.workspaces)
    if (
      !Array.isArray(w.bookmarkIds) ||
      w.bookmarkIds.some((id) => !bookmarks.has(id))
    )
      throw Error("Workspace contains missing bookmarks.");
  return s;
}
export class Library {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true });
    this.directory = directory;
    this.open();
  }
  open() {
    this.db = new DatabaseSync(path.join(this.directory, "library.sqlite"));
    this.db.exec(
      "PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value INTEGER NOT NULL); INSERT OR IGNORE INTO metadata VALUES ('revision',0);",
    );
  }
  readRaw() {
    const s = empty();
    for (const r of this.db.prepare("SELECT * FROM entities").all())
      if (s[r.kind]) s[r.kind].push(JSON.parse(r.payload));
    s.revision = Number(
      this.db.prepare("SELECT value FROM metadata WHERE key='revision'").get()
        .value,
    );
    return s;
  }
  read() {
    let snapshot=this.readRaw();
    // A replacement/restored database can leave a long-running connection
    // looking at the old empty file. Never publish that as a new library.
    if(snapshot.revision===0 && !['profiles','bookmarks','folders','workspaces','pinGroups'].some(kind=>snapshot[kind].length)) {
      const backups=path.join(this.directory,'backups');
      const hasSavedLibrary=fs.existsSync(backups) && fs.readdirSync(backups).some(name=>{
        if(!name.endsWith('.json'))return false;
        try { const saved=JSON.parse(fs.readFileSync(path.join(backups,name),'utf8'));return saved.format==='profiledock' && validate(saved.library).revision>0; }catch{return false;}
      });
      if(hasSavedLibrary) {
        // Do not close a connection while save() owns a transaction.
        if(this.saving)throw Error('Saved library is unavailable. Restart Automora Dock to reload it. Recovery copies are preserved.');
        this.db.close();this.open();snapshot=this.readRaw();
        if(snapshot.revision===0)throw Error('Saved library could not be loaded. Recovery copies are preserved; do not re-import or reset your library.');
      }
    }
    return snapshot;
  }
  save(next,beforeCommit) {
    validate(next);
    this.read();
    this.db.exec("BEGIN IMMEDIATE");
    this.saving=true;
    try {
      if (next.revision !== this.read().revision)
        throw Error("Library changed in another window. Reload before saving.");
      this.backup();
      this.db.exec("DELETE FROM entities");
      const q = this.db.prepare("INSERT INTO entities VALUES(?,?,?)");
      for (const k of [
        "profiles",
        "bookmarks",
        "folders",
        "workspaces",
        "pinGroups",
      ])
        for (const x of next[k]) q.run(k, x.id, JSON.stringify(x));
      this.db
        .prepare("UPDATE metadata SET value=value+1 WHERE key='revision'")
        .run();
      if(beforeCommit)beforeCommit();
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    } finally { this.saving=false; }
    // Keep the latest committed state in a standalone recovery file as well.
    // Backup failure must not report a successful database commit as failed.
    try { this.backup(); } catch (error) { console.error("Recovery backup failed:", error.message); }
    return this.read();
  }
  backup() {
    const snapshot=this.read();
    if(this.lastBackupRevision===snapshot.revision)return;
    const dir = path.join(this.directory, "backups");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, Date.now() + "-" + String(snapshot.revision).padStart(12,'0') + "-" + randomUUID() + ".json");
    const temporary=file+'.tmp';
    let descriptor;
    try{
      descriptor=fs.openSync(temporary,'wx');
      fs.writeFileSync(descriptor,JSON.stringify({format:'profiledock',version:2,library:snapshot,favoriteFolders:new Favorites(this.directory).read()}));
      fs.fsyncSync(descriptor);fs.closeSync(descriptor);descriptor=undefined;
      fs.renameSync(temporary,file);this.lastBackupRevision=snapshot.revision;
    }finally{if(descriptor!==undefined)fs.closeSync(descriptor);if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
    for (const f of fs.readdirSync(dir).filter(name=>name.endsWith('.json')).sort().slice(0, -10))
      fs.unlinkSync(path.join(dir, f));
  }
  close() {
    this.db.close();
  }
}
export function detectProfiles(customRoot, customExecutable) {
  const local = process.env.LOCALAPPDATA || "";
  const roots = customRoot
    ? [customRoot]
    : [
        path.join(local, "Google/Chrome/User Data"),
        path.join(local, "Google/Chrome Beta/User Data"),
      ];
  const executables = [
    customExecutable,
    path.join(
      process.env.PROGRAMFILES || "C:/Program Files",
      "Google/Chrome/Application/chrome.exe",
    ),
    path.join(local, "Google/Chrome/Application/chrome.exe"),
    path.join(
      process.env["PROGRAMFILES(X86)"] || "C:/Program Files (x86)",
      "Google/Chrome/Application/chrome.exe",
    ),
  ].filter(Boolean);
  const executable = executables.find((x) => fs.existsSync(x)) || "";
  const profiles = [];
  const warnings = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    let info = {};
    try {
      info =
        JSON.parse(fs.readFileSync(path.join(root, "Local State"), "utf8"))
          .profile?.info_cache || {};
    } catch {
      warnings.push("Profile names unavailable in " + root);
    }
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = entry.name;
      if (
        !info[directory] &&
        !fs.existsSync(path.join(root, directory, "Bookmarks")) &&
        !fs.existsSync(path.join(root, directory, "Bookmarks.bak")) &&
        !fs.existsSync(path.join(root, directory, "AccountBookmarks")) &&
        !fs.existsSync(path.join(root, directory, "AccountBookmarks.bak"))
      )
        continue;
      if (directory === "System Profile" || directory === "Guest Profile")
        continue;
      const meta = info[directory] || {};
      profiles.push({
        id: createHash("sha256")
          .update(path.resolve(root).toLowerCase() + "|" + directory)
          .digest("hex")
          .slice(0, 24),
        name: meta.name || directory,
        root: path.resolve(root),
        directory,
        executable,
        color: ["#9d8dff", "#61c5ad", "#e5b66e", "#83b9ed"][
          profiles.length % 4
        ],
        pinned: false,
      });
    }
  }
  return { profiles, warnings };
}
export function parseBookmarks(tree, profileId, store = "local") {
  const entries = [];
  function walk(node, folders) {
    if (node.type === "url") {
      try {
        const u = new URL(node.url);
        if (!["http:", "https:"].includes(u.protocol)) return;
        entries.push({
          sourceId: node.guid
            ? String(node.guid)
            : (store === "account" ? "account:" : "") + String(node.id),
          name: node.name || u.hostname,
          url: u.href,
          profileId,
          folderPath: folders,
        });
      } catch {}
      return;
    }
    for (const child of node.children || [])
      walk(child, node.name ? [...folders, node.name] : folders);
  }
  for (const node of Object.values(tree.roots || {})) walk(node, []);
  return entries;
}
export function readBookmarkSource(p) {
  const items = [],
    files = [],
    backups = [],
    errors = [];
  let readable = 0;
  for (const [store, primary] of [
    ["local", "Bookmarks"],
    ["account", "AccountBookmarks"],
  ]) {
    let failures = [];
    for (const file of [primary, primary + ".bak"]) {
      try {
        const tree = JSON.parse(
          fs.readFileSync(path.join(p.root, p.directory, file), "utf8"),
        );
        if (
          !tree ||
          !tree.roots ||
          typeof tree.roots !== "object" ||
          Array.isArray(tree.roots)
        )
          throw Error("Invalid bookmark file structure.");
        items.push(...parseBookmarks(tree, p.id, store));
        files.push(file);
        readable++;
        if (file.endsWith(".bak")) backups.push(file);
        failures = [];
        break;
      } catch (e) {
        failures.push(e);
      }
    }
    if (failures.some((e) => e.code !== "ENOENT")) errors.push(store);
  }
  const seen = new Set();
  const entries = items.filter((item) => {
    if (seen.has(item.sourceId)) return false;
    seen.add(item.sourceId);
    return true;
  });
  let status, message;
  if (readable) {
    status = errors.length
      ? "partial"
      : backups.length
        ? "backup"
        : entries.length
          ? "ready"
          : "empty";
    message = entries.length
      ? `${entries.length} bookmarks available · ${files.some((f) => f.startsWith("Account")) ? (files.some((f) => f.startsWith("Bookmarks")) ? "local + account bookmarks" : "account bookmarks") : "local bookmarks"}`
      : "No supported HTTP/HTTPS bookmarks in this profile.";
    if (backups.length)
      message += " Using local backup: " + backups.join(", ") + ".";
    if (errors.length)
      message +=
        " Some " + errors.join(" / ") + " bookmark files could not be read.";
  } else {
    status = errors.length ? "error" : "missing";
    message = errors.length
      ? "Bookmark files could not be read. Check access to the Chrome user-data folder and try again."
      : "No local or account bookmark file in this profile. Open this Chrome profile and check its bookmarks, or choose another profile.";
  }
  return {
    items: entries,
    profileId: p.id,
    name: p.name,
    status,
    count: entries.length,
    message,
    files,
  };
}
export function preview(profiles) {
  const items = [],
    warnings = [],
    sources = [];
  for (const p of profiles) {
    const result = readBookmarkSource(p);
    const { items: entries, ...source } = result;
    sources.push(source);
    items.push(...entries);
    if (["missing", "error", "backup", "partial"].includes(source.status))
      warnings.push(`${p.name} (${p.directory}): ${source.message}`);
  }
  return { items, warnings, sources };
}
export function launchSpec(profile, url, forceMaximized = false) {
  if (!fs.existsSync(path.join(profile.root, profile.directory)))
    throw Error(
      "Profile folder is missing. Re-detect profiles or reassign this bookmark.",
    );
  if (!profile.executable || !fs.existsSync(profile.executable))
    throw Error("Chrome executable not found. Set its path in Profiles.");
  const args = [
    "--user-data-dir=" + path.resolve(profile.root),
    "--profile-directory=" + profile.directory,
  ];
  if (forceMaximized === true) args.push("--start-maximized");
  if (url) {
    const u = new URL(url);
    if (!["https:", "http:"].includes(u.protocol))
      throw Error("Unsupported URL.");
    args.push(u.href);
  } else args.push("chrome://newtab/");
  return { executable: profile.executable, args };
}
export function launch(profile, url, forceMaximized = false) {
  const {executable,args} = launchSpec(profile,url,forceMaximized);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      stdio: "ignore",
      shell: false,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve({ requested: true });
    });
  });
}
export function favicon(profile, url) {
  let db;
  try {
    const source = path.join(profile.root, profile.directory, "Favicons");
    const read = () =>
      db
        .prepare(
          "SELECT b.image_data FROM favicon_bitmaps b JOIN icon_mapping m ON m.icon_id=b.icon_id WHERE m.page_url=? OR m.page_url=? ORDER BY CASE WHEN m.page_url=? THEN 0 ELSE 1 END,b.width DESC LIMIT 1",
        )
        .get(url, new URL(url).origin + "/", url);
    let row;
    try {
      db = new DatabaseSync(source, { readOnly: true });
      row = read();
    } catch (error) {
      db?.close();
      db = undefined;
      if (!String(error.message).includes("locked")) throw error;
      let cached = iconSnapshots.get(source);
      if (!cached || Date.now() - cached.time > 60000) {
        const directory = fs.mkdtempSync(
          path.join(tmpdir(), "profiledock-icons-"),
        );
        const file = path.join(directory, "Favicons");
        try {
          fs.copyFileSync(source, file);
          const check = new DatabaseSync(file, { readOnly: true });
          try {
            const result = check.prepare("PRAGMA quick_check").get();
            if (Object.values(result)[0] !== "ok")
              throw Error("Icon snapshot unavailable");
          } finally {
            check.close();
          }
        } catch (e) {
          fs.rmSync(directory, { recursive: true, force: true });
          throw e;
        }
        if (cached)
          fs.rmSync(cached.directory, { recursive: true, force: true });
        cached = { directory, file, time: Date.now() };
        iconSnapshots.set(source, cached);
      }
      db = new DatabaseSync(cached.file, { readOnly: true });
      row = read();
    }
    if (!row || row.image_data.length > 1000000) return null;
    return (
      "data:image/png;base64," + Buffer.from(row.image_data).toString("base64")
    );
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
const iconSnapshots = new Map();
export function profileAvatar(profile) {
  for (const [name, mime] of [
    ["Google Profile Picture.png", "image/png"],
    ["Google Profile.ico", "image/x-icon"],
    ["Avatar.png", "image/png"],
  ]) {
    try {
      const bytes = fs.readFileSync(
        path.join(profile.root, profile.directory, name),
      );
      if (bytes.length && bytes.length < 2000000)
        return `data:${mime};base64,${bytes.toString("base64")}`;
    } catch {}
  }
  return null;
}
process.once("exit", () => {
  for (const snapshot of iconSnapshots.values())
    try {
      fs.rmSync(snapshot.directory, { recursive: true, force: true });
    } catch {}
});
