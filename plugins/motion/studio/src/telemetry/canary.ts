// ---------------------------------------------------------------------------
// Studio (browser) binding for the shared canary registry.
//
// `@hyperframes/core` owns the decision and is deliberately pure — the caller
// supplies the unit id, the override and the exclusion. This file supplies
// those three from the browser, mirroring `packages/cli/src/telemetry/canary.ts`
// for the CLI. The public API is deliberately identical on both surfaces:
//
//   import { isCanaryEnabled } from "../telemetry/canary";
//   if (isCanaryEnabled("my-feature")) { ... }
//
// so a call site reads the same whether it runs in Node or the browser, and a
// canary can span both.
//
// Three things differ from the CLI, each for a reason:
//
// 1. UNIT ID — the CLI's bucket seed (`window.__HF_CLI_BUCKET_SEED`) when the
//    CLI launched Studio, so both surfaces bucket on the SAME unit and a
//    rollout spanning render and editor is coherent for that user. Standalone
//    Studio falls back to `resolveStudioDistinctId()` — the browser has no
//    second storage location, so its localStorage id doubles as the seed.
//
// 2. OVERRIDE — there is no `process.env` in a page, so the override is a URL
//    query param mirrored into sessionStorage (see `readOverride`).
//
// 3. EXCLUSION — `navigator.webdriver` stands in for the CLI's `is_ci`.
//    Automated browsers mint a fresh localStorage id per run, so their ids are
//    ephemeral and they would hop cohorts between runs — noise in the rollout
//    signal, and nothing learned about real users.
// ---------------------------------------------------------------------------

// Deep subpath imports, NOT the "@hyperframes/core" barrel. Studio is a
// browser bundle, and the barrel re-exports the whole core surface (parsers,
// lint, studio-server); pulling that in here drags a Node-oriented dependency
// graph into the bundle. These two modules are pure and leaf.
import {
  canaryFeatureProperties,
  evaluateCanary,
  parseCanaryOverride,
  type CanaryDecision,
} from "@hyperframes/core/canary";
import { CANARIES, findCanary } from "@hyperframes/core/canary-registry";
import { resolveStudioDistinctId } from "./distinctId";
import { browserTelemetryAllowed } from "./policy";
import { safeSessionStorage } from "../utils/safeStorage";

