import {
  compareStandaloneVersions,
  sameStandaloneHandoffEnvelope,
  validateStandaloneHandoffRequest,
  validateStandaloneRuntimeCommandRequest,
  validateStandaloneRuntimeCommandResult,
  validateStandaloneRuntimeStatus,
  validateStandaloneShellCapabilityRequest,
  validateStandaloneShellCapabilityResult,
  type StandaloneHandle,
  type StandaloneHandoff,
  type StandaloneHandoffRequest,
  type StandaloneRuntimeCommandRequest,
  type StandaloneRuntimeCommandResult,
  type StandaloneRuntimeStatus,
  type StandaloneRuntimeTerminalStatus,
  type StandaloneShellCapabilityPort,
  type StandaloneShellCapabilityRequest,
} from "@open-design/standalone-proto";

export type StandaloneBootloaderErrorCode =
  | "attachment-conflict"
  | "body-invalid"
  | "handoff-conflict"
  | "shell-incompatible";

export class StandaloneBootloaderError extends Error {
  readonly code: StandaloneBootloaderErrorCode;

  constructor(code: StandaloneBootloaderErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StandaloneBootloaderError";
    this.code = code;
  }
}

export type StandaloneShellCompatibility = Readonly<Record<string, Readonly<{
  version: Readonly<{ min: string }>;
}>>>;

export type CreateStandaloneBootloaderOptions = Readonly<{
  shellCompatibility: StandaloneShellCompatibility;
  start: StandaloneHandoff;
  resolveRegisteredBootloader?: () => StandaloneHandoff | null;
}>;

function sharedRequestKey(request: StandaloneHandoffRequest): string {
  return JSON.stringify({
    descriptorDigest: request.handoff.descriptorDigest,
    paths: request.paths,
    scope: request.handoff.scope,
  });
}

function attachmentKey(request: StandaloneHandoffRequest): string {
  return JSON.stringify(request.attachment);
}

function requireCompatibleShell(
  compatibility: StandaloneShellCompatibility,
  request: StandaloneHandoffRequest,
): void {
  const minimum = compatibility[request.attachment.shell.type]?.version.min;
  if (
    minimum == null
    || compareStandaloneVersions(request.attachment.shell.version, minimum) < 0
  ) {
    throw new StandaloneBootloaderError(
      "shell-incompatible",
      minimum == null
        ? `Standalone does not support Shell ${request.attachment.shell.type}`
        : `Standalone requires ${request.attachment.shell.type} Shell ${minimum} or newer`,
    );
  }
}

function validateCompatibility(value: StandaloneShellCompatibility): StandaloneShellCompatibility {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new StandaloneBootloaderError(
      "body-invalid",
      "Standalone shell compatibility must not be empty",
    );
  }
  for (const [shellType, compatibility] of entries) {
    if (!/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u.test(shellType)) {
      throw new StandaloneBootloaderError(
        "body-invalid",
        `Standalone shell compatibility contains invalid type ${shellType}`,
      );
    }
    compareStandaloneVersions(compatibility.version.min, compatibility.version.min);
  }
  return Object.freeze(Object.fromEntries(entries.map(([type, compatibility]) => [
    type,
    Object.freeze({ version: Object.freeze({ min: compatibility.version.min }) }),
  ])));
}

type AttachmentSlot = {
  closed: boolean;
  key: string;
  request: StandaloneHandoffRequest;
  resolveTerminal: (status: StandaloneRuntimeTerminalStatus) => void;
  task: Promise<StandaloneHandle> | null;
  terminal: Promise<StandaloneRuntimeTerminalStatus>;
  terminalStatus: StandaloneRuntimeTerminalStatus | null;
};

type BodyEntry = {
  attachments: Map<string, AttachmentSlot>;
  bodyTask: Promise<StandaloneHandle>;
  key: string;
  request: StandaloneHandoffRequest;
};

function attachmentTerminal(
  status: StandaloneRuntimeStatus,
): StandaloneRuntimeTerminalStatus {
  if (status.state !== "running") return status;
  return {
    handoff: status.handoff,
    pid: status.pid,
    schemaVersion: status.schemaVersion,
    state: "stopped",
  };
}

