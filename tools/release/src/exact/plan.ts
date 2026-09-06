import {
  canonicalMetadataJson,
  metadataDigest,
  readContentIdentityRegistry,
  resolveContentIdentity,
  resolveContentIdentityDeclaration,
  type ContentIdentityRegistry,
} from "@open-design/metatool";

export const EXACT_PLAN_SCHEMA_VERSION = 1 as const;

export type ExactTarget = "darwin-arm64" | "darwin-x64" | "win32-x64";

export type ExactPlanNodeId =
  | "closure.acceptance.hot"
  | "closure.build"
  | "closure.test"
  | "electron.contract.build"
  | "electron.contract.test"
  | "electron.acceptance.full"
  | "electron.distribution"
  | "electron.shell.build"
  | "electron.shell.test";

export type ExactPlanNode = Readonly<{
  dependencies: readonly ExactPlanNodeId[];
  identity: `sha256:${string}`;
  sourceIdentity: `sha256:${string}`;
  target: ExactTarget;
}>;

export type ExactPlan = Readonly<{
  acceptedShellBaseline: `sha256:${string}`;
  nodes: Readonly<Record<ExactPlanNodeId, ExactPlanNode>>;
  schemaVersion: typeof EXACT_PLAN_SCHEMA_VERSION;
  target: ExactTarget;
}>;

export type ExactPlanAction = Readonly<{
  id: ExactPlanNodeId | "exact.activate" | "exact.compose" | "exact.publish";
  reason: "identity-miss" | "release-finalization";
}>;

const NODE_DEPENDENCIES: Readonly<Record<ExactPlanNodeId, readonly ExactPlanNodeId[]>> = {
  "closure.acceptance.hot": ["electron.distribution", "closure.build"],
  "closure.build": ["electron.contract.build"],
  "closure.test": ["closure.build", "electron.contract.test"],
  "electron.contract.build": [],
  "electron.contract.test": ["electron.contract.build"],
  "electron.acceptance.full": ["electron.distribution"],
  "electron.distribution": ["electron.shell.build"],
  "electron.shell.build": ["electron.contract.build"],
  "electron.shell.test": ["electron.shell.build", "electron.contract.test"],
};

const NODE_ORDER = Object.freeze([
  "electron.contract.build",
  "electron.contract.test",
  "electron.shell.build",
  "electron.shell.test",
  "closure.build",
  "closure.test",
  "electron.distribution",
] satisfies ExactPlanNodeId[]);

function compositeIdentity(id: ExactPlanNodeId, sourceIdentity: string, dependencies: readonly ExactPlanNode[], target: ExactTarget): `sha256:${string}` {
  return metadataDigest(canonicalMetadataJson({
    dependencies: dependencies.map((dependency) => dependency.identity),
    id,
    schemaVersion: EXACT_PLAN_SCHEMA_VERSION,
    sourceIdentity,
    target,
  }));
}

async function resolveNode(
  acceptedShellBaseline: `sha256:${string}`,
  id: ExactPlanNodeId,
  root: string,
  target: ExactTarget,
  registry: ContentIdentityRegistry,
  nodes: Partial<Record<ExactPlanNodeId, ExactPlanNode>>,
): Promise<ExactPlanNode> {
  const resolved = resolveContentIdentityDeclaration(registry, id);
  const supportedParameters = new Set(["acceptedShellBaseline", "target"]);
  const unexpectedParameters = resolved.declaration.parameters.filter((parameter) => !supportedParameters.has(parameter));
  if (unexpectedParameters.length > 0 || !resolved.declaration.parameters.includes("target")) {
    throw new Error(`exact identity ${id} has unsupported or incomplete parameters`);
  }
  const parameters = Object.fromEntries(resolved.declaration.parameters.map((parameter) => [
    parameter,
    parameter === "target" ? target : acceptedShellBaseline,
  ]));
  const source = await resolveContentIdentity({
    id,
    parameters,
    root,
    schemaVersion: resolved.declaration.schemaVersion,
    sources: resolved.sources,
  });
  const dependencies = NODE_DEPENDENCIES[id];
  const dependencyNodes = dependencies.map((dependency) => {
    const node = nodes[dependency];
    if (node == null) throw new Error(`exact plan dependency ${dependency} must precede ${id}`);
    return node;
  });
  return Object.freeze({
    dependencies,
    identity: compositeIdentity(id, source.digest, dependencyNodes, target),
    sourceIdentity: source.digest,
    target,
  });
}

