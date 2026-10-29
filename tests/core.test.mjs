import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Library,
  empty,
  parseBookmarks,
  detectProfiles,
  preview,
  validate,
  launch,
  launchSpec,
  favicon,
} from "../dev/core.mjs";
import { mergeImport } from "../src/model.ts";
test("Chrome launch preserves the selected profile and URL without overriding Chrome window state",()=>fixture(dir=>{
  mkdirSync(path.join(dir,"Default"));
  const executable=path.join(dir,"chrome.exe");writeFileSync(executable,"");
  const p={...profile(dir),executable};
  const spec=launchSpec(p,"https://example.com/?q=hello%20world&x=1");
  assert.equal(spec.executable,executable);
  assert.deepEqual(spec.args,["--user-data-dir="+path.resolve(dir),"--profile-directory=Default","https://example.com/?q=hello%20world&x=1"]);
  assert.equal(launchSpec(p).args.at(-1),"chrome://newtab/");
  assert(launchSpec(p,"https://example.com/",true).args.includes("--start-maximized"));
  assert(!launchSpec(p,"https://example.com/",false).args.includes("--start-maximized"));
  assert.throws(()=>launchSpec(p,"javascript:alert(1)"),/Unsupported URL/);
}));
const profile = (root = "C:/fixture") => ({
  id: "p1",
  name: "Work",
  root,
  directory: "Default",
  executable: "C:/chrome.exe",
  color: "#aaa",
  pinned: false,
});
const item = (profileId = "p1") => ({
  sourceId: "abc",
  name: "Example",
  url: "https://example.com/",
  profileId,
  folderPath: ["Bookmarks bar", "Work"],
});
const treeFor = (children) => ({
  roots: { bar: { name: "Bookmarks bar", children } },
});
const link = (id, url, guid) => ({
  type: "url",
  id,
  name: "Fixture",
  url,
  ...(guid ? { guid } : {}),
});
test("account-only profiles are detected and account bookmarks appear in preview", () =>
  fixture((dir) => {
    mkdirSync(path.join(dir, "Default"));
    writeFileSync(
      path.join(dir, "Default", "AccountBookmarks"),
      JSON.stringify(
        treeFor([link("1", "https://account.example/", "account-guid")]),
      ),
    );
    const detected = detectProfiles(dir);
    assert.equal(detected.profiles.length, 1);
    const result = preview(detected.profiles);
    assert.equal(result.sources[0].status, "ready");
    assert.equal(result.sources[0].count, 1);
    assert.equal(result.items[0].sourceId, "account-guid");
    assert.match(result.sources[0].message, /account bookmarks/);
  }));
test("local and account stores merge without numeric ID collisions or duplicate GUIDs", () =>
  fixture((dir) => {
    mkdirSync(path.join(dir, "Default"));
    writeFileSync(
      path.join(dir, "Default", "Bookmarks"),
      JSON.stringify(
        treeFor([
          link("1", "https://local.example/"),
          link("2", "https://shared.example/", "same-guid"),
        ]),
      ),
    );
    writeFileSync(
      path.join(dir, "Default", "AccountBookmarks"),
      JSON.stringify(
        treeFor([
          link("1", "https://account.example/"),
          link("8", "https://shared.example/", "same-guid"),
        ]),
      ),
    );
    const result = preview([profile(dir)]);
    assert.equal(result.items.length, 3);
    assert.deepEqual(
      new Set(result.items.map((i) => i.sourceId)),
      new Set(["1", "account:1", "same-guid"]),
    );
    const state = { ...empty(), profiles: [profile(dir)] };
    const first = mergeImport(state, result.items);
    assert.equal(mergeImport(first, result.items).bookmarks.length, 3);
  }));
test("account backup is read when its primary file is corrupt", () =>
  fixture((dir) => {
    mkdirSync(path.join(dir, "Default"));
    writeFileSync(path.join(dir, "Default", "AccountBookmarks"), "{broken");
    writeFileSync(
      path.join(dir, "Default", "AccountBookmarks.bak"),
      JSON.stringify(treeFor([link("1", "https://account.example/")])),
    );
    const result = preview([profile(dir)]);
    assert.equal(result.items.length, 1);
    assert.equal(result.sources[0].status, "backup");
    assert.match(result.sources[0].message, /AccountBookmarks.bak/);
  }));
