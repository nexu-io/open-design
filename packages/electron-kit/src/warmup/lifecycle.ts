import {
  validateElectronWarmupTopology,
  type ElectronWarmupNode,
  type ElectronWarmupTopology,
} from "./contracts.js";

export type ElectronWarmupNodeState = "cancelled" | "completed" | "failed" | "running";

export type ElectronWarmupEvent = Readonly<{
  node: ElectronWarmupNode;
  state: ElectronWarmupNodeState;
  error?: unknown;
}>;

export type ElectronWarmupExecutor = (context: Readonly<{
  node: ElectronWarmupNode;
  signal: AbortSignal;
}>) => void | Promise<void>;

export type ElectronWarmupRun = Readonly<{
  ready: Promise<void>;
  settled: Promise<void>;
  dispose(): Promise<void>;
}>;

function executeWithTimeout(
  executor: ElectronWarmupExecutor,
  node: ElectronWarmupNode,
  parentSignal: AbortSignal,
): Promise<void> {
  const controller = new AbortController();
  const abort = () => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) abort();
  else parentSignal.addEventListener("abort", abort, { once: true });
  let timer: NodeJS.Timeout | undefined;
  if (node.timeoutMs != null) {
    timer = setTimeout(() => controller.abort(new Error(`Electron warmup node timed out: ${node.id}`)), node.timeoutMs);
    timer.unref();
  }
  const aborted = new Promise<never>((_resolve, reject) => {
    const rejectAbort = () => reject(controller.signal.reason ?? new Error(`Electron warmup node aborted: ${node.id}`));
    if (controller.signal.aborted) rejectAbort();
    else controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  return Promise.race([Promise.resolve().then(() => executor({ node, signal: controller.signal })), aborted])
    .finally(() => {
      if (timer != null) clearTimeout(timer);
      parentSignal.removeEventListener("abort", abort);
    });
}

export function runElectronWarmupTopology(input: Readonly<{
  topology: ElectronWarmupTopology;
  executors: Readonly<Record<string, ElectronWarmupExecutor>>;
  onEvent?(event: ElectronWarmupEvent): void | Promise<void>;
}>): ElectronWarmupRun {
  const topology = validateElectronWarmupTopology(input.topology);
  const controller = new AbortController();
  const promises = new Map<string, Promise<void>>();
  const emit = (event: ElectronWarmupEvent): void => {
    try { void Promise.resolve(input.onEvent?.(event)).catch(() => undefined); }
    catch { /* Progress observers are non-authoritative. */ }
  };
  const execute = (node: ElectronWarmupNode): Promise<void> => {
    const existing = promises.get(node.id);
    if (existing != null) return existing;
    const executor = input.executors[node.executor];
    const promise = Promise.all(node.dependsOn.map((dependency) => {
      const dependencyNode = topology.nodes.find((candidate) => candidate.id === dependency);
      if (dependencyNode == null) throw new Error(`Electron warmup dependency disappeared: ${dependency}`);
      return execute(dependencyNode);
    })).then(async () => {
      if (executor == null) throw new Error(`unknown Electron warmup executor: ${node.executor}`);
      emit({ node, state: "running" });
      try {
        await executeWithTimeout(executor, node, controller.signal);
        emit({ node, state: "completed" });
      } catch (error) {
        emit({ node, state: controller.signal.aborted ? "cancelled" : "failed", error });
        throw error;
      }
    });
    promises.set(node.id, promise);
    return promise;
  };
  const all = topology.nodes.map(execute);
  const ready = Promise.all(topology.nodes.filter((node) => node.blocking).map((node) => promises.get(node.id)!)).then(() => undefined);
  const settled = Promise.allSettled(all).then(() => undefined);
  return Object.freeze({
    ready,
    settled,
    async dispose() {
      controller.abort(new Error("Electron warmup lifecycle disposed"));
      await settled;
    },
  });
}
