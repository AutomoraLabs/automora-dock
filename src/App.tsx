import React, { useState, useEffect, useRef, useMemo } from "react";
import brandLogo from './assets/automora-main.png';
import launcherLogo from './assets/automora-launcher.png';
import {bootstrap} from './bootstrap';
import { command, download, initial, mergeImport, uid } from "./model";
import type {
  Library,
  Profile,
  Bookmark,
  Folder,
  Workspace,
  ImportItem,
} from "./model";
import { Icon, host, SiteIcon, WorkspaceIcon } from "./ui";
import { ProfileAvatar, ProfilePicker } from "./profiles";
import PinBoard from "./PinBoard";
import FavoriteFolders from "./FavoriteFolders";
import LauncherSettings from "./LauncherSettings";
import WorkspaceRail from "./WorkspaceRail";
import PinFolderPopup from './PinFolderPopup';
import { pinGroupsFor, movePin, pinKinds, stackPin, removeFolderShortcut } from "./pins";
import { launcherMode, nativeMessage, openManager } from "./native";
import LauncherPinButton from './LauncherPinButton';
import {
  Modal,
  BookmarkForm,
  FolderForm,
  WorkspaceForm,
  ImportForm,
} from "./editors";
const sections = [
  ["home", "house", "Overview"],
  ["all", "bookmark", "All bookmarks"],
  ["pinned", "thumbtack", "Pinned"],
  ["profiles", "user-group", "Chrome profiles"],
  ["workspaces", "layer-group", "Workspaces"],
  ["pcfolders", "folder-open", "PC folders"],
  ["trash", "trash-can", "Trash"],
] as const;
type Dialog =
  | { kind: "bookmark"; item?: Bookmark }
  | { kind: "folder"; item?: Folder }
  | { kind: "workspace"; item?: Workspace; pinOnCreate?: boolean }
  | { kind: "import" }
  | {
      kind: "confirm";
      title: string;
      text: string;
      action: () => Promise<void>;
    }
  | null;
