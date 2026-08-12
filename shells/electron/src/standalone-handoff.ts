import { basename, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import {
  STANDALONE_BOOTLOADER_ENTRY_PATH,
  STANDALONE_BOOTLOADER_EXPORT_NAME,
  createStandaloneHandoffEnvelope,
  validateStandaloneHandoffRequest,
  validateStandaloneBootstrapResolution,
  type StandaloneBootstrapResolution,
  type StandaloneHandle,
  type StandaloneHandoff,
  type StandaloneHandoffRequest,
  type StandaloneHandoffScope,
  type StandaloneAttachmentDescriptor,
  type StandalonePaths,
  type StandaloneRuntimeDescriptor,
  type StandaloneShellCapabilityPort,
} from "@open-design/standalone-proto";

export type ElectronStandaloneBinding = Readonly<{
  attachment: StandaloneAttachmentDescriptor;
  bootloaderPath: string;
  descriptor: StandaloneRuntimeDescriptor;
  paths: StandalonePaths;
  scope: StandaloneHandoffScope;
}>;

export type ElectronStandaloneLaunchErrorCode =
  | "binding-conflict"
  | "installer-required"
  | "standalone-start-failed";

export class ElectronStandaloneLaunchError extends Error {
  readonly code: ElectronStandaloneLaunchErrorCode;

  constructor(code: ElectronStandaloneLaunchErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ElectronStandaloneLaunchError";
    this.code = code;
  }
}

type BootloaderModule = Readonly<Record<string, unknown>>;

export function electronBindingFromBootstrapResolution(
  value: StandaloneBootstrapResolution,
): ElectronStandaloneBinding {
  const resolution = validateStandaloneBootstrapResolution(value);
  return Object.freeze({
    attachment: resolution.handoff.attachment,
    bootloaderPath: resolution.bootloaderPath,
    descriptor: resolution.handoff.handoff.descriptor,
    paths: resolution.handoff.paths,
    scope: resolution.handoff.handoff.scope,
  });
}

export type ElectronStandaloneLauncherOptions = Readonly<{
  importBootloader?: (bootloaderUrl: string) => Promise<BootloaderModule>;
}>;

function requestFromBinding(
  binding: ElectronStandaloneBinding,
  capabilities: StandaloneShellCapabilityPort,
): StandaloneHandoffRequest {
  if (
    !isAbsolute(binding.bootloaderPath)
    || basename(binding.bootloaderPath) !== STANDALONE_BOOTLOADER_ENTRY_PATH
  ) {
    throw new ElectronStandaloneLaunchError(
      "standalone-start-failed",
      `Standalone binding must target an absolute ${STANDALONE_BOOTLOADER_ENTRY_PATH}`,
    );
  }
  return validateStandaloneHandoffRequest({
    attachment: binding.attachment,
    capabilities,
    handoff: createStandaloneHandoffEnvelope({
      descriptor: binding.descriptor,
      scope: binding.scope,
    }),
    paths: binding.paths,
  });
}

function requestKey(bootloaderPath: string, request: StandaloneHandoffRequest): string {
  return JSON.stringify({
    attachment: request.attachment,
    bootloaderPath,
    descriptorDigest: request.handoff.descriptorDigest,
    paths: request.paths,
    scope: request.handoff.scope,
  });
}

function bootloaderHandoff(module: BootloaderModule): StandaloneHandoff {
  const handoff = module[STANDALONE_BOOTLOADER_EXPORT_NAME];
  if (typeof handoff !== "function") {
    throw new ElectronStandaloneLaunchError(
      "standalone-start-failed",
      `${STANDALONE_BOOTLOADER_ENTRY_PATH} must export ${STANDALONE_BOOTLOADER_EXPORT_NAME}()`,
    );
  }
  return handoff as StandaloneHandoff;
}

function errorDetail(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  return String(error);
}

/**
 * Lazy-load one committed Standalone binding. Repeated identical launches
 * share the task; any different binding fails closed. The Shell never imports
 * an app-private module and never falls back after entering bootloader.mjs.
 */
export function createElectronStandaloneLauncher(
  options: ElectronStandaloneLauncherOptions = {},
): Readonly<{
  launch(
    binding: ElectronStandaloneBinding,
    capabilities: StandaloneShellCapabilityPort,
  ): Promise<StandaloneHandle>;
}> {
  const importBootloader = options.importBootloader
    ?? (async (bootloaderUrl: string) => await import(bootloaderUrl) as BootloaderModule);
  let entered: Readonly<{ key: string; task: Promise<StandaloneHandle> }> | null = null;

  return Object.freeze({
    async launch(binding, capabilities) {
      const request = requestFromBinding(binding, capabilities);
      const key = requestKey(binding.bootloaderPath, request);
      if (entered != null) {
        if (entered.key !== key) {
          throw new ElectronStandaloneLaunchError(
            "binding-conflict",
            "Electron Shell already entered a different Standalone binding",
          );
        }
        return await entered.task;
      }

      const task = (async () => {
        try {
          const module = await importBootloader(pathToFileURL(binding.bootloaderPath).href);
          return await bootloaderHandoff(module)(request);
        } catch (error) {
          if (
            typeof error === "object"
            && error != null
            && "code" in error
            && error.code === "shell-incompatible"
          ) {
            throw new ElectronStandaloneLaunchError(
              "installer-required",
              "The committed Standalone requires a newer Electron Shell",
              { cause: error },
            );
          }
          if (error instanceof ElectronStandaloneLaunchError) throw error;
          throw new ElectronStandaloneLaunchError(
            "standalone-start-failed",
            `Electron Shell could not enter the committed Standalone: ${errorDetail(error)}`,
            { cause: error },
          );
        }
      })();
      entered = Object.freeze({ key, task });
      return await task;
    },
  });
}
