import { join } from "node:path";
import type { NodePlatformResource } from "@open-design/standalone/packages";
import { prepareNodePlatformResource } from "@open-design/standalone/packages/resource";
import { resolveElectronStandaloneStoreRoot } from "./store-root.js";
import { StandaloneStore, StandaloneFeedbackEmitter, type StandaloneScope } from "@open-design/standalone";
import type { ElectronStartupProgress } from "@open-design/electron-kit/contracts";
import { randomUUID } from "node:crypto";
import { describeElectronStartupFeedback } from "./startup-progress.js";

/** Product platform preparation is invoked by Capsule after its first screen. */
export async function prepareElectronNodeRuntime(input: Readonly<{
  runtimeRoot: string; platform: NodePlatformResource; signal: AbortSignal;
  scope: StandaloneScope; observeProgress(progress: ElectronStartupProgress): void;
}>) {
  const state = await new StandaloneStore(resolveElectronStandaloneStoreRoot(input.runtimeRoot), input.scope).readState();
  input.observeProgress({ mode: state.activationAttempt != null ? "recovery" : state.active == null ? "first-install"
    : state.activationIntent != null ? "update" : "startup", label: "Preparing runtime components" });
  const feedback = new StandaloneFeedbackEmitter(randomUUID(), input.scope,
    event => input.observeProgress(describeElectronStartupFeedback(event)));
  return (await prepareNodePlatformResource({ root: join(resolveElectronStandaloneStoreRoot(input.runtimeRoot), "platform"),
    resource: input.platform }, { signal: input.signal, feedback, resourceId: "application-runtime" })).binding;
}
