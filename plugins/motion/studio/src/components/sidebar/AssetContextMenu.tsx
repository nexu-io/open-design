import { useI18n } from "../../i18n/I18n";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { filename } from "./assetHelpers";
import { menuClasses } from "../ui/menuStyle";

/** Reject names that would escape the asset directory or break paths. */
function isValidAssetName(name: string): boolean {
  return name.length > 0 && !/[/\\]/.test(name) && !name.includes("..");
}

// fallow-ignore-next-line complexity
export function ContextMenu({
  x,
  y,
  asset,
  onClose,
  onCopy,
  onDelete,
  onRename,
  onAddAtPlayhead,
  onPreview,
  downloadUrl,
}: {
  x: number;
  y: number;
  asset: string;
  onClose: () => void;
  onCopy: (path: string) => void;
  onDelete?: (path: string) => void;
  onRename?: (oldPath: string, newPath: string) => void;
  onAddAtPlayhead?: (path: string) => void;
  onPreview?: (path: string) => void;
  downloadUrl?: string;
}) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [mode, setMode] = useState<"menu" | "confirm-delete" | "rename">("menu");
  const [renameDraft, setRenameDraft] = useState(() => filename(asset));
  const [renameError, setRenameError] = useState<string | null>(null);

  // Clamp the menu inside the viewport once it has a size.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    setPos({
      x: Math.min(x, window.innerWidth - rect.width - margin),
      y: Math.min(y, window.innerHeight - rect.height - margin),
    });
  }, [x, y, mode]);

  // Keyboard contract: Escape backs out one level (rename/delete-confirm →
  // menu → closed), arrows move between menu items.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (mode !== "menu") {
          setMode("menu");
        } else {
          onClose();
        }
        return;
      }
      if (mode !== "menu" || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );
      if (items.length === 0) return;
      e.preventDefault();
      const idx = items.findIndex((el) => el === document.activeElement);
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const next = items[(idx + delta + items.length) % items.length];
      next.focus();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [mode, onClose]);

  // Move focus into the menu on open so arrow keys work immediately.
  useEffect(() => {
    if (mode === "menu") {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }
  }, [mode]);

  const commitRename = useCallback(() => {
    const trimmed = renameDraft.trim();
    if (trimmed === filename(asset)) {
      onClose();
      return;
    }
    if (!isValidAssetName(trimmed)) {
      setRenameError("Name can't contain / or ..");
      return;
    }
    const dir = asset.includes("/") ? asset.slice(0, asset.lastIndexOf("/") + 1) : "";
    onRename?.(asset, `${dir}${trimmed}`);
    onClose();
  }, [renameDraft, asset, onRename, onClose]);

  const itemCls = `${menuClasses.row} ${menuClasses.rowEnabled} active:bg-neutral-700/70 transition-colors`;

  return (
    <div
      className="fixed inset-0 z-200"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        role="menu"
        aria-label={t("Actions for {value0}", { value0: filename(asset) })}
        className={`${menuClasses.panel} absolute min-w-[160px] text-xs`}
        style={{ left: pos.x, top: pos.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "menu" && (
          <>
            {onPreview && <button role="menuitem" className={itemCls} onClick={() => { onPreview(asset); onClose(); }}>{t("Show in preview")}</button>}
            {onAddAtPlayhead && (
              <button
                role="menuitem"
                onClick={() => {
                  onAddAtPlayhead(asset);
                  onClose();
                }}
                className={itemCls}
              >
                {t("Add at playhead")}</button>
            )}
            <button
              role="menuitem"
              onClick={() => {
                onCopy(asset);
                onClose();
              }}
              className={itemCls}
            >
              {t("Copy path")}</button>
            {downloadUrl && <a role="menuitem" className={itemCls} href={downloadUrl} download={filename(asset)} onClick={onClose}>{t("Download file")}</a>}
            {onRename && (
              <button role="menuitem" onClick={() => setMode("rename")} className={itemCls}>
                {t("Rename")}</button>
            )}
            {onDelete && (
              <button
                role="menuitem"
                onClick={() => setMode("confirm-delete")}
                className={`${menuClasses.row} ${menuClasses.rowDanger} active:bg-neutral-700/70 transition-colors`}
              >
                {t("Delete")}</button>
            )}
          </>
        )}
        {mode === "confirm-delete" && (
          <DeleteConfirm
            name={filename(asset)}
            onConfirm={() => {
              onDelete?.(asset);
              onClose();
            }}
            onCancel={() => setMode("menu")}
          />
        )}
        {mode === "rename" && (
          <div className="px-2 py-1.5 flex flex-col gap-1">
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => {
                setRenameDraft(e.target.value);
                setRenameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setMode("menu");
                }
              }}
              aria-label={t("Rename {value0}", { value0: filename(asset) })}
              className="w-full bg-neutral-800 border border-neutral-600 rounded-sm px-1.5 py-1 text-[11px] text-text-0 focus:border-studio-accent/60 focus:outline-hidden"
            />
            {renameError && <span className="text-[10px] text-danger-ink">{renameError}</span>}
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => setMode("menu")}
                className="px-2 py-0.5 text-[10px] rounded-sm text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                {t("Cancel")}</button>
              <button
                onClick={commitRename}
                className="px-2 py-0.5 text-[10px] rounded-sm bg-accent hover:bg-accent-hover text-on-accent transition-colors"
              >
                {t("Rename")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeleteConfirm({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="px-2 py-1.5 bg-danger/15 border-l-2 border-red-500 flex items-center justify-between gap-2">
      <span className="text-[10px] text-danger-ink truncate">{t("Delete")}{" "}{name}?</span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onConfirm}
          className="px-2 py-0.5 text-[10px] rounded-sm bg-danger text-on-danger hover:brightness-95 active:brightness-90 transition-colors"
        >
          {t("Delete")}</button>
        <button
          onClick={onCancel}
          className="px-2 py-0.5 text-[10px] rounded-sm text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          {t("Cancel")}</button>
      </div>
    </div>
  );
}
