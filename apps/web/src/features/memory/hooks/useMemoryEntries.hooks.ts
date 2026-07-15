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
const MUTATION_ERROR_MESSAGE = "Memory changes couldn't be saved. Try again shortly.";

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
  const [editing, setEditingState] = useState<DraftEntry | null>(null);
  // The editor can remain interactive while a save is on the wire. Every edit
  // change gets a revision, allowing the save completion to close only the
  // exact draft it persisted rather than dismissing a newer draft.
  const editingRevisionRef = useRef(0);
  const setEditing = useCallback<Dispatch<SetStateAction<DraftEntry | null>>>((next) => {
    editingRevisionRef.current += 1;
    setEditingState(next);
  }, []);
  const [busy, setBusy] = useState(false);
  // Entry and index writes can overlap after the user switches tabs. Keep the
  // shared `busy` signal true until ALL writes finish, rather than letting the
  // first completion re-enable controls while another request is still live.
  const busyOperationCountRef = useRef(0);
  const beginBusy = useCallback(() => {
    busyOperationCountRef.current += 1;
    setBusy(true);
  }, []);
  const endBusy = useCallback(() => {
    busyOperationCountRef.current -= 1;
    if (busyOperationCountRef.current <= 0) {
      busyOperationCountRef.current = 0;
      setBusy(false);
    }
  }, []);
  const entrySaveInFlightRef = useRef(false);
  const indexSaveInFlightRef = useRef(false);
  const deletingEntryIdsRef = useRef<Set<string>>(new Set());
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
    try {
      await copyToClipboard(rootDir);
      fireFlash('pathCopied');
    } catch {
      // The shared helper already falls back when Clipboard API access is
      // denied, but that fallback can still fail in a locked-down document.
      // Keep this user-triggered callback from escaping as an unhandled
      // rejection, and do not claim success with a copy flash.
      setLoadError(LOAD_ERROR_MESSAGE);
    }
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
      setLoadError(null);
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
      if (editRequestTokenRef.current !== token) return;
      setLoadError(null);
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
    [port, openEditor, setEditing],
  );

  const startNew = useCallback(() => {
    editRequestTokenRef.current += 1;
    openEditor();
    setEditing({ ...EMPTY_DRAFT });
  }, [openEditor, setEditing]);

  const cancelEdit = useCallback(() => {
    editRequestTokenRef.current += 1;
    setEditing(null);
  }, [setEditing]);

  const onSave = useCallback(async () => {
    if (!editing) return;
    if (!editing.name.trim()) return;
    if (entrySaveInFlightRef.current) return;
    entrySaveInFlightRef.current = true;
    const wasNew = !editing.id;
    const editingRevision = editingRevisionRef.current;
    beginBusy();
    try {
      const entry = await port.saveMemoryEntry(editing);
      if (!entry) {
        // A resolved `null` is the port's ordinary non-2xx failure signal.
        // Treat it as a visible failure, like a thrown transport error, rather
        // than making a click appear to do nothing.
        setLoadError(MUTATION_ERROR_MESSAGE);
        return;
      }
      await reload();
      if (editingRevisionRef.current === editingRevision) {
        setEditing(null);
        closeEditor();
      }
      fireFlash(wasNew ? 'created' : 'saved');
    } catch {
      // A thrown save (as opposed to a resolved `null` failure) must still
      // surface as a load error instead of propagating as an unhandled
      // rejection with no user-visible feedback at all.
      setLoadError(LOAD_ERROR_MESSAGE);
    } finally {
      entrySaveInFlightRef.current = false;
      endBusy();
    }
  }, [editing, reload, fireFlash, port, closeEditor, setEditing, beginBusy, endBusy]);

  const onDelete = useCallback(
    async (id: string) => {
      if (deletingEntryIdsRef.current.has(id)) return;
      deletingEntryIdsRef.current.add(id);
      try {
        const ok = await port.deleteMemoryEntry(id);
        if (ok) {
          await reload();
          fireFlash('deleted');
        } else {
          setLoadError(MUTATION_ERROR_MESSAGE);
        }
      } catch {
        setLoadError(LOAD_ERROR_MESSAGE);
      } finally {
        deletingEntryIdsRef.current.delete(id);
      }
    },
    [reload, fireFlash, port],
  );

  const onSaveIndex = useCallback(async () => {
    if (indexDraft === null) return;
    if (indexSaveInFlightRef.current) return;
    indexSaveInFlightRef.current = true;
    const savedDraft = indexDraft;
    beginBusy();
    try {
      const ok = await port.saveMemoryIndex(savedDraft);
      if (ok) {
        setIndex(savedDraft);
        // Only clear the draft if the user hasn't already typed a NEWER,
        // still-unsaved edit while this save was in flight — a stale closure
        // unconditionally clearing here would silently discard that edit
        // even though it was never sent to the server.
        setIndexDraft((current) => (current === savedDraft ? null : current));
        setLoadError(null);
        fireFlash('indexSaved');
      } else {
        setLoadError(MUTATION_ERROR_MESSAGE);
      }
    } catch {
      setLoadError(LOAD_ERROR_MESSAGE);
    } finally {
      indexSaveInFlightRef.current = false;
      endBusy();
    }
  }, [indexDraft, fireFlash, port, beginBusy, endBusy]);

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
