import { isAbsolute } from "node:path";

import {
  canonicalJson,
  compareVersions,
  sha256Hex,
  validateShellIdentity,
  validateStandaloneScope,
  type StandaloneScope,
  type StandaloneShellIdentity,
} from "./protocol.js";
import type { GenerationRecord } from "./store.js";

export const STANDALONE_BOOTLOADER_HANDOFF_SCHEMA = 2 as const;
export const STANDALONE_LAUNCHER_PROTOCOL = "standalone-launcher-v1" as const;
export const STANDALONE_GENERATION_HANDOFF_EXPORT = "standaloneGenerationHandoff" as const;

export type StandaloneGenerationResourceBinding = Readonly<{
  component: "standalone.launcher" | "standalone.resource";
  blobSha256: string;
  entrypoint: string;
  mediaType: string;
  path: string;
  size: number;
}>;

export type StandaloneGenerationBinding = Readonly<{
  schemaVersion: typeof STANDALONE_BOOTLOADER_HANDOFF_SCHEMA;
  protocol: typeof STANDALONE_LAUNCHER_PROTOCOL;
  scope: StandaloneScope;
  generationId: string;
  launcher: Readonly<{
    resourceId: string;
    blobSha256: string;
    entrypoint: string;
    path: string;
  }>;
  resources: Readonly<Record<string, StandaloneGenerationResourceBinding>>;
  minimumShellVersions: Readonly<Record<string, string>>;
  digest: string;
}>;

export type StandaloneHandoffAttachment = Readonly<{
  id: string;
  shell: StandaloneShellIdentity;
}>;

export type StandaloneShellCapabilityRequest = Readonly<{
  requestId: string;
  attachmentId: string;
  bindingDigest: string;
  capability: string;
  input?: unknown;
}>;

export type StandaloneShellCapabilityResult = Readonly<{
  requestId: string;
  attachmentId: string;
  bindingDigest: string;
  outcome: "accepted" | "unsupported" | "failed";
  output?: unknown;
  error?: Readonly<{ code: string; message?: string }>;
}>;

export interface StandaloneShellCapabilityPort {
  invoke(request: StandaloneShellCapabilityRequest): Promise<StandaloneShellCapabilityResult>;
}

export type StandaloneHandoffRequest = Readonly<{
  binding: StandaloneGenerationBinding;
  attachment: StandaloneHandoffAttachment;
  capabilities: StandaloneShellCapabilityPort;
}>;

export type StandaloneRuntimeStatus = Readonly<{
  bindingDigest: string;
  generationId: string;
  instanceId: string;
  state: "running" | "stopped" | "failed";
  references: number;
}>;

export type StandaloneRuntimeCommand = Readonly<{
  requestId: string;
  attachmentId: string;
  bindingDigest: string;
  command: string;
  input?: unknown;
}>;

export type StandaloneRuntimeCommandResult = Readonly<{
  requestId: string;
  attachmentId: string;
  bindingDigest: string;
  outcome: "accepted" | "unsupported" | "failed";
  output?: unknown;
  error?: Readonly<{ code: string; message?: string }>;
}>;

export interface StandaloneRuntimeHandle {
  readStatus(): Promise<StandaloneRuntimeStatus>;
  invoke(request: StandaloneRuntimeCommand, context?: StandaloneRuntimeInvocationContext): Promise<StandaloneRuntimeCommandResult>;
  close(): Promise<StandaloneRuntimeStatus>;
  waitForTerminal(): Promise<StandaloneRuntimeStatus>;
}

/** Supplied by the bound generation handle, never taken from command input. */
export type StandaloneRuntimeInvocationContext = Readonly<{
  attachment: StandaloneHandoffAttachment;
}>;

export type StandaloneGenerationHandoff = (request: StandaloneHandoffRequest) => Promise<StandaloneRuntimeHandle>;

export class StandaloneHandoffError extends Error {
  constructor(
    readonly code: "attachment-conflict" | "handoff-conflict" | "launcher-invalid" | "runtime-invalid" | "shell-incompatible",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StandaloneHandoffError";
  }
}

function bindingPayload(binding: Omit<StandaloneGenerationBinding, "digest">): string {
  return canonicalJson(binding);
}

