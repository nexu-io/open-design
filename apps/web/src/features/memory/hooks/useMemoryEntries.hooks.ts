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
import { createAsyncCommitGuard } from '../async-commit-guard';
import type { MemoryEntriesPort } from '../ports';
import type { DraftEntry, FlashKind } from '../types';
import { EMPTY_DRAFT } from '../constants';

/** Runtime coordination the entries hook receives from the orchestrator: fire a
 *  flash pill, hydrate the config flags off the shared GET, and open/close the
 *  editor modal the orchestrator owns. */
export interface MemoryEntriesCoordination {
  fireFlash: (kind: FlashKind) => void;
  captureConfigHydrationRevision: () => number;
  hydrateConfig: (list: MemoryListResponse, revision: number) => void;
  openEditor: () => void;
  closeEditor: () => void;
}

const LOAD_ERROR_MESSAGE = "Memory data couldn't be loaded. Try again shortly.";

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
  const {
    fireFlash,
    captureConfigHydrationRevision,
    hydrateConfig,
    openEditor,
    closeEditor,
  } = coord;

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
  // Each preview/edit action gets its own monotonic token, so a stale
  // fetchMemoryEntry() response can never win over a newer action — even one
  // that re-selects the SAME id (close then reopen, or cancel then restart
  // the same entry) while the abandoned request is still in flight. Tracking
  // by id alone can't distinguish that case since both requests share an id.
  const previewRequestTokenRef = useRef(0);
  const editRequestTokenRef = useRef(0);
  // reload() is the shared read path for mount, SSE change events, save/delete
  // flows, and connector refreshes, so overlapping calls are expected. Gate
  // every state commit behind a monotonic token so an older reload() that
  // resolves after a newer one can never overwrite the fresher snapshot.
  const reloadCommitGuardRef = useRef(createAsyncCommitGuard());

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
    const token = reloadCommitGuardRef.current.begin();
    const configHydrationRevision = captureConfigHydrationRevision();
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
      // A newer reload() already committed its snapshot; this older response
      // must not regress it (or hydrateConfig a just-succeeded toggle back).
      if (!reloadCommitGuardRef.current.isCurrent(token)) return;
      hydrateConfig(list, configHydrationRevision);
      setRootDir(list.rootDir);
      setIndex(list.index);
      setEntries(list.entries);
      setMemoryTree(tree);
      setLoadError(null);
    } catch {
      // Do not invent an empty "success" response: leave the last confirmed
      // state intact and let the shell render this explicit failure instead.
      if (!reloadCommitGuardRef.current.isCurrent(token)) return;
      setLoadError(LOAD_ERROR_MESSAGE);
    }
  }, [port, captureConfigHydrationRevision, hydrateConfig]);

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
        previewRequestTokenRef.current += 1;
        setPreviewId(null);
        setPreviewBody(null);
        return;
      }
      const token = ++previewRequestTokenRef.current;
      setPreviewId(id);
      setPreviewBody(null);
      let entry;
      try {
        // The port resolves null only for a genuine not-found; a 5xx/transport
        // failure rejects and must surface as a failed read, not render as an
        // empty preview.
        entry = await port.fetchMemoryEntry(id);
      } catch {
        // A stale request's failure must not clobber a newer action's state.
        if (previewRequestTokenRef.current !== token) return;
        setPreviewId(null);
        setPreviewBody(null);
        setLoadError(LOAD_ERROR_MESSAGE);
        return;
      }
      if (previewRequestTokenRef.current !== token) return;
      setPreviewBody(entry?.body ?? '');
    },
    [previewId, port],
  );

  const startEdit = useCallback(
    async (id: string) => {
      const token = ++editRequestTokenRef.current;
      let entry;
      try {
        entry = await port.fetchMemoryEntry(id);
      } catch {
        // A stale request's failure must not clobber a newer action's state.
        if (editRequestTokenRef.current !== token) return;
        setLoadError(LOAD_ERROR_MESSAGE);
        return;
      }
      if (!entry || editRequestTokenRef.current !== token) return;
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
    editRequestTokenRef.current += 1;
    openEditor();
    setEditing({ ...EMPTY_DRAFT });
  }, [openEditor]);

  const cancelEdit = useCallback(() => {
    editRequestTokenRef.current += 1;
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
