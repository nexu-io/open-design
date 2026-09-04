import { createJsonIpcServer, requestJsonIpc } from "./json-ipc.js";
import {
  isCurrentSidecarLauncher,
  normalizeSidecarStamp,
  readSupervisedSidecarContext,
  resolvePrivateIpcPath,
  SIDECAR_SUPERVISED_CONTEXT_ENV,
  type SidecarStamp,
  type SupervisedSidecarContext,
} from "./stamp.js";

const RESOURCES_ENV = "OD_SIDECAR_RESOURCES";
const CONTROL_STATUS = "sidecar:status";
const CONTROL_STOP = "sidecar:stop";
const CONTROL_DESCRIBE = "sidecar:describe";
const BUSINESS_INVOKE = "sidecar:invoke";
const INHERITED_ENDPOINT_ENV = "OD_SIDECAR_CLIENT_ENDPOINT";
const SUPERVISOR_HANDOFF = "sidecar:supervisor-handoff";
const SUPERVISOR_HANDOFF_ACCEPTED = "sidecar:supervisor-handoff-accepted";
export const SIDECAR_SUPERVISOR_TARGET_ENV = "OD_SIDECAR_SUPERVISOR_TARGET";

export type SidecarResources = Readonly<{
  dataRoot: string | null;
  ownerPid: number | null;
  pid: number;
  port: number;
  runtimeRoot: string;
}>;

export function prepareSidecarLaunchEnvironment(
  env: NodeJS.ProcessEnv,
  resources: Omit<SidecarResources, "pid">,
): NodeJS.ProcessEnv {
  const launchEnv: NodeJS.ProcessEnv = {
    ...env,
    [RESOURCES_ENV]: JSON.stringify({
      dataRoot: resources.dataRoot,
      ownerPid: resources.ownerPid,
      port: resources.port,
      runtimeRoot: resources.runtimeRoot,
    }),
  };
  delete launchEnv[INHERITED_ENDPOINT_ENV];
  delete launchEnv[SIDECAR_SUPERVISED_CONTEXT_ENV];
  delete launchEnv[SIDECAR_SUPERVISOR_TARGET_ENV];
  return launchEnv;
}

function newSidecarGenerationEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const launchEnv = { ...env };
  delete launchEnv[INHERITED_ENDPOINT_ENV];
  delete launchEnv[RESOURCES_ENV];
  delete launchEnv[SIDECAR_SUPERVISED_CONTEXT_ENV];
  delete launchEnv[SIDECAR_SUPERVISOR_TARGET_ENV];
  return launchEnv;
}

export type SidecarHandler = (input: unknown) => unknown | Promise<unknown>;
export type SidecarHandlers = Readonly<Record<string, SidecarHandler>>;

export type SidecarLifecycle<TRuntime> = {
  start(resources: SidecarResources): Promise<TRuntime>;
  status(runtime: TRuntime): unknown | Promise<unknown>;
  stop(runtime: TRuntime): Promise<void>;
};

export type SidecarClientOptions<TRuntime> = {
  handlers?: SidecarHandlers;
  lifecycle: SidecarLifecycle<TRuntime>;
};

export type SidecarGenerationHandoffRequest = {
  args?: readonly string[];
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

type SupervisorHandoffEnvelope = {
  request: SidecarGenerationHandoffRequest;
  requestId: string;
  type: typeof SUPERVISOR_HANDOFF;
};

type SupervisorHandoffAcceptedEnvelope = {
  requestId: string;
  type: typeof SUPERVISOR_HANDOFF_ACCEPTED;
};

/** Queue the next child under the current supervisor without changing generation identity. */
export async function handoffCurrentSidecarGeneration(
  request: SidecarGenerationHandoffRequest,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  if (typeof process.send !== "function") {
    throw new Error("current sidecar generation has no supervisor control channel");
  }
  if (typeof request.command !== "string" || request.command.length === 0) {
    throw new Error("sidecar generation handoff command must be a non-empty string");
  }
  const requestId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const timeoutMs = options.timeoutMs ?? 5_000;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      process.off("message", onMessage);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error == null) resolve();
      else reject(error);
    };
    const onMessage = (message: unknown) => {
      const response = message as Partial<SupervisorHandoffAcceptedEnvelope> | null;
      if (response?.type === SUPERVISOR_HANDOFF_ACCEPTED && response.requestId === requestId) finish();
    };
    const timer = setTimeout(
      () => finish(new Error(`sidecar supervisor did not accept generation handoff within ${timeoutMs}ms`)),
      timeoutMs,
    );
    process.on("message", onMessage);
    process.send?.({ request, requestId, type: SUPERVISOR_HANDOFF } satisfies SupervisorHandoffEnvelope, (error) => {
      if (error != null) finish(error);
    });
  });
}