function validateResourceBinding(resourceId: string, resource: StandaloneGenerationResourceBinding): void {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(resourceId)) throw new StandaloneHandoffError("launcher-invalid", "handoff contains an invalid resource id");
  if (resource.component !== "standalone.launcher" && resource.component !== "standalone.resource") {
    throw new StandaloneHandoffError("launcher-invalid", `handoff resource ${resourceId} has an invalid component`);
  }
  if (!/^[a-f0-9]{64}$/.test(resource.blobSha256)) throw new StandaloneHandoffError("launcher-invalid", `handoff resource ${resourceId} has an invalid blob digest`);
  if (!isAbsolute(resource.path) || !isAbsolute(resource.entrypoint)) throw new StandaloneHandoffError("launcher-invalid", `handoff resource ${resourceId} paths must be absolute`);
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(resource.mediaType)) throw new StandaloneHandoffError("launcher-invalid", `handoff resource ${resourceId} has an invalid media type`);
  if (!Number.isSafeInteger(resource.size) || resource.size < 0) throw new StandaloneHandoffError("launcher-invalid", `handoff resource ${resourceId} has an invalid size`);
}

export function createStandaloneGenerationBinding(
  generation: GenerationRecord,
  scope: StandaloneScope,
): StandaloneGenerationBinding {
  const validScope = validateStandaloneScope(scope);
  if (generation.channel !== validScope.channel) throw new StandaloneHandoffError("launcher-invalid", "generation escaped handoff channel");
  if (generation.launcher.protocol !== STANDALONE_LAUNCHER_PROTOCOL) throw new StandaloneHandoffError("launcher-invalid", "generation uses an unsupported launcher protocol");
  if (!isAbsolute(generation.launcher.path)) throw new StandaloneHandoffError("launcher-invalid", "generation launcher path must be absolute");
  const launcherResource = generation.resources[generation.launcher.resourceId];
  if (
    launcherResource?.component !== "standalone.launcher"
    || launcherResource.blobSha256 !== generation.launcher.blobSha256
    || launcherResource.entrypoint !== generation.launcher.entrypoint
    || launcherResource.path !== generation.launcher.path
  ) {
    throw new StandaloneHandoffError("launcher-invalid", "generation launcher is not bound to standalone.launcher");
  }
  for (const [shellType, minimum] of Object.entries(generation.minimumShellVersions)) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(shellType)) throw new StandaloneHandoffError("launcher-invalid", "generation contains an invalid Shell floor");
    compareVersions(minimum, minimum);
  }
  const resources = Object.freeze(Object.fromEntries(Object.entries(generation.resources)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([resourceId, resource]) => {
      const projected = Object.freeze({
        component: resource.component,
        blobSha256: resource.blobSha256,
        entrypoint: resource.entrypoint,
        mediaType: resource.mediaType,
        path: resource.path,
        size: resource.size,
      });
      validateResourceBinding(resourceId, projected);
      return [resourceId, projected];
    })));
  const payload = Object.freeze({
    schemaVersion: STANDALONE_BOOTLOADER_HANDOFF_SCHEMA,
    protocol: STANDALONE_LAUNCHER_PROTOCOL,
    scope: Object.freeze({ ...validScope }),
    generationId: generation.id,
    launcher: Object.freeze({
      resourceId: generation.launcher.resourceId,
      blobSha256: generation.launcher.blobSha256,
      entrypoint: generation.launcher.entrypoint,
      path: generation.launcher.path,
    }),
    resources,
    minimumShellVersions: Object.freeze({ ...generation.minimumShellVersions }),
  });
  return Object.freeze({ ...payload, digest: sha256Hex(bindingPayload(payload)) });
}

function validateBinding(binding: StandaloneGenerationBinding): StandaloneGenerationBinding {
  const { digest, ...payload } = binding;
  if (binding.schemaVersion !== STANDALONE_BOOTLOADER_HANDOFF_SCHEMA || binding.protocol !== STANDALONE_LAUNCHER_PROTOCOL) {
    throw new StandaloneHandoffError("launcher-invalid", "unsupported Standalone bootloader handoff");
  }
  validateStandaloneScope(binding.scope);
  if (!/^[a-f0-9]{64}$/.test(binding.generationId) || !/^[a-f0-9]{64}$/.test(binding.launcher.blobSha256)) {
    throw new StandaloneHandoffError("launcher-invalid", "handoff contains an invalid generation or launcher digest");
  }
  if (!isAbsolute(binding.launcher.path) || binding.launcher.resourceId.length === 0 || binding.launcher.entrypoint.length === 0) {
    throw new StandaloneHandoffError("launcher-invalid", "handoff contains an invalid launcher entrypoint");
  }
  if (binding.resources == null || typeof binding.resources !== "object" || Array.isArray(binding.resources)) {
    throw new StandaloneHandoffError("launcher-invalid", "handoff contains invalid generation resources");
  }
  const resources = Object.entries(binding.resources);
  if (resources.length === 0) throw new StandaloneHandoffError("launcher-invalid", "handoff contains no generation resources");
  for (const [resourceId, resource] of resources) validateResourceBinding(resourceId, resource);
  const launcherResource = binding.resources[binding.launcher.resourceId];
  if (
    launcherResource?.component !== "standalone.launcher"
    || launcherResource.blobSha256 !== binding.launcher.blobSha256
    || launcherResource.entrypoint !== binding.launcher.entrypoint
    || launcherResource.path !== binding.launcher.path
  ) throw new StandaloneHandoffError("launcher-invalid", "handoff launcher escaped its generation resources");
  if (sha256Hex(bindingPayload(payload)) !== digest) throw new StandaloneHandoffError("launcher-invalid", "handoff binding digest mismatch");
  return binding;
}

