import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import type { ElectronRendererLease, ElectronShellRenderer } from "../../contracts/index.js";
import {
  installElectronRendererMountBarrier,
  serializeElectronRendererMountAcknowledgement,
  type ElectronRendererMountIpc,
} from "./mount-acknowledgement.js";

type MountInput = Parameters<ElectronShellRenderer["mount"]>[0];

/** Every generation gets a hidden window and its own sender/attempt challenge. */
export async function mountElectronRendererLease(input: Readonly<{
  context: Omit<MountInput, "window">;
  createWindow(options: BrowserWindowConstructorOptions): BrowserWindow;
  ipc: ElectronRendererMountIpc;
  renderer: ElectronShellRenderer;
  signal: AbortSignal;
}>): Promise<ElectronRendererLease> {
  input.signal.throwIfAborted();
  const { acknowledgement, manifest, windowPolicy, preflight, presentation } = input.context;
  const options = input.renderer.windowOptions?.({ acknowledgement, manifest, windowPolicy, preflight, presentation });
  const window = input.createWindow({
    ...options,
    width: windowPolicy.width,
    height: windowPolicy.height,
    title: windowPolicy.title,
    show: false,
    webPreferences: {
      ...options?.webPreferences,
      additionalArguments: [
        ...(options?.webPreferences?.additionalArguments ?? []),
        serializeElectronRendererMountAcknowledgement(acknowledgement),
      ],
    },
  });
  const barrier = installElectronRendererMountBarrier({ acknowledgement, ipc: input.ipc, sender: window.webContents, signal: input.signal });
  const abort = () => { if (!window.isDestroyed()) window.destroy(); };
  input.signal.addEventListener("abort", abort, { once: true });
  // An abort may precede asynchronous product mount completion.
  void barrier.ready.catch(() => undefined);
  let integration: Awaited<ReturnType<ElectronShellRenderer["mount"]>> | null = null;
  try {
    integration = await input.renderer.mount({ ...input.context, window });
    await barrier.ready;
    input.signal.throwIfAborted();
    const mounted = integration;
    let released = false;
    return Object.freeze({
      window,
      async releaseIntegration() { if (!released) { released = true; await mounted.dispose(); } },
      destroy() { if (!window.isDestroyed()) window.destroy(); },
    });
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    try { await integration?.dispose(); }
    catch (disposeError) { throw new AggregateError([error, disposeError], "Electron renderer mount and integration cleanup failed"); }
    throw error;
  } finally { barrier.dispose(); input.signal.removeEventListener("abort", abort); }
}

/** Retire the old handlers before binding new ones; reveal only after mount. */
export async function replaceElectronRendererLease(input: Readonly<{
  previous: ElectronRendererLease;
  mount(): Promise<ElectronRendererLease>;
  reveal(lease: ElectronRendererLease): void;
}>): Promise<ElectronRendererLease> {
  let next: ElectronRendererLease | null = null;
  try {
    await input.previous.releaseIntegration();
    next = await input.mount();
    input.reveal(next);
    return next;
  } catch (error) {
    try { await next?.releaseIntegration(); }
    catch (disposeError) { throw new AggregateError([error, disposeError], "Electron renderer replacement and integration cleanup failed"); }
    finally { next?.destroy(); }
    throw error;
  } finally { input.previous.destroy(); }
}
