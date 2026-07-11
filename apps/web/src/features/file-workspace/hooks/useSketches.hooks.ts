// Feature-local hook for the file-workspace sketch cluster: sketch tab state
// (load/save/autosave/export), the pending → persisted-tab promotion on first
// save, and the mutation helpers the tab-close/delete/rename flows need to
// keep a sketch's local state in sync with the file it maps to.
//
// Transport is INJECTED as the slice port (`SketchesPort`). Tab-state
// coordination (reading/committing the persisted tab list, activating a tab,
// refreshing files/folders) is genuinely owned by the orchestrator's
// not-yet-extracted tab-state cluster, so it is threaded through as PARAMS —
// this hook calls back into it rather than reimplementing it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  emptySketchScene,
  parseSketchWorkspaceDocument,
  serializeExcalidrawSketchScene,
  type ExcalidrawSketchScene,
} from '../../../components/sketch-model';
import type { ProjectFile, ProjectFolder } from '../../../types';
import { sketchesPort } from '../dependencies';
import type { SketchesPort } from '../ports';
import {
  defaultSketchState,
  isSketchName,
  loadedSketchStateFromDocument,
  mergeSketchSaveOptions,
  parentDirForProjectFile,
  shouldKeepCurrentSketchState,
  sketchFileSourceKey,
} from '../rules';
import { SKETCH_AUTOSAVE_DELAY_MS, DESIGN_FILES_TAB } from '../constants';
import type {
  PendingSketchSave,
  QueuedSketchAutosave,
  SaveSketchOptions,
  SketchState,
  TranslateFn,
} from '../types';

export interface SketchesController {
  sketches: Record<string, SketchState>;
  setSketchScene: (
    name: string,
    scene: ExcalidrawSketchScene,
    options?: { markDirty?: boolean; discardLegacyItems?: boolean },
  ) => void;
  clearSketch: (name: string) => void;
  saveSketch: (
    name: string,
    sceneOverride?: ExcalidrawSketchScene,
    options?: SaveSketchOptions,
    revisionOverride?: number,
  ) => Promise<boolean | undefined>;
  exportSketchImage: (
    sketchName: string,
    base64: string,
    imageFileName: string,
  ) => Promise<{ fileName: string } | false>;
  startNewSketch: () => Promise<void>;
  /** Drop a never-saved sketch's local entry (its tab close/reject path). */
  discardPendingSketchEntry: (name: string) => void;
  /** The tab-close path for an already-persisted (or absent) sketch entry. */
  pruneClosedSketchEntry: (name: string) => void;
  /** Drop a single sketch's local entry (file-delete path). */
  removeSketchEntry: (name: string) => void;
  /** Drop several sketches' local entries at once (bulk file-delete path). */
  removeSketchEntries: (names: string[]) => void;
  /** Carry a sketch's local entry over to its new name (file-rename path). */
  renameSketchEntry: (oldName: string, renamed: ProjectFile) => void;
}

export interface UseSketchesParams {
  projectId: string;
  uploadDir: string;
  activeTab: string;
  visibleFiles: ProjectFile[];
  t: TranslateFn;
  setActiveTab: (name: string) => void;
  onRefreshFiles: () => Promise<void> | void;
  refreshProjectFolders: () => Promise<ProjectFolder[]>;
  onUploadError: (message: string | null) => void;
  getCurrentTabs: () => string[];
  getCurrentActive: () => string | null;
  commitTabs: (nextTabs: string[], nextActive: string | null) => void;
}

