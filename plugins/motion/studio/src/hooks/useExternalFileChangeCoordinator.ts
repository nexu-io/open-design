import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  mergeFileChangePayloads,
  readFileChangeAffectedCompositions,
  readFileChangeAffectsPreview,
  readFileChangeField,
  readStudioFileChangePath,
} from "../components/editor/manualEdits";
import { StudioFileConflictError } from "../utils/studioSaveDiagnostics";
import type { ExternalConflictSnapshot } from "../utils/externalConflictStorage";
import { isSelfWriteEcho } from "./sdkSelfWriteRegistry";
import { consumeStudioWriteToken } from "../utils/studioFileVersion";
import { logReload } from "../utils/reloadDebug";

type ExternalChangeDrainResult =
  | { status: "clean" }
  | { status: "conflict"; error: StudioFileConflictError }
  | { status: "failed"; error: unknown };

export type ExternalFileChangeBlockedState =
  | {
      status: "conflict";
      generation: number;
      error: StudioFileConflictError;
      payload: unknown;
    }
  | {
      status: "failed";
      generation: number;
      path: string;
      error: unknown;
      payload: unknown;
      studioContent: string | null;
      recovered: boolean;
    };

interface ExternalFileChangeCoordinatorOptions {
  projectId: string | null;
  activeCompPath: string | null;
  recoveryFilePath?: string | null;
  pendingTimelineEditPathRef: MutableRefObject<Set<string>>;
  drainPendingChanges: () => Promise<ExternalChangeDrainResult>;
  getPendingCandidate?: () => { path: string; content: string } | null;
  discardPendingChanges: () => void;
  reloadPreview: () => void;
  reloadSdkSession: (path: string) => void;
  persistConflictSnapshot: (projectId: string, conflict: StudioFileConflictError) => Promise<void>;
  persistFailureSnapshot?: (
    projectId: string,
    filePath: string,
    studioContent: string,
    externalVersion: string | null,
    externalContent: string | null,
    error: unknown,
  ) => Promise<void>;
  loadConflictSnapshot?: (
    projectId: string,
    filePath: string,
  ) => Promise<ExternalConflictSnapshot | null>;
  deleteConflictSnapshot?: (projectId: string, filePath: string) => Promise<void>;
  overwriteConflict: (conflict: StudioFileConflictError) => Promise<void>;
  readProjectFile: (path: string) => Promise<string>;
  onUseExternalFile?: (path: string, content: string) => void;
  resetSaveQueues?: () => void;
  onAcceptedPersistedFileChange: (
    path: string,
    affectedCompositions: readonly string[] | null,
  ) => void;
  /**
   * Called alongside `reloadPreview`/`reloadSdkSession` on every accepted
   * external change. The file tree (`useFileTree`) is only ever refreshed
   * from Studio's OWN file operations (create/delete/rename/upload) — an
   * external change (an agent writing outside Studio) reloads the preview
   * and the SDK session but, without this, never the listing. A composition
   * an agent removed or replaced then stays in the tree until the user does
   * a Studio-side file op or reloads the tab; clicking it opens a session
   * that can never resolve (`reason: "absent"`, proven stale-tree 2026-09-23).
   */
  refreshFileTree?: () => void | Promise<void>;
}

export interface ExternalFileChangeCoordinatorHandle {
  blocked: ExternalFileChangeBlockedState | null;
  retry: () => Promise<void>;
  useExternalFile: () => Promise<void>;
  keepStudioFile: () => Promise<void>;
}

interface HotTestAdapter {
  on(event: string, handler: (payload?: unknown) => void): void;
  off(event: string, handler: (payload?: unknown) => void): void;
}

function testHotAdapter(): HotTestAdapter | null {
  const value = (globalThis as { __HF_STUDIO_HOT_TEST_ADAPTER__?: unknown })
    .__HF_STUDIO_HOT_TEST_ADAPTER__;
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<HotTestAdapter>;
  return typeof candidate.on === "function" && typeof candidate.off === "function"
    ? (candidate as HotTestAdapter)
    : null;
}

