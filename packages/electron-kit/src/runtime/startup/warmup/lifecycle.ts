import {
  validateElectronWarmupTopology,
  type ElectronWarmupNode,
  type ElectronWarmupTopology,
} from "./contracts.js";

export type ElectronWarmupNodeState = "cancelled" | "completed" | "failed" | "pending" | "running";

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
  snapshot(): readonly ElectronWarmupNodeReceipt[];
  dispose(): Promise<void>;
}>;

export type ElectronWarmupNodeReceipt = Readonly<{
  durationMs: number | null;
  error: string | null;
  id: string;
  state: ElectronWarmupNodeState;
}>;

class ElectronWarmupScheduler {
  readonly #limit: number;
  #active = 0;
  readonly #queue: Array<() => void> = [];

  constructor(limit: number) { this.#limit = limit; }

  acquire(): (() => void) | Promise<() => void> {
    if (this.#active >= this.#limit) {
      return new Promise<void>((resolve) => this.#queue.push(resolve)).then(() => this.#grant());
    }
    return this.#grant();
  }

  #grant(): () => void {
    this.#active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#active -= 1;
      this.#queue.shift()?.();
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
  const unknown = topology.nodes.find((node) => input.executors[node.executor] == null);
  if (unknown != null) throw new Error(`unknown Electron warmup executor: ${unknown.executor}`);
  const controller = new AbortController();
  const scheduler = new ElectronWarmupScheduler(topology.maxConcurrency ?? topology.nodes.length);
  const promises = new Map<string, Promise<void>>();
  const receipts = new Map<string, ElectronWarmupNodeReceipt>(topology.nodes.map((node) => [node.id, {
    durationMs: null,
    error: null,
    id: node.id,
    state: "pending",
  }]));
  const emit = (event: ElectronWarmupEvent): void => {
    try { void Promise.resolve(input.onEvent?.(event)).catch(() => undefined); }
    catch { /* Progress observers are non-authoritative. */ }
  };
  const execute = (node: ElectronWarmupNode): Promise<void> => {
    const existing = promises.get(node.id);
    if (existing != null) return existing;
    const executor = input.executors[node.executor]!;
    const promise = Promise.all(node.dependsOn.map((dependency) => {
      const dependencyNode = topology.nodes.find((candidate) => candidate.id === dependency);
      if (dependencyNode == null) throw new Error(`Electron warmup dependency disappeared: ${dependency}`);
      return execute(dependencyNode);
    })).then(async () => {
      const acquired = scheduler.acquire();
      const release = typeof acquired === "function" ? acquired : await acquired;
      const startedAt = Date.now();
      receipts.set(node.id, { durationMs: null, error: null, id: node.id, state: "running" });
      emit({ node, state: "running" });
      try {
        await executeWithTimeout(executor, node, controller.signal);
        receipts.set(node.id, { durationMs: Date.now() - startedAt, error: null, id: node.id, state: "completed" });
        emit({ node, state: "completed" });
      } catch (error) {
        const state = controller.signal.aborted ? "cancelled" : "failed";
        receipts.set(node.id, { durationMs: Date.now() - startedAt, error: errorMessage(error), id: node.id, state });
        emit({ node, state, error });
        if (node.failure !== "best-effort") throw error;
      } finally {
        release();
      }
    }).catch((error: unknown) => {
      if (receipts.get(node.id)?.state === "pending") {
        receipts.set(node.id, { durationMs: null, error: errorMessage(error), id: node.id, state: "cancelled" });
        emit({ node, state: "cancelled", error });
      }
      throw error;
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
    snapshot() {
      return topology.nodes.map((node) => structuredClone(receipts.get(node.id)!));
    },
    async dispose() {
      controller.abort(new Error("Electron warmup lifecycle disposed"));
      await settled;
    },
  });
}