function fixture(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "profiledock-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("re-import preserves custom organisation and creates no duplicate entries or folders", () => {
  const s = empty();
  s.profiles = [profile()];
  let next = mergeImport(s, [item()]);
  next.bookmarks[0].name = "Custom title";
  next.bookmarks[0].tags = ["important"];
  next.bookmarks[0].notes = "Keep me";
  next.bookmarks[0].folderId = null;
  next.bookmarks[0].pinned = true;
  next.bookmarks[0].trashed = true;
  const updated = mergeImport(next, [
    { ...item(), url: "https://example.com/new", folderPath: ["Different"] },
  ]);
  assert.equal(updated.bookmarks.length, 1);
  assert.equal(updated.folders.length, 2);
  assert.equal(updated.bookmarks[0].url, "https://example.com/new");
  assert.equal(updated.bookmarks[0].name, "Custom title");
  assert.deepEqual(updated.bookmarks[0].tags, ["important"]);
  assert.equal(updated.bookmarks[0].folderId, null);
  assert.equal(updated.bookmarks[0].trashed, true);
});
test("same URL in two profiles remains independent", () => {
  const s = empty();
  s.profiles = [profile(), { ...profile(), id: "p2" }];
  const next = mergeImport(s, [item(), item("p2")]);
  assert.equal(next.bookmarks.length, 2);
  assert.notEqual(next.bookmarks[0].id, next.bookmarks[1].id);
  validate(next);
});
test("SQLite persistence, revision conflict protection and backup retention", () =>
  fixture((dir) => {
    let store = new Library(dir);
    const s = empty();
    s.profiles = [profile()];
    let saved = store.save(mergeImport(s, [item()]));
    assert.equal(saved.revision, 1);
    assert.throws(() => store.save(s), /another window/);
    for (let i = 0; i < 12; i++) saved = store.save(saved);
    assert.equal(readdirSync(path.join(dir, "backups")).length, 10);
    store.close();
    store = new Library(dir);
    assert.equal(store.read().bookmarks.length, 1);
    assert.equal(store.read().revision, 13);
    store.close();
  }));
test("invalid restore is rejected without modifying current data", () =>
  fixture((dir) => {
    const store = new Library(dir);
    assert.throws(
      () =>
        store.save({
          ...empty(),
          profiles: [profile()],
          bookmarks: [
            {
              id: "bad",
              name: "Bad",
              url: "javascript:alert(1)",
              profileId: "p1",
            },
          ],
        }),
      /HTTP/,
    );
    assert.equal(store.read().revision, 0);
    store.close();
  }));
test("folder cycles and missing profile mappings are rejected", () => {
  const s = empty();
  s.folders = [
    { id: "a", name: "A", parentId: "b" },
    { id: "b", name: "B", parentId: "a" },
  ];
  assert.throws(() => validate(s), /themselves/);
  const n = mergeImport({ ...empty(), profiles: [profile()] }, [item()]);
  n.profiles = [];
  assert.throws(() => validate(n), /profile/);
});
test("bookmark parsing preserves nested paths and ignores executable URLs", () => {
  const tree = {
    roots: {
      bookmark_bar: {
        name: "Bookmarks bar",
        children: [
          { type: "url", id: "1", name: "No", url: "javascript:alert(1)" },
          {
            type: "folder",
            name: "Work",
            children: [
              {
                type: "url",
                guid: "abc",
                name: "Yes",
                url: "https://example.com",
              },
            ],
          },
        ],
      },
    },
  };
  const entries = parseBookmarks(tree, "p1");
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].folderPath, ["Bookmarks bar", "Work"]);
  assert.equal(entries[0].sourceId, "abc");
});
test("custom-root profile detection and selective preview", () =>
  fixture((dir) => {
    mkdirSync(path.join(dir, "Default"));
    writeFileSync(
      path.join(dir, "Local State"),
      JSON.stringify({
        profile: { info_cache: { Default: { name: "Fixture Work" } } },
      }),
    );
    writeFileSync(
      path.join(dir, "Default", "Bookmarks"),
      JSON.stringify({
        roots: {
          bar: {
            name: "Bar",
            children: [
              {
                type: "url",
                id: "1",
                name: "Example",
                url: "https://example.com/",
              },
            ],
          },
        },
      }),
    );
    const result = detectProfiles(dir);
    assert.equal(result.profiles.length, 1);
    assert.equal(result.profiles[0].name, "Fixture Work");
    assert.equal(preview(result.profiles).items.length, 1);
    assert.equal(preview([]).items.length, 0);
    assert.equal(detectProfiles(dir).profiles[0].id, result.profiles[0].id);
    assert.equal(favicon(result.profiles[0], "https://example.com"), null);
  }));
