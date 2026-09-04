export type ElectronSingleInstanceAdditionalData = Readonly<{
  kind: "installer-replacement";
  installAttemptId: string;
}>;

export type ElectronSingleInstanceApp = Readonly<{
  requestSingleInstanceLock(additionalData?: Record<string, unknown>): boolean;
}>;

export type ElectronInstallerReplacementClaim = Readonly<{
  kind: "installer-replacement";
  installAttemptId: string;
  attempts?: number;
  retryIntervalMs?: number;
  wait?: (milliseconds: number) => Promise<void>;
}>;

const ingressToken = /^[A-Za-z0-9._-]{1,128}$/u;

/**
 * A normal launch asks Electron once, which delivers at most one
 * `second-instance` event to the current owner. Only an authenticated
 * installer replacement may poll across the previous process' exit window.
 */
export async function claimElectronSingleInstanceLock(
  electronApp: ElectronSingleInstanceApp,
  replacement?: ElectronInstallerReplacementClaim,
): Promise<boolean> {
  if (replacement == null) return electronApp.requestSingleInstanceLock();
  if (!ingressToken.test(replacement.installAttemptId)) throw new Error("invalid Electron installer replacement attempt");
  const attempts = Math.max(1, Math.floor(replacement.attempts ?? 51));
  const retryIntervalMs = Math.max(0, Math.floor(replacement.retryIntervalMs ?? 100));
  const wait = replacement.wait ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const additionalData: ElectronSingleInstanceAdditionalData = {
    kind: "installer-replacement",
    installAttemptId: replacement.installAttemptId,
  };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (electronApp.requestSingleInstanceLock(additionalData)) return true;
    if (attempt < attempts) await wait(retryIntervalMs);
  }
  return false;
}

export function parseElectronInstallerReplacementData(value: unknown): ElectronSingleInstanceAdditionalData | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Partial<ElectronSingleInstanceAdditionalData>;
  return data.kind === "installer-replacement" && typeof data.installAttemptId === "string" && ingressToken.test(data.installAttemptId)
    ? { kind: data.kind, installAttemptId: data.installAttemptId }
    : null;
}

export type ElectronLaunchIngress =
  | Readonly<{ type: "focus"; source: "app-activate" | "second-instance" }>
  | Readonly<{ type: "deep-link"; source: "initial-argv" | "mac-open-url" | "second-instance"; url: string }>;

function isProtocolUrl(protocol: string, value: string): boolean {
  try { return new URL(value).protocol === `${protocol}:`; }
  catch { return false; }
}

export function findElectronProtocolUrl(protocol: string, argv: readonly string[]): string | null {
  return argv.find((value) => isProtocolUrl(protocol, value)) ?? null;
}

export class ElectronLaunchHandoffQueue {
  private readonly pending: ElectronLaunchIngress[] = [];
  private accepting = true;

  constructor(private readonly protocol: string, private readonly capacity = 32) {
    if (!/^[a-z][a-z0-9.-]{1,127}$/u.test(protocol)) throw new Error("invalid Electron handoff protocol");
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 256) throw new Error("invalid Electron handoff queue capacity");
  }

  enqueue(ingress: ElectronLaunchIngress): boolean {
    if (!this.accepting) return false;
    if (ingress.type === "deep-link" && !isProtocolUrl(this.protocol, ingress.url)) return false;
    if (this.pending.length >= this.capacity) this.pending.shift();
    this.pending.push(structuredClone(ingress));
    return true;
  }

  drain(): readonly ElectronLaunchIngress[] {
    return this.pending.splice(0);
  }

  cancel(): void {
    this.accepting = false;
    this.pending.splice(0);
  }
}
