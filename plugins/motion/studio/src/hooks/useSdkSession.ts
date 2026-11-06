import { useState, useEffect, useCallback, useRef } from "react";
import { openComposition } from "@hyperframes/sdk";
import type { Composition } from "@hyperframes/sdk";
import { isSelfWriteEcho } from "./sdkSelfWriteRegistry";
import { trackStudioEvent } from "../utils/studioTelemetry";
import type { PublishSdkSession } from "../utils/sdkCutover";
import { addExternalFileReloadListener } from "./externalFileReloadBus";
import { whenPreviewBooted } from "../player/store/playerStore";
import { studioApiFetch } from "../utils/studioApiFetch";

/**
 * Why an optional project-file read produced no usable content. `stage: "read"`
 * was a single opaque reason covering all of these, which made the largest
 * remaining class of SDK-session failures undiagnosable: 56 users in a 7-day
 * window hit it and, between them, never landed a single successful SDK edit.
 * Knowing which branch fired is the difference between "the file legitimately
 * is not there" and "the request never reached the file".
 *
 * Every reason lives in this union so the full surface is readable from one
 * place — `absent_or_empty` included, even though it is a 2xx.
 *
 * `network` is a fetch that REJECTED — the request never produced a response.
 * It was not in this union until 2026-09-21, so it escaped `readProjectFileOptional`
 * and was caught by the effect's outer `.catch`, landing in `stage: "open"`.
 * That label means `openComposition` threw (unparseable composition, OOM), and
 * it is what the largest failure class was reported as. Every `stage: open`
 * event measured on 0.8.56 and 0.8.57 carries a fetch-rejection message —
 * "Failed to fetch", "Load failed", "NetworkError when attempting to fetch
 * resource." — so the class was a network problem filed under a parser one, and
 * unaddressable in that bucket.
 *
 * `network` carries `elapsedMs` (time from fetch start to rejection) and
 * `hidden` (`document.visibilityState` at the moment of rejection) because
 * "the fetch rejected" alone conflates two very different situations: a
 * closing tab or a server that exited under a live one (rejects after a real
 * delay, `hidden` often true by the time it lands) versus a request blocked
 * before it left the browser — CSP `connect-src`, Private Network Access, an
 * extension rewriting `fetch` (rejects near-instantly, tab stays visible and
 * alive). Telemetry before this change could not tell the two apart.
 *
 * `absent` and `empty_file` split what `absent_or_empty` could not: the route
 * answers `content: ""` both for a file it cannot find (the `optional=1` shim)
 * and for a real 0-byte one, so the single label covered a composition nobody
 * has written yet AND a path that does not resolve on this server. The route
 * now marks the shim with `missing: true`. A server without that field still
 * lands in `absent_or_empty`, so the old series stays honest rather than
 * silently folding into one of the new ones.
 *
 * Measured on 0.8.62 before the split: 75 tabs hit this class and not one of
 * them ever landed an SDK edit afterwards — it is terminal for the tab, while
 * the tab itself keeps playing back and navigating, so nothing surfaces.
 *
 * `invalid_json` is a 200 whose body is not JSON at all — in production, an
 * HTML page (`Unexpected token '<', "<!-- /*!"...`), i.e. an SPA fallback or a
 * proxy answering in the route's place. `res.json()` rejected outside any
 * catch until now, so it escaped this function and the effect's outer catch
 * filed it as `stage: "open"` — which asserts the COMPOSITION failed to parse.
 * Third label to make that same wrong claim, after `network` (#4240) and the
 * fetch-rejection split; this one is the response shape, not the composition.
 */
type ProjectFileReadFailure =
  | { ok: false; reason: "unsafe_path" }
  | { ok: false; reason: "http_error"; status: number; why?: string }
  | { ok: false; reason: "missing_content" }
  | { ok: false; reason: "absent_or_empty" }
  | { ok: false; reason: "absent" }
  | { ok: false; reason: "empty_file" }
  | { ok: false; reason: "invalid_json"; contentType: string }
  | { ok: false; reason: "network"; elapsedMs: number; hidden: boolean };

