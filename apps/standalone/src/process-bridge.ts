import { createHash } from "node:crypto";

import {
  bootstrapControlPlane,
  type AttachedSidecar,
  type SidecarControlClient,
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

/**
 * Testable body-side shape. A real body process uses the same handlers with
 * sidecar attach metadata supplied by launcher.mjs instead of expose().
 */
export async function exposeStandaloneBodyBridge(options: Readonly<{
  descriptor: StandaloneHandoffDescriptor;
  handoff: StandaloneHandoff;
}>): Promise<AttachedSidecar> {
  const { control, descriptor: baseline } = descriptorControl(options.descriptor);
  const baselineKey = descriptorKey(baseline);
  const attachments = new Map<string, BodyAttachment>();
  const clientDescriptor = (value: StandaloneHandoffDescriptor): StandaloneHandoffDescriptor => {
    const descriptor = validateStandaloneHandoffDescriptor(value);
    if (descriptorKey(descriptor) !== baselineKey) {
      throw new Error("Standalone body attach does not match its generation paths and handoff");
    }
    return descriptor;
  };
  return await control.expose<StandaloneBodyBridgeMethods>({
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
          if (attachments.get(descriptor.attachment.id) === entry) {
            attachments.delete(descriptor.attachment.id);
          }
        });
        return validateStandaloneRuntimeStatus(await (await task).readStatus(), {
          handoff: descriptor.handoff,
        });
      },
      async close({ attachmentId }) {
        const entry = attachment(attachments, attachmentId);
        const handle = await entry.task;
        const terminal = validateTerminalStatus(await handle.close(), baseline);
        attachments.delete(attachmentId);
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
        if (attachments.get(attachmentId) === entry) attachments.delete(attachmentId);
        return terminal;
      },
    },
    async onStopRequested() {
      await Promise.all(
        [...attachments.values()].map(async (entry) => {
          await entry.task.then(async (handle) => await handle.close()).catch(() => undefined);
        }),
      );
      attachments.clear();
    },
    service: STANDALONE_BODY_BRIDGE_SERVICE,
  });
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
        closeTask = client.call("close", { attachmentId })
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
      return validateStandaloneRuntimeCommandResult(await client.call("invoke", command), {
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
          await client.call("waitForTerminal", { attachmentId }),
          descriptor,
        );
      } finally {
        await closeShell();
      }
    },
  };
}

export async function connectStandaloneBodyBridge(options: Readonly<{
  capabilities: StandaloneShellCapabilityPort;
  descriptor: StandaloneHandoffDescriptor;
}>): Promise<StandaloneHandle> {
  const { control, descriptor } = descriptorControl(options.descriptor);
  const shell = await exposeStandaloneShellBridge(options);
  try {
    const client = await control.connect<StandaloneBodyBridgeMethods>(STANDALONE_BODY_BRIDGE_SERVICE);
    validateStandaloneRuntimeStatus(
      await client.call("attach", { descriptor, shellService: shell.service }),
      { handoff: descriptor.handoff },
    );
    return bodyClientHandle(client, descriptor, shell.sidecar);
  } catch (error) {
    await shell.sidecar.close().catch(() => undefined);
    throw error;
  }
}