/** `my-feature` → `hf_canary_my_feature`, the query param and storage key. */
export function canaryParamName(name: string): string {
  return `hf_canary_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

// Injected by the CLI's studio server alongside __HF_CLI_DISTINCT_ID.
declare global {
  interface Window {
    __HF_CLI_BUCKET_SEED?: string;
    /**
     * Resolved per-canary outcome from the launching CLI. `forced` marks an
     * explicit `HF_CANARY_*` override as opposed to a percentage roll — the
     * two get different precedence against Studio's own opt-out.
     */
    __HF_CLI_CANARY_DECISIONS?: Record<string, { enabled?: boolean; forced?: boolean }>;
  }
}

/**
 * The launching CLI's decision for this canary, if it published one.
 *
 * When present this WINS over everything Studio could work out locally —
 * seed, URL override, registry percentage. Studio re-deriving cannot agree
 * with the CLI in the cases that matter most:
 *
 *   - telemetry off: the CLI resolves `telemetry_opt_out`, but Studio's
 *     opt-out is a separate localStorage flag it cannot see from here;
 *   - `HF_CANARY_*` override: env vars never cross into the browser;
 *   - no seed injected: Studio falls back to a different unit, i.e. a
 *     different bucket.
 *
 * In all three the CLI has already decided, and one render spanning both
 * surfaces must not run half-enrolled.
 */
function cliDecision(name: string): { enabled: boolean; forced: boolean } | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const decision = window.__HF_CLI_CANARY_DECISIONS?.[name];
    if (typeof decision?.enabled !== "boolean") return undefined;
    return { enabled: decision.enabled, forced: decision.forced === true };
  } catch {
    return undefined;
  }
}

/**
 * The bucketing unit. A CLI-launched Studio buckets on the CLI's SEED (which
 * survives config wipes via the install-state file), not its distinct id —
 * the CLI itself buckets on the seed, and the two surfaces must agree per
 * machine. Standalone Studio falls back to its own distinct id: the browser
 * has no second storage location, so localStorage IS both id and seed there.
 */
function resolveBucketUnit(): string {
  try {
    const seed = typeof window === "undefined" ? undefined : window.__HF_CLI_BUCKET_SEED;
    if (typeof seed === "string" && seed.length > 0) return seed;
  } catch {
    /* fall through */
  }
  return resolveStudioDistinctId();
}

const STORAGE_PREFIX = "hyperframes-studio:canary:";

/**
 * Resolve a manual override for one canary.
 *
 * `?hf_canary_my_feature=on` (also off/true/false/1/0/yes/no), mirrored into
 * sessionStorage so it survives in-app navigation and reloads within the tab.
 *
 * SESSION scope, not local, is the deliberate part. A URL is the right carrier
 * — it is shareable, which is what "support: open this link" and "QA: repro
 * with this on" actually need. But persisting a URL-borne override to
 * localStorage would mean one click silently pins that browser into a cohort
 * forever, long after anyone remembers why. Session scope keeps the link
 * useful and lets closing the tab be the reset.
 *
 * `?hf_canary_my_feature=reset` clears it explicitly.
 */
function readOverride(name: string): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  const key = canaryParamName(name);
  const storageKey = `${STORAGE_PREFIX}${name}`;
  const store = safeSessionStorage();

  let raw: string | null = null;
  try {
    raw = new URLSearchParams(window.location.search).get(key);
  } catch {
    raw = null;
  }

  if (raw !== null) {
    if (raw.trim().toLowerCase() === "reset") {
      store?.removeItem(storageKey);
      return undefined;
    }
    // Persist for the tab session so the override outlives the query string.
    try {
      store?.setItem(storageKey, raw);
    } catch {
      /* storage full / blocked — the param still applies to this page load */
    }
    return parseCanaryOverride(raw);
  }

  return parseCanaryOverride(store?.getItem(storageKey) ?? undefined);
}

/**
 * Automated browser? The browser analog of the CLI's CI exclusion.
 * `navigator.webdriver` is set by Playwright, Puppeteer and Selenium.
 */
function isAutomatedBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.webdriver === true;
}

/**
 * Memoized per page load, for the same reason the CLI memoizes per process: a
 * canary must not change its mind mid-session. A component that mounted
 * enrolled has to stay enrolled, and the telemetry has to agree with what the
 * user actually saw.
 */
const decisions = new Map<string, CanaryDecision>();

/** Test-only: drop memoized decisions so cases don't leak into each other. */
export function __resetStudioCanaryCacheForTests(): void {
  decisions.clear();
}

/** The uncached decision. Split out so `resolveCanary` is purely the memo. */
const forcedOutcome = (enabled: boolean): CanaryDecision => ({
  enabled,
  reason: enabled ? "forced_on" : "forced_off",
});

const cohortOutcome = (enabled: boolean): CanaryDecision => ({
  enabled,
  reason: enabled ? "in_cohort" : "out_of_cohort",
});

/**
 * Precedence, highest first:
 *
 *   1. An explicit `HF_CANARY_*` from the launching CLI. A deliberate operator
 *      choice — the documented escalation channel (dogfooding, bisect,
 *      panic-off) — so it wins outright, including over this profile's
 *      opt-out, exactly as a local URL override does.
 *   2. A local URL / sessionStorage override, same reasoning.
 *   3. This profile's telemetry opt-out. Checked BEFORE any percentage-derived
 *      CLI decision: the two surfaces have independent opt-outs, and CLI
 *      telemetry being on says nothing about whether THIS browser profile
 *      agreed to be measured. A cohort roll must never enrol an opted-out
 *      profile.
 *   4. The CLI's percentage decision — authoritative, since it already applied
 *      the shared seed and re-deriving is what let the surfaces disagree.
 *   5. Local evaluation (standalone Studio, or a canary the CLI didn't publish).
 */
function decideStudioCanary(name: string): CanaryDecision {
  const definition = findCanary(name);
  if (!definition) return { enabled: false, reason: "out_of_cohort" };

  const fromCli = cliDecision(definition.name);
  if (fromCli?.forced) return forcedOutcome(fromCli.enabled);

  const override = readOverride(definition.name);
  if (override === undefined) {
    if (!browserTelemetryAllowed()) return { enabled: false, reason: "telemetry_opt_out" };
    // Studio's exclusion is its own to apply: the CLI cannot see
    // navigator.webdriver, so adopting its cohort decision verbatim enrolled
    // Playwright/Puppeteer sessions driving a local `hyperframes preview` —
    // each minting a fresh localStorage id, precisely the ephemeral-id noise
    // the exclusion exists to keep out of the rollout signal.
    if (isAutomatedBrowser()) return { enabled: false, reason: "excluded" };
    if (fromCli !== undefined) return cohortOutcome(fromCli.enabled);
  }

  // An explicit override decides on evaluateCanary's first line without ever
  // reading unitId, so resolving the unit here would mint and PERSIST an
  // anonymous id purely as an unused argument — for a profile that may have
  // opted out. One click on a support link created a durable tracking id.
  if (override !== undefined) return forcedOutcome(override);

  return evaluateCanary({
    feature: definition.name,
    unitId: resolveBucketUnit(),
    percentage: definition.percentage,
    exclude: isAutomatedBrowser(),
  });
}

/**
 * Full decision including the reason. An unregistered name resolves to off
 * rather than throwing — a typo in a rollout control must never break the
 * editor.
 */
export function resolveCanary(name: string): CanaryDecision {
  const cached = decisions.get(name);
  if (cached) return cached;

  const decision = decideStudioCanary(name);

  decisions.set(name, decision);
  return decision;
}

/** Is this canary on for this Studio install? The everyday call. */
export function isCanaryEnabled(name: string): boolean {
  return resolveCanary(name).enabled;
}

/**
 * Canary assignments as PostHog flag properties (`$feature/canary-<name>`)
 * plus their `canary_reason_<name>`, attached to every Studio event so any
 * metric can be split by cohort — identical shape to the CLI, so a rollout
 * spanning both reads as one flag.
 *
 * The reason has to be here too, not just CLI-side. A CLI-launched Studio
 * adopts the CLI's decisions and shares its bucket seed, so a cohort flip can
 * surface on either surface; emitting attribution on only one of them makes
 * the two flip counts irreconcilable and leaves Studio-observed flips
 * unattributable — the exact ambiguity this property exists to remove.
 */
export function canaryEventProperties(): Record<string, string> {
  return canaryFeatureProperties(
    CANARIES.map((c) => {
      const { enabled, reason } = resolveCanary(c.name);
      return { name: c.name, enabled, reason };
    }),
  );
}
