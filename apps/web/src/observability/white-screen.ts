// White-screen detector.
//
// Fires `client_white_screen` when the app fails to mount after a
// generous timeout. The detection runs once at module load, sets a single
// timer, and (importantly) cancels itself the moment the React root mounts
// content — so a perfectly normal boot produces zero events.
//
// Success condition (anything below is treated as "still showing a
// pre-mount skeleton" and the timer keeps running):
//
//   1. The App component has set `data-od-app-mounted="1"` on
//      `<html>` (its very first `useEffect` runs that). This is the
//      authoritative marker — once App has rendered at all, any later
//      tree crash is a `$exception` story, not a white-screen story.
//   2. *Fallback only.* If the marker is missing (a render-time crash
//      that prevented the effect from firing, or older app build
//      without the marker), we accept "any non-loading-shell child of
//      <body> with > MIN_VISIBLE_TEXT visible text". This guards
//      against the loading sentinel
//      `<div class="od-loading-shell">Loading Open Design…</div>`
//      being mistaken for a mount (codex review on PR #2527).
//
// We do not try to discriminate between "still loading" and "white screen
// caused by a render error" — both are equally bad from the user's seat,
// and the latter usually accompanies a `$exception` we'll already have
// captured via `error-tracking.ts`.

import { reportSafetyEvent } from '../analytics/error-tracking';

const APP_MOUNT_TIMEOUT_MS = 5000;
// Below this floor we treat the root as still showing the skeleton shell.
const MIN_VISIBLE_TEXT = 10;
// Class names that signal "still loading" — we ignore them when computing
// whether the app rendered something meaningful. `od-loading-shell` is
// the dynamic-import fallback rendered by `client-app.tsx`.
const LOADING_SHELL_CLASSES = new Set(['od-loading-shell']);
const APP_MOUNTED_ATTR = 'data-od-app-mounted';

export function installWhiteScreenDetector(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  if (typeof document === 'undefined') return () => undefined;

  let cancelled = false;
  const timer = window.setTimeout(() => {
    if (cancelled) return;
    if (isAppMounted()) return;
    reportSafetyEvent('client_white_screen', {
      reason: 'app_not_mounted_after_timeout',
      timeout_ms: APP_MOUNT_TIMEOUT_MS,
      ready_state: document.readyState,
      // Whether the user has navigated away from the tab — `hidden`
      // backgrounded tabs throttle setTimeout, so a "white screen" here
      // is much more likely an OS-side scheduling artifact than a real
      // mount failure. Surfacing it lets us filter the noise.
      visibility_state: document.visibilityState,
      body_child_count: document.body?.children.length ?? 0,
    });
  }, APP_MOUNT_TIMEOUT_MS);

  // Cancel the timer as soon as the app renders something meaningful.
  // `requestIdleCallback` (when available) batches the check so we don't
  // poll for every microtask; the fallback chain keeps it working in
  // Safari which still ships without rIC.
  const stopMonitor = monitorMount(() => {
    if (cancelled) return;
    cancelled = true;
    window.clearTimeout(timer);
  });

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    stopMonitor();
  };
}

function isAppMounted(): boolean {
  if (typeof document === 'undefined') return false;
  // Primary signal: the App component's mount effect ran.
  if (document.documentElement.getAttribute(APP_MOUNTED_ATTR) === '1') {
    return true;
  }
  // Fallback: scan the body subtree for content that ISN'T just the
  // dynamic-import loading shell. We only count children whose classList
  // doesn't contain a known loading-shell marker; their visible text
  // determines whether something meaningful is on-screen.
  const root = document.getElementById('__next') ?? document.body;
  if (!root) return false;
  const meaningful = Array.from(root.children).filter((el) => !isLoadingShell(el));
  if (meaningful.length === 0) return false;
  const text = meaningful
    .map((el) => (el as HTMLElement).innerText ?? el.textContent ?? '')
    .join('')
    .trim();
  if (text.length < MIN_VISIBLE_TEXT) return false;
  return true;
}

function isLoadingShell(el: Element): boolean {
  for (const name of LOADING_SHELL_CLASSES) {
    if (el.classList.contains(name)) return true;
  }
  return false;
}

function monitorMount(onMounted: () => void): () => void {
  let stopped = false;
  const observer = new MutationObserver(() => {
    if (stopped) return;
    if (isAppMounted()) {
      stopped = true;
      observer.disconnect();
      onMounted();
    }
  });
  // Observe the whole body subtree — the React root is repeatedly
  // detached/reattached during hydration, so observing `#__next`
  // directly would stop firing the moment it gets replaced.
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  // Best-effort short-circuit: if the app is already mounted by the time
  // this hook runs (HMR, slow tab, etc.) we can fire immediately.
  if (isAppMounted()) {
    stopped = true;
    observer.disconnect();
    onMounted();
  }
  return () => {
    stopped = true;
    observer.disconnect();
  };
}