export function resolveStandaloneGenerationHandoff(module: Readonly<Record<string, unknown>>): StandaloneGenerationHandoff {
  const handoff = module[STANDALONE_GENERATION_HANDOFF_EXPORT];
  if (typeof handoff !== "function") {
    throw new StandaloneHandoffError("launcher-invalid", `materialized Standalone launcher must export ${STANDALONE_GENERATION_HANDOFF_EXPORT}`);
  }
  return handoff as StandaloneGenerationHandoff;
}

function requireCompatibleShell(binding: StandaloneGenerationBinding, shell: StandaloneShellIdentity): void {
  validateShellIdentity(shell);
  const minimum = binding.minimumShellVersions[shell.type];
  if (minimum == null || compareVersions(shell.version, minimum) < 0) {
    throw new StandaloneHandoffError(
      "shell-incompatible",
      minimum == null
        ? `generation ${binding.generationId} does not support Shell ${shell.type}`
        : `Shell ${shell.type} ${shell.version} is below required ${minimum}`,
    );
  }
}

function attachmentKey(attachment: StandaloneHandoffAttachment): string {
  return canonicalJson(attachment);
}

function validateStatus(status: StandaloneRuntimeStatus, binding: StandaloneGenerationBinding): StandaloneRuntimeStatus {
  if (
    status.bindingDigest !== binding.digest
    || status.generationId !== binding.generationId
    || status.instanceId.length === 0
    || !Number.isSafeInteger(status.references)
    || status.references < 0
    || !["running", "stopped", "failed"].includes(status.state)
  ) throw new StandaloneHandoffError("runtime-invalid", "Standalone runtime status escaped its generation binding");
  return status;
}

/**
 * Immutable fossil handoff. Selection and import are sticky for the lifetime
 * of this host: the selected launcher may fail, but it is never replaced by a
 * baseline or another generation in-process.
 */
export class FossilHandoffHost {
  private selectedDigest: string | null = null;
  private launcherTask: Promise<StandaloneGenerationHandoff> | null = null;
  private readonly attachments = new Map<string, Readonly<{ key: string; task: Promise<StandaloneRuntimeHandle> }>>();

  constructor(
    private readonly load: (binding: StandaloneGenerationBinding) => Promise<StandaloneGenerationHandoff>,
  ) {}

  async handoff(request: StandaloneHandoffRequest): Promise<StandaloneRuntimeHandle> {
    const binding = validateBinding(request.binding);
    requireCompatibleShell(binding, request.attachment.shell);
    if (this.selectedDigest != null && this.selectedDigest !== binding.digest) {
      throw new StandaloneHandoffError("handoff-conflict", "fossil host already selected a different Standalone generation");
    }
    if (this.selectedDigest == null) {
      this.selectedDigest = binding.digest;
      this.launcherTask = this.load(binding);
    }
    const key = attachmentKey(request.attachment);
    const existing = this.attachments.get(request.attachment.id);
    if (existing != null) {
      if (existing.key !== key) throw new StandaloneHandoffError("attachment-conflict", `attachment ${request.attachment.id} changed Shell identity`);
      return existing.task;
    }
    const attachmentId = request.attachment.id;
    const task = this.launcherTask!.then(async (handoff): Promise<StandaloneRuntimeHandle> => {
      const handle = await handoff(request);
      let closeTask: Promise<StandaloneRuntimeStatus> | null = null;
      return Object.freeze({
        readStatus: () => handle.readStatus(),
        invoke: (command: StandaloneRuntimeCommand) => handle.invoke(command),
        waitForTerminal: () => handle.waitForTerminal(),
        close: () => {
          closeTask ??= handle.close().then((status) => {
            // Only a completed release can evict this attachment. An old
            // handle must never evict a later attachment with the same id.
            if (this.attachments.get(attachmentId)?.task === task) this.attachments.delete(attachmentId);
            return status;
          });
          return closeTask;
        },
      });
    });
    this.attachments.set(attachmentId, Object.freeze({ key, task }));
    return task;
  }
}

type BodyEntry = Readonly<{
  binding: StandaloneGenerationBinding;
  attachments: Map<string, StandaloneHandoffRequest>;
  body: Promise<StandaloneRuntimeHandle>;
}>;

