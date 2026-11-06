import { useI18n } from "../../i18n/I18n";
import { memo, useState, useCallback, useMemo, useRef } from "react";
import { Plus, FolderSimplePlus } from "@phosphor-icons/react";
import {
  buildTree,
  sortChildren,
  isActiveInSubtree,
  ContextMenu,
  InlineInput,
  DeleteConfirm,
  TreeFile,
  TreeFolder,
  type ContextMenuState,
  type InlineInputState,
} from "./FileTreeNodes";

// ── Types ──

interface FileTreeProps {
  files: string[];
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onCreateFile?: (path: string) => void;
  onCreateFolder?: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;
  onDuplicateFile?: (path: string) => void;
  onMoveFile?: (oldPath: string, newPath: string) => void;
  onImportFiles?: (files: FileList, dir?: string) => void;
  lintFindingsByFile?: Map<string, { count: number; messages: string[] }>;
}

// ── Main FileTree Component ──

export const FileTree = memo(function FileTree({
  files,
  activeFile,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onRenameFile,
  onDuplicateFile,
  onMoveFile,
  onImportFiles,
  lintFindingsByFile,
}: FileTreeProps) {
  const { t } = useI18n();
  const tree = useMemo(() => buildTree(files), [files]);
  const children = useMemo(() => sortChildren(tree.children), [tree]);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [inlineInput, setInlineInput] = useState<InlineInputState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    path: string;
    isFolder: boolean;
    x: number;
    y: number;
  } | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const dragSourceRef = useRef<string | null>(null);

  const hasFileOps = !!(
    onCreateFile ||
    onCreateFolder ||
    onDeleteFile ||
    onRenameFile ||
    onDuplicateFile
  );

  // ── Context Menu handlers ──

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, path: string, isFolder: boolean) => {
      if (!hasFileOps) return;
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, targetPath: path, targetIsFolder: isFolder });
    },
    [hasFileOps],
  );

  const handleCloseContextMenu = useCallback(() => setContextMenu(null), []);

  // ── New File ──

  const handleNewFile = useCallback(
    (parentPath: string) => {
      setInlineInput({
        parentPath,
        mode: "new-file",
        onCommit: (name: string) => {
          const fullPath = parentPath ? `${parentPath}/${name}` : name;
          onCreateFile?.(fullPath);
          setInlineInput(null);
        },
        onCancel: () => setInlineInput(null),
      });
    },
    [onCreateFile],
  );

  // ── New Folder ──

  const handleNewFolder = useCallback(
    (parentPath: string) => {
      setInlineInput({
        parentPath,
        mode: "new-folder",
        onCommit: (name: string) => {
          const fullPath = parentPath ? `${parentPath}/${name}` : name;
          onCreateFolder?.(fullPath);
          setInlineInput(null);
        },
        onCancel: () => setInlineInput(null),
      });
    },
    [onCreateFolder],
  );

  // ── Rename ──

  const handleRename = useCallback(
    (path: string) => {
      const name = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
      const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      setInlineInput({
        parentPath,
        mode: "rename",
        originalPath: path,
        originalName: name,
        onCommit: (newName: string) => {
          if (newName !== name) {
            const newPath = parentPath ? `${parentPath}/${newName}` : newName;
            onRenameFile?.(path, newPath);
          }
          setInlineInput(null);
        },
        onCancel: () => setInlineInput(null),
      });
    },
    [onRenameFile],
  );

  // ── Duplicate ──

  const handleDuplicate = useCallback(
    (path: string) => {
      onDuplicateFile?.(path);
    },
    [onDuplicateFile],
  );

  // ── Delete ──

  const handleDelete = useCallback(
    (path: string) => {
      // Anchor the confirm near where the context menu was opened so it
      // appears next to the row the user acted on.
      setDeleteTarget({
        path,
        isFolder: contextMenu?.targetIsFolder ?? false,
        x: contextMenu?.x ?? window.innerWidth / 2,
        y: contextMenu?.y ?? window.innerHeight / 2,
      });
    },
    [contextMenu],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (deleteTarget) {
      onDeleteFile?.(deleteTarget.path);
      setDeleteTarget(null);
    }
  }, [deleteTarget, onDeleteFile]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  // ── Drag and Drop ──

  const handleDragStart = useCallback((e: React.DragEvent, path: string) => {
    dragSourceRef.current = path;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", path);
  }, []);

  const handleDragOver = useCallback((_e: React.DragEvent, folderPath: string) => {
    setDragOverFolder(folderPath);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, folderPath: string) => {
      if (e.dataTransfer.files.length > 0 && !dragSourceRef.current) {
        e.preventDefault();
        onImportFiles?.(e.dataTransfer.files, folderPath || undefined);
        setDragOverFolder(null);
        return;
      }

      const sourcePath = dragSourceRef.current;
      if (!sourcePath || !onMoveFile) {
        setDragOverFolder(null);
        return;
      }
      const fileName = sourcePath.includes("/")
        ? sourcePath.slice(sourcePath.lastIndexOf("/") + 1)
        : sourcePath;
      const newPath = folderPath ? `${folderPath}/${fileName}` : fileName;
      if (newPath !== sourcePath && !folderPath.startsWith(sourcePath + "/")) {
        onMoveFile(sourcePath, newPath);
      }
      setDragOverFolder(null);
      dragSourceRef.current = null;
    },
    [onMoveFile, onImportFiles],
  );

  const handleDragLeave = useCallback(() => {
    setDragOverFolder(null);
  }, []);

  // ── Root-level context menu (right-click on empty space) ──

  const handleRootContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!hasFileOps) return;
      if (e.target === e.currentTarget) {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, targetPath: "", targetIsFolder: true });
      }
    },
    [hasFileOps],
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* FILES header with action buttons */}
      {hasFileOps && (
        <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-neutral-800/50 shrink-0">
          <span className="text-[10px] font-semibold tracking-wider text-neutral-600 uppercase">
            {t("Files")}</span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => handleNewFile("")}
              className="p-1.5 rounded-sm hover:bg-neutral-800 text-neutral-600 hover:text-neutral-400 active:scale-[0.97] transition-colors"
              title={t("New File")}
              aria-label={t("New File")}
            >
              <Plus size={12} weight="bold" />
            </button>
            <button
              onClick={() => handleNewFolder("")}
              className="p-1.5 rounded-sm hover:bg-neutral-800 text-neutral-600 hover:text-neutral-400 active:scale-[0.97] transition-colors"
              title={t("New Folder")}
              aria-label={t("New Folder")}
            >
              <FolderSimplePlus size={12} weight="duotone" />
            </button>
          </div>
        </div>
      )}

      <div
        className={`flex-1 overflow-y-auto py-1 transition-colors ${
          dragOverFolder === ""
            ? "bg-accent/5 outline-solid outline-1 outline-accent-ink -outline-offset-1"
            : ""
        }`}
        onContextMenu={handleRootContextMenu}
        onDragOver={(e) => {
          e.preventDefault();
          if (e.target === e.currentTarget) setDragOverFolder("");
        }}
        onDragLeave={(e) => {
          if (e.target === e.currentTarget) setDragOverFolder(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleDrop(e, "");
        }}
      >
        {/* Root-level inline input for new file/folder */}
        {inlineInput &&
          (inlineInput.mode === "new-file" || inlineInput.mode === "new-folder") &&
          inlineInput.parentPath === "" && (
            <InlineInput
              defaultValue=""
              depth={0}
              isFolder={inlineInput.mode === "new-folder"}
              onCommit={(name) => inlineInput.onCommit?.(name)}
              onCancel={() => inlineInput.onCancel?.()}
            />
          )}
        {children.length === 0 && !inlineInput && (
          <div className="px-3 py-4 text-center text-[11px] text-neutral-600">
            {t("No files yet")}{hasFileOps ? t(". Use + above to create one") : ""}.
          </div>
        )}
        {children.map((child) =>
          child.isFile && child.children.size === 0 ? (
            <TreeFile
              key={child.fullPath}
              node={child}
              depth={0}
              activeFile={activeFile}
              onSelectFile={onSelectFile}
              onContextMenu={handleContextMenu}
              inlineInput={inlineInput}
              onDragStart={handleDragStart}
              lintInfo={lintFindingsByFile?.get(child.fullPath)}
            />
          ) : (
            <TreeFolder
              key={child.fullPath}
              node={child}
              depth={0}
              activeFile={activeFile}
              onSelectFile={onSelectFile}
              defaultOpen={isActiveInSubtree(child, activeFile)}
              onContextMenu={handleContextMenu}
              inlineInput={inlineInput}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragLeave={handleDragLeave}
              dragOverFolder={dragOverFolder}
              lintFindingsByFile={lintFindingsByFile}
            />
          ),
        )}
      </div>

      {/* Delete confirmation — anchored near the row it was invoked on */}
      {deleteTarget && (
        <div
          className="fixed z-50 w-56"
          style={{
            left: Math.min(deleteTarget.x, window.innerWidth - 240),
            top: Math.min(deleteTarget.y, window.innerHeight - 120),
          }}
        >
          <DeleteConfirm
            name={
              deleteTarget.path.includes("/")
                ? deleteTarget.path.slice(deleteTarget.path.lastIndexOf("/") + 1)
                : deleteTarget.path
            }
            isFolder={deleteTarget.isFolder}
            onConfirm={handleDeleteConfirm}
            onCancel={handleDeleteCancel}
          />
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={handleCloseContextMenu}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRename={handleRename}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
});