export default function App() {
  const [db, setDb] = useState<Library>(bootstrap?.library||initial),
    [loaded, setLoaded] = useState(!!bootstrap),
    [startupError,setStartupError]=useState<string|null>(null),
    [startupAttempt,setStartupAttempt]=useState(0),
    [view, setView] = useState("pinned"),
    [query, setQuery] = useState(""),
    [profileFilter, setProfileFilter] = useState(""),
    [layout, setLayout] = useState(
      launcherMode ? "grid" : localStorage.getItem("pd-layout-v2") === "list" ? "list" : "grid",
    ),
    [theme, setTheme] = useState(localStorage.getItem("pd-theme") || "system"),
    [dialog, setDialog] = useState<Dialog>(null),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(
      null,
    ),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [detail, setDetail] = useState<string | null>(null),
    [sort, setSort] = useState("manual"),
    [customRoot, setCustomRoot] = useState(""),
    [customExe, setCustomExe] = useState(""),
    [location, setLocation] = useState("");
  const [pageLimit, setPageLimit] = useState(60),
    [systemDark, setSystemDark] = useState(
      matchMedia("(prefers-color-scheme: dark)").matches,
    );
  const [selectMode, setSelectMode] = useState(false),
    [renamingWorkspace,setRenamingWorkspace]=useState<Workspace|null>(null),
    [pinFolder,setPinFolder]=useState<string|null>(null),
    [workspaceRail,setWorkspaceRail]=useState(localStorage.getItem('pd-workspace-rail')==='true'),
    [forceMaximized, setForceMaximized] = useState(localStorage.getItem("pd-force-maximized") === "true"),
    [editingGroup, setEditingGroup] = useState<string | null>(null),
    [context, setContext] = useState<{
      key: string;
      x: number;
      y: number;
    } | null>(null);
  function cancelSelection(){setSelectMode(false);setSelected(new Set());}
  const selectionState=useRef({active:selectMode,count:selected.size});
  selectionState.current={active:selectMode,count:selected.size};
  useEffect(()=>{const close=()=>{setRenamingWorkspace(null);setPinFolder(null);setContext(null);setSelectMode(false);setSelected(new Set());};window.addEventListener('profiledock:close-popups',close);window.addEventListener('profiledock:refresh',close);return()=>{window.removeEventListener('profiledock:close-popups',close);window.removeEventListener('profiledock:refresh',close);};},[]);
  useEffect(() => {
    if (!context) return;
    document
      .querySelector<HTMLElement>('.shortcut-menu [role="menuitem"]')
      ?.focus();
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest(".shortcut-menu")) setContext(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [context]);
  const dark = theme === "dark" || (theme === "system" && systemDark);
  useEffect(()=>{const sync=(event:StorageEvent)=>{if(event.key==='pd-theme'&&['light','dark','system'].includes(event.newValue||''))setTheme(event.newValue!);if(event.key==='pd-workspace-rail')setWorkspaceRail(event.newValue==='true');if(event.key==='pd-force-maximized')setForceMaximized(event.newValue==='true');};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
  const search = useRef<HTMLInputElement>(null),
    restore = useRef<HTMLInputElement>(null),
    lock = useRef(false);
  const revision = useRef(db.revision);
  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    document.fonts.ready.then(() => {
      if (alive)
        nativeMessage(
          document.documentElement.dataset.theme === "light"
            ? "ready:light"
            : "ready:dark",
        );
    });
    return () => {
      alive = false;
    };
  }, [loaded]);
  useEffect(() => {
    revision.current = db.revision;
  }, [db.revision]);
  useEffect(() => {
    const refresh = () => {
      if (lock.current) return;
      command<Library>("snapshot")
        .then((next) => {
          if (!lock.current && next.revision > revision.current) {
            revision.current = next.revision;
            setDb(next);
          }
        })
        .catch(() => {});
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("profiledock:refresh", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("profiledock:refresh", refresh);
    };
  }, []);
  const notify = (text: string, error = false) => setNotice({ text, error });
  useEffect(() => {
    let active=true;setStartupError(null);
    command<Library>("snapshot")
      .then((s) => {
        if(!active)return;
        if(bootstrap&&(lock.current||s.revision<revision.current))return;
        revision.current=s.revision;
        setDb(s);
        setLoaded(true);
      })
      .catch((e) => {if(active)setStartupError(e.message);});
    if(!launcherMode)command<string>("data_location")
      .then(value=>{if(active)setLocation(value);})
      .catch(() => {});
    return()=>{active=false;};
  }, [startupAttempt]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      setSystemDark(media.matches);
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    localStorage.setItem("pd-theme", theme);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    if (!launcherMode) localStorage.setItem("pd-layout-v2", layout);
  }, [layout]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        search.current?.focus();
      }
      if (e.key === "Escape") {
        setRenamingWorkspace(null);
        if(selectionState.current.active || selectionState.current.count){e.preventDefault();cancelSelection();setContext(null);return;}
        if (
          launcherMode &&
          !document.querySelector(
            '[role="dialog"],[role="menu"],[role="listbox"]',
          )
        )
          nativeMessage("dismiss");
        setSelectMode(false);
        setContext(null);
        setDetail(null);
        setDialog(null);
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    setSelected(new Set());
    setDetail(null);
    setSelectMode(false);
    setContext(null);
  }, [view]);
  useEffect(() => {
    setPageLimit(60);
  }, [view, query, profileFilter, sort]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => setNotice(null),
      notice.error ? 12000 : 5500,
    );
    return () => clearTimeout(timer);
  }, [notice]);
  async function task(label: string, fn: () => Promise<void>) {
    if(!loaded){notify('Your library is not loaded yet. Retry loading before making changes.',true);return;}
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      if(e instanceof Error&&e.message.includes('Library changed in another window')){
        try{const next=await command<Library>('snapshot');revision.current=next.revision;setDb(next);}catch{}
      }
      notify(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy("");
      lock.current = false;
    }
  }
  async function save(next: Library, message?: string) {
    const available=new Set(next.bookmarks.filter(bookmark=>bookmark.pinned&&!bookmark.trashed).map(bookmark=>bookmark.id));
    for(const folder of next.folders)if(folder.shortcutIds)folder.shortcutIds=folder.shortcutIds.filter(id=>available.has(id));
    next.pinGroups = pinGroupsFor(next);
    const result = await command<Library>("save_state", { state: next });
    revision.current=result.revision;
    setDb(result);
    if (message) notify(message);
  }
  function mutate(fn: (next: Library) => void, message: string) {
    return task("Saving…", async () => {
      const next = structuredClone(db);
      fn(next);
      await save(next, message);
    });
  }
  const active = db.bookmarks.filter((b) => !b.trashed),
    pinned = active.filter((b) => b.pinned);
  const pinCount = pinGroupsFor(db).reduce(
    (total, group) => total + group.itemKeys.length,
    0,
  );
  const currentFolder = db.folders.find((f) => view === "folder:" + f.id);
  const currentWorkspace = db.workspaces.find(
    (w) => view === "workspace:" + w.id,
  );
  const title = query
    ? "Search results"
    : currentFolder?.name ||
      currentWorkspace?.name ||
      sections.find((s) => s[0] === view)?.[2] ||
      (view === "settings" ? "Settings" : "Bookmarks");
  const filtered = useMemo(() => {
    let items = db.bookmarks.filter((b) =>
      view === "trash" ? b.trashed : !b.trashed,
    );
    if (view === "pinned") items = items.filter((b) => b.pinned);
    if (view.startsWith("folder:"))
      items = items.filter((b) => currentFolder?.shortcutIds ? currentFolder.shortcutIds.includes(b.id) : b.folderId === view.slice(7));
    if (currentWorkspace)
      items = items.filter((b) => currentWorkspace.bookmarkIds.includes(b.id));
    if (profileFilter)
      items = items.filter((b) => b.profileId === profileFilter);
    if (query) {
      const q = query.toLowerCase();
      items = items.filter((b) =>
        [
          b.name,
          b.url,
          b.notes,
          ...b.tags,
          db.profiles.find((p) => p.id === b.profileId)?.name || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    if (sort === "manual") return items;
    return [...items].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "recent"
          ? (b.opened || 0) - (a.opened || 0)
          : b.created - a.created,
    );
  }, [db, view, profileFilter, query, sort, currentWorkspace,currentFolder]);
  async function openBookmark(b: Bookmark) {
    await task("Opening in Chrome…", async () => {
      await command("launch", { profileId: b.profileId, url: b.url });
      let historyError='';
      try{
        for(let attempt=0;attempt<2;attempt++){
          const next=await command<Library>('snapshot');
          const bookmark=next.bookmarks.find(item=>item.id===b.id);
          if(!bookmark){revision.current=next.revision;setDb(next);break;}
          bookmark.opened=Date.now();
          try{await save(next);break;}catch(error){if(attempt===0 && String(error).includes('Library changed'))continue;throw error;}
        }
      }catch(error){historyError=' · History not saved: '+String(error);}
      notify(
        "Open requested in " +
          (db.profiles.find((p) => p.id === b.profileId)?.name || "Chrome")+historyError,
        !!historyError,
      );
      if (launcherMode) nativeMessage("dismiss");
    });
  }
  async function openWorkspace(w: Workspace) {
    const items = active.filter((b) => w.bookmarkIds.includes(b.id));
    if (!items.length) {
      notify("This workspace has no available bookmarks.", true);
      return;
    }
    const action = () =>
      task("Opening workspace…", async () => {
        let count = 0;
        const errors = [];
        for (const b of items) {
          try {
            await command("launch", { profileId: b.profileId, url: b.url });
            count++;
          } catch (e) {
            errors.push(b.name + ": " + String(e));
          }
        }
        notify(
          errors.length
            ? `${count} launch requests sent. ${errors.join("; ")}`
            : `${count} launch requests sent to assigned profiles.`,
          errors.length > 0,
        );
        setDialog(null);
      });
    if (items.length > 5)
      setDialog({
        kind: "confirm",
        title: `Open ${items.length} bookmarks?`,
        text: "Each link will open in its assigned Chrome profile. This may create multiple browser windows.",
        action,
      });
    else await action();
  }
  async function detect() {
    await task("Detecting Chrome profiles…", async () => {
      const result = await command<{ profiles: Profile[]; warnings: string[] }>(
        "detect_profiles",
        { root: customRoot || null, executable: customExe || null },
      );
      const next = structuredClone(db);
      for (const p of result.profiles) {
        const old = next.profiles.find((x) => x.id === p.id);
        if (old) {
          old.root = p.root;
          old.directory = p.directory;
          if (p.executable) old.executable = p.executable;
        } else next.profiles.push(p);
      }
      if (result.profiles.length) await save(next);
      notify(
        result.profiles.length
          ? `${result.profiles.length} profiles detected. ${result.warnings.join(" ")}`
          : "No Chrome profiles found. Check the user-data folder path.",
        !result.profiles.length,
      );
    });
  }
  const pin = (
    type: "bookmarks" | "folders" | "profiles" | "workspaces",
    id: string,
  ) =>
    mutate((n) => {
      const x = n[type].find((x) => x.id === id);
      if (x) x.pinned = !x.pinned;
    }, "Pin updated");
  const trashSelected = () =>
    mutate(
      (n) => {
        for (const b of n.bookmarks)
          if (selected.has(b.id)) b.trashed = view !== "trash";
        setSelected(new Set());
      },
      view === "trash" ? "Bookmarks restored" : "Moved to trash",
    );
  const childFolders = db.folders.filter(
    (f) => f.parentId === (currentFolder?.id || null),
  );
  const detailItem = db.bookmarks.find((b) => b.id === detail);
  const card = (b: Bookmark) => {
    const p = db.profiles.find((p) => p.id === b.profileId);
    return (
      <article
        key={b.id}
        className={"bookmark-card " + (selected.has(b.id) ? "selected" : "")}
        onContextMenu={(e) => {
          e.preventDefault();
          setContext({ key: "bookmarks:" + b.id, x: e.clientX, y: e.clientY });
        }}
      >
        <button
          className="bookmark-main"
          title={`${b.name}\n${b.url}\nOpens in: ${p?.name || "Missing profile"}`}
          disabled={!!busy || (b.trashed && !selectMode)}
          aria-pressed={selectMode ? selected.has(b.id) : undefined}
          onClick={(e) => {
            if (selectMode || e.ctrlKey || e.metaKey) {
              setSelected((old) => {
                const n = new Set(old);
                n.has(b.id) ? n.delete(b.id) : n.add(b.id);
                return n;
              });
            } else openBookmark(b);
          }}
        >
          <SiteIcon bookmark={b} profile={p} />
          <strong>{b.name}</strong>
          <span>
            {host(b.url)}
            <Icon name="arrow-up-right-from-square" />
          </span>
        </button>
        <div className="card-tags">
          {b.tags.slice(0, 2).map((t) => (
            <button key={t} onClick={() => setQuery(t)}>
              #{t}
            </button>
          ))}
        </div>
        <div className="card-bottom">
          <span
            className="profile-badge"
            style={{ "--profile": p?.color || "#888" } as React.CSSProperties}
          >
            <span />
            {p?.name || "Missing profile"}
          </span>
          <button
            className="icon-button"
            title="Bookmark details"
            aria-label={"Details for " + b.name}
            onClick={() => setDetail(b.id)}
          >
            <Icon name="ellipsis" />
          </button>
        </div>
      </article>
    );
  };
  const getPin = (key: string) => {
    const at = key.indexOf(":");
    const kind = key.slice(0, at) as (typeof pinKinds)[number];
    return pinKinds.includes(kind)
      ? db[kind].find((item) => item.id === key.slice(at + 1))
      : undefined;
  };
  const filteredIds = new Set(filtered.map((b) => b.id));
  const pinVisible = (key: string) => {
    if(launcherMode&&workspaceRail&&key.startsWith('workspaces:'))return false;
    const item = getPin(key);
    if (!item) return false;
    if (key.startsWith("bookmarks:")) return filteredIds.has(item.id);
    if(key.startsWith('folders:')&&(item as Folder).shortcutIds){
      const ids=(item as Folder).shortcutIds!;
      return (!query&&!profileFilter)||ids.some(id=>filteredIds.has(id))||(!profileFilter&&item.name.toLowerCase().includes(query.toLowerCase()));
    }
    return (
      (!profileFilter ||
        (key.startsWith("profiles:") && item.id === profileFilter)) &&
      (!query || item.name.toLowerCase().includes(query.toLowerCase()))
    );
  };
  const arrangedGroups=pinGroupsFor(db);
  const railWorkspaces=arrangedGroups.flatMap(group=>group.itemKeys).filter(key=>key.startsWith('workspaces:')).map(key=>db.workspaces.find(w=>w.id===key.slice(11))).filter((w):w is Workspace=>!!w);
  const boardGroups = arrangedGroups.filter(group=>!(launcherMode&&workspaceRail&&group.itemKeys.length>0&&group.itemKeys.every(key=>key.startsWith('workspaces:')))).map((group) => ({
    ...group,
    itemKeys:
      sort === "manual"
        ? group.itemKeys
        : [...group.itemKeys].sort((a, b) =>
            sort === "name"
              ? (getPin(a)?.name || "").localeCompare(getPin(b)?.name || "")
              : sort === "recent"
                ? ((getPin(b) as Bookmark)?.opened || 0) -
                  ((getPin(a) as Bookmark)?.opened || 0)
                : ((getPin(b) as Bookmark)?.created || 0) -
                  ((getPin(a) as Bookmark)?.created || 0),
          ),
  }));
  const renderPin = (key: string) => {
    const item = getPin(key);
    if (!item) return null;
    if (key.startsWith("bookmarks:")) return card(item as Bookmark);
    return (
      <button
        className="folder-tile board-shortcut"
        title={item.name}
        disabled={!!busy}
        onContextMenu={(e) => {
          e.preventDefault();
          setContext({ key, x: e.clientX, y: e.clientY });
        }}
        onClick={() => {
          if (key.startsWith("folders:")) {if((item as Folder).shortcutIds)setPinFolder(item.id);else setView("folder:" + item.id);}
          else if (key.startsWith("workspaces:"))
            openWorkspace(item as Workspace);
          else
            task("Opening profile…", async () => {
              await command("launch", { profileId: item.id });
              notify("Profile launch requested");
              if (launcherMode) nativeMessage("dismiss");
            });
        }}
      >
        {key.startsWith("profiles:") ? (
          <ProfileAvatar profile={item as Profile} size={40} />
        ) : (
          key.startsWith("workspaces:") ? <WorkspaceIcon workspace={item as Workspace} bookmarks={db.bookmarks}/> : (item as Folder).shortcutIds ? <div className="pin-folder-symbol"><WorkspaceIcon badge={false} workspace={{id:item.id,name:item.name,pinned:true,bookmarkIds:(item as Folder).shortcutIds!}} bookmarks={db.bookmarks}/></div> : <Icon name="folder" />
        )}
        <span className="shortcut-label">{item.name}</span>
      </button>
    );
  };
  const contextItem = context ? getPin(context.key) : undefined;
  return (
    <div
      className={
        "app-shell " +
        (launcherMode ? "popup-mode " : "") +
        (["pinned", "all", "trash"].includes(view) ||
        currentFolder ||
        currentWorkspace
          ? "launcher-view"
          : "")
      }
    >
      <aside className="sidebar">
        <a
          aria-label="Automora Dock overview"
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("home");
          }}
        >
          <span className="brand-icon">
            <img src={brandLogo} alt="" draggable={false}/>
          </span>
          <span>
            Automora Dock<small>YOUR LINKS. RIGHT PROFILE.</small>
          </span>
        </a>
        <div className="library-label">LIBRARY</div>
        <nav>
          {sections.map(([id, icon, name]) => (
            <button
              key={id}
              aria-label={name}
              title={name}
              className={"nav-item " + (view === id ? "active" : "")}
              onClick={() => {
                setView(id);
                setQuery("");
              }}
            >
              <Icon name={icon} />
              <span>{name}</span>
              {id === "all" && <small>{active.length}</small>}
              {id === "pinned" && pinCount > 0 && <small>{pinCount}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="folder-heading">
          <span>FOLDERS</span>
          <button
            className="icon-button"
            title="New folder"
            aria-label="New folder"
            onClick={() => setDialog({ kind: "folder" })}
          >
            <Icon name="plus" />
          </button>
        </div>
        <div className="folder-nav">
          {db.folders.length === 0 ? (
            <p className="sidebar-hint">
              A little order for your links.
              <br />
              Create your first folder.
            </p>
          ) : (
            db.folders.filter(folder=>!folder.parentId).map((f) => (
              <button
                key={f.id}
                aria-label={'Folder '+f.name}
                title={f.name}
                className={
                  "nav-item " + (view === "folder:" + f.id ? "active" : "")
                }
                onClick={() => {
                  setView("folder:" + f.id);
                  setQuery("");
                }}
              >
                <Icon name={f.parentId ? "folder-open" : "folder"} />
                <span>{f.name}</span>
                {f.pinned && <Icon name="thumbtack" />}
              </button>
            ))
          )}
        </div>
        <div className="sidebar-footer">
          <div className="local-status">
            <span />
            Stored on this device
          </div>
          <button
            className={"nav-item " + (view === "settings" ? "active" : "")}
            aria-label="Settings & backup"
            title="Settings & backup"
            onClick={() => setView("settings")}
          >
            <Icon name="gear" />
            <span>Settings & backup</span>
          </button>
          <div className="version">
            <span>Automora Dock</span>
            <span>v0.4.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        {launcherMode && (
          <div className="popup-titlebar">
            <div className="popup-brand">
              <span>
                <img src={launcherLogo} alt="" draggable={false}/>
              </span>
              <strong>AUTOMORA DOCK</strong>
              <LauncherSettings loaded={loaded} theme={theme} onThemeChange={setTheme} forceMaximized={forceMaximized} onForceMaximizedChange={enabled=>{localStorage.setItem('pd-force-maximized',String(enabled));setForceMaximized(enabled);}} workspaceRail={workspaceRail} onWorkspaceRailChange={enabled=>{localStorage.setItem('pd-workspace-rail',String(enabled));setWorkspaceRail(enabled);}} />
            </div>
            <div>
              <button
                className="icon-button open-manager-button"
                title="Open full Automora Dock"
                aria-label="Open full Automora Dock"
                onClick={openManager}
              >
                <Icon name="up-right-and-down-left-from-center" />
              </button>
            </div>
          </div>
        )}
        <header className="topbar">
          <div className="global-search">
            <Icon name="magnifying-glass" />
            <input
              ref={search}
              aria-label="Search bookmarks"
              placeholder={
                launcherMode
                  ? "Search"
                  : "Search your bookmarks, tags, profiles…"
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (
                  !["all", "pinned", "trash"].includes(view) &&
                  !view.startsWith("folder:") &&
                  !view.startsWith("workspace:")
                )
                  setView("all");
              }}
            />
            <kbd>Ctrl K</kbd>
          </div>
          {launcherMode && (
            <ProfilePicker
              profiles={db.profiles}
              value={profileFilter}
              onChange={setProfileFilter}
            />
          )}
          <div className="topbar-actions">
            {!launcherMode && <LauncherPinButton enabled={loaded} disabled={!!busy} notify={notify}/>}
            {launcherMode && <span id="favorite-folder-toolbar" />}
            <div className="heading-actions">
              {view !== "settings" && (
                <>
                  <button
                    className="button secondary"
                    disabled={!!busy}
                    onClick={() =>
                      db.profiles.length
                        ? setDialog({ kind: "import" })
                        : setView("profiles")
                    }
                  >
                    <Icon name="download" />
                    Import bookmarks
                  </button>
                  <button
                    className="button primary"
                    disabled={!!busy}
                    onClick={() =>
                      setDialog(
                        view === "workspaces"
                          ? { kind: "workspace" }
                          : { kind: "bookmark" },
                      )
                    }
                  >
                    <Icon name="plus" />
                    {view === "workspaces" ? "New workspace" : "Add bookmark"}
                  </button>
                </>
              )}
            </div>
            {!launcherMode && <button
              className="icon-button"
              title="Switch theme"
              aria-label="Switch theme"
              onClick={() =>
                setTheme(
                  document.documentElement.dataset.theme === "dark"
                    ? "light"
                    : "dark",
                )
              }
            >
              <Icon name={dark ? "sun" : "moon"} />
            </button>}
            <span className="topbar-separator" />
            <span className="device-badge">
              <Icon name="desktop" />
              Local library
            </span>
          </div>
        </header>
        {launcherMode&&selectMode&&<div className="launcher-selection-bar" role="status"><span><Icon name="list-check"/> Selection mode · {selected.size} selected</span><button className="text-button" aria-label="Exit selection mode" onClick={cancelSelection}>Done <kbd>Esc</kbd></button></div>}
        {!loaded&&startupError&&<div className="library-load-error" role="alert"><div><strong>Your library could not load</strong><p>{startupError}</p></div><button className="button secondary" onClick={()=>setStartupAttempt(value=>value+1)}>Retry loading</button></div>}
        <div className={launcherMode?'launcher-content':'full-content'}>
        <main>
          {launcherMode && view !== "pinned" && (
            <button
              className="text-button popup-back"
              onClick={() => {
                setView("pinned");
                setQuery("");
              }}
            >
              <Icon name="arrow-left" />
              Pinned library
            </button>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR PERSONAL LINK LIBRARY</div>
              <h1>{title}</h1>
              <p>
                {view==='pcfolders' ? 'Manage your PC folder shortcuts. The Dock shows the same saved list.' : view === "home"
                  ? "Everything you saved. Exactly where it belongs."
                  : view === "profiles"
                    ? "Connect your Chrome profiles. Keep every account in its own lane."
                    : view === "settings"
                      ? "Make yourself at home. Keep your library protected."
                      : view === "workspaces"
                        ? "Your everyday tools, ready together."
                        : view === "trash"
                          ? "Deleted bookmarks stay here until you remove them permanently."
                          : `${filtered.length} bookmarks · opens in the profile you choose`}
              </p>
            </div>
          </div>
          {!loaded ? (
            <div className="empty-state">
              <Icon name="circle-notch" />
              <h2>Opening your library</h2>
              <p>
                {notice?.error
                  ? "The library could not be opened. Restart the launcher and try again."
                  : "Getting everything ready…"}
              </p>
            </div>
          ) : (
            <>
              {view==='pcfolders'&&<FavoriteFolders manager/>}
              {view === "home" && (
                <>
                  <div className="stats-grid">
                    {[
                      [
                        "bookmark",
                        "Bookmarks",
                        active.length,
                        "Across your library",
                      ],
                      [
                        "user-group",
                        "Chrome profiles",
                        db.profiles.length,
                        "One home for every account",
                      ],
                      [
                        "thumbtack",
                        "Pinned items",
                        pinned.length +
                          db.folders.filter((f) => f.pinned).length +
                          db.profiles.filter((p) => p.pinned).length +
                          db.workspaces.filter((w) => w.pinned).length,
                        "Always within reach",
                      ],
                    ].map(([i, l, n, s]) => (
                      <div className="stat-card" key={l}>
                        <span className="stat-icon">
                          <Icon name={String(i)} />
                        </span>
                        <div>
                          <span>{l}</span>
                          <strong>{n}</strong>
                          <small>{s}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                  {db.profiles.length === 0 && (
                    <div className="welcome-banner">
                      <div className="welcome-art">
                        <Icon name="compass" />
                      </div>
                      <div>
                        <span className="eyebrow">
                          A PLACE FOR EVERY PROFILE
                        </span>
                        <h2>Bring your bookmarks home.</h2>
                        <p>
                          Connect Chrome, choose what to import, and open every
                          link
                          <br />
                          in the account it belongs to.
                        </p>
                        <button
                          className="button primary"
                          onClick={() => {
                            setView("profiles");
                            detect();
                          }}
                          disabled={!!busy}
                        >
                          <Icon name="link" />
                          Connect Chrome profiles
                          <Icon name="arrow-right" />
                        </button>
                      </div>
                      <div className="banner-mark">
                        <Icon name="bookmark" />
                      </div>
                    </div>
                  )}
                  <div className="section-title">
                    <h2>
                      <Icon name="thumbtack" />
                      Pinned for quick access
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => setView("pinned")}
                    >
                      View all
                      <Icon name="arrow-right" />
                    </button>
                  </div>
                  {pinned.length ||
                  db.folders.some((f) => f.pinned) ||
                  db.profiles.some((p) => p.pinned) ||
                  db.workspaces.some((w) => w.pinned) ? (
                    <>
                      <div className="quick-items">
                        {db.folders
                          .filter((f) => f.pinned)
                          .map((f) => (
                            <button
                              key={f.id}
                              className="folder-tile"
                              onClick={() => setView("folder:" + f.id)}
                            >
                              <Icon name="folder" />
                              {f.name}
                            </button>
                          ))}
                        {db.profiles
                          .filter((p) => p.pinned)
                          .map((p) => (
                            <button
                              key={p.id}
                              className="folder-tile"
                              onClick={() =>
                                task("Opening profile…", async () => {
                                  await command("launch", { profileId: p.id });
                                  notify("Profile launch requested");
                                  if (launcherMode) nativeMessage("dismiss");
                                })
                              }
                            >
                              <Icon name="user" />
                              {p.name}
                            </button>
                          ))}
                        {db.workspaces
                          .filter((w) => w.pinned)
                          .map((w) => (
                            <button
                              key={w.id}
                              className="folder-tile"
                              onClick={() => openWorkspace(w)}
                            >
                              <WorkspaceIcon workspace={w} bookmarks={db.bookmarks}/>
                              {w.name}
                            </button>
                          ))}
                      </div>
                      <div className="bookmark-grid">
                        {pinned.slice(0, 6).map(card)}
                      </div>
                    </>
                  ) : (
                    <div className="empty-inline">
                      <span className="empty-symbol">
                        <Icon name="thumbtack" />
                      </span>
                      <div>
                        <strong>Your favourites, one click away</strong>
                        <p>
                          Pin a bookmark, folder, profile or workspace to find
                          it here.
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="section-title">
                    <h2>
                      <Icon name="clock-rotate-left" />
                      Recently added
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => setView("all")}
                    >
                      Browse library
                      <Icon name="arrow-right" />
                    </button>
                  </div>
                  {active.length ? (
                    <div className="bookmark-grid">
                      {[...active]
                        .sort((a, b) => b.created - a.created)
                        .slice(0, 6)
                        .map(card)}
                    </div>
                  ) : (
                    <div className="empty-inline">
                      <span className="empty-symbol">
                        <Icon name="bookmark" />
                      </span>
                      <div>
                        <strong>A fresh start for your bookmarks</strong>
                        <p>Import from Chrome or add your first link.</p>
                      </div>
                    </div>
                  )}
                </>
              )}
              {view === "profiles" && (
                <>
                  <div className="profile-tools">
                    <div>
                      <h3>
                        <Icon name="wand-magic-sparkles" />
                        Find your Chrome profiles
                      </h3>
                      <p>
                        Detection reads local profile metadata. You choose which
                        bookmarks to import.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      onClick={detect}
                      disabled={!!busy}
                    >
                      <Icon name="rotate" />
                      Detect profiles
                    </button>
                  </div>
                  <details className="advanced">
                    <summary>Custom Chrome location</summary>
                    <div className="two-columns">
                      <label>
                        User-data directory
                        <input
                          value={customRoot}
                          onChange={(e) => setCustomRoot(e.target.value)}
                          placeholder="C:\…\Chrome\User Data"
                        />
                      </label>
                      <label>
                        Chrome executable (optional)
                        <input
                          value={customExe}
                          onChange={(e) => setCustomExe(e.target.value)}
                          placeholder="C:\…\chrome.exe"
                        />
                      </label>
                    </div>
                    <p className="muted">
                      Use the parent user-data directory, not the individual
                      “Profile 1” directory.
                    </p>
                  </details>
                  <div className="profiles-grid">
                    {db.profiles.map((p) => (
                      <div className="profile-card" key={p.id}>
                        <div className="profile-header">
                          <ProfileAvatar profile={p} size={48} />
                          <button
                            className={
                              "icon-button " + (p.pinned ? "is-pinned" : "")
                            }
                            title="Pin profile"
                            aria-label={"Pin " + p.name}
                            onClick={() => pin("profiles", p.id)}
                          >
                            <Icon name="thumbtack" />
                          </button>
                        </div>
                        <input
                          className="profile-name"
                          aria-label={"Profile nickname " + p.name}
                          defaultValue={p.name}
                          key={p.id + p.name}
                          onBlur={(e) => {
                            if (
                              e.target.value.trim() &&
                              e.target.value !== p.name
                            )
                              mutate((n) => {
                                n.profiles.find((x) => x.id === p.id)!.name =
                                  e.target.value.trim();
                              }, "Profile renamed");
                          }}
                        />
                        <span className="profile-directory">{p.directory}</span>
                        <p>
                          {active.filter((b) => b.profileId === p.id).length}{" "}
                          saved bookmarks
                        </p>
                        <div className="profile-path" title={p.root}>
                          {p.root}
                        </div>
                        <div className="profile-actions">
                          <button
                            className="button secondary"
                            disabled={!!busy}
                            onClick={() =>
                              task("Opening profile…", async () => {
                                await command("launch", { profileId: p.id });
                                notify("Profile launch requested");
                                if (launcherMode) nativeMessage("dismiss");
                              })
                            }
                          >
                            <Icon name="arrow-up-right-from-square" />
                            Open
                          </button>
                          <button
                            className="button primary"
                            onClick={() => {
                              setProfileFilter(p.id);
                              setDialog({ kind: "import" });
                            }}
                          >
                            <Icon name="download" />
                            Import
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {!db.profiles.length && (
                    <div className="empty-state">
                      <Icon name="user-group" />
                      <h2>Your profiles will appear here</h2>
                      <p>Detect Chrome profiles to get started.</p>
                    </div>
                  )}
                </>
              )}
              {(view === "all" ||
                view === "pinned" ||
                view === "trash" ||
                currentFolder ||
                currentWorkspace) && (
                <>
                  {currentFolder && (
                    <div className="folder-toolbar">
                      <span>
                        <Icon name="folder-open" />
                        Folder
                      </span>
                      <button
                        className="text-button"
                        onClick={() =>
                          setDialog({ kind: "folder", item: currentFolder })
                        }
                      >
                        Edit folder
                      </button>
                      <button
                        className="text-button"
                        onClick={() => pin("folders", currentFolder.id)}
                      >
                        {currentFolder.pinned ? "Unpin" : "Pin folder"}
                      </button>
                      <button
                        className="text-button danger"
                        onClick={() =>
                          setDialog({
                            kind: "confirm",
                            title: "Delete this folder?",
                            text: "Bookmarks will move to the parent folder. Nested folders will move up one level.",
                            action: () =>
                              mutate((n) => {
                                for (const b of n.bookmarks)
                                  if (b.folderId === currentFolder.id)
                                    b.folderId = currentFolder.parentId;
                                for (const f of n.folders)
                                  if (f.parentId === currentFolder.id)
                                    f.parentId = currentFolder.parentId;
                                n.folders = n.folders.filter(
                                  (f) => f.id !== currentFolder.id,
                                );
                                setDialog(null);
                                setView("all");
                              }, "Folder deleted"),
                          })
                        }
                      >
                        Delete folder
                      </button>
                    </div>
                  )}
                  {currentWorkspace && (
                    <div className="folder-toolbar">
                      <button
                        className="button primary"
                        onClick={() => openWorkspace(currentWorkspace)}
                      >
                        <Icon name="play" />
                        Open workspace
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          setDialog({
                            kind: "workspace",
                            item: currentWorkspace,
                          })
                        }
                      >
                        Edit workspace
                      </button>
                      <button
                        className="text-button"
                        onClick={() => pin("workspaces", currentWorkspace.id)}
                      >
                        {currentWorkspace.pinned ? "Unpin" : "Pin workspace"}
                      </button>
                    </div>
                  )}
                  {(view === "all" || currentFolder) &&
                    childFolders.length > 0 && (
                      <div className="quick-items">
                        {childFolders.map((f) => (
                          <button
                            className="folder-tile"
                            key={f.id}
                            onClick={() => setView("folder:" + f.id)}
                          >
                            <Icon name="folder" />
                            {f.name}
                            <span>
                              {active.filter((b) => b.folderId === f.id).length}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  <div className="collection-toolbar">
                    <div className="filters">
                      {!launcherMode && (
                        <ProfilePicker
                          profiles={db.profiles}
                          value={profileFilter}
                          onChange={setProfileFilter}
                        />
                      )}
                      <select
                        aria-label="Sort bookmarks"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="manual">Arranged order</option>
                        <option value="newest">Newest first</option>
                        <option value="name">Name A–Z</option>
                        <option value="recent">Recently opened</option>
                      </select>
                    </div>
                    <div className="collection-actions">
                      {view === "pinned" && (
                        <button
                          className="button secondary compact-button"
                          disabled={!!busy}
                          onClick={() => {
                            const id = uid();
                            mutate((n) => {
                              n.pinGroups = [
                                ...pinGroupsFor(n),
                                { id, name: "New group", itemKeys: [] },
                              ];
                            }, "Group created");
                            setEditingGroup(id);
                          }}
                        >
                          <Icon name="plus" />
                          Add group
                        </button>
                      )}
                      <button
                        className={
                          "button secondary compact-button " +
                          (selectMode ? "selection-active" : "")
                        }
                        aria-pressed={selectMode}
                        onClick={() => {
                          setSelectMode((v) => !v);
                          setSelected(new Set());
                        }}
                      >
                        <Icon name="list-check" />
                        {selectMode ? "Done" : "Select"}
                      </button>
                      <div className="view-toggle">
                        <button
                          aria-label="Icon view"
                          className={layout === "grid" ? "active" : ""}
                          onClick={() => setLayout("grid")}
                        >
                          <Icon name="table-cells-large" />
                        </button>
                        <button
                          aria-label="List view"
                          className={layout === "list" ? "active" : ""}
                          onClick={() => setLayout("list")}
                        >
                          <Icon name="list" />
                        </button>
                      </div>
                    </div>
                  </div>
                  {selected.size > 0 && (
                    <div className="selection-toolbar">
                      <span>{selected.size} selected</span>
                      <button
                        className="text-button"
                        onClick={() =>
                          mutate((n) => {
                            for (const b of n.bookmarks)
                              if (selected.has(b.id)) b.pinned = true;
                          }, "Selection pinned")
                        }
                      >
                        Pin selected
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          mutate((n) => {
                            for (const b of n.bookmarks)
                              if (selected.has(b.id)) b.pinned = false;
                            setSelected(new Set());
                          }, "Selection unpinned")
                        }
                      >
                        Unpin selected
                      </button>
                      <button className="text-button" onClick={trashSelected}>
                        {view === "trash" ? "Restore" : "Move to trash"}
                      </button>
                      {view !== "trash" && (
                        <select
                          aria-label="Move selected bookmarks"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value === "") return;
                            const folderId =
                              e.target.value === "root" ? null : e.target.value;
                            mutate((n) => {
                              for (const b of n.bookmarks)
                                if (selected.has(b.id)) b.folderId = folderId;
                              setSelected(new Set());
                            }, "Bookmarks moved");
                          }}
                        >
                          <option value="">Move to folder…</option>
                          <option value="root">No folder</option>
                          {db.folders.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {view === "trash" && (
                        <button
                          className="text-button danger"
                          onClick={() =>
                            setDialog({
                              kind: "confirm",
                              title: "Permanently delete selected bookmarks?",
                              text: "These items will be removed from the library and workspaces. Chrome bookmarks are unchanged.",
                              action: () =>
                                mutate((n) => {
                                  n.bookmarks = n.bookmarks.filter(
                                    (b) => !selected.has(b.id),
                                  );
                                  for (const w of n.workspaces)
                                    w.bookmarkIds = w.bookmarkIds.filter(
                                      (id) => !selected.has(id),
                                    );
                                  setSelected(new Set());
                                  setDialog(null);
                                }, "Bookmarks permanently deleted"),
                            })
                          }
                        >
                          Delete permanently
                        </button>
                      )}
                      <button
                        className="text-button"
                        onClick={() =>
                          setSelected(new Set(filtered.map((b) => b.id)))
                        }
                      >
                        Select all
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Clear selection"
                        onClick={cancelSelection}
                      >
                        <Icon name="xmark" />
                      </button>
                    </div>
                  )}
                  {view === "pinned" ? (
                    <PinBoard
                      layout={layout}
                      groups={boardGroups}
                      busy={!!busy}
                      renderItem={renderPin}
                      visible={pinVisible}
                      canStack={(source,target)=>!selectMode&&source!==target&&source.startsWith('bookmarks:')&&(target.startsWith('bookmarks:')||!!db.folders.find(folder=>'folders:'+folder.id===target&&folder.shortcutIds))}
                      onStack={(source,target)=>mutate(n=>{stackPin(n,source,target,uid());},'Shortcut folder saved')}
                      onMove={(key, groupId, before) => {
                        setSort("manual");
                        mutate((n) => {
                          n.pinGroups = movePin(n, key, groupId, before);
                        }, "Pinned order updated");
                      }}
                      onRename={(id, name) =>
                        mutate((n) => {
                          n.pinGroups = pinGroupsFor(n).map((g) =>
                            g.id === id ? { ...g, name } : g,
                          );
                        }, "Group label saved")
                      }
                      onDelete={(id) =>
                        mutate((n) => {
                          const groups = pinGroupsFor(n);
                          const removed = groups.find((g) => g.id === id);
                          const remaining = groups.filter((g) => g.id !== id);
                          let fallback = remaining.find(
                            (g) => g.id === "ungrouped",
                          );
                          if (!fallback) {
                            fallback = {
                              id: "ungrouped",
                              name: "Pinned",
                              itemKeys: [],
                            };
                            remaining.push(fallback);
                          }
                          fallback.itemKeys.push(...(removed?.itemKeys || []));
                          n.pinGroups = remaining;
                        }, "Group removed; pins kept")
                      }
                      onReorder={(id, before) =>
                        mutate((n) => {
                          const groups = pinGroupsFor(n);
                          const group = groups.find((g) => g.id === id);
                          if (!group) return;
                          const rest = groups.filter((g) => g.id !== id);
                          const at = rest.findIndex((g) => g.id === before);
                          rest.splice(at < 0 ? rest.length : at, 0, group);
                          n.pinGroups = rest;
                        }, "Group order updated")
                      }
                      editing={editingGroup}
                      setEditing={setEditingGroup}
                      filtering={!!query || !!profileFilter}
                    />
                  ) : filtered.length ? (
                    <div
                      className={
                        layout === "list"
                          ? "bookmark-grid list-view"
                          : "bookmark-grid"
                      }
                    >
                      {filtered.slice(0, pageLimit).map(card)}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <Icon name={query ? "magnifying-glass" : "bookmark"} />
                      <h2>
                        {query ? "No matching bookmarks" : "Nothing here yet"}
                      </h2>
                      <p>
                        {query
                          ? "Try a different title, domain, tag or profile."
                          : view === "trash"
                            ? "Your trash is empty."
                            : "Add a bookmark or import a collection from Chrome."}
                      </p>
                      {!query && view !== "trash" && (
                        <button
                          className="button secondary"
                          onClick={() => setDialog({ kind: "bookmark" })}
                        >
                          <Icon name="plus" />
                          Add bookmark
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              {filtered.length > pageLimit &&
                (view === "all" ||
                  view === "pinned" ||
                  view === "trash" ||
                  currentFolder ||
                  currentWorkspace) && (
                  <div className="load-more">
                    <button
                      className="button secondary"
                      onClick={() => setPageLimit((n) => n + 60)}
                    >
                      Show more · {filtered.length - pageLimit} remaining
                    </button>
                  </div>
                )}
              {view === "workspaces" && (
                <>
                  {db.workspaces.length ? (
                    <div className="profiles-grid">
                      {db.workspaces.map((w) => (
                        <div className="workspace-card" key={w.id} onContextMenu={event=>{event.preventDefault();setContext({key:'workspaces:'+w.id,x:event.clientX,y:event.clientY});}}>
                          <div className="profile-header">
                            <div className="workspace-icon">
                              <WorkspaceIcon workspace={w} bookmarks={db.bookmarks}/>
                            </div>
                            <button
                              className={
                                "icon-button " + (w.pinned ? "is-pinned" : "")
                              }
                              aria-label={"Pin " + w.name}
                              onClick={() => pin("workspaces", w.id)}
                            >
                              <Icon name="thumbtack" />
                            </button>
                          </div>
                          <h2>{w.name}</h2>
                          <p>
                            {w.bookmarkIds.length} bookmarks · assigned profiles
                          </p>
                          <div className="workspace-domains">
                            {active
                              .filter((b) => w.bookmarkIds.includes(b.id))
                              .slice(0, 3)
                              .map((b) => (
                                <span key={b.id}>{host(b.url)}</span>
                              ))}
                          </div>
                          <div className="profile-actions">
                            <button
                              className="button secondary"
                              onClick={() => setView("workspace:" + w.id)}
                            >
                              View links
                            </button>
                            <button
                              className="button primary"
                              disabled={!!busy}
                              onClick={() => openWorkspace(w)}
                            >
                              <Icon name="play" />
                              Open all
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <Icon name="layer-group" />
                      <h2>Start a little faster</h2>
                      <p>
                        Group your everyday links into a workspace.
                        <br />
                        Each one opens in its assigned profile.
                      </p>
                      <button
                        className="button primary"
                        onClick={() => setDialog({ kind: "workspace" })}
                      >
                        <Icon name="plus" />
                        Create workspace
                      </button>
                    </div>
                  )}
                </>
              )}
              {view === "settings" && (
                <div className="settings-stack">
                  <section className="settings-card">
                    <div>
                      <h2>
                        <Icon name="palette" />
                        Appearance
                      </h2>
                      <p>Choose the look that feels right for your desk.</p>
                    </div>
                    <div className="theme-options">
                      {[
                        ["light", "sun", "Light"],
                        ["dark", "moon", "Dark"],
                        ["system", "desktop", "System"],
                      ].map(([id, icon, label]) => (
                        <button
                          key={id}
                          className={theme === id ? "selected" : ""}
                          onClick={() => setTheme(id)}
                        >
                          <Icon name={icon} />
                          {label}
                          {theme === id && <Icon name="circle-check" />}
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="settings-card">
                    <div>
                      <h2>
                        <Icon name="shield-halved" />
                        Backup & restore
                      </h2>
                      <p>
                        Full backups include profiles, folders, pins, tags and
                        workspaces, plus your PC folder shortcuts, names, colors and order.
                        <br />
                        The last 10 library versions are also backed up
                        automatically before changes.
                      </p>
                    </div>
                    <div className="heading-actions">
                      <button
                        className="button secondary"
                        onClick={() =>
                          task("Exporting backup…", async () => {
                            if ("__TAURI_INTERNALS__" in window) {
                              const file =
                                await command<string>("export_backup");
                              notify("Backup saved: " + file);
                            } else
                              download(
                                "Automora Dock-backup-" +
                                  new Date().toISOString().slice(0, 10) +
                                  ".json",
                                await command('export_backup'),
                              );
                          })
                        }
                      >
                        <Icon name="download" />
                        Export backup
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => restore.current?.click()}
                      >
                        <Icon name="upload" />
                        Restore backup
                      </button>
                      <input
                        hidden
                        type="file"
                        ref={restore}
                        accept=".json"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          try {
                            if (file.size > 25000000)
                              throw Error("Backup exceeds 25 MB.");
                            const data = JSON.parse(await file.text());
                            if (
                              data.format !== "profiledock" ||
                              ![1,2].includes(data.version)
                            )
                              throw Error("Unsupported backup format.");
                            setDialog({
                              kind: "confirm",
                              title: "Replace your current library?",
                              text: data.version===2?"This backup replaces your library and PC folder shortcuts. A recovery copy is kept first. Folder and profile paths may need updating on another PC.":"This older backup replaces your library and keeps your current PC folder shortcuts. A recovery copy is kept first.",
                              action: () =>
                                task("Restoring…", async () => {
                                  if(data.version===2){
                                    const restored=await command<Library>('restore_backup',{backup:data,revision:db.revision});revision.current=restored.revision;setDb(restored);notify('Backup restored including PC folders');window.dispatchEvent(new Event('profiledock:refresh'));
                                  }else await save(
                                    { ...data.library, revision: db.revision },
                                    "Backup restored",
                                  );
                                  setDialog(null);
                                }),
                            });
                          } catch (err) {
                            notify(String(err), true);
                          }
                        }}
                      />
                    </div>
                  </section>
                  <section className="settings-card">
                    <div>
                      <h2>
                        <Icon name="hard-drive" />
                        Local data
                      </h2>
                      <p>
                        Your library lives on this computer. No account is
                        required.
                      </p>
                      <code className="data-path">
                        {location || "Application local-data directory"}
                      </code>
                      <p className="muted">
                        Imports read Chrome bookmarks. Edits in Automora Dock do
                        not modify Chrome.
                      </p>
                    </div>
                  </section>
                  <section className="settings-card">
                    <div>
                      <h2>
                        <Icon name="circle-info" />
                        About this build
                      </h2>
                      <p>
                        Automora Dock 0.4.0 ·{" "}
                        {"__TAURI_INTERNALS__" in window
                          ? "Tauri desktop"
                          : "Local development runtime"}
                      </p>
                      <p className="muted">
                        Site icons are read from Chrome’s local cache, with a
                        globe as fallback. Pinned groups and their arranged
                        order are saved locally. Importing is manual.
                      </p>
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
          <footer className="main-footer">
            <span>
              <Icon name="lock" />
              Your library stays on your device
            </span>
            <span>Made for a more organised day.</span>
          </footer>
        </main>
        {launcherMode&&workspaceRail&&<WorkspaceRail all={db.workspaces} pinned={railWorkspaces} bookmarks={db.bookmarks} busy={!!busy} onOpen={openWorkspace} onPin={id=>pin('workspaces',id)} onCreate={()=>setDialog({kind:'workspace',pinOnCreate:true})} onContext={(w,x,y)=>setContext({key:'workspaces:'+w.id,x,y})}/>}
        </div>
        {launcherMode&&<FavoriteFolders/>}
      </div>
      {context && contextItem && (
        <div
          className="shortcut-menu"
          role="menu"
          aria-label="Shortcut actions"
          style={{
            left: Math.max(8, Math.min(context.x, window.innerWidth - 240)),
            top: Math.max(8, Math.min(context.y, window.innerHeight - 330)),
          }}
        >
          <strong>{contextItem.name}</strong>
          <button
            role="menuitem"
            onClick={() => {
              const at = context.key.indexOf(":");
              const kind = context.key.slice(0, at),
                id = context.key.slice(at + 1);
              pin(kind as (typeof pinKinds)[number], id);
              setContext(null);
            }}
          >
            <Icon name="thumbtack" />
            {contextItem.pinned ? "Unpin" : "Pin"}
          </button>
          {context.key.startsWith('workspaces:')&&<>
            <button role="menuitem" onClick={()=>{setDialog({kind:'workspace',item:contextItem as Workspace});setContext(null);}}><Icon name="pen-to-square"/>Edit workspace</button>
            <button role="menuitem" onClick={()=>{setRenamingWorkspace(contextItem as Workspace);setContext(null);}}><Icon name="i-cursor"/>Rename workspace</button>
          </>}
          {context.key.startsWith("bookmarks:") && (
            <>
              <button
                role="menuitem"
                onClick={() => {
                  if(selectMode)cancelSelection();else{setSelectMode(true);setSelected(new Set([contextItem.id]));}
                  setContext(null);
                }}
              >
                <Icon name="list-check" />
                {selectMode?'Exit selection mode':'Select'}
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setDialog({
                    kind: "bookmark",
                    item: contextItem as Bookmark,
                  });
                  setContext(null);
                }}
              >
                <Icon name="pen" />
                Edit bookmark
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setDetail(contextItem.id);
                  setContext(null);
                }}
              >
                <Icon name="circle-info" />
                Details
              </button>
            </>
          )}
          {contextItem.pinned && (
            <label>
              Move to group
              <select
                aria-label="Move pin to group"
                value={
                  pinGroupsFor(db).find((g) => g.itemKeys.includes(context.key))
                    ?.id || ""
                }
                onChange={(e) => {
                  const key = context.key;
                  mutate((n) => {
                    n.pinGroups = movePin(n, key, e.target.value);
                  }, "Pin moved");
                  setContext(null);
                }}
              >
                {pinGroupsFor(db).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {pinFolder&&db.folders.find(folder=>folder.id===pinFolder)?.shortcutIds&&<PinFolderPopup folder={db.folders.find(folder=>folder.id===pinFolder)!} bookmarks={db.bookmarks} profiles={db.profiles} busy={!!busy} onClose={()=>setPinFolder(null)} onOpen={openBookmark} onRename={name=>mutate(n=>{n.folders.find(folder=>folder.id===pinFolder)!.name=name;},'Folder renamed')} onRemove={id=>mutate(n=>removeFolderShortcut(n,pinFolder,id),'Moved out of folder')} onReorder={ids=>mutate(n=>{n.folders.find(folder=>folder.id===pinFolder)!.shortcutIds=ids;},'Folder order updated')}/>}
      {detailItem && (
        <div className="detail-backdrop" onClick={() => setDetail(null)}>
          <aside className="detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">
              <h2>Bookmark details</h2>
              <button
                className="icon-button"
                aria-label="Close details"
                onClick={() => setDetail(null)}
              >
                <Icon name="xmark" />
              </button>
            </div>
            <div className="detail-icon">
              {host(detailItem.url).charAt(0).toUpperCase()}
            </div>
            <h2>{detailItem.name}</h2>
            <a
              className="detail-url"
              href={detailItem.url}
              onClick={(e) => {
                e.preventDefault();
                openBookmark(detailItem);
              }}
            >
              {detailItem.url}
            </a>
            <dl>
              <dt>OPENS IN</dt>
              <dd>
                {db.profiles.find((p) => p.id === detailItem.profileId)?.name ||
                  "Missing profile"}
              </dd>
              <dt>FOLDER</dt>
              <dd>
                {db.folders.find((f) => f.id === detailItem.folderId)?.name ||
                  "No folder"}
              </dd>
              <dt>TAGS</dt>
              <dd>{detailItem.tags.join(", ") || "No tags"}</dd>
              <dt>NOTES</dt>
              <dd className="notes">{detailItem.notes || "No notes yet."}</dd>
            </dl>
            <button
              className="button primary full-width"
              onClick={() => {
                setDialog({ kind: "bookmark", item: detailItem });
                setDetail(null);
              }}
            >
              <Icon name="pen" />
              Edit bookmark
            </button>
            <button
              className="button secondary full-width"
              onClick={() => pin("bookmarks", detailItem.id)}
            >
              <Icon name="thumbtack" />
              {detailItem.pinned ? "Unpin" : "Pin bookmark"}
            </button>
            <button
              className="button secondary full-width"
              onClick={() =>
                mutate(
                  (n) => {
                    n.bookmarks.find((b) => b.id === detailItem.id)!.trashed =
                      !detailItem.trashed;
                    setDetail(null);
                  },
                  detailItem.trashed ? "Bookmark restored" : "Moved to trash",
                )
              }
            >
              <Icon name={detailItem.trashed ? "rotate-left" : "trash-can"} />
              {detailItem.trashed ? "Restore" : "Move to trash"}
            </button>
          </aside>
        </div>
      )}
      {renamingWorkspace&&<Modal onClose={()=>setRenamingWorkspace(null)}><form onSubmit={event=>{event.preventDefault();const name=String(new FormData(event.currentTarget).get('name')||'').trim();if(name)void task('Renaming workspace…',async()=>{const next=structuredClone(db);const workspace=next.workspaces.find(item=>item.id===renamingWorkspace.id);if(!workspace)throw Error('Workspace no longer exists.');workspace.name=name;await save(next,'Workspace renamed');setRenamingWorkspace(null);});}}><span className="modal-symbol"><Icon name="i-cursor"/></span><h2>Rename workspace</h2><label>Workspace name<input name="name" aria-label="Workspace name" defaultValue={renamingWorkspace.name} maxLength={120} required autoFocus/></label><button type="submit" className="button primary full-width" disabled={!!busy}>Save name</button></form></Modal>}
      {dialog && (
        <Modal
          onClose={() => {
            if (!busy) setDialog(null);
          }}
        >
          {dialog.kind === "bookmark" ? (
            <BookmarkForm
              db={db}
              item={dialog.item}
              defaultFolder={currentFolder?.id}
              busy={!!busy}
              onSave={(item) =>
                task("Saving bookmark…", async () => {
                  const next = structuredClone(db);
                  const index = next.bookmarks.findIndex(
                    (b) => b.id === item.id,
                  );
                  if (index >= 0) next.bookmarks[index] = item;
                  else next.bookmarks.push(item);
                  await save(next, "Bookmark saved");
                  setDialog(null);
                })
              }
            />
          ) : dialog.kind === "folder" ? (
            <FolderForm
              db={db}
              item={dialog.item}
              parentId={currentFolder?.id}
              busy={!!busy}
              onSave={(item) =>
                task("Saving folder…", async () => {
                  const next = structuredClone(db);
                  const index = next.folders.findIndex((f) => f.id === item.id);
                  if (index >= 0) next.folders[index] = item;
                  else next.folders.push(item);
                  await save(next, "Folder saved");
                  setDialog(null);
                })
              }
            />
          ) : dialog.kind === "workspace" ? (
            <WorkspaceForm
              db={db}
              item={dialog.item}
              busy={!!busy}
              onSave={(item) =>
                task("Saving workspace…", async () => {
                  const next = structuredClone(db);
                  const savedItem=dialog?.kind==='workspace'&&dialog.pinOnCreate&&!dialog.item?{...item,pinned:true}:item;
                  const index = next.workspaces.findIndex(
                    (w) => w.id === item.id,
                  );
                  if (index >= 0) next.workspaces[index] = savedItem;
                  else next.workspaces.push(savedItem);
                  await save(next, "Workspace saved");
                  setDialog(null);
                })
              }
              onDelete={
                dialog.item
                  ? () =>
                      mutate((n) => {
                        n.workspaces = n.workspaces.filter(
                          (w) => w.id !== dialog.item?.id,
                        );
                        setDialog(null);
                        setView("workspaces");
                      }, "Workspace deleted")
                  : undefined
              }
            />
          ) : dialog.kind === "import" ? (
            <ImportForm
              db={db}
              defaultProfile={profileFilter}
              busy={!!busy}
              onSave={(items) =>
                task("Importing bookmarks…", async () => {
                  await save(
                    mergeImport(db, items),
                    `${items.length} selected bookmarks processed`,
                  );
                  setDialog(null);
                  setView("all");
                  setProfileFilter("");
                })
              }
            />
          ) : (
            <>
              <span className="modal-symbol">
                <Icon name="circle-question" />
              </span>
              <h2>{dialog.title}</h2>
              <p>{dialog.text}</p>
              <button
                className="button primary full-width"
                disabled={!!busy}
                onClick={dialog.action}
              >
                Confirm
              </button>
            </>
          )}
        </Modal>
      )}
      {notice && (
        <div
          role={notice.error ? "alert" : "status"}
          className={"toast " + (notice.error ? "error" : "")}
        >
          <Icon name={notice.error ? "circle-exclamation" : "circle-check"} />
          <span>{notice.text}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <Icon name="xmark" />
          </button>
        </div>
      )}
      {busy && (
        <div role="status" className="busy-pill">
          <Icon name="circle-notch" />
          {busy}
        </div>
      )}
    </div>
  );
}
