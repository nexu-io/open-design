// ---------------------------------------------------------------------------
// Single source of truth for the Studio telemetry distinct_id.
//
// Studio historically minted TWO independent anonymous ids:
//   - `hf-studio-anon-id`            (utils/studioTelemetry.ts → studio:* events)
//   - `hyperframes-studio:anonymousId` (telemetry/config.ts → studio_* + render events)
// so a single browser looked like two different people in PostHog. This module
// resolves ONE id that both clients (and the render→CLI channel) share.
//
// CLI→Studio identity stitch (Layer 1, no login / no PII):
// When the CLI launches Studio it injects its own `config.anonymousId`
// (a random UUID from ~/.hyperframes/config.json) as `window.__HF_CLI_DISTINCT_ID`
// (see packages/cli/src/server/studioServer.ts). When present we ADOPT it as the
// Studio distinct_id and persist it, so CLI `cli_command*` events and the
// browser's `studio:*` / `studio_*` / render events are attributed to the same
// PostHog person. When absent (Studio opened standalone) we fall back to the
// previous per-browser localStorage id — behaviour is unchanged.
// ---------------------------------------------------------------------------

import { generateId } from "../utils/generateId";
import { safeLocalStorage } from "../utils/safeStorage";

// Canonical storage key. Both legacy keys are kept in sync (below) so any code
// still reading them directly, plus older cached values, resolve to one id.
export const DISTINCT_ID_KEY = "hyperframes-studio:anonymousId";
// Legacy key used by utils/studioTelemetry.ts for `studio:*` events.
export const LEGACY_STUDIO_ANON_ID_KEY = "hf-studio-anon-id";

// Global injected by the CLI's embedded studio server at page load. Read-only
// from the browser's perspective.
declare global {
  interface Window {
    __HF_CLI_DISTINCT_ID?: string;
  }
}

let cachedId: string | null = null;

/**
 * The distinct_id the CLI seeded into the page, if any. A non-empty string
 * means "this Studio was launched by the HyperFrames CLI, adopt its identity".
 */
export function getCliDistinctId(): string | null {
  try {
    const id = typeof window === "undefined" ? undefined : window.__HF_CLI_DISTINCT_ID;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

// Persist to both the canonical and legacy keys so the two Studio clients and
// any cached reads converge on one id. Best-effort — private browsing / quota
// failures are non-fatal (we still return the in-memory id for this session).
function persist(ls: Storage, id: string): void {
  for (const key of [DISTINCT_ID_KEY, LEGACY_STUDIO_ANON_ID_KEY]) {
    try {
      ls.setItem(key, id);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Resolve the single Studio telemetry distinct_id.
 *
 * Precedence:
 *   1. CLI-seeded id (`window.__HF_CLI_DISTINCT_ID`) — adopted + persisted so
 *      the browser session joins the CLI machine's PostHog person.
 *   2. Existing persisted id (canonical or legacy key) — unchanged behaviour.
 *   3. A freshly generated UUID — persisted for future loads.
 *
 * Memoized per module instance so repeated calls in a session are stable even
 * if localStorage is unavailable.
 */
export function resolveStudioDistinctId(): string {
  if (cachedId) return cachedId;

  const ls = safeLocalStorage();

  // 1. CLI-seeded identity wins. Adopt + persist so it's stable across reloads
  //    and shared by every Studio telemetry path.
  const cliId = getCliDistinctId();
  if (cliId) {
    cachedId = cliId;
    if (ls) persist(ls, cliId);
    return cliId;
  }

  // 2. Reuse an existing persisted id (prefer canonical, fall back to legacy).
  if (ls) {
    // getItem can throw in storage-restricted contexts (partitioned / sandboxed
    // storage) even when the localStorage reference itself resolved — stay
    // fail-silent (telemetry must never break Studio) and treat it as "no id".
    let existing: string | null = null;
    try {
      existing = ls.getItem(DISTINCT_ID_KEY) ?? ls.getItem(LEGACY_STUDIO_ANON_ID_KEY);
    } catch {
      /* ignore */
    }
    if (existing) {
      cachedId = existing;
      // Backfill the other key so both clients agree going forward.
      persist(ls, existing);
      return existing;
    }
  } else {
    // No storage at all (SSR / locked-down browser): stable within the
    // session, but RANDOM per session rather than a shared literal.
    //
    // It used to be the constant "anonymous", which made every
    // storage-restricted profile one bucketing unit: computed against the
    // shipped hash, `calibration-50:anonymous` lands in bucket 44, so 100% of
    // that population was enrolled at a nominal 50% and would flip together
    // on any ramp. It also merged unrelated users into a single PostHog
    // person. A per-session id spreads them and keeps them distinct, while
    // persisting nothing.
    // `cachedId` is guaranteed null here (early-returned at the top otherwise).
    cachedId = generateId();
    return cachedId;
  }

  // 3. Mint a new id and persist it.
  const id = generateId();
  cachedId = id;
  persist(ls, id);
  return id;
}

/** Test-only: clear the memoized id so a fresh resolution can be exercised. */
export function __resetStudioDistinctIdForTests(): void {
  cachedId = null;
}
