// Feature-local hook for the saved-memories cluster: the entry list + tree, the
// MEMORY.md index, the preview toggle, and the manual create/edit/delete flow.
//
// Same paradigm as useMemoryConfig: transport is INJECTED as the slice port
// (bound by the wirer), pure logic is imported. Unlike config, this hook also
// takes runtime *coordination* the orchestrator supplies at call time — it does
// not own the flash pill, the config flags, or the editor modal, so those cross
// the boundary as small callbacks rather than inter-hook imports.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type {
  MemoryEntrySummary,
  MemoryListResponse,
  MemoryTreeNode,
  MemoryType,
} from '@open-design/contracts';
import { copyToClipboard } from '../../../runtime/clipboard';
import { memoryEntriesPort } from '../dependencies';
import type { MemoryEntriesPort } from '../ports';
import type { DraftEntry, FlashKind } from '../types';
import { EMPTY_DRAFT } from '../constants';

/** Runtime coordination the entries hook receives from the orchestrator: fire a
 *  flash pill, hydrate the config flags off the shared GET, and open/close the
 *  editor modal the orchestrator owns. */
export interface MemoryEntriesCoordination {
  fireFlash: (kind: FlashKind) => void;
  hydrateConfig: (list: MemoryListResponse) => void;
  openEditor: () => void;
  closeEditor: () => void;
}

export interface MemoryEntriesController {
  /** Non-null when the list/tree transport failed; callers retain prior state. */
  loadError?: string | null;
  entries: MemoryEntrySummary[];
  filtered: MemoryEntrySummary[];
  memoryTree: MemoryTreeNode[];
  treeFolders: MemoryTreeNode[];
  treeChildren: Map<string, MemoryTreeNode[]>;
  rootDir: string;
  index: string;
  indexDraft: string | null;
  setIndexDraft: Dispatch<SetStateAction<string | null>>;
  previewId: string | null;
  previewBody: string | null;
  editing: DraftEntry | null;
  setEditing: Dispatch<SetStateAction<DraftEntry | null>>;
  busy: boolean;
  filter: 'all' | MemoryType;
  setFilter: Dispatch<SetStateAction<'all' | MemoryType>>;
  editorRef: MutableRefObject<HTMLDivElement | null>;
  editorNameRef: MutableRefObject<HTMLInputElement | null>;
  reload: () => Promise<void>;
  onCopyPath: () => Promise<void>;
  openPreview: (id: string) => Promise<void>;
  startEdit: (id: string) => Promise<void>;
  startNew: () => void;
  cancelEdit: () => void;
  onSave: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSaveIndex: () => Promise<void>;
}

