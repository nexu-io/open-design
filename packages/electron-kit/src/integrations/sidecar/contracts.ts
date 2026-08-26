export const ELECTRON_SIDECAR_CONTROL_SCHEMA_VERSION = 1 as const;

export type ElectronSidecarSession = Readonly<{
  schemaVersion: typeof ELECTRON_SIDECAR_CONTROL_SCHEMA_VERSION;
  sessionId: string;
  ipcPath: string;
}>;

export type ElectronSidecarHandlerDeclaration = Readonly<{
  id: string;
  timeoutMs?: number;
}>;

export type ElectronSidecarHandlerTopology = Readonly<{
  schemaVersion: typeof ELECTRON_SIDECAR_CONTROL_SCHEMA_VERSION;
  handlers: readonly ElectronSidecarHandlerDeclaration[];
}>;

export type ElectronSidecarControlErrorCode =
  | "handler-timeout"
  | "invalid-session"
  | "invalid-topology"
  | "session-closed"
  | "unknown-handler";

export class ElectronSidecarControlError extends Error {
  constructor(readonly code: ElectronSidecarControlErrorCode, message: string) {
    super(message);
    this.name = "ElectronSidecarControlError";
  }
}

const identifier = /^[a-z][a-z0-9.-]{0,127}$/u;
const sessionIdentifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export function validateElectronSidecarSession(value: ElectronSidecarSession): ElectronSidecarSession {
  if (
    value.schemaVersion !== ELECTRON_SIDECAR_CONTROL_SCHEMA_VERSION
    || !sessionIdentifier.test(value.sessionId)
    || typeof value.ipcPath !== "string"
    || value.ipcPath.trim().length === 0
  ) {
    throw new ElectronSidecarControlError("invalid-session", "invalid Electron Sidecar session");
  }
  return structuredClone(value);
}

export function validateElectronSidecarHandlerTopology(
  value: ElectronSidecarHandlerTopology,
): ElectronSidecarHandlerTopology {
  if (value.schemaVersion !== ELECTRON_SIDECAR_CONTROL_SCHEMA_VERSION) {
    throw new ElectronSidecarControlError("invalid-topology", "unsupported Electron Sidecar handler topology schema");
  }
  if (!Array.isArray(value.handlers) || value.handlers.length === 0 || value.handlers.length > 128) {
    throw new ElectronSidecarControlError("invalid-topology", "Electron Sidecar handler topology must declare between 1 and 128 handlers");
  }
  const ids = new Set<string>();
  for (const handler of value.handlers) {
    if (!identifier.test(handler.id) || ids.has(handler.id)) {
      throw new ElectronSidecarControlError("invalid-topology", `invalid or duplicate Electron Sidecar handler: ${handler.id}`);
    }
    ids.add(handler.id);
    if (
      handler.timeoutMs != null
      && (!Number.isSafeInteger(handler.timeoutMs) || handler.timeoutMs < 100 || handler.timeoutMs > 600_000)
    ) {
      throw new ElectronSidecarControlError("invalid-topology", `invalid Electron Sidecar handler timeout: ${handler.id}`);
    }
  }
  return structuredClone(value);
}
