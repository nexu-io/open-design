import { createHash } from "node:crypto";

import {
  SidecarControlError,
  attachSidecar,
  bootstrapControlPlane,
  type AttachSidecarOptions,
  type AttachedSidecar,
  type SidecarControlClient,
  type SidecarControlContext,
  type SidecarControlPlane,
  type SidecarMethod,
} from "@open-design/sidecar/control";
import {
  validateStandaloneHandoffDescriptor,
  validateStandaloneRuntimeCommandRequest,
  validateStandaloneRuntimeCommandResult,
  validateStandaloneRuntimeStatus,
  validateStandaloneShellCapabilityRequest,
  validateStandaloneShellCapabilityResult,
  type StandaloneHandle,
  type StandaloneHandoff,
  type StandaloneHandoffDescriptor,
  type StandaloneRuntimeCommandRequest,
  type StandaloneRuntimeCommandResult,
  type StandaloneRuntimeStatus,
  type StandaloneRuntimeTerminalStatus,
  type StandaloneShellCapabilityPort,
  type StandaloneShellCapabilityRequest,
  type StandaloneShellCapabilityResult,
} from "@open-design/standalone-proto";

import { createStandaloneLauncherBootstrapEnv } from "./launcher-bootstrap.js";

export const STANDALONE_BODY_BRIDGE_SERVICE = "standalone-body" as const;

type StandaloneShellBridgeMethods = {
  invoke: SidecarMethod<StandaloneShellCapabilityRequest, StandaloneShellCapabilityResult>;
};

type StandaloneBodyAttachmentInput = Readonly<{
  attachmentId: string;
}>;

type StandaloneBodyAttachInput = Readonly<{
  descriptor: StandaloneHandoffDescriptor;
  shellService: string;
}>;

type StandaloneBodyBridgeMethods = {
  attach: SidecarMethod<StandaloneBodyAttachInput, StandaloneRuntimeStatus>;
  close: SidecarMethod<StandaloneBodyAttachmentInput, StandaloneRuntimeTerminalStatus>;
  invoke: SidecarMethod<StandaloneRuntimeCommandRequest, StandaloneRuntimeCommandResult>;
  readStatus: SidecarMethod<StandaloneBodyAttachmentInput, StandaloneRuntimeStatus>;
  waitForTerminal: SidecarMethod<StandaloneBodyAttachmentInput, StandaloneRuntimeTerminalStatus>;
};

type BodyAttachment = Readonly<{
  descriptorKey: string;
  task: Promise<StandaloneHandle>;
}>;

export type StandaloneBodyProcessLaunchSpec = Readonly<{
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  executable: string;
  launcherPath: string;
  output?: "ignore" | "inherit";
  readyTimeoutMs?: number;
  stopTimeoutMs?: number;
}>;

function descriptorControl(descriptorInput: StandaloneHandoffDescriptor): Readonly<{
  control: SidecarControlPlane;
  descriptor: StandaloneHandoffDescriptor;
}> {
  const descriptor = validateStandaloneHandoffDescriptor(descriptorInput);
  const scope = descriptor.handoff.scope;
  return {
    control: bootstrapControlPlane({
      projection: {
        digest: descriptor.handoff.descriptorDigest,
        value: descriptor.handoff.descriptor,
      },
      roots: {
        dataRoot: descriptor.paths.dataRoot,
        resourceRoot: descriptor.paths.resourceRoot,
        runtimeRoot: descriptor.paths.runtimeRoot,
      },
      scope: {
        channel: scope.channel,
        generation: scope.generation,
        namespace: scope.namespace,
      },
    }),
    descriptor,
  };
}

function descriptorKey(descriptor: StandaloneHandoffDescriptor): string {
  return JSON.stringify({ handoff: descriptor.handoff, paths: descriptor.paths });
}

function attachmentKey(descriptor: StandaloneHandoffDescriptor): string {
  return JSON.stringify(descriptor.attachment);
}

export function resolveStandaloneShellBridgeService(
  descriptorInput: StandaloneHandoffDescriptor,
): string {
  const descriptor = validateStandaloneHandoffDescriptor(descriptorInput);
  const digest = createHash("sha256").update(attachmentKey(descriptor)).digest("hex").slice(0, 24);
  return `standalone-shell-${digest}`;
}

