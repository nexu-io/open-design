export const ELECTRON_WARMUP_SCHEMA_VERSION = 1 as const;

export const ELECTRON_WARMUP_ATOMS = Object.freeze({
  ENSURE_CARRIER: "electron.ensure-carrier",
  RESOLVE_STANDALONE: "standalone.resolve",
  AWAIT_STANDALONE_READY: "standalone.await-ready",
  MOUNT_RENDERER: "electron.mount-renderer",
} as const);

export type ElectronWarmupAtom =
  (typeof ELECTRON_WARMUP_ATOMS)[keyof typeof ELECTRON_WARMUP_ATOMS];

export type ElectronWarmupNode = Readonly<{
  id: string;
  executor: string;
  dependsOn: readonly string[];
  blocking: boolean;
  failure?: "best-effort" | "required";
  label?: string;
  timeoutMs?: number;
}>;

export type ElectronWarmupTopology = Readonly<{
  schemaVersion: typeof ELECTRON_WARMUP_SCHEMA_VERSION;
  maxConcurrency?: number;
  nodes: readonly ElectronWarmupNode[];
}>;

const identifier = /^[a-z][a-z0-9.-]{0,127}$/u;

export function validateElectronWarmupTopology(value: ElectronWarmupTopology): ElectronWarmupTopology {
  if (value.schemaVersion !== ELECTRON_WARMUP_SCHEMA_VERSION) {
    throw new Error("unsupported Electron warmup topology schema");
  }
  if (!Array.isArray(value.nodes) || value.nodes.length === 0 || value.nodes.length > 128) {
    throw new Error("Electron warmup topology must declare between 1 and 128 nodes");
  }
  if (value.maxConcurrency != null
    && (!Number.isSafeInteger(value.maxConcurrency) || value.maxConcurrency < 1 || value.maxConcurrency > 32)) {
    throw new Error("Electron warmup topology has invalid concurrency");
  }
  const ids = new Set<string>();
  for (const node of value.nodes) {
    if (!identifier.test(node.id)) throw new Error(`invalid Electron warmup node id: ${node.id}`);
    if (!identifier.test(node.executor)) throw new Error(`invalid Electron warmup executor: ${node.executor}`);
    if (ids.has(node.id)) throw new Error(`duplicate Electron warmup node: ${node.id}`);
    ids.add(node.id);
    if (!Array.isArray(node.dependsOn) || new Set(node.dependsOn).size !== node.dependsOn.length) {
      throw new Error(`Electron warmup node has duplicate dependencies: ${node.id}`);
    }
    if (node.label != null && node.label.trim().length === 0) {
      throw new Error(`Electron warmup node has an empty label: ${node.id}`);
    }
    if (node.failure != null && node.failure !== "best-effort" && node.failure !== "required") {
      throw new Error(`Electron warmup node has an invalid failure mode: ${node.id}`);
    }
    if (node.timeoutMs != null && (!Number.isSafeInteger(node.timeoutMs) || node.timeoutMs < 100 || node.timeoutMs > 300_000)) {
      throw new Error(`Electron warmup node has an invalid timeout: ${node.id}`);
    }
  }
  for (const node of value.nodes) {
    for (const dependency of node.dependsOn) {
      if (dependency === node.id) throw new Error(`Electron warmup node depends on itself: ${node.id}`);
      if (!ids.has(dependency)) throw new Error(`Electron warmup node has an unknown dependency: ${node.id} -> ${dependency}`);
    }
  }

  const nodes = new Map(value.nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`Electron warmup topology contains a cycle at: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of nodes.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
  if (!value.nodes.some((node) => node.blocking)) throw new Error("Electron warmup topology requires a blocking node");
  return structuredClone(value);
}

export function validateElectronRuntimeWarmupTopology(value: ElectronWarmupTopology): ElectronWarmupTopology {
  const topology = validateElectronWarmupTopology(value);
  const byExecutor = new Map<string, ElectronWarmupNode>();
  for (const executor of Object.values(ELECTRON_WARMUP_ATOMS)) {
    const matches = topology.nodes.filter((node) => node.executor === executor);
    if (matches.length !== 1) throw new Error(`Electron runtime warmup requires exactly one ${executor} node`);
    byExecutor.set(executor, matches[0]!);
  }
  const dependsOn = (node: ElectronWarmupNode, expectedId: string, seen = new Set<string>()): boolean => {
    if (node.dependsOn.includes(expectedId)) return true;
    if (seen.has(node.id)) return false;
    seen.add(node.id);
    return node.dependsOn.some((id) => {
      const dependency = topology.nodes.find((candidate) => candidate.id === id);
      return dependency != null && dependsOn(dependency, expectedId, seen);
    });
  };
  const ordered = [
    ELECTRON_WARMUP_ATOMS.ENSURE_CARRIER,
    ELECTRON_WARMUP_ATOMS.RESOLVE_STANDALONE,
    ELECTRON_WARMUP_ATOMS.AWAIT_STANDALONE_READY,
    ELECTRON_WARMUP_ATOMS.MOUNT_RENDERER,
  ];
  for (let index = 1; index < ordered.length; index += 1) {
    const node = byExecutor.get(ordered[index]!)!;
    const previous = byExecutor.get(ordered[index - 1]!)!;
    if (!dependsOn(node, previous.id)) {
      throw new Error(`Electron runtime warmup must order ${previous.executor} before ${node.executor}`);
    }
  }
  if (!byExecutor.get(ELECTRON_WARMUP_ATOMS.MOUNT_RENDERER)!.blocking) {
    throw new Error("Electron renderer mount must be a blocking warmup node");
  }
  return topology;
}