type ProjectFileReadResult = { ok: true; content: string } | ProjectFileReadFailure;

/** The three ways a 200 can carry no composition — old combined label plus its split. */
const EMPTY_READ_REASONS = new Set<ProjectFileReadFailure["reason"]>([
  "absent_or_empty",
  "absent",
  "empty_file",
]);

/**
 * Record a read that produced no usable content, and answer which project — if
 * any — the failure identifies as unreachable.
 *
 * No SDK session follows a failed read, so EVERY cutover chokepoint takes the
 * server path and emits nothing — the shadow never runs either. A broken read
 * would otherwise be a silent, total SDK bypass, which is why this is recorded
 * at all.
 *
 * Only a 404 identifies the *project*: the server answered, and its answer was
 * that it does not serve this id. A 5xx, a dropped request, an unexpected body
 * and an empty file all say nothing about which project the server serves, so
 * none of them claim it. See `unreachableProject` on the handle.
 *
 * A function rather than three more conditions inline: the read callback it is
 * called from is a long pre-existing async body already near the complexity
 * threshold, and this branch is one coherent unit.
 */
function reportReadFailure(
  read: ProjectFileReadFailure,
  projectId: string,
  pathInTree: boolean | null,
): string | null {
  trackStudioEvent("sdk_session_unavailable", {
    stage: "read",
    reason: read.reason,
    ...(read.reason === "http_error" ? { status: read.status, why: read.why } : {}),
    ...(read.reason === "network" ? { elapsed_ms: read.elapsedMs, hidden: read.hidden } : {}),
    ...(read.reason === "invalid_json" ? { content_type: read.contentType } : {}),
    // Only meaningful for the empty-read reasons — the graveyard-refuted "clear
    // activeCompPath when it's not in the tree" fix's proposed next step,
    // scoped to instrumentation only. `null` while the tree hasn't loaded
    // yet: a false-negative there would read as "genuinely absent" when it is
    // really "haven't looked". Carried on all three so the split keeps the
    // signal that made it worth splitting: every measured case so far is
    // `path_in_tree: true`, a file the tree lists and this read cannot get.
    ...(EMPTY_READ_REASONS.has(read.reason) ? { path_in_tree: pathInTree } : {}),
  });
  if (read.reason !== "http_error") return null;
  return read.status === 404 ? projectId : null;
}

// The request never produced a response: offline, the dev server gone, a
// CSP/Private-Network-Access block, or an extension rewriting fetch. Called
// from the fetch's own catch so it is reported as a READ failure — left to
// propagate, the effect's outer catch reported it as `stage: "open"`, which
// claims the composition failed to parse. Every `stage: open` event before
// this change was this branch, so the label made the largest class
// unaddressable.
//
// `elapsedMs` and `hidden` (read synchronously, right at the moment of
// rejection, so they survive whenever the event itself does) are the
// discriminator between "blocked before send" (near-zero elapsed) and "the
// tab/server went away mid-flight" (real elapsed, often already hidden) —
// see the type's doc comment.
function networkReadFailure(
  fetchStarted: number,
): Extract<ProjectFileReadFailure, { reason: "network" }> {
  return {
    ok: false,
    reason: "network",
    elapsedMs: Math.round(performance.now() - fetchStarted),
    hidden: typeof document !== "undefined" && document.visibilityState === "hidden",
  };
}

// `why` distinguishes the studio-server route's own 403/404 causes (a NUL
// byte, a path escaping the project, or — the one that used to read as a
// plain path-traversal 403 — this project's folder having been renamed or
// deleted out from under a still-running server) that a bare status code
// cannot. Best-effort: an older server or a non-JSON error body just omits it.
async function httpReadFailureWhy(res: Response): Promise<string | undefined> {
  const body = (await res.json().catch(() => null)) as { why?: unknown } | null;
  return typeof body?.why === "string" ? body.why : undefined;
}

