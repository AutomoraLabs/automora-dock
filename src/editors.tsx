import React, { useState, useEffect, useRef } from "react";
import { command, uid } from "./model";
import type {
  Library,
  Bookmark,
  Folder,
  Workspace,
  ImportItem,
  ImportSource,
  ImportPreview,
} from "./model";
import { Icon, host } from "./ui";
export function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>("input,button,select")?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = [
        ...ref.current!.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ),
      ].filter((x) => x.offsetParent !== null);
      if (!nodes.length) return;
      if (e.shiftKey && document.activeElement === nodes[0]) {
        e.preventDefault();
        nodes.at(-1)!.focus();
      } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
        e.preventDefault();
        nodes[0].focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Library editor"
        ref={ref}
      >
        <button
          className="icon-button modal-close"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="xmark" />
        </button>
        {children}
      </div>
    </div>
  );
}
export function BookmarkForm({
  db,
  item,
  defaultFolder,
  busy,
  onSave,
}: {
  db: Library;
  item?: Bookmark;
  defaultFolder?: string;
  busy: boolean;
  onSave: (b: Bookmark) => void;
}) {
  const [name, setName] = useState(item?.name || ""),
    [url, setUrl] = useState(item?.url || ""),
    [profile, setProfile] = useState(
      item?.profileId || db.profiles[0]?.id || "",
    ),
    [folder, setFolder] = useState(item?.folderId || defaultFolder || ""),
    [tags, setTags] = useState(item?.tags.join(", ") || ""),
    [notes, setNotes] = useState(item?.notes || ""),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          let address = url.trim();
          if (!/^https?:\/\//i.test(address)) address = "https://" + address;
          const u = new URL(address);
          if (!u.hostname || !["http:", "https:"].includes(u.protocol))
            throw Error("Enter a valid HTTP or HTTPS address.");
          if (!profile) throw Error("Detect a Chrome profile first.");
          onSave({
            ...item,
            id: item?.id || uid(),
            name: name.trim() || u.hostname,
            url: u.href,
            profileId: profile,
            folderId: folder || null,
            tags: [
              ...new Set(
                tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              ),
            ],
            notes,
            pinned: item?.pinned || false,
            created: item?.created || Date.now(),
          });
        } catch (err) {
          setError(String(err));
        }
      }}
    >
      <span className="modal-symbol">
        <Icon name="bookmark" />
      </span>
      <h2>{item ? "Edit bookmark" : "A new place to come back to."}</h2>
      <p>Save a link and choose the profile it belongs to.</p>
      <label>
        Title
        <input
          maxLength={4096}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Design inspiration"
        />
      </label>
      <label>
        Website URL
        <input
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
        />
      </label>
      <div className="two-columns">
        <label>
          Chrome profile
          <select
            required
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
          >
            <option value="">Choose a profile</option>
            {db.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Folder
          <select value={folder} onChange={(e) => setFolder(e.target.value)}>
            <option value="">No folder</option>
            {db.folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Tags <small>comma separated</small>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="design, work"
        />
      </label>
      <label>
        Notes
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything worth remembering…"
        />
      </label>
      {!db.profiles.length && (
        <p className="form-error">
          Connect a Chrome profile from the Profiles screen first.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        disabled={busy || !db.profiles.length}
        className="button primary full-width"
        type="submit"
      >
        <Icon name="check" />
        Save bookmark
      </button>
    </form>
  );
}
export function FolderForm({
  db,
  item,
  parentId,
  busy,
  onSave,
}: {
  db: Library;
  item?: Folder;
  parentId?: string;
  busy: boolean;
  onSave: (f: Folder) => void;
}) {
  const [name, setName] = useState(item?.name || ""),
    [parent, setParent] = useState(item?.parentId || parentId || "");
  const descendants = new Set<string>();
  function collect(id: string) {
    for (const f of db.folders.filter((f) => f.parentId === id)) {
      if (descendants.has(f.id)) continue;
      descendants.add(f.id);
      collect(f.id);
    }
  }
  if (item) collect(item.id);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim())
          onSave({
            id: item?.id || uid(),
            name: name.trim(),
            parentId: parent || null,
            pinned: item?.pinned || false,
            ...(item?.shortcutIds?{shortcutIds:item.shortcutIds}:{}),
          });
      }}
    >
      <span className="modal-symbol">
        <Icon name="folder" />
      </span>
      <h2>{item ? "Edit folder" : "A little more organised."}</h2>
      <p>Give related bookmarks a place of their own.</p>
      <label>
        Folder name
        <input
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Projects"
        />
      </label>
      <label>
        Parent folder
        <select value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">Library root</option>
          {db.folders
            .filter((f) => f.id !== item?.id && !descendants.has(f.id))
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={busy}
        className="button primary full-width"
      >
        Save folder
      </button>
    </form>
  );
}
export function WorkspaceForm({
  db,
  item,
  busy,
  onSave,
  onDelete,
}: {
  db: Library;
  item?: Workspace;
  busy: boolean;
  onSave: (w: Workspace) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(item?.name || ""),
    [ids, setIds] = useState(new Set(item?.bookmarkIds || [])),
    [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim())
          onSave({
            id: item?.id || uid(),
            name: name.trim(),
            bookmarkIds: [...ids],
            pinned: item?.pinned || false,
          });
      }}
    >
      <span className="modal-symbol">
        <Icon name="layer-group" />
      </span>
      <h2>{item ? "Edit workspace" : "Your tools. Ready together."}</h2>
      <p>Each bookmark keeps its assigned Chrome profile.</p>
      <label>
        Workspace name
        <input
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Morning routine"
        />
      </label>
      <label>
        Find bookmarks
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title or domain"
        />
      </label>
      <div className="checklist">
        {db.bookmarks
          .filter(
            (b) =>
              !b.trashed &&
              [b.name, b.url].join(" ").toLowerCase().includes(q.toLowerCase()),
          )
          .map((b) => (
            <label className="check-row" key={b.id}>
              <input
                type="checkbox"
                checked={ids.has(b.id)}
                onChange={() =>
                  setIds((s) => {
                    const n = new Set(s);
                    n.has(b.id) ? n.delete(b.id) : n.add(b.id);
                    return n;
                  })
                }
              />
              <span>
                {b.name}
                <small>
                  {db.profiles.find((p) => p.id === b.profileId)?.name} ·{" "}
                  {host(b.url)}
                </small>
              </span>
            </label>
          ))}
      </div>
      <button
        type="submit"
        disabled={busy}
        className="button primary full-width"
      >
        Save workspace · {ids.size} links
      </button>
      {onDelete && (
        <button
          type="button"
          className="text-button danger full-width"
          disabled={busy}
          onClick={onDelete}
        >
          Delete workspace
        </button>
      )}
    </form>
  );
}
export function ImportForm({
  db,
  defaultProfile,
  busy,
  onSave,
}: {
  db: Library;
  defaultProfile: string;
  busy: boolean;
  onSave: (items: ImportItem[]) => void;
}) {
  const [profiles, setProfiles] = useState(
      new Set(defaultProfile ? [defaultProfile] : db.profiles.map((p) => p.id)),
    ),
    [items, setItems] = useState<ImportItem[] | null>(null),
    [picked, setPicked] = useState(new Set<number>()),
    [loading, setLoading] = useState(false),
    [warnings, setWarnings] = useState<string[]>([]),
    [query, setQuery] = useState("");
  const [sources, setSources] = useState<ImportSource[]>([]),
    [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true;
    setChecking(true);
    command<ImportPreview>("preview_import", {
      profileIds: db.profiles.map((p) => p.id),
    })
      .then((result) => {
        if (!active) return;
        setSources(result.sources || []);
        setProfiles(
          (previous) =>
            new Set(
              [...previous].filter((id) =>
                result.sources?.some((s) => s.profileId === id && s.count > 0),
              ),
            ),
        );
      })
      .catch((e) => {
        if (active) setWarnings([String(e)]);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [db.profiles]);
  async function loadPreview() {
    setLoading(true);
    setWarnings([]);
    try {
      const result = await command<ImportPreview>("preview_import", {
        profileIds: [...profiles],
      });
      setItems(result.items);
      setPicked(new Set(result.items.map((_, i) => i)));
      setSources(result.sources || []);
      setWarnings(result.sources ? [] : result.warnings);
    } catch (e) {
      setWarnings([String(e)]);
    } finally {
      setLoading(false);
    }
  }
  const unavailable =
    items !== null &&
    !items.length &&
    sources.some((s) => s.status === "missing" || s.status === "error");
  const groups = new Map<string, { items: ImportItem[]; indices: number[] }>();
  items?.forEach((item, index) => {
    const key = item.profileId + "|" + item.folderPath.join("/");
    if (!groups.has(key)) groups.set(key, { items: [], indices: [] });
    groups.get(key)!.items.push(item);
    groups.get(key)!.indices.push(index);
  });
  return (
    <>
      <span className="modal-symbol">
        <Icon name="download" />
      </span>
      <h2>
        {unavailable
          ? "Bookmark files unavailable."
          : items
            ? "Choose what comes with you."
            : "Bring your bookmarks home."}
      </h2>
      <p>
        {items
          ? "Select folders or individual bookmarks. Existing imported entries are matched by source identity."
          : "Select Chrome profiles to preview their bookmarks."}
      </p>
      {!items ? (
        <>
          <div className="checklist import-profile-list">
            {db.profiles.map((p) => (
              <label className="check-row" key={p.id}>
                <input
                  type="checkbox"
                  disabled={
                    checking ||
                    sources.some((s) => s.profileId === p.id && s.count === 0)
                  }
                  checked={profiles.has(p.id)}
                  onChange={() =>
                    setProfiles((s) => {
                      const n = new Set(s);
                      n.has(p.id) ? n.delete(p.id) : n.add(p.id);
                      return n;
                    })
                  }
                />
                <span>
                  {p.name}
                  <small>
                    {p.directory} ·{" "}
                    {checking
                      ? "Checking bookmarks…"
                      : sources.find((s) => s.profileId === p.id)?.message ||
                        "Availability unknown"}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <button
            className="button primary full-width"
            disabled={loading || checking || !profiles.size}
            onClick={loadPreview}
          >
            {loading ? "Reading bookmark files…" : "Preview bookmarks"}
            <Icon name="arrow-right" />
          </button>
        </>
      ) : (
        <>
          <div className="import-summary">
            {unavailable ? (
              "The selected profiles could not be read. This does not mean your library is empty."
            ) : (
              <>
                <strong>{items.length}</strong> found ·{" "}
                <strong>
                  {
                    items.filter((i) =>
                      db.bookmarks.some(
                        (b) =>
                          b.profileId === i.profileId &&
                          b.sourceId === i.sourceId,
                      ),
                    ).length
                  }
                </strong>{" "}
                already imported
              </>
            )}
          </div>
          {sources
            .filter((s) => s.status !== "ready")
            .map((s) => (
              <div key={s.profileId} className={"source-status " + s.status}>
                <strong>
                  {s.name} ·{" "}
                  {db.profiles.find((p) => p.id === s.profileId)?.directory}
                </strong>
                <p>{s.message}</p>
              </div>
            ))}
          <input
            className="full-width"
            aria-label="Filter import preview"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter preview…"
          />
          <div className="selection-links">
            <button
              className="text-button"
              onClick={() => setPicked(new Set(items.map((_, i) => i)))}
            >
              Select all
            </button>
            <button
              className="text-button"
              onClick={() => setPicked(new Set())}
            >
              Select none
            </button>
            <button className="text-button" onClick={() => setItems(null)}>
              Change profiles
            </button>
          </div>
          <div className="import-list">
            {[...groups.entries()].map(([key, g]) => {
              const matches = g.indices.filter((i) =>
                [items[i].name, items[i].url, ...items[i].folderPath]
                  .join(" ")
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              );
              if (!matches.length) return null;
              return (
                <details key={key} open={!!query}>
                  <summary>
                    <input
                      aria-label={
                        "Select folder " + g.items[0].folderPath.join("/")
                      }
                      type="checkbox"
                      checked={g.indices.every((i) => picked.has(i))}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setPicked((s) => {
                          const n = new Set(s);
                          for (const i of g.indices)
                            e.target.checked ? n.add(i) : n.delete(i);
                          return n;
                        })
                      }
                    />
                    <Icon name="folder" />
                    <span>
                      {
                        db.profiles.find((p) => p.id === g.items[0].profileId)
                          ?.name
                      }{" "}
                      / {g.items[0].folderPath.join(" / ") || "Root"}
                    </span>
                    <small>{g.indices.length}</small>
                  </summary>
                  {matches.map((i) => (
                    <label key={i} className="check-row">
                      <input
                        type="checkbox"
                        checked={picked.has(i)}
                        onChange={() =>
                          setPicked((s) => {
                            const n = new Set(s);
                            n.has(i) ? n.delete(i) : n.add(i);
                            return n;
                          })
                        }
                      />
                      <span>
                        {items[i].name}
                        <small>{host(items[i].url)}</small>
                      </span>
                    </label>
                  ))}
                </details>
              );
            })}
            {!items.length && !unavailable && (
              <p className="muted">No supported HTTP/HTTPS bookmarks found.</p>
            )}
          </div>
          <p className="muted">
            Re-import updates source URLs and preserves your custom titles,
            tags, folders and notes. Existing trash entries stay in trash.
          </p>
          <button
            className="button primary full-width"
            disabled={busy || !picked.size}
            hidden={!items.length}
            onClick={() => onSave(items.filter((_, i) => picked.has(i)))}
          >
            <Icon name="download" />
            Import {picked.size} selected bookmarks
          </button>
          {!items.length && (
            <button
              className="button primary full-width"
              onClick={() => setItems(null)}
            >
              Choose another profile
            </button>
          )}
          <button
            className="text-button full-width"
            disabled={loading}
            onClick={loadPreview}
          >
            {loading ? "Checking…" : "Refresh bookmark files"}
          </button>
        </>
      )}
      {warnings.length > 0 && (
        <div role="alert" className="form-error">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
    </>
  );
}
