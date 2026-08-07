import { spawn } from "node:child_process";
import { watch, type FSWatcher } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { readJsonFile } from "../json-file.js";
import { requestJsonIpc } from "../json-ipc.js";
import { SidecarControlError } from "./error.js";
import {
  assertPrivateResponse,
  createPrivateLaunchEnv,
  createPrivateLaunchMetadata,
  createPrivateRequest,
  normalizeControlIdentity,
  normalizeControlRoots,
  normalizeControlScope,
  normalizePrivateReadyDescriptor,
  privateControlPaths,
  sameControlIdentity,
  sameControlRoots,
  type PrivateControlResponse,
  type PrivateLaunchMetadata,
  type PrivateReadyDescriptor,
} from "./private-protocol.js";
import type {
  BootstrapControlPlaneOptions,
  SidecarControlClient,
  SidecarControlIdentity,
  SidecarControlPlane,
  SidecarExit,
  SidecarLaunch,
  SidecarLaunchOptions,
  SidecarProbeResult,
  SidecarStopResult,
} from "./public-types.js";

function peerUnavailable(identity: SidecarControlIdentity): SidecarControlError {
  return new SidecarControlError(
    "peer-unavailable",
    `sidecar peer is unavailable: ${identity.channel}/${identity.namespace}/${identity.generation}/${identity.service}`,
  );
}

async function readCurrentDescriptor(
  identity: SidecarControlIdentity,
  roots: BootstrapControlPlaneOptions["roots"],
): Promise<PrivateReadyDescriptor> {
  const { descriptorPath } = privateControlPaths(identity, roots);
  const raw = await readJsonFile(descriptorPath);
  if (raw == null) throw peerUnavailable(identity);
  let descriptor: PrivateReadyDescriptor;
  try {
    descriptor = normalizePrivateReadyDescriptor(raw);
  } catch (error) {
    throw new SidecarControlError("peer-unavailable", "sidecar peer descriptor is invalid", {
      cause: error,
    });
  }
  if (!sameControlIdentity(descriptor.identity, identity) || !sameControlRoots(descriptor.roots, roots)) {
    throw peerUnavailable(identity);
  }
  return descriptor;
}

function normalizeTimeout(value: number | undefined, fallback: number, label: string): number {
  const timeout = value ?? fallback;
  if (!Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new SidecarControlError("invalid-input", `${label} must be a positive safe integer`);
  }
  return timeout;
}

function childExit(child: ReturnType<typeof spawn>): Promise<SidecarExit> {
  return new Promise<SidecarExit>((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
}

function createClient<TMethods>(descriptor: PrivateReadyDescriptor): SidecarControlClient<TMethods> {
  const invoke = async (operation: Parameters<typeof createPrivateRequest>[1]): Promise<unknown> => {
    const request = createPrivateRequest(descriptor, operation);
    let response: PrivateControlResponse;
    try {
      response = await requestJsonIpc<PrivateControlResponse>(descriptor.endpointPath, request);
    } catch (error) {
      throw new SidecarControlError("peer-unavailable", "sidecar peer request failed", { cause: error });
    }
    return assertPrivateResponse(request, response);
  };

  return Object.freeze({
    async call(method, input) {
      return (await invoke({ kind: "call", input, method })) as never;
    },
    identity: descriptor.identity,
    async probe() {
      return (await invoke({ kind: "probe" })) as SidecarProbeResult;
    },
    async requestStop() {
      return (await invoke({ kind: "request-stop" })) as SidecarStopResult;
    },
  });
}

async function waitForLaunchedClient<TMethods>(input: {
  descriptor: PrivateLaunchMetadata;
  exited: Promise<SidecarExit>;
  timeoutMs: number;
}): Promise<SidecarControlClient<TMethods>> {
  const { descriptorPath } = privateControlPaths(input.descriptor.identity, input.descriptor.roots);
  const descriptorRoot = dirname(descriptorPath);
  await mkdir(descriptorRoot, { recursive: true });

  return await new Promise<SidecarControlClient<TMethods>>((resolveReady, rejectReady) => {
    let checking = false;
    let settled = false;
    let timeout: NodeJS.Timeout | null = null;
    let watcher: FSWatcher | null = null;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout != null) clearTimeout(timeout);
      watcher?.close();
      callback();
    };
    const check = async () => {
      if (settled || checking) return;
      checking = true;
      try {
        const descriptor = await readCurrentDescriptor(
          input.descriptor.identity,
          input.descriptor.roots,
        );
        if (descriptor.incarnation !== input.descriptor.incarnation) return;
        const client = createClient<TMethods>(descriptor);
        await client.probe();
        settle(() => resolveReady(client));
      } catch {
        // Descriptor creation and socket readiness are separate writes. A later
        // filesystem event, child exit, or the deadline gives the next signal.
      } finally {
        checking = false;
      }
    };
    watcher = watch(descriptorRoot, () => void check());
    watcher.once("error", (error) => settle(() => rejectReady(error)));
    timeout = setTimeout(() => {
      settle(() =>
        rejectReady(
          new SidecarControlError(
            "peer-unavailable",
            `sidecar launch readiness timed out after ${input.timeoutMs}ms`,
          ),
        ),
      );
    }, input.timeoutMs);
    void input.exited.then(
      (exit) => {
        settle(() =>
          rejectReady(
            new SidecarControlError(
              "peer-unavailable",
              `sidecar exited before readiness: code=${String(exit.code)} signal=${String(exit.signal)}`,
            ),
          ),
        );
      },
      (error) => settle(() => rejectReady(error)),
    );
    void check();
  });
}

