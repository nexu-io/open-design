import type {
  OpenDesignHostFailure,
  OpenDesignHostProjectImportResult,
  OpenDesignHostProjectReplaceWorkingDirResult,
  OpenDesignHostPickWorkingDirResult,
} from "./protocol.js";

/**
 * @module normalize
 *
 * Converts a privileged host adapter's raw responses into the host-owned
 * renderer contracts. The adapter may call daemon APIs internally, but only the
 * whitelisted identifiers cross the host bridge.
 */

/** @internal Narrow an unknown value to a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

/** @internal Build a normalized host failure result. */
function failure(reason: string, details?: unknown): OpenDesignHostFailure {
  return {
    ...(details === undefined ? {} : { details }),
    ok: false,
    reason,
  };
}

/**
 * Converts a privileged host adapter's raw project-import result into the
 * host-owned renderer contract. The adapter may internally call daemon APIs,
 * but only project identifiers cross the host bridge.
 */
export function normalizeOpenDesignHostProjectImportResult(input: unknown): OpenDesignHostProjectImportResult {
  if (!isRecord(input)) {
    return failure("desktop import returned an invalid response", input);
  }
  if (input.ok !== true) {
    if (input.canceled === true) return { canceled: true, ok: false };
    const reason = typeof input.reason === "string" && input.reason.length > 0
      ? input.reason
      : "unknown failure";
    return failure(reason, input.details);
  }

  const response = input.response;
  if (!isRecord(response)) {
    return failure("daemon import response was not an object", response);
  }
  const project = response.project;
  const rawProjectId = isRecord(project) ? project.id : null;
  const projectId = typeof rawProjectId === "string" ? rawProjectId : null;
  const conversationId = typeof response.conversationId === "string" ? response.conversationId : null;
  const entryFile =
    typeof response.entryFile === "string" || response.entryFile === null
      ? response.entryFile
      : undefined;
  if (projectId == null || conversationId == null || entryFile === undefined) {
    return failure("daemon import response did not include host project identifiers", response);
  }

  return {
    conversationId,
    entryFile,
    ok: true,
    projectId,
  };
}

/**
 * Converts a privileged host adapter's raw working-dir replace result into the
 * host-owned renderer contract.
 */
export function normalizeOpenDesignHostProjectReplaceWorkingDirResult(
  input: unknown,
): OpenDesignHostProjectReplaceWorkingDirResult {
  if (!isRecord(input)) {
    return failure("desktop working-dir replace returned an invalid response", input);
  }
  if (input.ok !== true) {
    if (input.canceled === true) return { canceled: true, ok: false };
    const reason = typeof input.reason === "string" && input.reason.length > 0
      ? input.reason
      : "unknown failure";
    return failure(reason, input.details);
  }

  const response = input.response;
  if (!isRecord(response)) {
    return failure("daemon working-dir response was not an object", response);
  }
  const baseDir = typeof response.baseDir === "string" ? response.baseDir : null;
  const entryFile = typeof response.entryFile === "string" ? response.entryFile : null;
  if (baseDir == null) {
    return failure("daemon working-dir response did not include baseDir", response);
  }

  return { baseDir, entryFile, ok: true };
}

/**
 * Converts a privileged host adapter's raw working-dir pick result into the
 * host-owned renderer contract (chosen path plus single-use token).
 */
export function normalizeOpenDesignHostPickWorkingDirResult(
  input: unknown,
): OpenDesignHostPickWorkingDirResult {
  if (!isRecord(input)) {
    return failure("desktop working-dir pick returned an invalid response", input);
  }
  if (input.ok !== true) {
    if (input.canceled === true) return { canceled: true, ok: false };
    const reason = typeof input.reason === "string" && input.reason.length > 0
      ? input.reason
      : "unknown failure";
    return failure(reason, input.details);
  }
  const baseDir = typeof input.baseDir === "string" ? input.baseDir : null;
  const token = typeof input.token === "string" ? input.token : null;
  if (baseDir == null || token == null) {
    return failure("desktop working-dir pick did not include baseDir and token", input);
  }
  return { baseDir, ok: true, token };
}
