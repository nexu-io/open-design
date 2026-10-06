import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isPreviewBuildFocusReady,
  parsePreviewBuildFocusResult,
  parsePreviewBuildFocusSections,
  previewBuildFocusRequest,
  type PreviewSection,
} from '@open-design/contracts/runtime/preview-build-focus';

import { useT } from '../../i18n';
import { appendResourceQuery } from '../../collab/workspace-identity';
import { projectRawUrl } from '../../providers/registry';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { ProjectFile } from '../../types';
import type { RunProgressStep } from '../../runtime/run-progress';
import { RunStepFeed } from './RunStepFeed';
import { stepLabel } from './run-step-label';
import styles from './DesignFilesBuildingState.module.css';

interface Props {
  projectId: string;
  /** The page being built — see `selectBuildPreviewHtmlEntry`. */
  file: ProjectFile;
  /** Bumped on every coalesced `file-changed` batch; part of the cache bust. */
  filesRefreshKey: number;
  /** The running turn's tool calls, newest first. */
  steps: RunProgressStep[];
  workspaceContext: WorkspaceCollabContext | null;
}

interface FocusRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Keeps the cursor from being drawn half outside the pane. */
const EDGE_MARGIN = 28;

/** How long the cursor rests on each part that just landed before moving to
 *  the next one. Long enough to read the label, short enough that a page of
 *  six parts is walked in about the time the next write takes. */
const SECTION_DWELL_MS = 1200;

/**
 * The page the agent is building, live, with a cursor on the part it is writing
 * right now.
 *
 * This is the middle state the pane never had: before it, an empty project
 * showed the starter CTAs; after the first file landed, the pane jumped
 * straight to a grid of file cards. Neither showed the artifact taking shape.
 *
 * The frame is a real URL-load preview of the file on disk, reloaded on each
 * settled write (the daemon's watcher already debounces the write, and the host
 * coalesces the events, so this does not thrash).
 *
 * The way back to the file grid is the topbar's preview switch
 * (`BuildPreviewToggle`), not a button on top of the page — see that component
 * for why this surface no longer carries its own.
 *
 * The cursor walks the page's own PARTS. After every load the frame's bridge
 * broadcasts the top-level sections it can see, each with a label taken from
 * its heading (or id, or tag); the host keeps the keys it has already seen, so
 * what comes back after a write is exactly what that write added. It then
 * rests the cursor on each new part in document order, naming it — which is
 * what "the agent is on this module now" looks like when a whole page lands in
 * one Write, where a single anchor would have jumped straight to the footer.
 *
 * Between tours the cursor falls back to the anchor: the current step carries a
 * literal string of what it just wrote (`RunProgressStep.anchor`), the bridge
 * finds that text, scrolls it into view, and reports its box back — which is
 * the right target for an edit INSIDE a part that already exists. When neither
 * a section nor an anchor can be matched — a CSS-only edit, a rewritten line —
 * the caption still says what is happening and the cursor stays hidden rather
 * than pointing at a guess.
 */
