export type SidecarLifecycleErrorCode =
  | "guard-busy"
  | "invalid-input"
  | "state-corrupt"
  | "state-unavailable";

export class SidecarLifecycleError extends Error {
  readonly code: SidecarLifecycleErrorCode;

  constructor(code: SidecarLifecycleErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SidecarLifecycleError";
    this.code = code;
  }
}

