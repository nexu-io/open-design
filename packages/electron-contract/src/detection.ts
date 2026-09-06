import {
  OPEN_DESIGN_ELECTRON_CONTRACT_VERSION,
  OPEN_DESIGN_ELECTRON_CLIENT_TYPES,
  type OpenDesignElectronBridge,
  type OpenDesignElectronClientType,
  type OpenDesignElectronGlobalScope,
} from "./protocol.js";
import { readElectronContractCandidate } from "./locator.js";

/**
 * @module detection
 *
 * Locates the host bridge on a global scope and structurally validates it.
 * Owns the {@link isOpenDesignElectronBridge} type guard plus the scope-lookup
 * helpers used by every renderer-facing accessor.
 */

/** @internal Narrow an unknown value to a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

/** @internal True when `record[key]` is a function. */
function hasFunction(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "function";
}

/**
 * Structural type guard for a fully-formed {@link OpenDesignElectronBridge}: checks
 * version, client type, and the presence of every required capability method.
 */
export function isOpenDesignElectronBridge(value: unknown): value is OpenDesignElectronBridge {
  if (!isRecord(value)) return false;
  if (value.version !== OPEN_DESIGN_ELECTRON_CONTRACT_VERSION) return false;
  const client = value.client;
  if (!isRecord(client) || client.type !== OPEN_DESIGN_ELECTRON_CLIENT_TYPES.DESKTOP) return false;
  if (client.platform != null && typeof client.platform !== "string") return false;
  if (client.osLocale != null && typeof client.osLocale !== "string") return false;

  const shell = value.shell;
  if (!isRecord(shell) || !hasFunction(shell, "openExternal") || !hasFunction(shell, "openPath")) return false;

  const browser = value.browser;
  if (!isRecord(browser) || !hasFunction(browser, "clearData")) return false;

  const capture = value.capture;
  if (!isRecord(capture) || !hasFunction(capture, "page")) return false;

  const diagnostics = value.diagnostics;
  if (!isRecord(diagnostics) || !hasFunction(diagnostics, "exportToFile")) return false;

  const lifecycle = value.lifecycle;
  if (!isRecord(lifecycle) || !hasFunction(lifecycle, "ready")) return false;

  const project = value.project;
  if (
    !isRecord(project) ||
    !hasFunction(project, "pickAndImport") ||
    !hasFunction(project, "pickAndReplaceWorkingDir")
  ) {
    return false;
  }

  const pdf = value.pdf;
  if (!isRecord(pdf) || !hasFunction(pdf, "print")) return false;

  const pet = value.pet;
  if (!isRecord(pet) || !hasFunction(pet, "setVisible")) return false;

  const updater = value.updater;
  if (
    !isRecord(updater) ||
    !hasFunction(updater, "apply") ||
    !hasFunction(updater, "status") ||
    !hasFunction(updater, "check") ||
    !hasFunction(updater, "download") ||
    !hasFunction(updater, "later") ||
    !hasFunction(updater, "setMenuLabels") ||
    !hasFunction(updater, "subscribe") ||
    !hasFunction(updater, "subscribeOpenDialog")
  ) {
    return false;
  }

  return true;
}

/**
 * Resolve the validated host bridge from `scope`, or `null` when absent or
 * malformed.
 */
export function getOpenDesignElectron(scope: OpenDesignElectronGlobalScope = globalThis): OpenDesignElectronBridge | null {
  const candidate = readElectronContractCandidate(scope);
  return isOpenDesignElectronBridge(candidate) ? candidate : null;
}

/** True when a valid OpenDesign host bridge is present on `scope`. */
export function isOpenDesignElectronAvailable(scope: OpenDesignElectronGlobalScope = globalThis): boolean {
  return getOpenDesignElectron(scope) != null;
}

/** Detect the host client type on `scope`, falling back to web. */
export function detectOpenDesignElectronClientType(scope: OpenDesignElectronGlobalScope = globalThis): OpenDesignElectronClientType | "web" {
  return getOpenDesignElectron(scope)?.client.type ?? "web";
}