interface ProjectFileBody {
  content?: string;
  /** Present only from a server that separates its shim from a real 0-byte file. */
  missing?: boolean;
}

/**
 * Decide what a 200 with a JSON body actually delivered.
 *
 * `optional=1` answers a missing file with 200 + `content: ""`, so a non-string
 * content is a response shape we did not expect, not absence. An empty string
 * parses into a session with no elements, which declines every edit wholesale —
 * not a session worth opening — and `missing` is the route saying which of the
 * two empties it was. Without that field (older server) the combined label
 * stands rather than guessing one and corrupting the series.
 */
function classifyProjectFileBody(data: ProjectFileBody): ProjectFileReadResult {
  if (typeof data.content !== "string") return { ok: false, reason: "missing_content" };
  if (data.content !== "") return { ok: true, content: data.content };
  if (data.missing === true) return { ok: false, reason: "absent" };
  if (data.missing === false) return { ok: false, reason: "empty_file" };
  return { ok: false, reason: "absent_or_empty" };
}

/**
 * Read a project file's content (optional read — a missing file is not an
 * error). Replaces the removed SDK http adapter's `read()` — the only thing
 * Studio used it for (Studio is the sole writer, so the adapter's write path
 * was dead).
 */
async function readProjectFileOptional(
  projectId: string,
  path: string,
): Promise<ProjectFileReadResult> {
  // Reject traversal / NUL before building the request URL — `path` is a
  // user-influenced composition path (mirrors the guard in timelineEditingHelpers,
  // and closes the CodeQL client-side-request-forgery flag). encodeURIComponent
  // already confines both values to single segments of this same-origin URL.
  if (path.includes("\0") || path.includes("..")) return { ok: false, reason: "unsafe_path" };
  let res: Response;
  const fetchStarted = performance.now();
  try {
    res = await studioApiFetch(
      `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(path)}?optional=1`,
    );
  } catch {
    return networkReadFailure(fetchStarted);
  }
  if (!res.ok) {
    const why = await httpReadFailureWhy(res);
    return { ok: false, reason: "http_error", status: res.status, ...(why ? { why } : {}) };
  }
  // A 200 that is not JSON is a different failure from a JSON body missing its
  // field: it means something other than this route answered — an SPA fallback
  // or a proxy. Left unguarded, it rejected out of this function entirely and
  // the effect's outer catch blamed the composition. See the type's comment.
  let data: ProjectFileBody;
  try {
    data = (await res.json()) as ProjectFileBody;
  } catch {
    return {
      ok: false,
      reason: "invalid_json",
      contentType: res.headers.get("content-type") ?? "",
    };
  }
  return classifyProjectFileBody(data);
}

/**
 * Stage 7 Step 3a — SDK session wired to the active composition.
 *
 * Creates an SDK Composition (reading the file via the project files API) on
 * every (projectId, activeCompPath) change, disposes the old one on cleanup, and
 * re-opens it when the active composition file changes on disk (code editor,
 * agent, or server-side patch) so the in-memory linkedom document never goes
 * stale. The session has NO persist queue — Studio is the sole file writer; see
 * the open effect below.
 */
/**
 * Decide whether a file-change for the active composition should reload the SDK
 * session. `content` is the new on-disk bytes (from the payload or a re-read);
 * pass null when unavailable. Content-identity wins: a change whose bytes match a
 * registered self-write is our own echo (suppress). Without content we can't prove
 * identity, so we fall back to the time window ONLY to suppress an echo — an undo
 * write outside the window (or any non-self-write) still reloads. Exported for test.
 */
export function shouldReloadOnFileChange(
  activeCompPath: string,
  content: string | null,
  withinSuppressWindow: boolean,
): boolean {
  if (content != null) return !isSelfWriteEcho(activeCompPath, content);
  // No content to compare — preserve the old time-window echo suppression.
  return !withinSuppressWindow;
}