export function useSketches(port: SketchesPort, params: UseSketchesParams): SketchesController {
  const {
    projectId,
    uploadDir,
    activeTab,
    visibleFiles,
    t,
    setActiveTab,
    onRefreshFiles,
    refreshProjectFolders,
    onUploadError,
    getCurrentTabs,
    getCurrentActive,
    commitTabs,
  } = params;

  const [sketches, setSketches] = useState<Record<string, SketchState>>({});
  const sketchesRef = useRef<Record<string, SketchState>>({});
  sketchesRef.current = sketches;
  const activeProjectIdRef = useRef(projectId);
  activeProjectIdRef.current = projectId;
  const sketchAutosaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const sketchAutosaveDraftsRef = useRef<Map<string, QueuedSketchAutosave>>(new Map());
  const sketchSceneRevisionRef = useRef<Map<string, number>>(new Map());
  const sketchSaveInFlightRef = useRef<Set<string>>(new Set());
  const pendingSketchSavesRef = useRef<Map<string, PendingSketchSave>>(new Map());
  const flushPendingSketchAutosavesRef = useRef<() => void>(() => {});
  const sketchPreloadInFlightRef = useRef<Map<string, Promise<boolean>>>(new Map());

  const sketchFiles = useMemo(
    () => visibleFiles.filter((file) => isSketchName(file.name)),
    [visibleFiles],
  );

  const loadSketchFile = useCallback((file: ProjectFile): Promise<boolean> => {
    const sourceKey = sketchFileSourceKey(projectId, file);
    const startedRevision = sketchSceneRevisionRef.current.get(file.name) ?? 0;
    const current = sketchesRef.current[file.name];
    if (shouldKeepCurrentSketchState(current, file.name, sourceKey, sketchSaveInFlightRef.current)) {
      return Promise.resolve(true);
    }
    const existing = sketchPreloadInFlightRef.current.get(sourceKey);
    if (existing) return existing;

    const inFlight = { promise: null as Promise<boolean> | null };
    const promise = (async () => {
      try {
        const text = await port.fetchProjectFileText(projectId, file.name);
        const doc = parseSketchWorkspaceDocument(text);
        if (activeProjectIdRef.current !== projectId) return false;
        setSketches((curr) => {
          const activeRevision = sketchSceneRevisionRef.current.get(file.name) ?? 0;
          if (activeRevision !== startedRevision) return curr;
          const existingState = curr[file.name];
          if (shouldKeepCurrentSketchState(existingState, file.name, sourceKey, sketchSaveInFlightRef.current)) {
            return curr;
          }
          sketchSceneRevisionRef.current.set(file.name, 0);
          return {
            ...curr,
            [file.name]: loadedSketchStateFromDocument(doc, sourceKey),
          };
        });
        return true;
      } catch (err) {
        console.warn('[FileWorkspace] sketch load failed', file.name, err);
        return false;
      } finally {
        if (sketchPreloadInFlightRef.current.get(sourceKey) === inFlight.promise) {
          sketchPreloadInFlightRef.current.delete(sourceKey);
        }
      }
    })();
    inFlight.promise = promise;
    sketchPreloadInFlightRef.current.set(sourceKey, promise);
    return promise;
  }, [port, projectId]);

  useEffect(() => {
    sketchPreloadInFlightRef.current.clear();
  }, [projectId]);

  useEffect(() => {
    return () => {
      flushPendingSketchAutosavesRef.current();
      sketchSceneRevisionRef.current.clear();
    };
  }, []);

  useEffect(() => {
    return port.subscribePageUnload(() => flushPendingSketchAutosavesRef.current());
  }, [port]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const file of sketchFiles) {
        if (cancelled) return;
        await loadSketchFile(file);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSketchFile, sketchFiles]);

  const activeSketchFile = useMemo(() => {
    if (!isSketchName(activeTab)) return null;
    return visibleFiles.find((file) => file.name === activeTab) ?? null;
  }, [activeTab, visibleFiles]);
  const activeSketchSourceKey = activeSketchFile ? sketchFileSourceKey(projectId, activeSketchFile) : null;
  const activeSketchEntry = isSketchName(activeTab) ? sketches[activeTab] : undefined;
  const activeSketchLoaded = Boolean(
    activeSketchEntry?.loaded
    && (
      !activeSketchEntry.persisted
      || (activeSketchSourceKey !== null && activeSketchEntry.sourceKey === activeSketchSourceKey)
    ),
  );

  useEffect(() => {
    if (activeTab === DESIGN_FILES_TAB) return;
    if (!isSketchName(activeTab)) return;
    if (activeSketchLoaded) return;
    if (!activeSketchFile) return;
    void loadSketchFile(activeSketchFile);
  }, [activeSketchFile, activeSketchLoaded, activeTab, loadSketchFile]);

  // The save/autosave functions below are mutually recursive (saveSketch <->
  // runSketchSave, queueSketchAutosave -> saveSketch) so they stay plain
  // function declarations (hoisted, redefined fresh every render) instead of
  // useCallback — matching the original component's shape and sidestepping
  // any TDZ ordering concern between them.
  function setSketchScene(
    name: string,
    scene: ExcalidrawSketchScene,
    options: { markDirty?: boolean; discardLegacyItems?: boolean } = {},
  ) {
    sketchSceneRevisionRef.current.set(name, (sketchSceneRevisionRef.current.get(name) ?? 0) + 1);
    setSketches((curr) => ({
      ...curr,
      [name]: {
        ...(curr[name] ?? {
          version: 1,
          rawItems: [],
          discardRawItemsOnSave: false,
          items: [],
          scene: emptySketchScene(name),
          persisted: false,
          loaded: true,
          saving: false,
        }),
        scene,
        items: options.discardLegacyItems ? [] : (curr[name]?.items ?? []),
        dirty: options.markDirty === false ? (curr[name]?.dirty ?? false) : true,
        discardRawItemsOnSave: options.discardLegacyItems ?? curr[name]?.discardRawItemsOnSave ?? false,
      } as SketchState,
    }));
    if (options.markDirty !== false) {
      queueSketchAutosave(name, scene);
    }
  }

  function clearSketch(name: string) {
    const scene = emptySketchScene(name);
    sketchSceneRevisionRef.current.set(name, (sketchSceneRevisionRef.current.get(name) ?? 0) + 1);
    setSketches((curr) => ({
      ...curr,
      [name]: {
        ...(curr[name] ?? {
          version: 1,
          rawItems: [],
          discardRawItemsOnSave: false,
          items: [],
          scene: emptySketchScene(name),
          persisted: false,
          loaded: true,
          saving: false,
        }),
        items: [],
        scene,
        dirty: true,
        discardRawItemsOnSave: true,
      } as SketchState,
    }));
    queueSketchAutosave(name, scene);
  }

  async function saveSketch(
    name: string,
    sceneOverride?: ExcalidrawSketchScene,
    options: SaveSketchOptions = {},
    revisionOverride?: number,
  ): Promise<boolean | undefined> {
    const entry = sketchesRef.current[name] ?? (sceneOverride ? defaultSketchState(name, sceneOverride) : null);
    if (!entry) return;
    const scene = sceneOverride ?? entry.scene;
    const currentRevision = sketchSceneRevisionRef.current.get(name) ?? 0;
    const revision = revisionOverride ?? currentRevision;
    if (revision === currentRevision) clearSketchAutosave(name);
    if (sketchSaveInFlightRef.current.has(name)) {
      if (options.showSaving !== false) {
        setSketches((curr) => ({
          ...curr,
          [name]: {
            ...(curr[name] ?? entry),
            saving: true,
          },
        }));
      }
      return new Promise((resolve) => {
        const pending = pendingSketchSavesRef.current.get(name);
        pendingSketchSavesRef.current.set(name, {
          scene,
          revision,
          options: pending ? mergeSketchSaveOptions(pending.options, options) : options,
          resolvers: [...(pending?.resolvers ?? []), resolve],
        });
      });
    }
    return runSketchSave(name, entry, scene, options, revision);
  }

  async function runSketchSave(
    name: string,
    entry: SketchState,
    scene: ExcalidrawSketchScene,
    options: SaveSketchOptions,
    revision: number,
  ): Promise<boolean | undefined> {
    sketchSaveInFlightRef.current.add(name);
    const showSaving = options.showSaving !== false;
    if (showSaving) {
      setSketches((curr) => ({
        ...curr,
        [name]: {
          ...(curr[name] ?? entry),
          saving: true,
        },
      }));
    }
    const text = serializeExcalidrawSketchScene(scene, name);
    const startedAt = Date.now();
    let result: boolean | undefined;
    try {
      const file = await port.writeProjectTextFile(projectId, name, text);
      const elapsed = Date.now() - startedAt;
      // Ensures saving UI shows so the button does not flicker
      if (showSaving && elapsed < 500) await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
      if (file) {
        const savedSourceKey = sketchFileSourceKey(projectId, file);
        const hasPendingSave = pendingSketchSavesRef.current.has(name);
        const savedRevisionIsCurrent = revision === (sketchSceneRevisionRef.current.get(name) ?? 0);
        const savedAt = Date.now();
        setSketches((curr) => {
          const current = curr[name] ?? entry;
          return {
            ...curr,
            [name]: hasPendingSave || !savedRevisionIsCurrent
              ? {
                ...current,
                sourceKey: savedSourceKey,
                persisted: true,
                loaded: true,
                saving: hasPendingSave,
              }
              : {
                ...current,
                version: 2,
                rawItems: [],
                items: [],
                scene,
                sourceKey: savedSourceKey,
                discardRawItemsOnSave: false,
                dirty: false,
                persisted: true,
                saving: false,
                savedAt,
              },
          };
        });
        if (!hasPendingSave) {
          // Promote the previously-pending sketch into the persisted tab list.
          const currentTabs = getCurrentTabs();
          if (options.activate !== false || !currentTabs.includes(name)) {
            const nextTabs = currentTabs.includes(name) ? currentTabs : [...currentTabs, name];
            const nextActive = options.activate === false ? (getCurrentActive() ?? null) : name;
            commitTabs(nextTabs, nextActive);
          }
          if (options.activate !== false) setActiveTab(name);
          if (options.refreshFiles !== false) {
            await onRefreshFiles();
            await refreshProjectFolders();
          }
        }
        result = true;
      } else {
        const hasPendingSave = pendingSketchSavesRef.current.has(name);
        setSketches((curr) => ({
          ...curr,
          [name]: {
            ...(curr[name] ?? entry),
            saving: hasPendingSave,
          },
        }));
        result = false;
      }
    } finally {
      sketchSaveInFlightRef.current.delete(name);
    }

    const pending = pendingSketchSavesRef.current.get(name);
    if (pending) {
      pendingSketchSavesRef.current.delete(name);
      const pendingResult = await saveSketch(name, pending.scene, pending.options, pending.revision);
      for (const resolve of pending.resolvers) resolve(pendingResult);
      return pendingResult;
    }

    return result;
  }

  function queueSketchAutosave(name: string, scene: ExcalidrawSketchScene) {
    clearSketchAutosave(name);
    const revision = sketchSceneRevisionRef.current.get(name) ?? 0;
    const options: SaveSketchOptions = {
      activate: false,
      refreshFiles: false,
      showSaving: false,
    };
    if (sketchSaveInFlightRef.current.has(name)) {
      const pending = pendingSketchSavesRef.current.get(name);
      pendingSketchSavesRef.current.set(name, {
        scene,
        revision,
        options: pending ? mergeSketchSaveOptions(pending.options, options) : options,
        resolvers: pending?.resolvers ?? [],
      });
      return;
    }
    sketchAutosaveDraftsRef.current.set(name, { scene, revision, options });
    const timer = setTimeout(() => {
      sketchAutosaveTimersRef.current.delete(name);
      sketchAutosaveDraftsRef.current.delete(name);
      void saveSketch(name, scene, options, revision);
    }, SKETCH_AUTOSAVE_DELAY_MS);
    sketchAutosaveTimersRef.current.set(name, timer);
  }

  function clearSketchAutosave(name: string) {
    const timer = sketchAutosaveTimersRef.current.get(name);
    if (timer) clearTimeout(timer);
    sketchAutosaveTimersRef.current.delete(name);
    sketchAutosaveDraftsRef.current.delete(name);
  }

  function flushPendingSketchAutosaves() {
    const queued = Array.from(sketchAutosaveDraftsRef.current.entries());
    if (queued.length === 0) return;
    for (const [name, draft] of queued) {
      const timer = sketchAutosaveTimersRef.current.get(name);
      if (timer) clearTimeout(timer);
      sketchAutosaveTimersRef.current.delete(name);
      sketchAutosaveDraftsRef.current.delete(name);
      void saveSketch(name, draft.scene, draft.options, draft.revision);
    }
  }
  flushPendingSketchAutosavesRef.current = flushPendingSketchAutosaves;

  async function exportSketchImage(
    sketchName: string,
    base64: string,
    imageFileName: string,
  ): Promise<{ fileName: string } | false> {
    const targetDir = parentDirForProjectFile(sketchName);
    const targetName = targetDir ? `${targetDir}/${imageFileName}` : imageFileName;
    const file = await port.writeProjectBase64File(projectId, targetName, base64);
    if (!file) {
      onUploadError(t('common.exportImageFailed'));
      return false;
    }
    onUploadError(null);
    await onRefreshFiles();
    await refreshProjectFolders();
    return { fileName: file.name };
  }

  async function startNewSketch() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const base = `sketch-${stamp}.sketch.json`;
    // Create under the folder currently being viewed, if any. The slash-joined
    // name flows through as the sketch's tab id and save path; the daemon's
    // sanitizePath turns it into a real subdirectory on save.
    const name = uploadDir ? `${uploadDir}/${base}` : base;
    const scene = emptySketchScene(name);
    sketchSceneRevisionRef.current.set(name, 0);
    setSketches((curr) => ({
      ...curr,
      [name]: {
        version: 1,
        rawItems: [],
        discardRawItemsOnSave: false,
        items: [],
        scene,
        dirty: false,
        persisted: false,
        loaded: true,
        saving: true,
      },
    }));
    setActiveTab(name);
    const ok = await saveSketch(name, scene, {
      activate: true,
      refreshFiles: true,
      showSaving: false,
    });
    if (ok === false) {
      setSketches((curr) => ({
        ...curr,
        [name]: {
          ...(curr[name] ?? defaultSketchState(name, scene)),
          dirty: true,
          persisted: false,
          saving: false,
        },
      }));
    }
  }

  function discardPendingSketchEntry(name: string) {
    setSketches((curr) => {
      const next = { ...curr };
      clearSketchAutosave(name);
      sketchSceneRevisionRef.current.delete(name);
      delete next[name];
      return next;
    });
  }

  function pruneClosedSketchEntry(name: string) {
    setSketches((curr) => {
      const next = { ...curr };
      const entry = next[name];
      if (entry && !entry.persisted) {
        clearSketchAutosave(name);
        delete next[name];
      }
      return next;
    });
  }

  function removeSketchEntry(name: string) {
    setSketches((curr) => {
      const next = { ...curr };
      clearSketchAutosave(name);
      delete next[name];
      return next;
    });
  }

  function removeSketchEntries(names: string[]) {
    setSketches((curr) => {
      const next = { ...curr };
      for (const name of names) {
        clearSketchAutosave(name);
        sketchSceneRevisionRef.current.delete(name);
        delete next[name];
      }
      return next;
    });
  }

  function renameSketchEntry(oldName: string, renamed: ProjectFile) {
    setSketches((curr) => {
      const entry = curr[oldName];
      if (!entry) return curr;
      const next = { ...curr };
      clearSketchAutosave(oldName);
      const revision = sketchSceneRevisionRef.current.get(oldName);
      sketchSceneRevisionRef.current.delete(oldName);
      if (revision !== undefined) sketchSceneRevisionRef.current.set(renamed.name, revision);
      delete next[oldName];
      next[renamed.name] = isSketchName(renamed.name)
        ? { ...entry, sourceKey: sketchFileSourceKey(projectId, renamed) }
        : entry;
      return next;
    });
  }

  return {
    sketches,
    setSketchScene,
    clearSketch,
    saveSketch,
    exportSketchImage,
    startNewSketch,
    discardPendingSketchEntry,
    pruneClosedSketchEntry,
    removeSketchEntry,
    removeSketchEntries,
    renameSketchEntry,
  };
}

/**
 * Wirer: binds the real provider port and returns a ready-to-call hook. This
 * is the default the orchestrator injects; swap it via the component prop in
 * tests.
 */
export function useWiredSketches(params: UseSketchesParams): SketchesController {
  return useSketches(sketchesPort, params);
}