export function useMemoryEntries(
  port: MemoryEntriesPort,
  coord: MemoryEntriesCoordination,
): MemoryEntriesController {
  const { fireFlash, hydrateConfig, openEditor, closeEditor } = coord;

  const [rootDir, setRootDir] = useState('');
  const [index, setIndex] = useState('');
  const [indexDraft, setIndexDraft] = useState<string | null>(null);
  const [entries, setEntries] = useState<MemoryEntrySummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [memoryTree, setMemoryTree] = useState<MemoryTreeNode[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [editing, setEditing] = useState<DraftEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | MemoryType>('all');
  const editorRef = useRef<HTMLDivElement | null>(null);
  const editorNameRef = useRef<HTMLInputElement | null>(null);
  const editingTarget = editing?.id ?? (editing ? 'new' : null);

  useEffect(() => {
    if (!editingTarget) return;
    editorRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    editorNameRef.current?.focus({ preventScroll: true });
  }, [editingTarget]);

  const onCopyPath = useCallback(async () => {
    if (!rootDir) return;
    await copyToClipboard(rootDir);
    fireFlash('pathCopied');
  }, [rootDir, fireFlash]);

  const reload = useCallback(async () => {
    try {
      const list = await port.fetchMemoryList();
      // The flat list is the primary saved-memory surface. A tree is an
      // enhancement for hierarchy-aware rendering, so a transient tree
      // failure must not hide otherwise readable memories or their controls.
      let tree: MemoryTreeNode[] = [];
      try {
        tree = await port.fetchMemoryTree();
      } catch {
        // Keep the last confirmed list and render without tree affordances.
      }
      hydrateConfig(list);
      setRootDir(list.rootDir);
      setIndex(list.index);
      setEntries(list.entries);
      setMemoryTree(tree);
      setLoadError(null);
    } catch {
      // Do not invent an empty "success" response: leave the last confirmed
      // state intact and let the shell render this explicit failure instead.
      setLoadError("Memory data couldn't be loaded. Try again shortly.");
    }
  }, [port, hydrateConfig]);

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((e) => e.type === filter);
  }, [entries, filter]);

  const treeFolders = useMemo(
    () => memoryTree.filter((node) => node.kind === 'folder'),
    [memoryTree],
  );

  const treeChildren = useMemo(() => {
    const map = new Map<string, MemoryTreeNode[]>();
    for (const node of memoryTree) {
      if (node.kind !== 'entry' || !node.parentId) continue;
      const list = map.get(node.parentId) ?? [];
      list.push(node);
      map.set(node.parentId, list);
    }
    return map;
  }, [memoryTree]);

  const openPreview = useCallback(
    async (id: string) => {
      if (previewId === id) {
        setPreviewId(null);
        setPreviewBody(null);
        return;
      }
      setPreviewId(id);
      setPreviewBody(null);
      const entry = await port.fetchMemoryEntry(id);
      setPreviewBody(entry?.body ?? '');
    },
    [previewId, port],
  );

  const startEdit = useCallback(
    async (id: string) => {
      const entry = await port.fetchMemoryEntry(id);
      if (!entry) return;
      openEditor();
      setEditing({
        id: entry.id,
        name: entry.name,
        description: entry.description,
        type: entry.type,
        body: entry.body,
      });
    },
    [port, openEditor],
  );

  const startNew = useCallback(() => {
    openEditor();
    setEditing({ ...EMPTY_DRAFT });
  }, [openEditor]);

  const cancelEdit = useCallback(() => {
    setEditing(null);
  }, []);

  const onSave = useCallback(async () => {
    if (!editing) return;
    if (!editing.name.trim()) return;
    const wasNew = !editing.id;
    setBusy(true);
    try {
      const entry = await port.saveMemoryEntry(editing);
      if (entry) {
        await reload();
        setEditing(null);
        closeEditor();
        fireFlash(wasNew ? 'created' : 'saved');
      }
    } finally {
      setBusy(false);
    }
  }, [editing, reload, fireFlash, port, closeEditor]);

  const onDelete = useCallback(
    async (id: string) => {
      const ok = await port.deleteMemoryEntry(id);
      if (ok) {
        await reload();
        fireFlash('deleted');
      }
    },
    [reload, fireFlash, port],
  );

  const onSaveIndex = useCallback(async () => {
    if (indexDraft === null) return;
    setBusy(true);
    try {
      const ok = await port.saveMemoryIndex(indexDraft);
      if (ok) {
        setIndex(indexDraft);
        setIndexDraft(null);
        fireFlash('indexSaved');
      }
    } finally {
      setBusy(false);
    }
  }, [indexDraft, fireFlash, port]);

  return {
    loadError,
    entries,
    filtered,
    memoryTree,
    treeFolders,
    treeChildren,
    rootDir,
    index,
    indexDraft,
    setIndexDraft,
    previewId,
    previewBody,
    editing,
    setEditing,
    busy,
    filter,
    setFilter,
    editorRef,
    editorNameRef,
    reload,
    onCopyPath,
    openPreview,
    startEdit,
    startNew,
    cancelEdit,
    onSave,
    onDelete,
    onSaveIndex,
  };
}

/**
 * Wirer: binds the real entries transport and returns a hook that still takes
 * the orchestrator's runtime coordination. The default the orchestrator injects.
 */
export function useWiredMemoryEntries(
  coord: MemoryEntriesCoordination,
): MemoryEntriesController {
  return useMemoryEntries(memoryEntriesPort, coord);
}
