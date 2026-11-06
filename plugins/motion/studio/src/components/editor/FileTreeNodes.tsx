import { useI18n } from "../../i18n/I18n";
import { memo, useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  PencilSimple,
  Copy,
  Trash,
  FilePlus,
  FolderSimplePlus,
  FolderSimple,
} from "@phosphor-icons/react";
import { ChevronDown, ChevronRight } from "../../icons/SystemIcons";
import {
  FileIcon,
  buildTree as _buildTree,
  sortChildren,
  isActiveInSubtree,
  type TreeNode,
  type ContextMenuState,
  type InlineInputState,
  DIM,
} from "./FileTreeIcons";
import { menuClasses } from "../ui/menuStyle";

export type { ContextMenuState, InlineInputState };
export { buildTree, sortChildren, isActiveInSubtree } from "./FileTreeIcons";

const SZ_ICON = 14;
const ROW = `${menuClasses.row} ${menuClasses.rowEnabled} flex items-center gap-2 active:bg-neutral-700`;
const DANGER_ROW = `${menuClasses.row} ${menuClasses.rowDanger} flex items-center gap-2 active:bg-danger/25`;

// ── Context Menu Component ──

export function ContextMenu({
  state,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDuplicate,
  onDelete,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRename: (path: string) => void;
  onDuplicate: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const firstItem = menuRef.current?.querySelector("button");
    if (firstItem instanceof HTMLElement) firstItem.focus();
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      restoreFocusRef.current?.focus();
    };
  }, [onClose]);

  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    const menu = menuRef.current;
    if (!menu) return;
    e.preventDefault();
    const items = Array.from(menu.querySelectorAll("button"));
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = 0;
    if (e.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
    else if (e.key === "ArrowUp") {
      next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
    } else if (e.key === "End") next = items.length - 1;
    items[next]?.focus();
  };

  const adjustedX = Math.min(state.x, window.innerWidth - 180);
  const adjustedY = Math.min(state.y, window.innerHeight - 200);

  const parentPath = state.targetIsFolder
    ? state.targetPath
    : state.targetPath.includes("/")
      ? state.targetPath.slice(0, state.targetPath.lastIndexOf("/"))
      : "";

  return (
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={handleMenuKeyDown}
      className={`${menuClasses.panel} fixed z-50 min-w-[160px]`}
      style={{ left: adjustedX, top: adjustedY }}
    >
      {state.targetIsFolder && (
        <>
          <button
            role="menuitem"
            className={ROW}
            onClick={() => {
              onNewFile(state.targetPath);
              onClose();
            }}
          >
            <FilePlus size={12} weight="duotone" className="text-neutral-500" />
            {t("New File")}</button>
          <button
            role="menuitem"
            className={ROW}
            onClick={() => {
              onNewFolder(state.targetPath);
              onClose();
            }}
          >
            <FolderSimplePlus size={12} weight="duotone" className="text-neutral-500" />
            {t("New Folder")}</button>
          <div className={menuClasses.divider} />
        </>
      )}
      {!state.targetIsFolder && (
        <>
          <button
            role="menuitem"
            className={ROW}
            onClick={() => {
              onNewFile(parentPath);
              onClose();
            }}
          >
            <FilePlus size={12} weight="duotone" className="text-neutral-500" />
            {t("New File")}</button>
          <div className={menuClasses.divider} />
        </>
      )}
      <button
        role="menuitem"
        className={ROW}
        onClick={() => {
          onRename(state.targetPath);
          onClose();
        }}
      >
        <PencilSimple size={12} weight="duotone" className="text-neutral-500" />
        {t("Rename")}</button>
      {!state.targetIsFolder && (
        <button
          role="menuitem"
          className={ROW}
          onClick={() => {
            onDuplicate(state.targetPath);
            onClose();
          }}
        >
          <Copy size={12} weight="duotone" className="text-neutral-500" />
          {t("Duplicate")}</button>
      )}
      <div className={menuClasses.divider} />
      <button
        role="menuitem"
        className={DANGER_ROW}
        onClick={() => {
          onDelete(state.targetPath);
          onClose();
        }}
      >
        <Trash size={12} weight="duotone" />
        {t("Delete")}</button>
    </div>
  );
}

// ── Inline Input (for new file/folder/rename) ──