test("missing profiles fail before any browser process is launched", () => {
  assert.throws(
    () =>
      launch(profile("C:/missing-profiledock-fixture"), "https://example.com"),
    /missing/,
  );
});
test("profile-directory traversal is rejected", () => {
  assert.throws(
    () =>
      validate({
        ...empty(),
        profiles: [{ ...profile(), directory: "../Personal" }],
      }),
    /location/,
  );
});
test("local Chrome favicon bytes are returned without a network request", () =>
  fixture((dir) => {
    mkdirSync(path.join(dir, "Default"));
    const db = new DatabaseSync(path.join(dir, "Default", "Favicons"));
    db.exec(
      "CREATE TABLE icon_mapping(page_url TEXT,icon_id INTEGER); CREATE TABLE favicon_bitmaps(icon_id INTEGER,width INTEGER,image_data BLOB);",
    );
    db.prepare("INSERT INTO icon_mapping VALUES (?,?)").run(
      "https://example.com/",
      1,
    );
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ1sAAAAASUVORK5CYII=",
      "base64",
    );
    db.prepare("INSERT INTO favicon_bitmaps VALUES (?,?,?)").run(1, 16, bytes);
    assert.equal(
      favicon(profile(dir), "https://example.com/"),
      "data:image/png;base64," + bytes.toString("base64"),
    );
    db.exec("PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; COMMIT;");
    try {
      assert.equal(
        favicon(profile(dir), "https://example.com/"),
        "data:image/png;base64," + bytes.toString("base64"),
      );
    } finally {
      db.close();
    }
  }));
test("missing bookmark files are reported as unavailable, distinct from a valid empty profile", () =>
  fixture((dir) => {
    mkdirSync(path.join(dir, "Default"));
    let result = preview([profile(dir)]);
    assert.equal(result.sources[0].status, "missing");
    assert.equal(result.items.length, 0);
    assert.match(
      result.sources[0].message,
      /No local or account bookmark file/,
    );
    assert.doesNotMatch(result.warnings[0], /ENOENT/);
    writeFileSync(
      path.join(dir, "Default", "Bookmarks"),
      JSON.stringify({ roots: { bar: { children: [] } } }),
    );
    result = preview([profile(dir)]);
    assert.equal(result.sources[0].status, "empty");
    assert.deepEqual(result.warnings, []);
  }));
test("backup-only profiles are detected and preview uses the backup with a clear status", () =>
  fixture((dir) => {
    mkdirSync(path.join(dir, "Default"));
    writeFileSync(
      path.join(dir, "Default", "Bookmarks.bak"),
      JSON.stringify({
        roots: {
          bar: {
            children: [
              {
                type: "url",
                id: "1",
                name: "Saved",
                url: "https://example.com/",
              },
            ],
          },
        },
      }),
    );
    const detected = detectProfiles(dir);
    assert.equal(detected.profiles.length, 1);
    const result = preview(detected.profiles);
    assert.equal(result.sources[0].status, "backup");
    assert.equal(result.items.length, 1);
    assert.match(result.warnings[0], /backup/);
  }));
test("a broken profile does not hide bookmarks from other selected profiles", () =>
  fixture((dir) => {
    mkdirSync(path.join(dir, "Default"));
    mkdirSync(path.join(dir, "Profile 1"));
    writeFileSync(path.join(dir, "Default", "Bookmarks"), "{broken json");
    writeFileSync(
      path.join(dir, "Profile 1", "Bookmarks"),
      JSON.stringify({
        roots: {
          bar: {
            children: [
              {
                type: "url",
                id: "1",
                name: "Saved",
                url: "https://example.com/",
              },
            ],
          },
        },
      }),
    );
    const result = preview([
      profile(dir),
      { ...profile(dir), id: "p2", directory: "Profile 1" },
    ]);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].profileId, "p2");
    assert.equal(result.sources[0].status, "error");
    assert.equal(result.sources[1].status, "ready");
  }));