export async function exposeStandaloneShellBridge(options: Readonly<{
  capabilities: StandaloneShellCapabilityPort;
  descriptor: StandaloneHandoffDescriptor;
}>): Promise<Readonly<{
  service: string;
  sidecar: AttachedSidecar;
}>> {
  const { control, descriptor } = descriptorControl(options.descriptor);
  const service = resolveStandaloneShellBridgeService(descriptor);
  const sidecar = await control.expose<StandaloneShellBridgeMethods>({
    handlers: {
      async invoke(value) {
        const request = validateStandaloneShellCapabilityRequest(value, {
          attachmentId: descriptor.attachment.id,
          handoff: descriptor.handoff,
        });
        return validateStandaloneShellCapabilityResult(
          await options.capabilities.invoke(request),
          {
            attachmentId: descriptor.attachment.id,
            handoff: descriptor.handoff,
            requestId: request.requestId,
          },
        );
      },
    },
    service,
  });
  return { service, sidecar };
}

async function remoteCapabilityPort(
  control: SidecarControlPlane,
  descriptor: StandaloneHandoffDescriptor,
  service: string,
): Promise<StandaloneShellCapabilityPort> {
  if (service !== resolveStandaloneShellBridgeService(descriptor)) {
    throw new Error("Standalone body attach references the wrong Shell capability service");
  }
  const client = await control.connect<StandaloneShellBridgeMethods>(service);
  return {
    async invoke(value) {
      const request = validateStandaloneShellCapabilityRequest(value, {
        attachmentId: descriptor.attachment.id,
        handoff: descriptor.handoff,
      });
      return validateStandaloneShellCapabilityResult(await client.call("invoke", request), {
        attachmentId: descriptor.attachment.id,
        handoff: descriptor.handoff,
        requestId: request.requestId,
      });
    },
  };
}

function attachment(
  attachments: Map<string, BodyAttachment>,
  attachmentId: string,
): BodyAttachment {
  const entry = attachments.get(attachmentId);
  if (entry == null) throw new Error(`Standalone body attachment is unavailable: ${attachmentId}`);
  return entry;
}

function validateTerminalStatus(
  value: unknown,
  descriptor: StandaloneHandoffDescriptor,
): StandaloneRuntimeTerminalStatus {
  const status = validateStandaloneRuntimeStatus(value, { handoff: descriptor.handoff });
  if (status.state === "running") {
    throw new Error("Standalone body returned a non-terminal status from a terminal operation");
  }
  return status;
}

type StandaloneBodyBridgeHostOptions = Readonly<{
  descriptor: StandaloneHandoffDescriptor;
  handoff: StandaloneHandoff;
  onExitRequested?: () => void;
}>;

function createStandaloneBodyBridgeHost(options: StandaloneBodyBridgeHostOptions): Readonly<{
  attachOptions: AttachSidecarOptions<StandaloneBodyBridgeMethods>;
  closeAttachments(): Promise<void>;
}> {
  const { control, descriptor: baseline } = descriptorControl(options.descriptor);
  const baselineKey = descriptorKey(baseline);
  const attachments = new Map<string, BodyAttachment>();
  let exitScheduled = false;
  let stopping = false;
  const scheduleExitIfIdle = (): void => {
    if (stopping || attachments.size > 0 || exitScheduled) return;
    exitScheduled = true;
    setImmediate(() => {
      exitScheduled = false;
      if (!stopping && attachments.size === 0) options.onExitRequested?.();
    });
  };
  const removeAttachment = (attachmentId: string, entry: BodyAttachment): void => {
    if (attachments.get(attachmentId) !== entry) return;
    attachments.delete(attachmentId);
    scheduleExitIfIdle();
  };
  const closeAttachments = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await Promise.all(
      [...attachments.values()].map(async (entry) => {
        await entry.task.then(async (handle) => await handle.close()).catch(() => undefined);
      }),
    );
    attachments.clear();
  };
  const clientDescriptor = (value: StandaloneHandoffDescriptor): StandaloneHandoffDescriptor => {
    const descriptor = validateStandaloneHandoffDescriptor(value);
    if (descriptorKey(descriptor) !== baselineKey) {
      throw new Error("Standalone body attach does not match its generation paths and handoff");
    }
    return descriptor;
  };
  return {
    attachOptions: {
      handlers: {
        async attach(value) {
          const descriptor = clientDescriptor(value.descriptor);
          const key = attachmentKey(descriptor);
          const existing = attachments.get(descriptor.attachment.id);
          if (existing != null) {
            if (existing.descriptorKey !== key) {
              throw new Error("Standalone body attachment changed Shell identity");
            }
            return validateStandaloneRuntimeStatus(await (await existing.task).readStatus(), {
              handoff: descriptor.handoff,
            });
          }
          const task = (async () => {
            const capabilities = await remoteCapabilityPort(control, descriptor, value.shellService);
            return await options.handoff({ ...descriptor, capabilities });
          })();
          const entry = { descriptorKey: key, task };
          attachments.set(descriptor.attachment.id, entry);
          task.catch(() => {
            removeAttachment(descriptor.attachment.id, entry);
          });
          void task.then(async (handle) => await handle.waitForTerminal())
            .then(() => removeAttachment(descriptor.attachment.id, entry))
            .catch(() => removeAttachment(descriptor.attachment.id, entry));
          return validateStandaloneRuntimeStatus(await (await task).readStatus(), {
            handoff: descriptor.handoff,
            state: "running",
          });
        },
        async close({ attachmentId }) {
          const entry = attachment(attachments, attachmentId);
          const handle = await entry.task;
          const terminal = validateTerminalStatus(await handle.close(), baseline);
          removeAttachment(attachmentId, entry);
          return terminal;
        },
        async invoke(value) {
          const command = validateStandaloneRuntimeCommandRequest(value, {
            attachmentId: value.attachmentId,
            handoff: baseline.handoff,
          });
          return validateStandaloneRuntimeCommandResult(
            await (await attachment(attachments, command.attachmentId).task).invoke(command),
            {
              attachmentId: command.attachmentId,
              handoff: baseline.handoff,
              requestId: command.requestId,
            },
          );
        },
        async readStatus({ attachmentId }) {
          return validateStandaloneRuntimeStatus(
            await (await attachment(attachments, attachmentId).task).readStatus(),
            { handoff: baseline.handoff },
          );
        },
        async waitForTerminal({ attachmentId }) {
          const entry = attachment(attachments, attachmentId);
          const terminal = validateTerminalStatus(
            await (await entry.task).waitForTerminal(),
            baseline,
          );
          removeAttachment(attachmentId, entry);
          return terminal;
        },
      },
      async onStopRequested() {
        await closeAttachments();
        options.onExitRequested?.();
      },
    },
    closeAttachments,
  };
}

