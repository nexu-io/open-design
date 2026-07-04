import { assertObject, assertKnownKeys } from "./validation.js";
import { APP_KEYS, SIDECAR_MODES, SIDECAR_SOURCES, SIDECAR_STAMP_FIELDS } from "./identity.js";
import type { AppKey, SidecarMode, SidecarSource } from "./identity.js";

/**
 * @module stamp
 *
 * The sidecar process-stamp shape plus the field-level and whole-stamp
 * normalizers/guards. Validates the five-field stamp (app/mode/namespace/
 * ipc/source) and its partial-criteria form used for process matching.
 */

export type SidecarStamp = {
  app: AppKey;
  ipc: string;
  mode: SidecarMode;
  namespace: string;
  source: SidecarSource;
};

export type SidecarStampInput = Partial<Record<(typeof SIDECAR_STAMP_FIELDS)[number], unknown>>;
export type SidecarStampCriteria = Partial<SidecarStamp>;

/**
 * Validate a sidecar namespace string (charset, length, no surrounding
 * whitespace, no path separators).
 * @param namespace - candidate namespace
 * @returns the namespace unchanged
 * @throws if the value is not a valid namespace
 */
export function normalizeNamespace(namespace: unknown): string {
  if (typeof namespace !== "string") throw new Error("namespace must be a string");
  const value = namespace.trim();
  if (value.length === 0) throw new Error("namespace must not be empty");
  if (value !== namespace) throw new Error("namespace must not contain leading or trailing whitespace");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(`namespace contains unsupported characters: ${value}`);
  }
  if (/[\\/]/.test(value)) throw new Error(`namespace must not contain path separators: ${value}`);
  return value;
}

/** Type guard for a supported sidecar mode (`dev` | `runtime`). */
export function isSidecarMode(value: unknown): value is SidecarMode {
  return Object.values(SIDECAR_MODES).includes(value as SidecarMode);
}

/** Assert and return a supported sidecar mode. @throws if not `dev`/`runtime`. */
export function normalizeSidecarMode(mode: unknown): SidecarMode {
  if (!isSidecarMode(mode)) {
    throw new Error("sidecar mode must be dev or runtime");
  }
  return mode;
}

/** Type guard for a supported sidecar app key. */
export function isAppKey(value: unknown): value is AppKey {
  return Object.values(APP_KEYS).includes(value as AppKey);
}

/** Assert and return a supported sidecar app key. @throws on unknown app. */
export function normalizeAppKey(app: unknown): AppKey {
  if (!isAppKey(app)) throw new Error(`unsupported sidecar app: ${String(app)}`);
  return app;
}

/** Type guard for a supported sidecar launch source. */
export function isSidecarSource(value: unknown): value is SidecarSource {
  return Object.values(SIDECAR_SOURCES).includes(value as SidecarSource);
}

/** Assert and return a supported sidecar launch source. @throws on unknown source. */
export function normalizeSidecarSource(source: unknown): SidecarSource {
  if (!isSidecarSource(source)) {
    throw new Error(`unsupported sidecar source: ${String(source)}`);
  }
  return source;
}

/** True when the value is a Windows named-pipe path (`\\\\.\\pipe\\...`). */
export function isWindowsNamedPipePath(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("\\\\.\\pipe\\");
}

/**
 * Validate a sidecar IPC path: non-empty, no surrounding whitespace, no null
 * bytes, and absolute (POSIX, Windows drive, or a Windows named pipe).
 * @returns the path unchanged
 */
export function normalizeIpcPath(ipc: unknown): string {
  if (typeof ipc !== "string") throw new Error("sidecar ipc path must be a string");
  if (ipc.length === 0) throw new Error("sidecar ipc path must not be empty");
  if (ipc.trim() !== ipc) throw new Error("sidecar ipc path must not contain leading or trailing whitespace");
  if (ipc.includes("\0")) throw new Error("sidecar ipc path must not contain null bytes");
  if (isWindowsNamedPipePath(ipc)) return ipc;
  if (!ipc.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(ipc)) {
    throw new Error(`sidecar ipc path must be absolute: ${ipc}`);
  }
  return ipc;
}

/** @internal Assert a value only carries the five known stamp fields. */
function assertKnownStampKeys(value: Record<string, unknown>, label: string): void {
  assertKnownKeys(value, SIDECAR_STAMP_FIELDS, label);
}

/**
 * Validate a complete five-field sidecar stamp and return the normalized
 * shape.
 * @throws on any missing or invalid field
 */
export function normalizeSidecarStamp(input: unknown): SidecarStamp {
  const value = assertObject(input, "sidecar stamp");
  assertKnownStampKeys(value, "sidecar stamp");
  return {
    app: normalizeAppKey(value.app),
    ipc: normalizeIpcPath(value.ipc),
    mode: normalizeSidecarMode(value.mode),
    namespace: normalizeNamespace(value.namespace),
    source: normalizeSidecarSource(value.source),
  };
}

/**
 * Validate a partial sidecar stamp used as match criteria; only provided
 * fields are normalized.
 * @returns the normalized subset
 */
export function normalizeSidecarStampCriteria(input: unknown = {}): SidecarStampCriteria {
  const value = assertObject(input, "sidecar stamp criteria");
  assertKnownStampKeys(value, "sidecar stamp criteria");
  return {
    ...(value.app == null ? {} : { app: normalizeAppKey(value.app) }),
    ...(value.ipc == null ? {} : { ipc: normalizeIpcPath(value.ipc) }),
    ...(value.mode == null ? {} : { mode: normalizeSidecarMode(value.mode) }),
    ...(value.namespace == null ? {} : { namespace: normalizeNamespace(value.namespace) }),
    ...(value.source == null ? {} : { source: normalizeSidecarSource(value.source) }),
  };
}

/** Assertion form of {@link normalizeSidecarStamp} for use in control flow. */
export function assertSidecarStamp(input: unknown): asserts input is SidecarStamp {
  normalizeSidecarStamp(input);
}
