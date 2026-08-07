export type SidecarControlErrorCode =
  | "invalid-input"
  | "method-unavailable"
  | "peer-mismatch"
  | "peer-unavailable"
  | "request-failed";

export class SidecarControlError extends Error {
  readonly code: SidecarControlErrorCode;

  constructor(code: SidecarControlErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SidecarControlError";
    this.code = code;
  }
}
