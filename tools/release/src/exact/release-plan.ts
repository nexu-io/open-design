import { readContentIdentityRegistry, type ContentIdentityRegistry } from "@open-design/metatool";

import { resolveAcceptedShellBaseline, type AcceptedShellBaselineResolution } from "./accepted-baseline.js";
import {
  createExactPlan,
  resolveExactPlanSourceIdentity,
  selectExactPlanActions,
  type ExactPlan,
  type ExactPlanAction,
  type ExactTarget,
} from "./plan.js";

export type ExactReleasePlan = Readonly<{
  actions: readonly ExactPlanAction[];
  baseline: AcceptedShellBaselineResolution;
  plan: ExactPlan;
  schemaVersion: 1;
}>;

export async function createExactReleasePlan(input: Readonly<{
  acceptedReceipt?: Readonly<{ bytes: Uint8Array; sha256: `sha256:${string}` }>;
  availableIdentities: ReadonlySet<string>;
  channel: string;
  registry: ContentIdentityRegistry;
  root: string;
  target: ExactTarget;
}>): Promise<ExactReleasePlan> {
  const currentClosureIdentity = await resolveExactPlanSourceIdentity({
    id: "closure.build",
    registry: input.registry,
    root: input.root,
    target: input.target,
  });
  const baseline = resolveAcceptedShellBaseline({
    acceptedReceipt: input.acceptedReceipt,
    channel: input.channel,
    currentClosureIdentity,
    target: input.target,
  });
  const plan = await createExactPlan({
    acceptedShellBaseline: baseline.baselineIdentity,
    registry: input.registry,
    root: input.root,
    target: input.target,
  });
  const trustedAvailable = new Set([...input.availableIdentities, ...baseline.acceptedIdentities]);
  const actions = baseline.requiredAcceptance === "full"
    ? selectExactPlanActions(plan, new Set())
    : selectExactPlanActions(plan, trustedAvailable);
  return Object.freeze({ actions, baseline, plan, schemaVersion: 1 });
}

export async function createExactReleasePlanFromRegistryFile(input: Readonly<{
  acceptedReceipt?: Readonly<{ bytes: Uint8Array; sha256: `sha256:${string}` }>;
  availableIdentities: ReadonlySet<string>;
  channel: string;
  registryPath: string;
  root: string;
  target: ExactTarget;
}>): Promise<ExactReleasePlan> {
  return await createExactReleasePlan({ ...input, registry: await readContentIdentityRegistry(input.registryPath) });
}