const readFileChangeContent = (payload: unknown) => readFileChangeField(payload, "content");
const readFileChangeVersion = (payload: unknown) => readFileChangeField(payload, "version");
const readFileChangeWriteToken = (payload: unknown) => readFileChangeField(payload, "writeToken");

/**
 * Decode one delivery into the payload shape every reader above assumes.
 *
 * SSE delivers a `MessageEvent` whose `data` is a JSON string; the hot-reload
 * transports deliver the payload object. This is the only place that difference
 * exists: a reader handed an undecoded envelope reports every field as absent,
 * which is indistinguishable from a field that is genuinely unset.
 */
function decodeFileChange(delivery: unknown): unknown {
  // Structural, not `instanceof`: a polyfilled or cross-realm event must still decode.
  const data = (delivery as { data?: unknown } | null)?.data;
  if (typeof data !== "string") return delivery;
  try {
    return JSON.parse(data);
  } catch {
    logReload("file-change", { path: null, why: "unparseable payload" });
    return null;
  }
}

export function sseFileChangeChannel(
  onDelivery: (delivery: unknown) => void,
  onReconnect: () => void,
): () => void {
  const eventSource = new EventSource("/api/events");
  eventSource.addEventListener("file-change", onDelivery);
  // Reopening the stream does not replay changes missed during a disconnect.
  let opened = false;
  eventSource.addEventListener("open", () => {
    if (opened) onReconnect();
    opened = true;
  });
  return () => eventSource.close();
}

function eventIdentity(path: string, payload: unknown): string | null {
  const version = readFileChangeVersion(payload);
  if (version) return `${path}\0${version}`;
  const content = readFileChangeContent(payload);
  return content == null ? null : `${path}\0${content.length}\0${content}`;
}