export interface SdkSessionHandle {
  session: Composition | null;
  /** Atomically publish a fully persisted candidate session. */
  publish: PublishSdkSession;
  /**
   * Force a session reload immediately, bypassing the self-write suppress
   * window. Call after undo/redo writes the active composition file so the
   * SDK in-memory document reflects the reverted content. Without it the
   * window swallows the file-change and the session stays stale; the write
   * side of that path is covered by usePersistentEditHistory.test.ts.
   */
  forceReload: () => void;
  /**
   * Set when this server answered the composition read with a 404 for the
   * project it was asked to open. In the CLI-embedded host — the only host
   * that reports telemetry at all (`telemetry/policy.ts` suppresses Vite dev)
   * — that does not mean the project is gone. It means this Studio is serving
   * a *different* one; the project is untouched on disk. Either way every edit
   * in this tab fails, and until now it failed silently.
   *
   * `null` for every other failure: a 500 or a dropped request says nothing
   * about which project the server serves, and `absent_or_empty` /
   * `missing_content` say nothing about the project at all.
   */
  unreachableProject: string | null;
  /**
   * True when the most recent read of `activeCompPath` reported `reason:
   * "absent"` — the file tree lists this path and the server cannot get it.
   * Proven 2026-09-23 to mean a stale tree: `refreshFileTree` only runs after
   * Studio's own file operations, so an external change (an agent removing
   * or replacing the file) updates the preview and this session but never
   * the listing, and the file stays clickable forever. Every edit then fails
   * silently with nothing to tell the user why — this is that signal.
   */
  compositionMissing: boolean;
}

interface SdkSessionOwner {
  projectId: string;
  path: string;
  reloadToken: number;
  generation: number;
}

interface OwnedSdkSession extends SdkSessionOwner {
  session: Composition;
}

function isSessionOwnerActive(
  owner: SdkSessionOwner | undefined,
  projectId: string | null,
  path: string | null,
  targetPath: string,
): owner is SdkSessionOwner {
  if (!owner) return false;
  return owner.projectId === projectId && owner.path === path && owner.path === targetPath;
}

function isSessionOwnerCurrent(
  owner: SdkSessionOwner,
  generation: number,
  projectId: string | null,
  path: string | null,
  reloadToken: number,
): boolean {
  return (
    owner.generation === generation &&
    owner.projectId === projectId &&
    owner.path === path &&
    owner.reloadToken === reloadToken
  );
}

function ownsExpectedSession(
  current: OwnedSdkSession | null,
  expectedOwner: SdkSessionOwner,
  expectedSession: Composition,
  reloadToken: number,
): current is OwnedSdkSession {
  if (!current) return false;
  return (
    current.session === expectedSession &&
    current.generation === expectedOwner.generation &&
    current.reloadToken === reloadToken
  );
}