async function awaitExitOrTerminate(input: {
  child: ReturnType<typeof spawn>;
  exited: Promise<SidecarExit>;
  timeoutMs: number;
}): Promise<SidecarExit> {
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      input.exited,
      new Promise<SidecarExit>((resolveExit) => {
        timeout = setTimeout(() => {
          input.child.kill("SIGKILL");
          void input.exited.then(resolveExit);
        }, input.timeoutMs);
      }),
    ]);
  } finally {
    if (timeout != null) clearTimeout(timeout);
  }
}

export function bootstrapControlPlane({
  roots: rootsInput,
  scope: scopeInput,
}: BootstrapControlPlaneOptions): SidecarControlPlane {
  const roots = normalizeControlRoots(rootsInput);
  const scope = normalizeControlScope(scopeInput);
  const connect = async <TMethods>(service: string): Promise<SidecarControlClient<TMethods>> => {
    const identity = normalizeControlIdentity({ ...scope, service });
    return createClient<TMethods>(await readCurrentDescriptor(identity, roots));
  };
  const launch = async <TMethods>(options: SidecarLaunchOptions): Promise<SidecarLaunch<TMethods>> => {
    if (typeof options.executable !== "string" || options.executable.length === 0) {
      throw new SidecarControlError("invalid-input", "sidecar executable must be present");
    }
    const readyTimeoutMs = normalizeTimeout(options.readyTimeoutMs, 5_000, "readyTimeoutMs");
    const stopTimeoutMs = normalizeTimeout(options.stopTimeoutMs, 1_500, "stopTimeoutMs");
    const descriptor = createPrivateLaunchMetadata({ roots, scope, service: options.service });
    const child = spawn(options.executable, [...(options.args ?? [])], {
      cwd: options.cwd,
      env: createPrivateLaunchEnv(descriptor, options.env),
      stdio: options.output ?? "ignore",
    });
    const exited = childExit(child);
    let client: SidecarControlClient<TMethods>;
    try {
      client = await waitForLaunchedClient<TMethods>({ descriptor, exited, timeoutMs: readyTimeoutMs });
    } catch (error) {
      child.kill("SIGKILL");
      await exited.catch(() => undefined);
      throw error;
    }
    let stopping: Promise<SidecarExit> | null = null;
    return Object.freeze({
      client,
      exited,
      identity: descriptor.identity,
      async stop() {
        if (stopping != null) return await stopping;
        stopping = (async () => {
          await client.requestStop().catch(() => undefined);
          return await awaitExitOrTerminate({ child, exited, timeoutMs: stopTimeoutMs });
        })();
        return await stopping;
      },
    });
  };

  return Object.freeze({
    connect,
    launch,
    roots,
    scope,
    async probe(service) {
      return await (await connect(service)).probe();
    },
    async requestStop(service) {
      return await (await connect(service)).requestStop();
    },
  });
}