function wrapStandaloneBodySidecar(
  sidecar: AttachedSidecar,
  closeAttachments: () => Promise<void>,
): AttachedSidecar {
  return Object.freeze({
    async close() {
      await closeAttachments();
      await sidecar.close();
    },
    context: sidecar.context,
  });
}

function assertStandaloneBodyContext(
  context: SidecarControlContext,
  control: SidecarControlPlane,
): void {
  if (
    context.identity.service !== STANDALONE_BODY_BRIDGE_SERVICE
    || context.identity.channel !== control.scope.channel
    || context.identity.namespace !== control.scope.namespace
    || context.identity.generation !== control.scope.generation
    || context.projection.digest !== control.projection.digest
    || context.roots.dataRoot !== control.roots.dataRoot
    || context.roots.resourceRoot !== control.roots.resourceRoot
    || context.roots.runtimeRoot !== control.roots.runtimeRoot
  ) {
    throw new Error("Standalone launcher control metadata does not match its handoff descriptor");
  }
}

/** Host a body bridge in the caller process for focused tests and embedders. */
export async function exposeStandaloneBodyBridge(
  options: StandaloneBodyBridgeHostOptions,
): Promise<AttachedSidecar> {
  const { control } = descriptorControl(options.descriptor);
  const host = createStandaloneBodyBridgeHost(options);
  return wrapStandaloneBodySidecar(
    await control.expose<StandaloneBodyBridgeMethods>({
      ...host.attachOptions,
      service: STANDALONE_BODY_BRIDGE_SERVICE,
    }),
    host.closeAttachments,
  );
}

/** Attach launcher.mjs to caller-supplied Sidecar launch metadata. */
export async function attachStandaloneBodyBridge(
  options: StandaloneBodyBridgeHostOptions,
): Promise<AttachedSidecar> {
  const { control } = descriptorControl(options.descriptor);
  const host = createStandaloneBodyBridgeHost(options);
  return wrapStandaloneBodySidecar(
    await attachSidecar<StandaloneBodyBridgeMethods>({
      ...host.attachOptions,
      initialize(context) {
        assertStandaloneBodyContext(context, control);
      },
    }),
    host.closeAttachments,
  );
}

