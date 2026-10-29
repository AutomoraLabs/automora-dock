import React, { useEffect, useRef, useState, useId } from "react";
import { command } from "./model";
import type { Profile } from "./model";
import {cachedAsset,loadAsset} from './assetCache';
export function ProfileAvatar({
  profile,
  size = 22,
}: {
  profile?: Profile;
  size?: number;
}) {
  const key=profile?'avatar|'+profile.id+'|'+profile.root+'|'+profile.directory:'';
  const [src, setSrc] = useState<string | null>(()=>cachedAsset(key));
  useEffect(() => {
    setSrc(cachedAsset(key));
    if (!profile) return;
    let alive = true;
    loadAsset(key,()=>command<string | null>("profile_avatar", {
          profileId: profile.id,
        })).then((src) => {
      if (alive) setSrc(src);
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return (
    <span
      className="chrome-avatar"
      aria-hidden="true"
      title={profile?.name || "All profiles"}
      style={{
        width: size,
        height: size,
        background: profile?.color || "var(--accent)",
        fontSize: Math.max(9, size * 0.44),
      }}
    >
      {src ? (
        <img src={src} alt="" draggable={false} onError={() => setSrc(null)} />
      ) : (
        profile?.name.slice(0, 1).toUpperCase() || (
          <i className="fa-solid fa-user-group" aria-hidden="true" />
        )
      )}
    </span>
  );
}
export function ProfilePicker({
  profiles,
  value,
  onChange,
}: {
  profiles: Profile[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [index, setIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    listId = useId();
  const options = [{ id: "", name: "All profiles" }, ...profiles];
  useEffect(()=>{const close=()=>setOpen(false);window.addEventListener('profiledock:close-popups',close);window.addEventListener('profiledock:refresh',close);window.addEventListener('blur',close);return()=>{window.removeEventListener('profiledock:close-popups',close);window.removeEventListener('profiledock:refresh',close);window.removeEventListener('blur',close);};},[]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (open)
      ref.current
        ?.querySelector<HTMLElement>(`[data-profile-index="${index}"]`)
        ?.focus();
  }, [open, index]);
  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div
      className="profile-picker"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (!open) {
            setIndex(
              Math.max(
                0,
                options.findIndex((p) => p.id === value),
              ),
            );
            setOpen(true);
          } else
            setIndex(
              (i) =>
                (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) %
                options.length,
            );
        }
        if (open && e.key === "Home") {
          e.preventDefault();
          setIndex(0);
        }
        if (open && e.key === "End") {
          e.preventDefault();
          setIndex(options.length - 1);
        }
        if (e.key === "Tab") setOpen(false);
      }}
    >
      <button
        ref={trigger}
        className="profile-filter-trigger"
        aria-label="Filter by profile"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          setIndex(
            Math.max(
              0,
              options.findIndex((p) => p.id === value),
            ),
          );
          setOpen((v) => !v);
        }}
      >
        <ProfileAvatar profile={profiles.find((p) => p.id === value)} />
        <span>
          {options.find((p) => p.id === value)?.name || "All profiles"}
        </span>
        <i className="fa-solid fa-chevron-down" aria-hidden="true" />
      </button>
      {open && (
        <div
          className="profile-options"
          id={listId}
          role="listbox"
          aria-label="Chrome profiles"
        >
          {options.map((p, i) => (
            <button
              key={p.id}
              role="option"
              aria-selected={p.id === value}
              data-profile-index={i}
              tabIndex={i === index ? 0 : -1}
              onClick={() => choose(p.id)}
            >
              <ProfileAvatar profile={profiles.find((x) => x.id === p.id)} />
              <span>
                {p.name}
                {"directory" in p && <small>{p.directory}</small>}
              </span>
              {value === p.id && (
                <i className="fa-solid fa-check" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