export function InlineInput({
  defaultValue,
  depth,
  isFolder,
  onCommit,
  onCancel,
}: {
  defaultValue: string;
  depth: number;
  isFolder: boolean;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);

  const validate = (name: string): string | null => {
    if (/[/\\]/.test(name)) return "Name can't contain / or \\";
    if (name.includes("..")) return "Name can't contain ..";
    return null;
  };

  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (defaultValue && defaultValue.includes(".")) {
      const dotIdx = defaultValue.lastIndexOf(".");
      el.setSelectionRange(0, dotIdx);
    } else {
      el.select();
    }
  }, [defaultValue]);

  const commit = (name: string) => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = value.trim();
      if (!trimmed) {
        onCancel();
        return;
      }
      const invalid = validate(trimmed);
      if (invalid) {
        setError(invalid);
        return;
      }
      commit(trimmed);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const handleBlur = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== defaultValue && !validate(trimmed)) commit(trimmed);
    else onCancel();
  };

  return (
    <div
      className="flex items-center gap-2 py-0.5 min-h-7"
      style={{ paddingLeft: `${8 + depth * 12 + (isFolder ? 0 : 14)}px` }}
    >
      {isFolder ? (
        <FolderSimple size={SZ_ICON} weight="duotone" className={`shrink-0 ${DIM}`} />
      ) : (
        <FileIcon path={value} />
      )}
      <div className="flex-1 min-w-0">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          aria-invalid={error ? true : undefined}
          className={`w-full min-w-0 bg-neutral-800 text-neutral-200 text-xs px-1.5 py-0.5 rounded border outline-hidden ${
            error ? "border-danger-ink" : "border-neutral-600 focus:border-accent-ink"
          }`}
          spellCheck={false}
        />
        {error && (
          <div className="mt-0.5 text-[10px] text-danger-ink" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Delete Confirmation ──

export function DeleteConfirm({
  name,
  isFolder,
  onConfirm,
  onCancel,
}: {
  name: string;
  isFolder?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onCancel]);

  return (
    <div
      ref={ref}
      className="mx-1 my-0.5 p-2 bg-neutral-800 border border-neutral-700 rounded-md text-xs"
    >
      <p className="text-neutral-300 mb-2">
        {isFolder ? (
          <>
            {t("Delete folder")}{" "}<span className="font-medium text-neutral-100">{name}</span> {t("and everything inside it?")}</>
        ) : (
          <>
            {t("Delete")}{" "}<span className="font-medium text-neutral-100">{name}</span>?
          </>
        )}
      </p>
      <div className="flex gap-1.5">
        <button
          onClick={onCancel}
          className="flex-1 px-2 py-1 rounded-sm bg-hover text-neutral-300 hover:bg-press transition-colors"
        >
          {t("Cancel")}</button>
        <button
          onClick={onConfirm}
          className="flex-1 px-2 py-1 rounded-sm bg-danger/15 text-danger-ink hover:bg-danger/25 transition-colors"
        >
          {t("Delete")}</button>
      </div>
    </div>
  );
}

// ── TreeFile ──

export const TreeFile = memo(function TreeFile({
  node,
  depth,
  activeFile,
  onSelectFile,
  onContextMenu,
  inlineInput,
  onDragStart,
  lintInfo,
}: {
  node: TreeNode;
  depth: number;
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string, isFolder: boolean) => void;
  inlineInput: InlineInputState | null;
  onDragStart: (e: React.DragEvent, path: string) => void;
  lintInfo?: { count: number; messages: string[] };
}) {
  const isActive = node.fullPath === activeFile;
  const isRenaming = inlineInput?.mode === "rename" && inlineInput.originalPath === node.fullPath;

  if (isRenaming) {
    return (
      <InlineInput
        defaultValue={inlineInput.originalName ?? node.name}
        depth={depth}
        isFolder={false}
        onCommit={(name) => {
          inlineInput?.onCommit?.(name);
        }}
        onCancel={() => {
          inlineInput?.onCancel?.();
        }}
      />
    );
  }

  return (
    <button
      draggable
      onDragStart={(e) => onDragStart(e, node.fullPath)}
      onClick={() => onSelectFile(node.fullPath)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, node.fullPath, false);
      }}
      className={`w-full flex items-center gap-2 py-1 min-h-7 text-left transition-all text-xs ${
        isActive
          ? "bg-neutral-800/60 text-neutral-200"
          : "text-neutral-500 hover:bg-neutral-800/30 hover:text-neutral-300"
      }`}
      style={{ paddingLeft: `${8 + depth * 12 + 14}px` }}
    >
      <FileIcon path={node.name} />
      <span className="truncate flex-1">{node.name}</span>
      {lintInfo && lintInfo.count > 0 && (
        <span
          className="shrink-0 min-w-[16px] rounded-full bg-amber-500/20 px-1 text-[8px] font-bold text-warning-ink text-center mr-1"
          title={lintInfo.messages.join("\n")}
        >
          {lintInfo.count}
        </span>
      )}
    </button>
  );
});

