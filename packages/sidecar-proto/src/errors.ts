/**
 * @module errors
 *
 * Sidecar contract error codes and the {@link SidecarContractError} thrown
 * when an inbound IPC message fails validation.
 */

export const SIDECAR_ERROR_CODES = Object.freeze({
  INVALID_MESSAGE: "SIDECAR_INVALID_MESSAGE",
  UNKNOWN_MESSAGE: "SIDECAR_UNKNOWN_MESSAGE",
} as const);

export type SidecarErrorCode = (typeof SIDECAR_ERROR_CODES)[keyof typeof SIDECAR_ERROR_CODES];

/**
 * Error thrown when a sidecar IPC message is structurally invalid or of an
 * unknown type. Carries a machine-readable {@link SidecarErrorCode}.
 */
export class SidecarContractError extends Error {
  readonly code: SidecarErrorCode;

  constructor(code: SidecarErrorCode, message: string) {
    super(message);
    this.name = "SidecarContractError";
    this.code = code;
  }
}