function createCapabilityMultiplexer(entry: Pick<BodyEntry, "attachments" | "request">): StandaloneShellCapabilityPort {
  return Object.freeze({
    async invoke(value: StandaloneShellCapabilityRequest) {
      const capabilityRequest = validateStandaloneShellCapabilityRequest(value, {
        handoff: entry.request.handoff,
      });
      const attachment = entry.attachments.get(capabilityRequest.attachmentId);
      if (attachment == null || attachment.closed) {
        return validateStandaloneShellCapabilityResult({
          attachmentId: capabilityRequest.attachmentId,
          error: { code: "attachment-unavailable" },
          handoff: entry.request.handoff,
          outcome: "failed",
          requestId: capabilityRequest.requestId,
          schemaVersion: capabilityRequest.schemaVersion,
        }, {
          attachmentId: capabilityRequest.attachmentId,
          capability: capabilityRequest.capability,
          handoff: entry.request.handoff,
          requestId: capabilityRequest.requestId,
        });
      }
      const result = await attachment.request.capabilities.invoke(capabilityRequest);
      return validateStandaloneShellCapabilityResult(result, {
        attachmentId: capabilityRequest.attachmentId,
        capability: capabilityRequest.capability,
        handoff: entry.request.handoff,
        requestId: capabilityRequest.requestId,
      });
    },
  });
}

async function startBody(entry: Pick<BodyEntry, "attachments" | "request">, start: StandaloneHandoff): Promise<StandaloneHandle> {
  const request = Object.freeze({
    ...entry.request,
    capabilities: createCapabilityMultiplexer(entry),
  });
  const rawHandle = await start(request);
  try {
    await rawHandle.readStatus().then((status) => validateStandaloneRuntimeStatus(status, {
      handoff: request.handoff,
      state: "running",
    }));
  } catch (error) {
    await rawHandle.close().catch(() => undefined);
    throw new StandaloneBootloaderError(
      "body-invalid",
      "Standalone did not report generation-bound running readiness",
      { cause: error },
    );
  }
  return rawHandle;
}

function resolveSlot(slot: AttachmentSlot, status: StandaloneRuntimeTerminalStatus): void {
  if (slot.terminalStatus != null) return;
  slot.terminalStatus = status;
  slot.resolveTerminal(status);
}

function attachmentHandle(entry: BodyEntry, slot: AttachmentSlot, raw: StandaloneHandle): StandaloneHandle {
  return Object.freeze({
    async close() {
      if (slot.terminalStatus != null) return slot.terminalStatus;
      slot.closed = true;
      entry.attachments.delete(slot.request.attachment.id);
      if (entry.attachments.size === 0) {
        const terminal = await raw.close();
        resolveSlot(slot, validateStandaloneRuntimeStatus(terminal, {
          handoff: slot.request.handoff,
        }) as StandaloneRuntimeTerminalStatus);
      } else {
        const status = validateStandaloneRuntimeStatus(await raw.readStatus(), {
          handoff: slot.request.handoff,
        });
        resolveSlot(slot, attachmentTerminal(status));
      }
      return slot.terminalStatus!;
    },
    async invoke(value: StandaloneRuntimeCommandRequest): Promise<StandaloneRuntimeCommandResult> {
      const command = validateStandaloneRuntimeCommandRequest(value, {
        attachmentId: slot.request.attachment.id,
        handoff: slot.request.handoff,
      });
      if (slot.closed) {
        return validateStandaloneRuntimeCommandResult({
          attachmentId: command.attachmentId,
          error: { code: "attachment-closed" },
          handoff: slot.request.handoff,
          outcome: "failed",
          requestId: command.requestId,
          schemaVersion: command.schemaVersion,
        }, {
          attachmentId: command.attachmentId,
          handoff: slot.request.handoff,
          requestId: command.requestId,
        });
      }
      return validateStandaloneRuntimeCommandResult(await raw.invoke(command), {
        attachmentId: command.attachmentId,
        handoff: slot.request.handoff,
        requestId: command.requestId,
      });
    },
    async readStatus() {
      if (slot.terminalStatus != null) return slot.terminalStatus;
      return validateStandaloneRuntimeStatus(await raw.readStatus(), {
        handoff: slot.request.handoff,
      });
    },
    async waitForTerminal() {
      return await slot.terminal;
    },
  });
}