// ── TreeFolder ──

export const TreeFolder = memo(function TreeFolder({
  node,
  depth,
  activeFile,
  onSelectFile,
  defaultOpen,
  onContextMenu,
  inlineInput,
  onDragStart,
  onDragOver,
  onDrop,
  onDragLeave,
  dragOverFolder,
  lintFindingsByFile,
}: {
  node: TreeNode;
  depth: number;
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  defaultOpen: boolean;
  onContextMenu: (e: React.MouseEvent, path: string, isFolder: boolean) => void;
  inlineInput: InlineInputState | null;
  onDragStart: (e: React.DragEvent, path: string) => void;
  onDragOver: (e: React.DragEvent, folderPath: string) => void;
  onDrop: (e: React.DragEvent, folderPath: string) => void;
  onDragLeave: () => void;
  dragOverFolder: string | null;
  lintFindingsByFile?: Map<string, { count: number; messages: string[] }>;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const children = useMemo(() => sortChildren(node.children), [node.children]);
  const Chevron = isOpen ? ChevronDown : ChevronRight;
  const isDragOver = dragOverFolder === node.fullPath;
  const isRenaming = inlineInput?.mode === "rename" && inlineInput.originalPath === node.fullPath;

  if (isRenaming) {
    return (
      <InlineInput
        defaultValue={inlineInput.originalName ?? node.name}
        depth={depth}
        isFolder={true}
        onCommit={(name) => {
          inlineInput?.onCommit?.(name);
        }}
        onCancel={() => {
          inlineInput?.onCancel?.();
        }}
      />
    );
  }

  return (
    <>
      <button
        draggable
        onDragStart={(e) => onDragStart(e, node.fullPath)}
        onClick={toggle}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e, node.fullPath, true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragOver(e, node.fullPath);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDrop(e, node.fullPath);
        }}
        onDragLeave={onDragLeave}
        className={`w-full flex items-center gap-1.5 px-2.5 py-1 min-h-7 text-left text-xs text-neutral-400 hover:bg-neutral-800/30 hover:text-neutral-300 transition-colors ${
          isDragOver
            ? "bg-accent/10 outline-solid outline-1 outline-accent-ink -outline-offset-1"
            : ""
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <Chevron size={10} className="shrink-0 text-neutral-600" />
        <span className="truncate font-medium">{node.name}</span>
      </button>
      {isOpen && (
        <>
          {inlineInput &&
            (inlineInput.mode === "new-file" || inlineInput.mode === "new-folder") &&
            inlineInput.parentPath === node.fullPath && (
              <InlineInput
                defaultValue=""
                depth={depth + 1}
                isFolder={inlineInput.mode === "new-folder"}
                onCommit={(name) => {
                  inlineInput?.onCommit?.(name);
                }}
                onCancel={() => {
                  inlineInput?.onCancel?.();
                }}
              />
            )}
          {children.map((child) =>
            child.isFile && child.children.size === 0 ? (
              <TreeFile
                key={child.fullPath}
                node={child}
                depth={depth + 1}
                activeFile={activeFile}
                onSelectFile={onSelectFile}
                onContextMenu={onContextMenu}
                inlineInput={inlineInput}
                onDragStart={onDragStart}
                lintInfo={lintFindingsByFile?.get(child.fullPath)}
              />
            ) : child.children.size > 0 ? (
              <TreeFolder
                key={child.fullPath}
                node={child}
                depth={depth + 1}
                activeFile={activeFile}
                onSelectFile={onSelectFile}
                defaultOpen={isActiveInSubtree(child, activeFile)}
                onContextMenu={onContextMenu}
                inlineInput={inlineInput}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragLeave={onDragLeave}
                dragOverFolder={dragOverFolder}
                lintFindingsByFile={lintFindingsByFile}
              />
            ) : (
              <TreeFile
                key={child.fullPath}
                node={child}
                depth={depth + 1}
                activeFile={activeFile}
                onSelectFile={onSelectFile}
                onContextMenu={onContextMenu}
                inlineInput={inlineInput}
                onDragStart={onDragStart}
                lintInfo={lintFindingsByFile?.get(child.fullPath)}
              />
            ),
          )}
        </>
      )}
    </>
  );
});