function disposeSdkSession(session: Composition): void {
  try {
    session.dispose();
  } catch (error) {
    trackStudioEvent("sdk_session_dispose_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function useSdkSession(
  projectId: string | null,
  activeCompPath: string | null,
  // Optional: only the app's primary session (App.tsx, wired to
  // useFileManager's tree) can answer `path_in_tree` on an `absent_or_empty`
  // read. A secondary session opened for a promote/bind target
  // (DesignPanelPromoteProvider) has no tree of its own to check against and
  // reports `null`, same as before the tree loads.
  fileTree: readonly string[] = [],
  fileTreeLoaded = false,
  // Fallback for the SSE-driven refresh in useExternalFileChangeCoordinator:
  // called at most once per (projectId, path) so the tree self-corrects even
  // when that delivery is missed (server restart, a watcher event the SSE
  // never sent). Optional for the same reason fileTree is: a secondary
  // session has no tree of its own to refresh.
  onAbsentRead?: (path: string) => void,
): SdkSessionHandle {
  const [ownedSession, setOwnedSession] = useState<OwnedSdkSession | null>(null);
  const ownedSessionRef = useRef<OwnedSdkSession | null>(null);
  const sessionOwnersRef = useRef(new WeakMap<Composition, SdkSessionOwner>());
  const generationRef = useRef(0);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  const activeCompPathRef = useRef(activeCompPath);
  activeCompPathRef.current = activeCompPath;
  const [reloadToken, setReloadToken] = useState(0);
  const reloadTokenRef = useRef(reloadToken);
  reloadTokenRef.current = reloadToken;
  const [unreachableProject, setUnreachableProject] = useState<string | null>(null);
  const [compositionMissing, setCompositionMissing] = useState(false);
  // Keyed `${projectId}:${path}` so a refresh that doesn't fix it (the file
  // really is gone) can't loop, and so it fires again for a genuinely
  // different path or project.
  const refreshedAbsentPathsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    refreshedAbsentPathsRef.current.clear();
  }, [projectId]);

  /**
   * Update `unreachableProject`/`compositionMissing` for one failed read, and
   * fire the once-per-path tree-refresh fallback on `absent`. Pulled out of
   * the open effect's `.then` — the branching there was pushing that
   * callback over the complexity threshold on its own.
   */
  function handleReadFailure(
    read: ProjectFileReadFailure,
    forProjectId: string,
    forPath: string,
  ): void {
    const pathInTree = fileTreeLoaded ? fileTree.includes(forPath) : null;
    setUnreachableProject(reportReadFailure(read, forProjectId, pathInTree));
    setCompositionMissing(read.reason === "absent");
    if (read.reason !== "absent") return;
    const key = `${forProjectId}:${forPath}`;
    if (refreshedAbsentPathsRef.current.has(key)) return;
    refreshedAbsentPathsRef.current.add(key);
    onAbsentRead?.(forPath);
  }

  useEffect(
    () =>
      addExternalFileReloadListener((changedPath) => {
        // "." is a project-wide change (a reconnect or a replaced folder): every session reloads.
        if (changedPath === "." || changedPath === activeCompPathRef.current) {
          setReloadToken((token) => token + 1);
        }
      }),
    [],
  );

  // ── Open / re-open the session ──
  useEffect(() => {
    const generation = ++generationRef.current;
    let cancelled = false;

    // The preceding effect normally released its generation first. Clear any
    // remaining owner defensively so an invalid project/path cannot retain it.
    const previous = ownedSessionRef.current;
    ownedSessionRef.current = null;
    setOwnedSession(null);
    if (previous) disposeSdkSession(previous.session);

    if (!projectId || !activeCompPath) {
      setUnreachableProject(null);
      setCompositionMissing(false);
      return () => {
        cancelled = true;
      };
    }

    const owner: SdkSessionOwner = {
      projectId,
      path: activeCompPath,
      reloadToken,
      generation,
    };

    // Parsing the source for editing takes the main thread for hundreds of ms on a large film;
    // the first frame and play do not need it, so it waits for the live preview to boot.
    whenPreviewBooted(projectId)
      .then((booted) =>
        cancelled || !booted ? null : readProjectFileOptional(projectId, activeCompPath),
      )
      .then(async (read) => {
        if (!read || cancelled) return;
        if (!read.ok) {
          handleReadFailure(read, projectId, activeCompPath);
          return;
        }
        setUnreachableProject(null);
        setCompositionMissing(false);
        const content = read.content;
        // No persist queue: Studio's writeProjectFile (via sdkCutover's
        // persistSdkSerialize) is the SINGLE writer. Wiring the SDK persist
        // queue too would double-write the file (queue auto-writes on every
        // 'change' AND Studio writes explicitly) and race on disk; it would
        // also write the full active-composition serialization to the fixed
        // persistPath even when an edit targeted a sub-composition file.
        // Studio's editHistory is the authoritative undo stack — SDK history
        // is unused dead weight here (forceReloadSdkSession discards it on undo).
        const comp = await openComposition(content, { history: false });
        // Cleanup may have fired while openComposition was awaited; dispose immediately.
        if (cancelled) {
          disposeSdkSession(comp);
          return;
        }
        if (
          !isSessionOwnerCurrent(
            owner,
            generationRef.current,
            projectIdRef.current,
            activeCompPathRef.current,
            reloadTokenRef.current,
          )
        ) {
          disposeSdkSession(comp);
          // Not a failure: project/path/reloadToken moved on while this open was
          // in flight, and the effect that owns the new identity already opened
          // (or is opening) its own session. Emitting this as `sdk_session_unavailable`
          // counted a benign race as a broken precondition on the cutover dashboard.
          trackStudioEvent("sdk_session_superseded", {});
          return;
        }
        const displaced = ownedSessionRef.current;
        const installed = { ...owner, session: comp };
        sessionOwnersRef.current.set(comp, owner);
        ownedSessionRef.current = installed;
        setOwnedSession(installed);
        if (displaced && displaced.session !== comp) disposeSdkSession(displaced.session);
      })
      .catch((error: unknown) => {
        if (!cancelled && generationRef.current === generation) {
          setOwnedSession(null);
          // openComposition threw (unparseable composition, OOM) — same total
          // bypass as the read failure above, but this one is a real defect
          // rather than a missing file. Carry the message; it is the only clue.
          //
          // A rejected read no longer reaches here: `readProjectFileOptional`
          // catches its own fetch rejection and answers `reason: "network"`, so
          // this stage now means what it says. Before that, every event in this
          // bucket was a network error wearing a parser's label.
          trackStudioEvent("sdk_session_unavailable", {
            stage: "open",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
      // Publication preserves this generation, so cleanup releases whichever
      // session it currently owns (the initially opened one or its candidate).
      const owned = ownedSessionRef.current;
      if (owned?.generation === generation) {
        ownedSessionRef.current = null;
        disposeSdkSession(owned.session);
      }
    };
    // fileTree/fileTreeLoaded/onAbsentRead deliberately excluded: they only
    // annotate or react to a read-failure event fired from this same effect
    // run (the diagnostic "was the path in the last-loaded tree" snapshot,
    // and the tree-refresh fallback), and re-running the whole open/dispose
    // cycle on every tree refresh or on every render (callers are not
    // required to memoize onAbsentRead) would drop and reopen a perfectly
    // good session far more often than the tree actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeCompPath, reloadToken]);

  const forceReload = useCallback(() => setReloadToken((t) => t + 1), []);
  const publish = useCallback<PublishSdkSession>(({ candidate, expectedSession, targetPath }) => {
    const expectedOwner = sessionOwnersRef.current.get(expectedSession);
    const current = ownedSessionRef.current;
    if (
      !isSessionOwnerActive(
        expectedOwner,
        projectIdRef.current,
        activeCompPathRef.current,
        targetPath,
      )
    ) {
      return "rejected-inactive-target";
    }
    if (!ownsExpectedSession(current, expectedOwner, expectedSession, reloadTokenRef.current)) {
      // The durable write won, but another session was installed for this same
      // path before publication. Its self-write echo will be suppressed, so
      // explicitly re-open it from disk instead of leaving it stale.
      setReloadToken((t) => t + 1);
      return "rejected-active-target";
    }
    const next: OwnedSdkSession = { ...current, session: candidate };
    sessionOwnersRef.current.set(candidate, current);
    ownedSessionRef.current = next;
    setOwnedSession(next);
    if (current.session !== candidate) disposeSdkSession(current.session);
    return "published";
  }, []);
  const session =
    ownedSession?.projectId === projectId &&
    ownedSession.path === activeCompPath &&
    ownedSession.reloadToken === reloadToken
      ? ownedSession.session
      : null;
  return { session, publish, forceReload, unreachableProject, compositionMissing };
}
