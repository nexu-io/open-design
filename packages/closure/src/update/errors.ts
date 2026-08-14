export class ClosureUpdateError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ClosureUpdateError";
  }
}

export class ClosureInstallerRequiredError extends ClosureUpdateError {
  readonly minimumShellVersion: string | null;

  constructor(message: string, minimumShellVersion: string | null = null) {
    super(message);
    this.name = "ClosureInstallerRequiredError";
    this.minimumShellVersion = minimumShellVersion;
  }
}
