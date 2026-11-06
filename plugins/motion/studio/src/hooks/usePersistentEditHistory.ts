import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HistoryListItem, HistoryResult } from "@hyperframes/studio-server";
import { studioFileContentVersion, studioWriteHeaders } from "../utils/studioFileVersion";
import type { RestoreFiles } from "../utils/gsapUndoRestore";
import { studioApiFetch } from "../utils/studioApiFetch";
import { setStudioPendingEditClaimClock } from "../utils/studioPendingEdits";
import type { RecordEditInput } from "../utils/studioFileHistory";
import { generateId } from "../utils/generateId";

interface ApplyCallbacks {
  readFile: (path: string) => Promise<string>;
  serialize?: <T>(paths: readonly string[], task: () => Promise<T>) => Promise<T>;
  claimedAfter?: number;
}

export interface UsePersistentEditHistoryOptions {
  projectId: string | null;
}

interface ApplyResult {
  ok: boolean;
  /** content-mismatch: `paths` changed after the step's entry. failed: `message` says why. */
  reason?: "empty" | "content-mismatch" | "failed";
  message?: string;
  label?: string;
  paths?: string[];
  undoes?: string;
  files?: RestoreFiles;
}

interface NextStep {
  id: string;
  label: string;
  endedAt: number;
  paths: string[];
}

interface HistoryView {
  entries: HistoryListItem[];
  back: NextStep | null;
  forward: NextStep | null;
}

const EMPTY: HistoryView = { entries: [], back: null, forward: null };
/** ponytail: the newest entries' content is kept; older ones step through the server only. */
const OWN_ENTRIES_KEPT = 100;

type OwnFiles = Record<string, { before: string; after: string }>;

function createOwnHistory() {
  const own = new Map<string, OwnFiles>();
  let next: Record<"undo" | "redo", NextStep | null> | null = null;
  let changes = 0;
  let claimed = { count: 0, id: "" };
  const undoneIds = new Set<string>();
  const remember = (id: string, files: OwnFiles) => {
    const known = own.get(id) ?? {};
    for (const [path, { before, after }] of Object.entries(files)) {
      known[path] = { before: known[path]?.before ?? before, after };
    }
    own.delete(id);
    own.set(id, known);
    if (own.size > OWN_ENTRIES_KEPT) own.delete(own.keys().next().value!);
  };
  return {
    remember,
    overtake: () => {
      changes += 1;
      next = null;
      return changes;
    },
    offered: (seen: number, view: HistoryView) => {
      if (seen === changes) next = { undo: view.back, redo: view.forward };
    },
    changes: () => changes,
    claimCount: () => claimed.count,
    claimedAfter: (count: number) => (claimed.count > count && claimed.id ? claimed.id : null),
    targetFor: (id: string | null, pressedAt: number) =>
      !id || !undoneIds.has(id) ? id : claimed.count > pressedAt ? false : null,
    noteClaim: (id: string) => {
      claimed = { count: claimed.count + 1, id };
    },
    stepped: (entry: { id: string; undoes?: string }) => {
      if (entry.undoes) undoneIds.add(entry.undoes);
      if (undoneIds.size > OWN_ENTRIES_KEPT) undoneIds.delete(undoneIds.values().next().value!);
      const undone = entry.undoes ? own.get(entry.undoes) : undefined;
      if (!undone) return;
      const swapped = Object.entries(undone).map(([path, f]) => [
        path,
        { before: f.after, after: f.before },
      ]);
      remember(entry.id, Object.fromEntries(swapped));
    },
    afterOf: (id: string | undefined): Record<string, string> =>
      Object.fromEntries(Object.entries((id && own.get(id)) || {}).map(([p, f]) => [p, f.after])),
    predict: (direction: "undo" | "redo"): { id: string; files: RestoreFiles } | null => {
      const step = next?.[direction];
      const files = step ? own.get(step.id) : undefined;
      const paths = files ? Object.keys(files) : [];
      if (
        !files ||
        paths.length !== step!.paths.length ||
        !paths.every((p) => step!.paths.includes(p))
      )
        return null;
      const restore = paths.map((path) => [
        path,
        { previous: files[path]!.after, restored: files[path]!.before },
      ]);
      return { id: step!.id, files: Object.fromEntries(restore) };
    },
    clear: () => {
      own.clear();
      undoneIds.clear();
      next = null;
      changes += 1;
    },
  };
}
const DEFAULT_COALESCE_MS = 300;

