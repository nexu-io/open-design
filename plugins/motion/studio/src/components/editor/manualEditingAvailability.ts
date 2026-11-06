export type StudioFeatureFlagEnv = Record<string, boolean | string | undefined>;

const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const FALSY_ENV_VALUES = new Set(["0", "false", "no", "off", "disabled"]);

export function resolveStudioBooleanEnvFlag(
  env: StudioFeatureFlagEnv,
  names: string[],
  fallback: boolean,
): boolean {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") continue;

    const normalized = value.trim().toLowerCase();
    if (!normalized) continue;
    if (TRUTHY_ENV_VALUES.has(normalized)) return true;
    if (FALSY_ENV_VALUES.has(normalized)) return false;
  }

  return fallback;
}

// `import.meta.env` is a Vite-only extension. In non-Vite ESM hosts
// (Next.js / Turbopack, Node, jest in some configs) it's undefined,
// and downstream `env[name]` reads would crash. Fall back to `{}` so
// every flag resolves to its declared default outside Vite. Direct
// property access keeps Vite's compile-time transform happy.
//
// When the studio is served as a pre-built SPA by the embedded Hono server,
// `import.meta.env` values were baked at build time. The server injects
// `window.__HF_STUDIO_ENV__` with any `VITE_STUDIO_*` env vars from the
// user's shell, so runtime overrides take precedence over baked defaults.
const runtimeEnv =
  typeof window !== "undefined"
    ? ((window as Window & { __HF_STUDIO_ENV__?: StudioFeatureFlagEnv }).__HF_STUDIO_ENV__ ?? {})
    : {};
const env = { ...(import.meta.env ?? {}), ...runtimeEnv } as StudioFeatureFlagEnv;

// Stage 7 SDK cutover — routes Studio edits through SDK dispatch instead of the
// server patch/mutation routes. Default TRUE as of the flip release (spec:
// 2026-09-17-studio-sdk-cutover-flip-design.md). Kill switch:
// VITE_STUDIO_SDK_CUTOVER_ENABLED=false (works at runtime via __HF_STUDIO_ENV__).
export const STUDIO_SDK_CUTOVER_ENABLED = resolveStudioBooleanEnvFlag(
  env,
  ["VITE_STUDIO_SDK_CUTOVER_ENABLED"],
  true,
);

/**
 * Per-family selection. Unset = every family (the master alone enables all).
 * Set `VITE_STUDIO_SDK_CUTOVER_FAMILIES=dom,timing` to RESTRICT to a subset.
 */
export const STUDIO_SDK_CUTOVER_FAMILIES = resolveEnabledSdkFamilies(
  env,
  STUDIO_SDK_CUTOVER_ENABLED,
);

// Resolver-parity tripwire (telemetry-only, decoupled from cutover).
// Runs the SDK resolver alongside any edit and emits sdk_resolver_shadow on
// divergence. Default true; disable via VITE_STUDIO_SDK_RESOLVER_SHADOW_ENABLED=false.
// Soak gate: retire once zero element_not_found divergences over a clean window.
export const STUDIO_SDK_RESOLVER_SHADOW_ENABLED = resolveStudioBooleanEnvFlag(
  env,
  ["VITE_STUDIO_SDK_RESOLVER_SHADOW_ENABLED"],
  true,
);

// Studio inspector redesign ("Ledger, flat" — design_handoff_studio_inspector):
// flat identity header/footer/groups. Default true as of v0.7.59+ bug-fix pass
// (right-aligned values, Stroke select-only, promote-badge overlap, Layout/
// Style section gating); disable via VITE_STUDIO_FLAT_INSPECTOR_ENABLED=false
// to fall back to the legacy panel.
export const STUDIO_FLAT_INSPECTOR_ENABLED = resolveStudioBooleanEnvFlag(
  env,
  ["VITE_STUDIO_ENABLE_FLAT_INSPECTOR", "VITE_STUDIO_FLAT_INSPECTOR_ENABLED"],
  true,
);

// A host whose mounted API authenticates with same-origin cookies sets this; studioApiFetch then sends them, and its
// requests share the preview media's sockets again.
export const STUDIO_API_SAME_ORIGIN_CREDENTIALS = resolveStudioBooleanEnvFlag(
  env,
  ["VITE_STUDIO_API_SAME_ORIGIN_CREDENTIALS"],
  false,
);

import { resolveEnabledSdkFamilies } from "../../utils/sdkCutoverPolicy";
