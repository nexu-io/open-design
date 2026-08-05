export function quotePosixShellArg(value: unknown): string {
  const text = String(value ?? '');
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

export function buildGhShellCommand(args: readonly unknown[]): string {
  return ['gh', ...args].map(quotePosixShellArg).join(' ');
}

export function buildCommandShellCommand(command: unknown, args: readonly unknown[]): string {
  return [command, ...args].map(quotePosixShellArg).join(' ');
}

export function buildLoginShellCommand(innerCommand: string, pathValue = process.env.PATH ?? ''): string {
  // Keep the caller's PATH visible to test fakes and agent wrappers; login
  // shells often reset PATH from profile scripts.
  return `export PATH=${quotePosixShellArg(pathValue)}; ${innerCommand}`;
}