function historyUrl(projectId: string, path = ""): string {
  return `/api/projects/${encodeURIComponent(projectId)}/history${path}`;
}

async function cantUndo(paths: string[] | undefined): Promise<ApplyResult> {
  return { ok: false, reason: "content-mismatch", paths: paths ?? [] };
}

function unionPaths(...lists: Array<readonly string[] | undefined>): string[] {
  return [...new Set(lists.flatMap((list) => list ?? []))];
}

async function post(
  url: string,
  body: object,
  headers: Record<string, string> = {},
): Promise<{ ok: true; body: unknown } | { ok: false; status: number; error: string }> {
  const response = await studioApiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!response) return { ok: false, status: 0, error: "Studio could not reach its server." };
  const reply = (await response.json().catch(() => null)) as { error?: string } | null;
  if (response.ok && reply) return { ok: true, body: reply };
  if (response.ok)
    return { ok: false, status: response.status, error: "The history's reply was unreadable." };
  return { ok: false, status: response.status, error: reply?.error ?? `HTTP ${response.status}` };
}

/** The entry id a claim took, or null; a failed one is logged (its write lands as an outside change; 404: none). */
function claimHeld(reply: Awaited<ReturnType<typeof post>>, label: string): string | null {
  if (reply.ok)
    return (reply.body as { claimed: { id: string } | null } | null)?.claimed?.id ?? null;
  if (reply.status !== 404)
    console.error(
      `[history] ${reply.status}: "${label}" was not recorded as your edit: ${reply.error}`,
    );
  return null;
}

async function overwroteVersions(files: RecordEditInput["files"]): Promise<Record<string, string>> {
  const pairs = await Promise.all(
    Object.entries(files).map(async ([path, { before }]) => [
      path,
      await studioFileContentVersion(before),
    ]),
  );
  return Object.fromEntries(pairs);
}

async function readAll(
  paths: readonly string[],
  readFile: (path: string) => Promise<string>,
): Promise<Record<string, string> | null> {
  const contents: Record<string, string> = {};
  for (const path of paths) {
    const content = await readFile(path).catch(() => null);
    if (content === null) return null;
    contents[path] = content;
  }
  return contents;
}

async function restoredFiles(
  paths: readonly string[],
  previous: Record<string, string> | null,
  readFile: (path: string) => Promise<string>,
): Promise<RestoreFiles | undefined> {
  if (!previous || paths.some((path) => !(path in previous))) return undefined;
  const restored = await readAll(paths, readFile);
  if (!restored) return undefined;
  return Object.fromEntries(
    paths.map((path) => [path, { previous: previous[path]!, restored: restored[path]! }]),
  );
}

function redoneAt(view: HistoryView): number | null {
  const undo = view.entries.find((entry) => entry.id === view.forward?.id);
  return view.entries.find((entry) => entry.id === undo?.undoes)?.endedAt ?? null;
}