export function DesignFilesBuildingState({
  projectId,
  file,
  filesRefreshKey,
  steps,
  workspaceContext,
}: Props) {
  const t = useT();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [focus, setFocus] = useState<FocusRect | null>(null);
  const requestIdRef = useRef<string | null>(null);
  // The parts this preview has already shown. Everything the frame reports that
  // is NOT in here is what the run just wrote.
  const seenSectionsRef = useRef<Set<string>>(new Set());
  const [walk, setWalk] = useState<{ sections: PreviewSection[]; index: number } | null>(null);
  const current = steps[0] ?? null;
  const anchor = current?.anchor ?? null;

  const src = useMemo(
    () =>
      appendResourceQuery(
        projectRawUrl(projectId, file.name, workspaceContext),
        // `v` is the established mtime bust; `fr` is the necessary second half —
        // an agent can rewrite the same file twice inside one filesystem mtime
        // tick, and the refresh key moves on every coalesced change batch.
        `v=${Math.round(file.mtime)}&fr=${filesRefreshKey}&odPreviewBridge=buildfocus`,
      ),
    [projectId, file.name, file.mtime, filesRefreshKey, workspaceContext],
  );

  const request = useCallback((text: string | null, section: string | null) => {
    const frame = frameRef.current;
    const target = frame?.contentWindow;
    if (!target) return;
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    requestIdRef.current = requestId;
    setFocus(null);
    target.postMessage(previewBuildFocusRequest(requestId, text, section), '*');
  }, []);

  const requestAnchor = useCallback(() => request(anchor, null), [request, anchor]);

  // A different page means a different set of parts; nothing carries over.
  useEffect(() => {
    seenSectionsRef.current = new Set();
    setWalk(null);
  }, [projectId, file.name]);

  // A new step means a new place to point at; the frame keeps its document.
  // A tour of the parts that just landed owns the cursor while it runs.
  useEffect(() => {
    if (walk) return;
    requestAnchor();
  }, [requestAnchor, src, walk]);

  // The tour: one stop per new part, in the order the page has them.
  useEffect(() => {
    if (!walk) return;
    const stop = walk.sections[walk.index];
    if (!stop) {
      setWalk(null);
      return;
    }
    request(null, stop.key);
    const timer = setTimeout(() => {
      setWalk((tour) => {
        if (!tour) return null;
        const next = tour.index + 1;
        return next < tour.sections.length ? { sections: tour.sections, index: next } : null;
      });
    }, SECTION_DWELL_MS);
    return () => clearTimeout(timer);
  }, [walk, request]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // The frame is sandboxed without `allow-same-origin`, so its origin is
      // the opaque "null" — identity has to come from the window itself.
      if (event.source !== frameRef.current?.contentWindow) return;
      if (isPreviewBuildFocusReady(event.data)) {
        requestAnchor();
        return;
      }
      const sections = parsePreviewBuildFocusSections(event.data);
      if (sections) {
        const seen = seenSectionsRef.current;
        const fresh = sections.filter((section) => !seen.has(section.key));
        for (const section of sections) seen.add(section.key);
        // Nothing new: this load only changed things inside parts that were
        // already there, and the step's own anchor is the better target.
        if (fresh.length > 0) setWalk({ sections: fresh, index: 0 });
        return;
      }
      const result = parsePreviewBuildFocusResult(event.data);
      if (!result) return;
      if (result.requestId !== requestIdRef.current) return;
      setFocus(
        result.found
          ? { x: result.x, y: result.y, width: result.width, height: result.height }
          : null,
      );
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [requestAnchor]);

  // On a tour the cursor is pointing AT a part, so it says which part. Off it,
  // it says what the run is doing — the step, worded as Chat's card titles it.
  const stop = walk ? walk.sections[walk.index] ?? null : null;
  const caption = stop
    ? stop.label
    : current
      ? stepLabel(current, t)
      : t('assistant.thinking');
  const cursorStyle = focus
    ? {
        transform: `translate3d(${Math.max(EDGE_MARGIN, focus.x + focus.width / 2)}px, ${Math.max(
          EDGE_MARGIN,
          focus.y + focus.height / 2,
        )}px, 0)`,
      }
    : undefined;

  return (
    <div className={styles.stage} data-testid="design-files-building">
      <iframe
        ref={frameRef}
        key={`${projectId}:${file.name}`}
        className={styles.frame}
        src={src}
        title=""
        // No `allow-same-origin`: this is generated, untrusted markup and the
        // host needs nothing from it but postMessage.
        sandbox="allow-scripts"
        tabIndex={-1}
        onLoad={requestAnchor}
      />
      <div className={styles.overlay} aria-hidden>
        {focus ? (
          <span className={styles.cursor} style={cursorStyle} data-testid="build-focus-cursor">
            <span className={styles.cursorRing} />
            <svg
              className={styles.cursorGlyph}
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M9.4 13V8a1.8 1.8 0 0 1 3.6 0v4.6c0-.9.7-1.6 1.6-1.6.9 0 1.6.7 1.6 1.6 0-.9.7-1.6 1.6-1.6.9 0 1.6.7 1.6 1.6v3.1c0 2.4-1.9 4.3-4.3 4.3h-1.9c-1.4 0-2.7-.7-3.5-1.9l-2.4-3.6a1.6 1.6 0 0 1 2.4-2l.7.9Z"
                fill="#fff"
                stroke="#1a1a1a"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
            </svg>
            <span className={styles.cursorCaption}>{caption}</span>
          </span>
        ) : null}
      </div>
      {/* What is being built, and the log of how it got here. The cursor's own
          caption names the CURRENT step, so this row names the page instead —
          repeating the step in both places would say one thing twice. */}
      <div className={styles.dock}>
        <p className={styles.dockCaption} role="status">
          {file.name}
        </p>
        <RunStepFeed running steps={steps} className={styles.dockFeed} />
      </div>
    </div>
  );
}