export const sidecarSupervisorProtocol = Object.freeze({
  handoff: SUPERVISOR_HANDOFF,
  handoffAccepted: SUPERVISOR_HANDOFF_ACCEPTED,
});

export type SidecarConnection = {
  invoke<TResult = unknown>(app: string, action: string, input: unknown, options?: { timeoutMs?: number }): Promise<TResult>;
  requestStop(app: string, options?: { timeoutMs?: number }): Promise<{ accepted?: unknown }>;
  status<TResult = unknown>(app: string, options?: { timeoutMs?: number }): Promise<TResult>;
};

export type SidecarDescription = Readonly<{
  ready: boolean;
  resources: SidecarResources;
  stamp: SidecarStamp;
}>;

type InvokeEnvelope = { action: string; app: string; input: unknown; type: typeof BUSINESS_INVOKE };
type ControlEnvelope =
  | { type: typeof CONTROL_DESCRIBE }
  | { targetPid: number | null; type: typeof CONTROL_STATUS }
  | { targetPids: readonly number[] | null; type: typeof CONTROL_STOP };

export function normalizeSidecarLaunchResources(input: unknown): Omit<SidecarResources, "pid"> {
  if (typeof input !== "object" || input == null || Array.isArray(input)) {
    throw new Error("sidecar launch resources must contain a resource object");
  }
  const value = input as Record<string, unknown>;
  if (value.dataRoot != null && (typeof value.dataRoot !== "string" || value.dataRoot.length === 0)) {
    throw new Error("sidecar dataRoot must be null or a non-empty string");
  }
  if (typeof value.runtimeRoot !== "string" || value.runtimeRoot.length === 0) {
    throw new Error("sidecar runtimeRoot must be a non-empty string");
  }
  const port = Number(value.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("sidecar port must be an integer between 0 and 65535");
  }
  const ownerPid = value.ownerPid == null ? null : Number(value.ownerPid);
  if (ownerPid != null && (!Number.isSafeInteger(ownerPid) || ownerPid <= 0)) {
    throw new Error("sidecar ownerPid must be null or a positive safe integer");
  }
  return Object.freeze({ dataRoot: value.dataRoot == null ? null : value.dataRoot, ownerPid, port, runtimeRoot: value.runtimeRoot });
}