function capabilityMultiplexer(entry: Pick<BodyEntry, "attachments" | "binding">): StandaloneShellCapabilityPort {
  return Object.freeze({
    async invoke(request: StandaloneShellCapabilityRequest) {
      if (request.bindingDigest !== entry.binding.digest) {
        throw new StandaloneHandoffError("runtime-invalid", "Shell capability request escaped its generation binding");
      }
      const attachment = entry.attachments.get(request.attachmentId);
      if (attachment == null) {
        return Object.freeze({
          requestId: request.requestId,
          attachmentId: request.attachmentId,
          bindingDigest: entry.binding.digest,
          outcome: "failed" as const,
          error: Object.freeze({ code: "attachment-unavailable" }),
        });
      }
      const result = await attachment.capabilities.invoke(request);
      if (
        result.requestId !== request.requestId
        || result.attachmentId !== request.attachmentId
        || result.bindingDigest !== entry.binding.digest
      ) throw new StandaloneHandoffError("runtime-invalid", "Shell capability result escaped its attachment binding");
      return result;
    },
  });
}

/** Create one generation body and multiplex compatible Shell attachments over it. */
export function createStandaloneGenerationBootloader(
  startBody: (request: StandaloneHandoffRequest) => Promise<StandaloneRuntimeHandle>,
): StandaloneGenerationHandoff {
  let entry: BodyEntry | null = null;
  return async (request) => {
    const binding = validateBinding(request.binding);
    requireCompatibleShell(binding, request.attachment.shell);
    if (entry != null && entry.binding.digest !== binding.digest) {
      throw new StandaloneHandoffError("handoff-conflict", "generation bootloader already entered a different binding");
    }
    if (entry == null) {
      const attachments = new Map<string, StandaloneHandoffRequest>();
      attachments.set(request.attachment.id, request);
      const bodyRequest = Object.freeze({ ...request, capabilities: capabilityMultiplexer({ attachments, binding }) });
      const body = startBody(bodyRequest).then(async (handle) => {
        try {
          const status = validateStatus(await handle.readStatus(), binding);
          if (status.state !== "running") throw new StandaloneHandoffError("runtime-invalid", "generation body did not report running readiness");
          return handle;
        } catch (error) {
          await handle.close().catch(() => undefined);
          throw error;
        }
      });
      entry = Object.freeze({ attachments, binding, body });
    } else {
      const previous = entry.attachments.get(request.attachment.id);
      if (previous != null && attachmentKey(previous.attachment) !== attachmentKey(request.attachment)) {
        throw new StandaloneHandoffError("attachment-conflict", `attachment ${request.attachment.id} changed Shell identity`);
      }
      entry.attachments.set(request.attachment.id, request);
    }
    const active = entry;
    const invocationContext: StandaloneRuntimeInvocationContext = Object.freeze({
      attachment: Object.freeze({ id: request.attachment.id, shell: Object.freeze({ ...request.attachment.shell }) }),
    });
    let closed: StandaloneRuntimeStatus | null = null;
    return Object.freeze({
      async readStatus() {
        if (closed != null) return closed;
        return validateStatus(await (await active.body).readStatus(), binding);
      },
      async invoke(command: StandaloneRuntimeCommand) {
        if (closed != null) throw new StandaloneHandoffError("runtime-invalid", "runtime attachment is closed");
        if (
          command.attachmentId !== invocationContext.attachment.id
          || command.bindingDigest !== binding.digest
        ) throw new StandaloneHandoffError("runtime-invalid", "runtime command escaped its attachment binding");
        const result = await (await active.body).invoke(command, invocationContext);
        if (
          result.requestId !== command.requestId
          || result.attachmentId !== command.attachmentId
          || result.bindingDigest !== binding.digest
        ) throw new StandaloneHandoffError("runtime-invalid", "runtime command result escaped its attachment binding");
        return result;
      },
      async close() {
        if (closed != null) return closed;
        active.attachments.delete(request.attachment.id);
        if (active.attachments.size === 0) {
          // Retire the multiplexed body before awaiting its physical close. A
          // later Shell attachment must start a fresh body instead of binding
          // to the already-closing handle retained by this closure.
          if (entry === active) entry = null;
          closed = validateStatus(await (await active.body).close(), binding);
        }
        else {
          const status = validateStatus(await (await active.body).readStatus(), binding);
          closed = Object.freeze({ ...status, state: "stopped" as const, references: active.attachments.size });
        }
        return closed;
      },
      async waitForTerminal() {
        if (closed != null) return closed;
        return validateStatus(await (await active.body).waitForTerminal(), binding);
      },
    });
  };
}