export function useExternalFileChangeCoordinator({
  projectId,
  activeCompPath,
  recoveryFilePath = activeCompPath,
  pendingTimelineEditPathRef,
  drainPendingChanges,
  getPendingCandidate,
  discardPendingChanges,
  reloadPreview,
  reloadSdkSession,
  persistConflictSnapshot,
  persistFailureSnapshot,
  loadConflictSnapshot,
  deleteConflictSnapshot,
  overwriteConflict,
  readProjectFile,
  onUseExternalFile,
  resetSaveQueues,
  onAcceptedPersistedFileChange,
  refreshFileTree,
}: ExternalFileChangeCoordinatorOptions): ExternalFileChangeCoordinatorHandle {
  const [blocked, setBlockedState] = useState<ExternalFileChangeBlockedState | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const lastEventIdentityRef = useRef<string | null>(null);
  const blockedRef = useRef<ExternalFileChangeBlockedState | null>(null);
  const snapshotWriteTailRef = useRef<Promise<void>>(Promise.resolve());
  const drainingRef = useRef(false);
  const pendingPayloadRef = useRef<{ payload: unknown } | null>(null);
  // A newer blocked change replaces the held one, so it inherits what the held one owed.
  const setBlocked = useCallback((next: ExternalFileChangeBlockedState | null) => {
    const held = blockedRef.current;
    const current =
      next && held
        ? { ...next, payload: mergeFileChangePayloads(held.payload, next.payload) }
        : next;
    blockedRef.current = current;
    setBlockedState(current);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    pendingPayloadRef.current = null;
  }, [projectId]);

  useEffect(() => {
    generationRef.current += 1;
    setBlocked(null);
    lastEventIdentityRef.current = null;
  }, [projectId, activeCompPath, setBlocked]);

  useEffect(() => {
    if (!projectId || !recoveryFilePath || !loadConflictSnapshot) return;
    const generation = ++generationRef.current;
    let cancelled = false;
    void loadConflictSnapshot(projectId, recoveryFilePath)
      .then((snapshot) => {
        if (cancelled || !snapshot || !mountedRef.current || generation !== generationRef.current) {
          return;
        }
        const payload = {
          path: snapshot.filePath,
          version: snapshot.externalVersion,
          content: snapshot.externalContent,
        };
        if (snapshot.kind === "failed") {
          setBlocked({
            status: "failed",
            generation,
            path: snapshot.filePath,
            error: new Error(snapshot.failureMessage),
            payload,
            studioContent: snapshot.studioContent,
            recovered: true,
          });
        } else {
          const error = new StudioFileConflictError({
            filePath: snapshot.filePath,
            currentVersion: snapshot.externalVersion,
            currentContent: snapshot.externalContent,
            attemptedContent: snapshot.studioContent,
          });
          setBlocked({ status: "conflict", generation, error, payload });
        }
      })
      .catch(() => {
        // Storage may be unavailable in restricted browser contexts. A failed
        // best-effort restore must not create an unhandled rejection or block
        // a project that has no known recovery record.
      });
    return () => {
      cancelled = true;
    };
  }, [loadConflictSnapshot, projectId, recoveryFilePath, setBlocked]);

  // What a settled change owes: thumbnails (unless its own write's echo brings them), then reloads.
  const deliverOwed = useCallback(
    (owed: unknown, accept = true) => {
      const path = readStudioFileChangePath(owed) ?? ".";
      const affectsPreview = readFileChangeAffectsPreview(owed);
      if (accept) onAcceptedPersistedFileChange(path, readFileChangeAffectedCompositions(owed));
      logReload(affectsPreview ? "reload" : "file-tree only", {
        path,
        by: "external-change coordinator",
      });
      if (affectsPreview) reloadPreview();
      reloadSdkSession(path);
      // Fire-and-forget: a failed refresh leaves the tree as stale as it was,
      // which is the status quo this exists to improve on, not a new failure
      // mode to surface. The `absent`-triggered fallback in useSdkSession
      // covers the case where this call is missed entirely (server restart,
      // a watcher event the SSE never delivered).
      void refreshFileTree?.();
    },
    [onAcceptedPersistedFileChange, reloadPreview, reloadSdkSession, refreshFileTree],
  );

  const persistSnapshotInOrder = useCallback(async (write: () => Promise<void>) => {
    const next = snapshotWriteTailRef.current.catch(() => undefined).then(write);
    snapshotWriteTailRef.current = next.then(
      () => undefined,
      () => undefined,
    );
    await next;
  }, []);

  const drainOnePending = useCallback(
    // fallow-ignore-next-line complexity
    async (payload: unknown) => {
      const path = readStudioFileChangePath(payload);
      if (!path) return;

      const generation = ++generationRef.current;
      const savingPath = getPendingCandidate?.()?.path;
      const result = await drainPendingChanges();
      if (!mountedRef.current || generation !== generationRef.current) return;

      if (result.status === "clean") {
        const previousBlocked = blockedRef.current;
        // Only saving the failed draft's file retires its copy; restored drafts are never queued.
        if (
          previousBlocked?.status === "failed" &&
          !previousBlocked.recovered &&
          previousBlocked.path === savingPath &&
          deleteConflictSnapshot
        ) {
          try {
            await deleteConflictSnapshot(projectId!, previousBlocked.path);
          } catch (error) {
            if (mountedRef.current && generation === generationRef.current) {
              setBlocked({
                ...previousBlocked,
                generation,
                error,
                payload: mergeFileChangePayloads(payload, previousBlocked.payload),
              });
            }
            return;
          }
        }
        if (!mountedRef.current || generation !== generationRef.current) return;
        setBlocked(null);
        const restored = previousBlocked?.status === "failed" && previousBlocked.recovered;
        deliverOwed(
          previousBlocked && !restored
            ? mergeFileChangePayloads(previousBlocked.payload, payload)
            : payload,
        );
        return;
      }
      if (result.status === "failed") {
        // The draft names the file to recover; the payload stays the scope to reload.
        const candidate = getPendingCandidate?.();
        const failedPath = candidate?.path ?? (path === "." ? (recoveryFilePath ?? path) : path);
        const studioContent = candidate?.content ?? null;
        const external = failedPath === path ? payload : null;
        let error = result.error;
        if (studioContent != null && persistFailureSnapshot) {
          try {
            await persistSnapshotInOrder(() =>
              persistFailureSnapshot(
                projectId!,
                failedPath,
                studioContent,
                readFileChangeVersion(external),
                readFileChangeContent(external),
                result.error,
              ),
            );
          } catch (snapshotError) {
            error = new Error(
              `Studio could not save the edit or its recovery snapshot: ${
                snapshotError instanceof Error ? snapshotError.message : String(snapshotError)
              }`,
              { cause: result.error },
            );
          }
        }
        if (!mountedRef.current || generation !== generationRef.current) return;
        setBlocked({
          status: "failed",
          generation,
          path: failedPath,
          error,
          payload,
          studioContent,
          recovered: false,
        });
        return;
      }
      try {
        await persistSnapshotInOrder(() => persistConflictSnapshot(projectId!, result.error));
      } catch (error) {
        if (!mountedRef.current || generation !== generationRef.current) return;
        setBlocked({
          status: "failed",
          generation,
          path: result.error.filePath,
          error,
          payload,
          studioContent: result.error.attemptedContent,
          recovered: false,
        });
        return;
      }
      if (!mountedRef.current || generation !== generationRef.current) return;
      setBlocked({ status: "conflict", generation, error: result.error, payload });
    },
    [
      drainPendingChanges,
      setBlocked,
      projectId,
      deleteConflictSnapshot,
      getPendingCandidate,
      recoveryFilePath,
      persistConflictSnapshot,
      persistFailureSnapshot,
      persistSnapshotInOrder,
      deliverOwed,
    ],
  );

  const drainOnePendingRef = useRef(drainOnePending);
  drainOnePendingRef.current = drainOnePending;

  const startDrainLoop = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      while (mountedRef.current) {
        const pending = pendingPayloadRef.current;
        if (!pending) break;
        pendingPayloadRef.current = null;
        await drainOnePendingRef.current(pending.payload);
      }
    } finally {
      drainingRef.current = false;
    }
  }, []);

  const processChange = useCallback(
    // fallow-ignore-next-line complexity
    (payload: unknown) => {
      const path = readStudioFileChangePath(payload);
      if (!path || !projectId) {
        logReload("file-change", { path: null, why: path ? "no project" : "no path in payload" });
        return;
      }
      // `/api/events` is one connection per SERVER, not per project: under the
      // CLI host, a tab left open from a `preview` run that has since exited
      // shares this stream with whatever project now runs on that port. Both
      // commonly use the same default composition path, so without this check
      // a stale tab reloads its preview (which then 404s — the CLI host is
      // single-project, so it can't resolve the OTHER project it's serving)
      // and re-reads its own composition on every save the CURRENT project
      // makes. Absent field (older server, one release of skew) still passes.
      const deliveredProjectId = readFileChangeField(payload, "projectId");
      if (deliveredProjectId && deliveredProjectId !== projectId) {
        logReload("suppressed", { path, why: "other project" });
        return;
      }
      pendingTimelineEditPathRef.current.delete(path);

      const content = readFileChangeContent(payload);
      const token = readFileChangeWriteToken(payload);
      logReload("file-change", { path, token: token ?? null, hasContent: content != null });
      const identity = eventIdentity(path, payload);
      if (identity != null && identity === lastEventIdentityRef.current) {
        logReload("suppressed", { path, why: "duplicate event" });
        return;
      }
      lastEventIdentityRef.current = identity;

      const ownWriteToken = consumeStudioWriteToken(token);
      const ownContentEcho = content != null && isSelfWriteEcho(path, content);
      if (ownWriteToken || ownContentEcho) {
        onAcceptedPersistedFileChange(path, readFileChangeAffectedCompositions(payload));
        logReload("suppressed", {
          path,
          why: ownWriteToken ? "own write token" : "own content echo",
        });
        return;
      }

      const waiting = pendingPayloadRef.current?.payload;
      const waitingChangeOutranksThis =
        waiting != null &&
        readFileChangeAffectsPreview(waiting) &&
        !readFileChangeAffectsPreview(payload);
      if (!waitingChangeOutranksThis) {
        pendingPayloadRef.current = {
          payload: waiting == null ? payload : mergeFileChangePayloads(waiting, payload),
        };
      }
      void startDrainLoop();
    },
    [projectId, pendingTimelineEditPathRef, startDrainLoop, onAcceptedPersistedFileChange],
  );

  const processChangeRef = useRef(processChange);
  processChangeRef.current = processChange;
  useEffect(() => {
    // One decoder for all three transports; the rungs only choose the channel.
    const handler = (delivery?: unknown) => processChangeRef.current(decodeFileChange(delivery));
    const adapter = testHotAdapter();
    if (adapter) {
      adapter.on("hf:file-change", handler);
      return () => adapter.off("hf:file-change", handler);
    }
    if (import.meta.hot) {
      import.meta.hot.on("hf:file-change", handler);
      return () => import.meta.hot?.off?.("hf:file-change", handler);
    }
    const catchUp = () => processChangeRef.current({ path: "." });
    return sseFileChangeChannel(handler, catchUp);
  }, []);

  const retry = useCallback(async () => {
    const current = blockedRef.current;
    if (!current || current.status === "conflict" || current.recovered) return;
    resetSaveQueues?.();
    lastEventIdentityRef.current = null;
    processChange(current.payload);
  }, [processChange, resetSaveQueues]);

  const useExternalFile = useCallback(
    // fallow-ignore-next-line complexity
    async () => {
      const current = blockedRef.current;
      if (!current || !projectId || current.generation !== generationRef.current) return;
      const path = current.status === "conflict" ? current.error.filePath : current.path;
      const external =
        current.status === "conflict" && current.error.currentContent != null
          ? current.error.currentContent
          : await readProjectFile(path);
      if (current.generation !== generationRef.current) return;
      discardPendingChanges();
      resetSaveQueues?.();
      onUseExternalFile?.(path, external);
      await deleteConflictSnapshot?.(projectId, path);
      setBlocked(null);
      deliverOwed(current.payload);
    },
    [
      deleteConflictSnapshot,
      setBlocked,
      discardPendingChanges,
      onUseExternalFile,
      projectId,
      readProjectFile,
      deliverOwed,
      resetSaveQueues,
    ],
  );

  // fallow-ignore-next-line complexity
  const keepStudioFile = useCallback(async () => {
    const current = blockedRef.current;
    if (!current || !projectId) return;
    if (current.generation !== generationRef.current) return;
    let conflict: StudioFileConflictError;
    if (current.status === "conflict") {
      conflict = current.error;
    } else {
      if (!current.recovered || current.studioContent == null) return;
      try {
        const currentContent =
          readFileChangeContent(current.payload) ?? (await readProjectFile(current.path));
        conflict = new StudioFileConflictError({
          filePath: current.path,
          currentVersion: readFileChangeVersion(current.payload),
          currentContent,
          attemptedContent: current.studioContent,
        });
      } catch (error) {
        if (current.generation === generationRef.current) setBlocked({ ...current, error });
        return;
      }
    }
    try {
      await overwriteConflict(conflict);
    } catch (error) {
      if (current.generation === generationRef.current) {
        setBlocked({
          status: "failed",
          generation: current.generation,
          path: conflict.filePath,
          error,
          payload: current.payload,
          studioContent: conflict.attemptedContent,
          recovered: current.status === "failed" && current.recovered,
        });
      }
      return;
    }
    if (current.generation !== generationRef.current) return;
    discardPendingChanges();
    resetSaveQueues?.();
    await deleteConflictSnapshot?.(projectId, conflict.filePath);
    setBlocked(null);
    deliverOwed(
      mergeFileChangePayloads(current.payload, { path: conflict.filePath, affectsPreview: true }),
      readStudioFileChangePath(current.payload) !== conflict.filePath,
    );
  }, [
    deleteConflictSnapshot,
    setBlocked,
    discardPendingChanges,
    overwriteConflict,
    projectId,
    readProjectFile,
    deliverOwed,
    resetSaveQueues,
  ]);

  return { blocked, retry, useExternalFile, keepStudioFile };
}
