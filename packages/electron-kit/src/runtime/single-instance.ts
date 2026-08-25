export type ElectronSingleInstanceApp = Readonly<{
  requestSingleInstanceLock(): boolean;
}>;

export async function claimElectronSingleInstanceLock(
  electronApp: ElectronSingleInstanceApp,
  options: Readonly<{ attempts?: number; retryIntervalMs?: number; wait?: (milliseconds: number) => Promise<void> }> = {},
): Promise<boolean> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 51));
  const retryIntervalMs = Math.max(0, Math.floor(options.retryIntervalMs ?? 100));
  const wait = options.wait ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (electronApp.requestSingleInstanceLock()) return true;
    if (attempt < attempts) await wait(retryIntervalMs);
  }
  return false;
}

export class ElectronLaunchHandoffQueue {
  private focusRequested = false;
  private readonly deepLinks: string[] = [];

  constructor(private readonly protocol: string, private readonly capacity = 32) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 256) throw new Error("invalid Electron handoff queue capacity");
  }

  enqueue(argv: readonly string[]): Readonly<{ deepLink: string | null; focusRequested: true }> {
    this.focusRequested = true;
    const deepLink = argv.find((value) => value.startsWith(`${this.protocol}://`)) ?? null;
    if (deepLink != null) {
      if (this.deepLinks.length >= this.capacity) this.deepLinks.shift();
      this.deepLinks.push(deepLink);
    }
    return { deepLink, focusRequested: true };
  }

  drain(): Readonly<{ deepLinks: readonly string[]; focusRequested: boolean }> {
    const result = { deepLinks: this.deepLinks.splice(0), focusRequested: this.focusRequested };
    this.focusRequested = false;
    return result;
  }
}