export function readSidecarLaunchResources(env: NodeJS.ProcessEnv = process.env): Omit<SidecarResources, "pid"> {
  const serialized = env[RESOURCES_ENV];
  if (serialized == null) throw new Error(`${RESOURCES_ENV} is required`);
  try {
    return normalizeSidecarLaunchResources(JSON.parse(serialized));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${RESOURCES_ENV} must contain valid JSON`, { cause: error });
    throw error;
  }
}

function readCurrentResources(context: SupervisedSidecarContext): SidecarResources {
  const resources = normalizeSidecarLaunchResources(context.resources);
  return Object.freeze({ ...resources, pid: context.generationPid });
}

function assertEnvelope(message: unknown): InvokeEnvelope | ControlEnvelope {
  if (typeof message !== "object" || message == null || Array.isArray(message)) {
    throw new Error("invalid sidecar request");
  }
  const request = message as Record<string, unknown>;
  if (request.type === CONTROL_DESCRIBE) return { type: CONTROL_DESCRIBE };
  if (request.type === CONTROL_STATUS) {
    if (request.targetPid != null && (!Number.isSafeInteger(request.targetPid) || Number(request.targetPid) <= 0)) {
      throw new Error("invalid sidecar status target");
    }
    return { targetPid: request.targetPid == null ? null : Number(request.targetPid), type: CONTROL_STATUS };
  }
  if (request.type === CONTROL_STOP) {
    if (request.targetPids != null && (
      !Array.isArray(request.targetPids) ||
      !request.targetPids.every((pid) => Number.isSafeInteger(pid) && Number(pid) > 0)
    )) throw new Error("invalid sidecar stop targets");
    const targetPids = request.targetPids == null ? null : request.targetPids.map(Number);
    return { targetPids, type: CONTROL_STOP };
  }
  if (request.type !== BUSINESS_INVOKE || typeof request.app !== "string" || typeof request.action !== "string") {
    throw new Error("invalid sidecar request");
  }
  return { action: request.action, app: request.app, input: request.input, type: BUSINESS_INVOKE };
}

export class SidecarClient<TRuntime> {
  readonly resources: SidecarResources;
  readonly stamp: SidecarStamp;

  readonly #handlers: SidecarHandlers;
  readonly #lifecycle: SidecarLifecycle<TRuntime>;
  #ipcServer: Awaited<ReturnType<typeof createJsonIpcServer>> | null = null;
  #runtime: TRuntime | null = null;
  #startPromise: Promise<void> | null = null;
  #stopPromise: Promise<void> | null = null;
  #supervisorTimer: NodeJS.Timeout | null = null;
  readonly #signalHandler = () => { this.#stopAndExit(); };
  #resolveStopped!: () => void;
  readonly #stopped = new Promise<void>((resolve) => { this.#resolveStopped = resolve; });

  constructor(options: SidecarClientOptions<TRuntime>) {
    const context = readSupervisedSidecarContext();
    if (context == null) throw new Error("SidecarFactory.create() requires a supervised sidecar context");
    this.stamp = context.stamp;
    this.resources = readCurrentResources(context);
    this.#handlers = options.handlers ?? {};
    this.#lifecycle = options.lifecycle;
  }

  start(): Promise<void> {
    if (this.#stopPromise != null) return Promise.reject(new Error("sidecar client is stopping"));
    if (this.#startPromise != null) return this.#startPromise;
    const attempt = this.#start();
    this.#startPromise = attempt;
    void attempt.catch(() => {
      if (this.#startPromise === attempt) this.#startPromise = null;
    });
    return attempt;
  }

  async #start(): Promise<void> {
    if (isCurrentSidecarLauncher()) {
      throw new Error("a sidecar launcher must bootstrap a generation before starting server lifecycle");
    }
    let runtime!: TRuntime;
    let runtimeStarted = false;
    try {
      this.#ipcServer = await createJsonIpcServer({
        socketPath: resolvePrivateIpcPath(this.stamp),
        handler: async (message) => {
          const request = assertEnvelope(message);
          if (request.type === CONTROL_DESCRIBE) {
            return { ready: runtimeStarted, resources: this.resources, stamp: this.stamp } satisfies SidecarDescription;
          }
          if (!runtimeStarted) throw new Error("sidecar runtime is starting");
          if (request.type === CONTROL_STATUS) {
            if (request.targetPid != null && request.targetPid !== this.resources.pid) {
              throw new Error(
                `sidecar endpoint belongs to generation ${this.resources.pid}, expected ${request.targetPid}`,
              );
            }
            return await this.#lifecycle.status(runtime);
          }
          if (request.type === CONTROL_STOP) {
            if (request.targetPids != null && !request.targetPids.includes(this.resources.pid)) {
              return { accepted: false };
            }
            setImmediate(() => { this.#stopAndExit(); });
            return { accepted: true };
          }
          if (request.type !== BUSINESS_INVOKE) throw new Error("invalid sidecar request");
          if (request.app !== this.stamp.app) throw new Error(`sidecar request targets ${request.app}, not ${this.stamp.app}`);
          const handler = this.#handlers[request.action];
          if (handler == null) throw new Error(`unknown ${this.stamp.app} action: ${request.action}`);
          return await handler(request.input);
        },
      });
      runtime = await this.#lifecycle.start(this.resources);
      runtimeStarted = true;
      this.#runtime = runtime;
      for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, this.#signalHandler);
      // The supervisor is the durable generation root. If it disappears
      // unexpectedly, the inner runtime quick-fails instead of surviving as
      // an ownerless process whose argv may no longer expose any identity.
      this.#supervisorTimer = setInterval(() => {
        try {
          process.kill(this.resources.pid, 0);
        } catch {
          if (this.#supervisorTimer != null) clearInterval(this.#supervisorTimer);
          this.#supervisorTimer = null;
          this.#stopAndExit();
        }
      }, 1_000);
      this.#supervisorTimer.unref();
      this.#publishEndpoint();
    } catch (error) {
      this.#runtime = null;
      if (runtimeStarted) await this.#lifecycle.stop(runtime).catch(() => undefined);
      await this.#ipcServer?.close().catch(() => undefined);
      this.#ipcServer = null;
      this.#clearEndpoint();
      throw error;
    }
  }

  #publishEndpoint(): void {
    process.env[INHERITED_ENDPOINT_ENV] = resolvePrivateIpcPath(this.stamp);
  }

  #clearEndpoint(): void {
    if (process.env[INHERITED_ENDPOINT_ENV] === resolvePrivateIpcPath(this.stamp)) {
      delete process.env[INHERITED_ENDPOINT_ENV];
    }
  }

  stop(): Promise<void> {
    this.#stopPromise ??= this.#stop();
    return this.#stopPromise;
  }

  #stopAndExit(): void {
    void this.stop().finally(() => process.exit(0));
  }

  async #stop(): Promise<void> {
    try {
      await this.#startPromise?.catch(() => undefined);
      for (const signal of ["SIGINT", "SIGTERM"] as const) process.off(signal, this.#signalHandler);
      if (this.#supervisorTimer != null) clearInterval(this.#supervisorTimer);
      this.#supervisorTimer = null;
      await this.#ipcServer?.close();
      this.#ipcServer = null;
      if (this.#runtime != null) await this.#lifecycle.stop(this.#runtime);
      this.#runtime = null;
    } finally {
      this.#clearEndpoint();
      this.#resolveStopped();
    }
  }

  waitUntilStopped(): Promise<void> {
    return this.#stopped;
  }

  async invoke<TResult = unknown>(app: string, action: string, input: unknown, options?: { timeoutMs?: number }): Promise<TResult> {
    const target = normalizeSidecarStamp({ ...this.stamp, app });
    return await requestJsonIpc<TResult>(
      resolvePrivateIpcPath(target),
      { action, app: target.app, input, type: BUSINESS_INVOKE },
      options,
    );
  }

  async status<TResult = unknown>(app: string, options?: { timeoutMs?: number }): Promise<TResult> {
    const target = normalizeSidecarStamp({ ...this.stamp, app });
    return await requestJsonIpc<TResult>(resolvePrivateIpcPath(target), { type: CONTROL_STATUS }, options);
  }

  async requestStop(app: string, options?: { timeoutMs?: number }): Promise<{ accepted?: unknown }> {
    const target = normalizeSidecarStamp({ ...this.stamp, app });
    return await requestJsonIpc(resolvePrivateIpcPath(target), { type: CONTROL_STOP }, options);
  }
}

export const SidecarFactory = Object.freeze({
  connectInherited(env: NodeJS.ProcessEnv = process.env): SidecarConnection | null {
    const endpoint = env[INHERITED_ENDPOINT_ENV];
    if (endpoint == null || endpoint.length === 0) return null;
    return {
      async invoke<TResult = unknown>(app: string, action: string, input: unknown, options?: { timeoutMs?: number }) {
        return await requestJsonIpc<TResult>(endpoint, { action, app, input, type: BUSINESS_INVOKE }, options);
      },
      async requestStop(_app: string, options?: { timeoutMs?: number }) {
        return await requestJsonIpc<{ accepted?: unknown }>(endpoint, { type: CONTROL_STOP }, options);
      },
      async status<TResult = unknown>(_app: string, options?: { timeoutMs?: number }) {
        return await requestJsonIpc<TResult>(endpoint, { type: CONTROL_STATUS }, options);
      },
    };
  },
  create<TRuntime>(options: SidecarClientOptions<TRuntime>): SidecarClient<TRuntime> {
    return new SidecarClient(options);
  },
  inheritedEnvironment(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
    const endpoint = env[INHERITED_ENDPOINT_ENV];
    return endpoint == null || endpoint.length === 0 ? {} : { [INHERITED_ENDPOINT_ENV]: endpoint };
  },
  /**
   * Creates the environment for an entrypoint that must bootstrap a new
   * generation instead of remaining attached to the caller's supervisor.
   */
  newGenerationEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    return newSidecarGenerationEnvironment(env);
  },
});

export const sidecarProtocol = Object.freeze({
  describe: CONTROL_DESCRIBE,
  resourcesEnv: RESOURCES_ENV,
  status: CONTROL_STATUS,
  stop: CONTROL_STOP,
});
