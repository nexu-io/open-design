import type { ElectronBackgroundUpdatePolicy } from "@open-design/electron-kit/contracts";
import { readElectronProductRuntime } from "../standalone/product-runtime.js";
import { readElectronSilentUpdatePreference } from "./silent-preference.js";

/** Only the unchanged candidate retained before startup is eligible. This
 * opportunity is consumed once, even when preferences or the guard refuse it.
 * Installer actions always remain explicit. */
export function createElectronBackgroundUpdateCheck(notifyUpdates: () => Promise<void> = async () => {}): ElectronBackgroundUpdatePolicy["check"] {
  let startup = true;
  return async input => {
    try {
      if (startup) {
        startup = false;
        if (await activateRetainedStartupUpdate(input)) return;
      }
      await prepareElectronBackgroundUpdate(input);
    } finally {
      if (!input.signal.aborted) await notifyUpdates();
    }
  };
}

async function activateRetainedStartupUpdate(input: Parameters<ElectronBackgroundUpdatePolicy["check"]>[0]): Promise<boolean> {
  input.signal.throwIfAborted();
  const snapshot = await input.shellUpdater.readSnapshot();
  const capsule = snapshot.revision === input.startupShellRevision && snapshot.state === "ready"
    && snapshot.actions.some(({ id }) => id === "restart");
  const closure = snapshot.state === "idle" && input.startupContentGenerationId != null;
  if (!capsule && !closure) return false;
  let allowed = false;
  try {
    const runtime = await readElectronProductRuntime({ attachmentId: input.runtime.attachment.id,
      bindingDigest: input.runtime.binding.digest, handle: input.runtime.handle, requestId: "updater.startup.preference" });
    allowed = await readElectronSilentUpdatePreference(runtime.daemon.url, input.signal);
  } catch (error) {
    // Preference failure is denial, not a reason to authorize by default.
    console.warn("[shell/electron] silent update preference unavailable", error instanceof Error ? error.message : "unknown error");
  }
  input.signal.throwIfAborted();
  const current = await input.shellUpdater.readSnapshot();
  input.signal.throwIfAborted();
  if (!allowed || current.revision !== snapshot.revision) return false;
  if (capsule) {
    const result = await input.shellUpdater.invoke("restart");
    if (result.outcome === "failed") throw new Error(result.snapshot.error?.message ?? "startup Capsule activation failed");
    return result.outcome === "accepted";
  }
  const prepared = await input.contentUpdater.readPrepared();
  input.signal.throwIfAborted();
  if (prepared?.generation.id !== input.startupContentGenerationId) return false;
  await input.contentUpdater.applyNow({ expectedGenerationId: prepared!.generation.id, activationPolicy: "authorize-silent" });
  return true;
}

/** Acquire in the background without authorizing activation. Capsule-bearing
 * candidates prepare their bound Closure together, so do not independently
 * replace that preparation with a second channel-head read. */
export const prepareElectronBackgroundUpdate: ElectronBackgroundUpdatePolicy["check"] = async ({
  signal, shellUpdater, contentUpdater,
}) => {
  signal.throwIfAborted();
  let snapshot = await shellUpdater.readSnapshot();
  if (snapshot.actions.some(({ id }) => id === "check")) {
    signal.throwIfAborted();
    const result = await shellUpdater.invoke("check");
    if (result.outcome === "failed") throw new Error(result.snapshot.error?.message ?? "background Shell check failed");
    snapshot = result.snapshot;
  }
  signal.throwIfAborted();
  if (snapshot.actions.some(({ id }) => id === "download")) {
    const result = await shellUpdater.invoke("download");
    if (result.outcome === "failed") throw new Error(result.snapshot.error?.message ?? "background Shell download failed");
    snapshot = result.snapshot;
  }
  signal.throwIfAborted();
  if (snapshot.state === "idle") await contentUpdater.prepareLatest("observe");
};