/** Studio's undo over the server's project history: an edit claims what it wrote; Cmd+Z steps the person's. */
export function usePersistentEditHistory({ projectId }: UsePersistentEditHistoryOptions) {
  const [view, setView] = useState<HistoryView>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  // A coalescing claim the server just took, until `refresh()` brings its entry into `view`.
  const heldClaimRef = useRef<{ paths: string[]; at: number } | null>(null);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const [own] = useState(createOwnHistory);
  const [pageKeyScope] = useState(generateId);
  const claimKey = useCallback((key: string) => `${pageKeyScope}:${key}`, [pageKeyScope]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const seen = own.changes();
    const response = await studioApiFetch(historyUrl(projectId)).catch(() => null);
    const next = response?.ok
      ? ((await response.json().catch(() => null)) as HistoryView | null)
      : EMPTY;
    if (projectIdRef.current !== projectId) return;
    if (!next) return console.error("The history's reply was unreadable.");
    setView(next);
    own.offered(seen, next);
  }, [projectId, own]);

  useEffect(() => {
    setView(EMPTY);
    setLoaded(false);
    heldClaimRef.current = null;
    own.clear();
    void refresh().finally(() => setLoaded(true));
  }, [refresh, own]);

  useEffect(() => {
    setStudioPendingEditClaimClock(own.claimCount);
    return () => setStudioPendingEditClaimClock(null);
  }, [own]);

  const recordEdit = useCallback(
    async ({ label, coalesceKey, coalesceMs, files, targets, created = [] }: RecordEditInput) => {
      if (!projectId) return;
      const paths = [...Object.keys(files), ...created];
      own.overtake();
      const reply = await post(historyUrl(projectId, "/claim"), {
        label,
        paths,
        ...(targets?.length && { targets }),
        overwrote: await overwroteVersions(files),
        ...(coalesceKey && {
          coalesceKey: claimKey(coalesceKey),
          idleMs: coalesceMs ?? DEFAULT_COALESCE_MS,
        }),
      });
      const claimed = claimHeld(reply, label);
      if (claimed) {
        own.remember(claimed, files);
        own.noteClaim(claimed);
      }
      heldClaimRef.current = claimed && coalesceKey ? { paths, at: Date.now() } : null;
      await refresh();
    },
    [projectId, refresh, own, claimKey],
  );

  const step = useCallback(
    async (direction: "undo" | "redo", callbacks: ApplyCallbacks): Promise<ApplyResult> => {
      if (!projectId) return { ok: false, reason: "empty" };
      const candidate =
        direction === "undo" && callbacks.claimedAfter !== undefined
          ? own.claimedAfter(callbacks.claimedAfter)
          : null;
      const next = direction === "undo" ? view.back : view.forward;
      const stepPaths = candidate ? Object.keys(own.afterOf(candidate)) : next?.paths;
      const paths = unionPaths(stepPaths, heldClaimRef.current?.paths);
      const pressedAt = own.claimCount();
      own.overtake();
      const attempt = async (target: string | null): Promise<ApplyResult> => {
        const previous = await readAll(paths, callbacks.readFile);
        const posted = await post(
          historyUrl(projectId, target ? "/undo" : "/step"),
          target ? { entryId: target } : { direction: direction === "undo" ? "back" : "forward" },
          studioWriteHeaders(),
        );
        heldClaimRef.current = null;
        void refresh();
        // 404: this app keeps no history, so there is nothing to step.
        if (!posted.ok && posted.status === 404) return { ok: false, reason: "empty" };
        if (!posted.ok) return { ok: false, reason: "failed", message: posted.error };
        const reply = posted.body as HistoryResult;
        if (!reply.ok) {
          const { files } = reply.conflict;
          return { ok: false, reason: "content-mismatch", paths: files };
        }
        if (!reply.entry) return { ok: false, reason: "empty" };
        own.stepped(reply.entry);
        const changed = reply.entry.files.map((file) => file.path);
        return {
          ok: true,
          label: reply.entry.label,
          undoes: reply.entry.undoes,
          paths: changed,
          files: await restoredFiles(
            changed,
            { ...own.afterOf(reply.entry.undoes), ...previous },
            callbacks.readFile,
          ),
        };
      };
      const run = () => {
        const target = own.targetFor(candidate, pressedAt);
        return target === false ? cantUndo(stepPaths) : attempt(target);
      };
      return callbacks.serialize ? callbacks.serialize(paths, run) : run();
    },
    [projectId, view, refresh, own],
  );

  const noteOutsideChange = useCallback(() => {
    own.overtake();
    void refresh();
  }, [own, refresh]);

  const undo = useCallback((callbacks: ApplyCallbacks) => step("undo", callbacks), [step]);
  const redo = useCallback((callbacks: ApplyCallbacks) => step("redo", callbacks), [step]);

  const state = useMemo(() => {
    const backAt = Math.max(view.back?.endedAt ?? 0, heldClaimRef.current?.at ?? 0);
    const redoAt = redoneAt(view);
    return {
      undo: backAt ? [{ createdAt: backAt }] : [],
      redo: redoAt === null ? [] : [{ createdAt: redoAt }],
    };
  }, [view]);

  return {
    loaded,
    canUndo: Boolean(view.back),
    canRedo: Boolean(view.forward),
    undoLabel: view.back?.label,
    redoLabel: view.forward?.label,
    undoPaths: view.back?.paths ?? [],
    redoPaths: view.forward?.paths ?? [],
    state,
    recordEdit,
    claimKey,
    undo,
    redo,
    predict: own.predict,
    claims: own.claimCount,
    noteOutsideChange,
  };
}