function createSlot(request: StandaloneHandoffRequest): AttachmentSlot {
  let resolveTerminal!: (status: StandaloneRuntimeTerminalStatus) => void;
  const terminal = new Promise<StandaloneRuntimeTerminalStatus>((resolve) => {
    resolveTerminal = resolve;
  });
  return {
    closed: false,
    key: attachmentKey(request),
    request,
    resolveTerminal,
    task: null,
    terminal,
    terminalStatus: null,
  };
}

/**
 * Create the fossil-compatible `bootloader.mjs` boundary. The root selects at
 * most one inner bootloader and never falls back after that selection. The
 * selected body is entered once per committed generation, while compatible
 * Shell attachments receive independent handles over the shared body.
 */
export function createStandaloneBootloader(
  options: CreateStandaloneBootloaderOptions,
): StandaloneHandoff {
  const compatibility = validateCompatibility(options.shellCompatibility);
  let selected: StandaloneHandoff | null | undefined;
  let delegatedKey: string | null = null;
  const delegated = new Map<string, Readonly<{ key: string; task: Promise<StandaloneHandle> }>>();
  let entered: BodyEntry | null = null;

  return async (value) => {
    const request = validateStandaloneHandoffRequest(value);
    requireCompatibleShell(compatibility, request);
    const key = sharedRequestKey(request);

    if (selected === undefined) {
      selected = options.resolveRegisteredBootloader?.() ?? null;
    }
    if (selected != null) {
      if (delegatedKey != null && delegatedKey !== key) {
        throw new StandaloneBootloaderError(
          "handoff-conflict",
          "bootloader.mjs already entered a different Standalone generation",
        );
      }
      delegatedKey = key;
      const existing = delegated.get(request.attachment.id);
      const nextAttachmentKey = attachmentKey(request);
      if (existing != null) {
        if (existing.key !== nextAttachmentKey) {
          throw new StandaloneBootloaderError(
            "attachment-conflict",
            `Standalone attachment ${request.attachment.id} changed Shell identity`,
          );
        }
        return await existing.task;
      }
      const task = selected(request);
      delegated.set(request.attachment.id, Object.freeze({ key: nextAttachmentKey, task }));
      return await task;
    }

    if (entered != null && (
      entered.key !== key
      || !sameStandaloneHandoffEnvelope(entered.request.handoff, request.handoff)
    )) {
      throw new StandaloneBootloaderError(
        "handoff-conflict",
        "bootloader.mjs already entered a different Standalone generation",
      );
    }
    if (entered == null) {
      const attachments = new Map<string, AttachmentSlot>();
      const entry = {
        attachments,
        bodyTask: null as unknown as Promise<StandaloneHandle>,
        key,
        request,
      };
      const slot = createSlot(request);
      attachments.set(request.attachment.id, slot);
      entry.bodyTask = startBody(entry, options.start);
      slot.task = entry.bodyTask.then((raw) => attachmentHandle(entry, slot, raw));
      entered = entry;
      void entry.bodyTask.then((raw) => raw.waitForTerminal()).then((terminal) => {
        const validated = validateStandaloneRuntimeStatus(terminal, {
          handoff: request.handoff,
        }) as StandaloneRuntimeTerminalStatus;
        for (const attachment of entry.attachments.values()) resolveSlot(attachment, validated);
      }).catch(() => undefined);
    }

    const existing = entered.attachments.get(request.attachment.id);
    const nextAttachmentKey = attachmentKey(request);
    if (existing != null) {
      if (existing.key !== nextAttachmentKey) {
        throw new StandaloneBootloaderError(
          "attachment-conflict",
          `Standalone attachment ${request.attachment.id} changed Shell identity`,
        );
      }
      return await existing.task!;
    }
    const slot = createSlot(request);
    entered.attachments.set(request.attachment.id, slot);
    slot.task = entered.bodyTask.then((raw) => attachmentHandle(entered!, slot, raw));
    return await slot.task;
  };
}
