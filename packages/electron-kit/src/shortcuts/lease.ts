import {
  validateElectronShortcutTopology,
  type ElectronShortcutTopology,
} from "./contracts.js";

export type ElectronShortcutBinding = () => void | Promise<void>;

export type ElectronShortcutRegistry = Readonly<{
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}>;

export type ElectronShortcutEvent =
  | Readonly<{ state: "registered" | "unavailable"; id: string; accelerator: string }>
  | Readonly<{ state: "invocation-failed"; id: string; accelerator: string; error: unknown }>;

export type ElectronShortcutLease = Readonly<{
  registrations: readonly Readonly<{ id: string; accelerator: string; registered: boolean }>[];
  dispose(): Promise<void>;
}>;

function observeSafely(observer: ((event: ElectronShortcutEvent) => void | Promise<void>) | undefined, event: ElectronShortcutEvent): void {
  try { void Promise.resolve(observer?.(event)).catch(() => undefined); }
  catch { /* Shortcut observation is non-authoritative. */ }
}

export function openElectronShortcutLease(input: Readonly<{
  topology: ElectronShortcutTopology;
  bindings: Readonly<Record<string, ElectronShortcutBinding>>;
  registry: ElectronShortcutRegistry;
  platform?: NodeJS.Platform;
  isAppReady(): boolean;
  observe?(event: ElectronShortcutEvent): void | Promise<void>;
}>): ElectronShortcutLease {
  const topology = validateElectronShortcutTopology(input.topology);
  if (!input.isAppReady()) throw new Error("Electron shortcuts require app readiness");
  const declaredIds = topology.shortcuts.map((shortcut) => shortcut.id).sort();
  const bindingIds = Object.keys(input.bindings).sort();
  if (declaredIds.length !== bindingIds.length || declaredIds.some((id, index) => id !== bindingIds[index])) {
    throw new Error("Electron shortcut bindings must exactly match the declared topology");
  }
  const platform = input.platform ?? process.platform;
  if (platform !== "darwin" && platform !== "win32") throw new Error(`unsupported Electron shortcut platform: ${platform}`);

  let active = true;
  const registeredAccelerators: string[] = [];
  const inFlight = new Set<Promise<void>>();
  const registrations: Array<{ id: string; accelerator: string; registered: boolean }> = [];
  const rollback = (): void => {
    active = false;
    for (const accelerator of registeredAccelerators.reverse()) input.registry.unregister(accelerator);
    registeredAccelerators.length = 0;
  };

  for (const shortcut of topology.shortcuts) {
    const selectedAccelerator = shortcut.accelerators[platform];
    const binding = input.bindings[shortcut.id]!;
    let registered = false;
    try {
      registered = input.registry.register(selectedAccelerator, () => {
        if (!active) return;
        const invocation = Promise.resolve()
          .then(binding)
          .catch((error: unknown) => { observeSafely(input.observe, { state: "invocation-failed", id: shortcut.id, accelerator: selectedAccelerator, error }); })
          .finally(() => inFlight.delete(invocation));
        inFlight.add(invocation);
      });
    } catch {
      registered = false;
    }
    registrations.push({ id: shortcut.id, accelerator: selectedAccelerator, registered });
    observeSafely(input.observe, { state: registered ? "registered" : "unavailable", id: shortcut.id, accelerator: selectedAccelerator });
    if (registered) registeredAccelerators.push(selectedAccelerator);
    else if (shortcut.required) {
      rollback();
      throw new Error(`required Electron shortcut is unavailable: ${shortcut.id}`);
    }
  }

  let disposePromise: Promise<void> | null = null;
  return Object.freeze({
    registrations: Object.freeze(registrations.map((registration) => Object.freeze(registration))),
    dispose() {
      disposePromise ??= (async () => {
        rollback();
        await Promise.allSettled([...inFlight]);
      })();
      return disposePromise;
    },
  });
}