function bodyClientHandle(
  client: SidecarControlClient<StandaloneBodyBridgeMethods>,
  descriptor: StandaloneHandoffDescriptor,
  shell: AttachedSidecar,
): StandaloneHandle {
  const attachmentId = descriptor.attachment.id;
  let closeTask: Promise<StandaloneRuntimeTerminalStatus> | null = null;
  const closeShell = async (): Promise<void> => await shell.close().catch(() => undefined);
  return {
    async close() {
      if (closeTask == null) {
        closeTask = client.call("close", { attachmentId }, { timeoutMs: null })
          .then((status) => validateTerminalStatus(status, descriptor))
          .finally(closeShell);
      }
      return await closeTask;
    },
    async invoke(value) {
      const command = validateStandaloneRuntimeCommandRequest(value, {
        attachmentId,
        handoff: descriptor.handoff,
      });
      return validateStandaloneRuntimeCommandResult(await client.call("invoke", command, { timeoutMs: null }), {
        attachmentId,
        handoff: descriptor.handoff,
        requestId: command.requestId,
      });
    },
    async readStatus() {
      return validateStandaloneRuntimeStatus(await client.call("readStatus", { attachmentId }), {
        handoff: descriptor.handoff,
      });
    },
    async waitForTerminal() {
      try {
        return validateTerminalStatus(
          await client.call("waitForTerminal", { attachmentId }, { timeoutMs: null }),
          descriptor,
        );
      } finally {
        await closeShell();
      }
    },
  };
}

async function attachShellToStandaloneBody(
  client: SidecarControlClient<StandaloneBodyBridgeMethods>,
  descriptor: StandaloneHandoffDescriptor,
  shell: Readonly<{ service: string; sidecar: AttachedSidecar }>,
): Promise<StandaloneHandle> {
  validateStandaloneRuntimeStatus(
    await client.call("attach", { descriptor, shellService: shell.service }),
    { handoff: descriptor.handoff, state: "running" },
  );
  return bodyClientHandle(client, descriptor, shell.sidecar);
}

function isUnavailableSidecar(error: unknown): boolean {
  return error instanceof SidecarControlError && error.code === "peer-unavailable";
}

export async function connectStandaloneBodyBridge(options: Readonly<{
  capabilities: StandaloneShellCapabilityPort;
  descriptor: StandaloneHandoffDescriptor;
}>): Promise<StandaloneHandle> {
  const { control, descriptor } = descriptorControl(options.descriptor);
  const shell = await exposeStandaloneShellBridge(options);
  try {
    const client = await control.connect<StandaloneBodyBridgeMethods>(STANDALONE_BODY_BRIDGE_SERVICE);
    return await attachShellToStandaloneBody(client, descriptor, shell);
  } catch (error) {
    await shell.sidecar.close().catch(() => undefined);
    throw error;
  }
}

/**
 * Shell-side cold/hot path. Reuse an existing generation body when present;
 * otherwise launch official Node with the immutable launcher.mjs entry. A
 * duplicate cold-start loser reconnects to the winner instead of replacing it.
 */
export async function launchStandaloneBodyBridge(options: Readonly<{
  capabilities: StandaloneShellCapabilityPort;
  descriptor: StandaloneHandoffDescriptor;
  launch: StandaloneBodyProcessLaunchSpec;
}>): Promise<StandaloneHandle> {
  const { control, descriptor } = descriptorControl(options.descriptor);
  const shell = await exposeStandaloneShellBridge(options);
  const ownedLaunch: { stop: (() => Promise<unknown>) | null } = { stop: null };
  try {
    let client: SidecarControlClient<StandaloneBodyBridgeMethods>;
    try {
      client = await control.connect<StandaloneBodyBridgeMethods>(STANDALONE_BODY_BRIDGE_SERVICE);
    } catch (connectError) {
      if (!isUnavailableSidecar(connectError)) throw connectError;
      try {
        const launched = await control.launch<StandaloneBodyBridgeMethods>({
          args: [options.launch.launcherPath],
          ...(options.launch.cwd == null ? {} : { cwd: options.launch.cwd }),
          env: createStandaloneLauncherBootstrapEnv({
            descriptor,
          }, options.launch.env),
          executable: options.launch.executable,
          ...(options.launch.output == null ? {} : { output: options.launch.output }),
          ...(options.launch.readyTimeoutMs == null
            ? {}
            : { readyTimeoutMs: options.launch.readyTimeoutMs }),
          service: STANDALONE_BODY_BRIDGE_SERVICE,
          ...(options.launch.stopTimeoutMs == null
            ? {}
            : { stopTimeoutMs: options.launch.stopTimeoutMs }),
        });
        ownedLaunch.stop = async () => await launched.stop();
        client = launched.client;
      } catch (launchError) {
        try {
          client = await control.connect<StandaloneBodyBridgeMethods>(
            STANDALONE_BODY_BRIDGE_SERVICE,
          );
        } catch {
          throw launchError;
        }
      }
    }
    return await attachShellToStandaloneBody(client, descriptor, shell);
  } catch (error) {
    await shell.sidecar.close().catch(() => undefined);
    await ownedLaunch.stop?.().catch(() => undefined);
    throw error;
  }
}