export async function createExactPlan(input: Readonly<{
  acceptedShellBaseline: `sha256:${string}`;
  registry: ContentIdentityRegistry;
  root: string;
  target: ExactTarget;
}>): Promise<ExactPlan> {
  if (!/^sha256:[a-f0-9]{64}$/u.test(input.acceptedShellBaseline)) throw new Error("accepted Shell baseline identity is invalid");
  const nodes: Partial<Record<ExactPlanNodeId, ExactPlanNode>> = {};
  for (const id of NODE_ORDER) nodes[id] = await resolveNode(input.acceptedShellBaseline, id, input.root, input.target, input.registry, nodes);
  nodes["electron.acceptance.full"] = await resolveNode(input.acceptedShellBaseline, "electron.acceptance.full", input.root, input.target, input.registry, nodes);
  nodes["closure.acceptance.hot"] = await resolveNode(input.acceptedShellBaseline, "closure.acceptance.hot", input.root, input.target, input.registry, nodes);
  return Object.freeze({
    acceptedShellBaseline: input.acceptedShellBaseline,
    nodes: Object.freeze(nodes as Record<ExactPlanNodeId, ExactPlanNode>),
    schemaVersion: EXACT_PLAN_SCHEMA_VERSION,
    target: input.target,
  });
}

export async function createExactPlanFromRegistryFile(input: Readonly<{
  acceptedShellBaseline: `sha256:${string}`;
  registryPath: string;
  root: string;
  target: ExactTarget;
}>): Promise<ExactPlan> {
  return await createExactPlan({ ...input, registry: await readContentIdentityRegistry(input.registryPath) });
}

export async function resolveExactPlanSourceIdentity(input: Readonly<{
  id: ExactPlanNodeId;
  registry: ContentIdentityRegistry;
  root: string;
  target: ExactTarget;
}>): Promise<`sha256:${string}`> {
  const resolved = resolveContentIdentityDeclaration(input.registry, input.id);
  if (JSON.stringify(resolved.declaration.parameters) !== JSON.stringify(["target"])) {
    throw new Error(`exact source identity ${input.id} must depend only on target`);
  }
  return (await resolveContentIdentity({
    id: input.id,
    parameters: { target: input.target },
    root: input.root,
    schemaVersion: resolved.declaration.schemaVersion,
    sources: resolved.sources,
  })).digest;
}

export function selectExactPlanActions(plan: ExactPlan, availableIdentities: ReadonlySet<string>): readonly ExactPlanAction[] {
  const actions: ExactPlanAction[] = [];
  for (const id of NODE_ORDER) {
    if (!availableIdentities.has(plan.nodes[id].identity)) actions.push({ id, reason: "identity-miss" });
  }
  if (!availableIdentities.has(plan.nodes["electron.acceptance.full"].identity)) {
    actions.push({ id: "electron.acceptance.full", reason: "identity-miss" });
  } else if (!availableIdentities.has(plan.nodes["closure.acceptance.hot"].identity)) {
    actions.push({ id: "closure.acceptance.hot", reason: "identity-miss" });
  }
  actions.push(
    { id: "exact.compose", reason: "release-finalization" },
    { id: "exact.publish", reason: "release-finalization" },
    { id: "exact.activate", reason: "release-finalization" },
  );
  return Object.freeze(actions);
}
