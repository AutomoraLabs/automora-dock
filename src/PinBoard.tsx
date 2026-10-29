import React, { useState, useEffect } from "react";
import type { PinGroup } from "./model";
import { Icon } from "./ui";
type Props = {
  groups: PinGroup[];
  busy: boolean;
  layout: string;
  filtering: boolean;
  renderItem: (key: string) => React.ReactNode;
  visible: (key: string) => boolean;
  onMove: (key: string, groupId: string, before?: string) => void;
  canStack: (source:string,target:string)=>boolean;
  onStack: (source:string,target:string)=>void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, before: string) => void;
  editing: string | null;
  setEditing: (id: string | null) => void;
};
export default function PinBoard({
  groups,
  busy,
  layout,
  filtering,
  renderItem,
  visible,
  onMove,
  canStack,
  onStack,
  onRename,
  onDelete,
  onReorder,
  editing,
  setEditing,
}: Props) {
  const [dragging, setDragging] = useState<string | null>(null),
    [stackTarget,setStackTarget]=useState<string|null>(null),
    [target, setTarget] = useState<string | null>(null),
    [draft, setDraft] = useState("");
  useEffect(() => {
    setDraft(groups.find((g) => g.id === editing)?.name || "");
  }, [editing]);
  const drop = (e: React.DragEvent, groupId: string, before?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setTarget(null);
    setDragging(null);
    setStackTarget(null);
    if(busy)return;
    const group = e.dataTransfer.getData("application/x-profiledock-group");
    if (group) {
      if (group !== groupId) onReorder(group, groupId);
      return;
    }
    const key = e.dataTransfer.getData("application/x-profiledock-pin");
    if(key && before && stackTarget===before && canStack(key,before))onStack(key,before);
    else if (key) onMove(key, groupId, before);
  };
  return (
    <div className="pin-board">
      {groups.map((group, groupIndex) => (
        <section
          className={"pin-group " + (target === group.id ? "drop-target" : "")}
          key={group.id}
          aria-label={"Group " + group.name}
          onDragOver={(e) => {
            if (busy) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setTarget(group.id);
          }}
          onDrop={(e) => drop(e, group.id)}
        >
          <header
            className="pin-group-heading"
            draggable={!busy && editing !== group.id}
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/x-profiledock-group",
                group.id,
              );
              e.dataTransfer.effectAllowed = "move";
              setDragging(group.id);
            }}
            onDragEnd={() => {
              setDragging(null);
              setTarget(null);
            }}
          >
            <Icon name="grip-vertical" />
            {editing === group.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) {
                    onRename(group.id, draft.trim());
                    setEditing(null);
                  }
                }}
              >
                <input
                  autoFocus
                  aria-label="Group label"
                  maxLength={80}
                  value={draft}
                  placeholder={group.name}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setEditing(null);
                    }
                  }}
                />
                <button
                  className="icon-button"
                  aria-label="Save group label"
                  disabled={busy || !draft.trim()}
                >
                  <Icon name="check" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Cancel group label"
                  onClick={() => setEditing(null)}
                >
                  <Icon name="xmark" />
                </button>
              </form>
            ) : (
              <>
                <h2>{group.name}</h2>
                <small>{group.itemKeys.filter(visible).length}</small>
                <div className="group-actions">
                  <button
                    className="icon-button"
                    aria-label={"Move group " + group.name + " up"}
                    disabled={busy || groupIndex === 0}
                    onClick={() =>
                      onReorder(group.id, groups[groupIndex - 1].id)
                    }
                  >
                    <Icon name="arrow-up" />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"Move group " + group.name + " down"}
                    disabled={busy || groupIndex === groups.length - 1}
                    onClick={() =>
                      onReorder(group.id, groups[groupIndex + 2]?.id || "end")
                    }
                  >
                    <Icon name="arrow-down" />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={"Rename group " + group.name}
                    onClick={() => {
                      setDraft(group.name);
                      setEditing(group.id);
                    }}
                  >
                    <Icon name="pen" />
                  </button>
                  {group.id !== "ungrouped" && (
                    <button
                      className="icon-button"
                      aria-label={"Delete group " + group.name}
                      onClick={() => onDelete(group.id)}
                    >
                      <Icon name="trash-can" />
                    </button>
                  )}
                </div>
              </>
            )}
          </header>
          <div
            className={
              "bookmark-grid pin-items " +
              (layout === "list" ? "list-view" : "")
            }
          >
            {group.itemKeys.filter(visible).map((key) => (
              <div
                className={"pin-slot " + (dragging === key ? "dragging" : "")+(stackTarget===key?' stack-target':'')}
                data-pin-key={key}
                key={key}
                onKeyDown={(e) => {
                  if (e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
                    e.preventDefault();
                    const keys = group.itemKeys;
                    const index = keys.indexOf(key);
                    if (e.key === "ArrowLeft" && index > 0)
                      onMove(key, group.id, keys[index - 1]);
                    if (e.key === "ArrowRight" && index < keys.length - 1)
                      onMove(key, group.id, keys[index + 2]);
                  }
                }}
                draggable={!busy}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-profiledock-pin", key);
                  e.dataTransfer.effectAllowed = "move";
                  setDragging(key);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setTarget(null);
                  setStackTarget(null);
                }}
                onDragOver={(e) => {
                  if(busy)return;
                  e.preventDefault();
                  e.stopPropagation();
                  setTarget(group.id);
                  const rect=e.currentTarget.getBoundingClientRect();
                  const center=e.clientX>rect.left+rect.width*.2&&e.clientX<rect.right-rect.width*.2&&e.clientY>rect.top&&e.clientY<rect.bottom-rect.height*.15;
                  setStackTarget(dragging&&center&&canStack(dragging,key)?key:null);
                }}
                onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setStackTarget(null);}}
                onDrop={(e) => drop(e, group.id, key)}
              >
                {renderItem(key)}
              </div>
            ))}
          </div>
          {group.itemKeys.filter(visible).length === 0 && (
            <div className="empty-pin-group">
              {filtering
                ? "No matching pinned items"
                : "Drag pinned items here"}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
