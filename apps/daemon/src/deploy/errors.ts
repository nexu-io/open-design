export type DeployErrorDetails = Record<string, unknown> | string | undefined;

export class DeployError extends Error {
  status: number;
  details: DeployErrorDetails;
  code?: string | undefined;

  constructor(message: string, status = 400, details: DeployErrorDetails = undefined, code?: string) {
    super(message);
    this.name = 'DeployError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
}
