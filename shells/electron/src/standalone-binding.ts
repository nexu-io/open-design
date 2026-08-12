import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { compareStandaloneVersions, STANDALONE_PROTOCOL_VERSION } from "@open-design/standalone-proto";
import {
  closureBindingIdentityFromRuntimePointer,
  readClosureBindingDescriptor,
  resolveClosureStorePaths,
  verifyStoredClosureCandidate,
  verifyStoredClosureDistributionGeneration,
  type ClosureDistributionGenerationPlan,
  type ClosureRuntimePointer,
  type ClosureStorePaths,
  type StoredClosureVerification,
} from "@open-design/closure-store";

import type { PackagedNamespacePaths } from "./paths.js";
import type { ElectronStandaloneBinding } from "./standalone-handoff.js";

export type ElectronStandaloneBindingErrorCode =
  | "installer-required"
  | "no-standalone"
  | "standalone-invalid"
  | "unsupported-platform";

export class ElectronStandaloneBindingError extends Error {
  readonly code: ElectronStandaloneBindingErrorCode;

  constructor(code: ElectronStandaloneBindingErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ElectronStandaloneBindingError";
    this.code = code;
  }
}

export type ElectronStandaloneSelection = Readonly<{
  binding: ElectronStandaloneBinding;
  distribution: ClosureDistributionGenerationPlan | null;
  pointer: ClosureRuntimePointer;
  storePaths: ClosureStorePaths;
  verification: StoredClosureVerification | null;
}>;

function hostStandalonePlatform(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | null {
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "win32" && arch === "x64") return "win32-x64";
  return null;
}

/**
 * Resolve one already-committed Standalone generation into the protocol-only
 * Electron handoff. This adapter verifies Store truth and paths, but never
 * imports the body or reads Web/daemon layout.
 */
export async function resolveElectronStandaloneBinding(input: Readonly<{
  channel: string;
  installerRequiredVersion: string | null;
  namespace: string;
  paths: PackagedNamespacePaths;
  shellDigest: `sha256:${string}`;
  shellVersion: string;
}>, options: Readonly<{
  arch?: string;
  platform?: NodeJS.Platform;
}> = {}): Promise<ElectronStandaloneSelection> {
  const platform = hostStandalonePlatform(options.platform, options.arch);
  if (platform == null) {
    throw new ElectronStandaloneBindingError(
      "unsupported-platform",
      `Electron Standalone handoff is unsupported on ${options.platform ?? process.platform}-${options.arch ?? process.arch}`,
    );
  }
  const storePaths = resolveClosureStorePaths({
    channel: input.channel,
    namespace: input.namespace,
    root: input.paths.installationRoot,
  });
  const descriptor = await readClosureBindingDescriptor(storePaths);
  if (descriptor.committed == null) {
    if (
      input.installerRequiredVersion != null
      && compareStandaloneVersions(input.shellVersion, input.installerRequiredVersion) < 0
    ) {
      throw new ElectronStandaloneBindingError(
        "installer-required",
        `Standalone requires Electron Shell ${input.installerRequiredVersion} or newer`,
      );
    }
    throw new ElectronStandaloneBindingError(
      "no-standalone",
      `No committed Standalone exists for ${storePaths.channel}/${storePaths.namespace}`,
    );
  }
  const { releaseVersion, standalone: pointer } = descriptor.committed;
  if (pointer.target !== platform) {
    throw new ElectronStandaloneBindingError(
      "standalone-invalid",
      `Committed Standalone target ${pointer.target} does not match ${platform}`,
    );
  }

  let distribution: Awaited<ReturnType<typeof verifyStoredClosureDistributionGeneration>> | null = null;
  let verification: StoredClosureVerification | null = null;
  let distributionError: unknown = null;
  try {
    distribution = await verifyStoredClosureDistributionGeneration(storePaths, pointer);
  } catch (error) {
    distributionError = error;
  }
  if (distribution == null) {
    try {
      verification = await verifyStoredClosureCandidate(
        storePaths,
        closureBindingIdentityFromRuntimePointer(pointer),
      );
    } catch (error) {
      const cause = new AggregateError(
        [distributionError, error].filter((value) => value != null),
        "Neither layered nor legacy Closure generation passed immutable verification",
      );
      throw new ElectronStandaloneBindingError(
        "standalone-invalid",
        "Committed Standalone failed immutable Store verification",
        { cause },
      );
    }
  }
  if (distribution == null && verification == null) {
    throw new ElectronStandaloneBindingError(
      "standalone-invalid",
      "Committed Standalone failed immutable Store verification",
    );
  }
  const minShellVersion = distribution?.plan.manifest.compatibility.shell.electron?.version.min
    ?? verification?.manifest.compatibility.shell.electron?.version.min;
  if (minShellVersion == null) {
    throw new ElectronStandaloneBindingError(
      "installer-required",
      "Committed Standalone does not support the Electron Shell",
    );
  }
  if (compareStandaloneVersions(input.shellVersion, minShellVersion) < 0) {
    throw new ElectronStandaloneBindingError(
      "installer-required",
      `Standalone requires Electron Shell ${minShellVersion} or newer`,
    );
  }

  return Object.freeze({
    binding: Object.freeze({
      attachment: Object.freeze({
        id: `electron-${input.shellDigest.slice("sha256:".length, "sha256:".length + 16)}`,
        shell: Object.freeze({
          digest: input.shellDigest,
          type: "electron",
          version: input.shellVersion,
        }),
      }),
      bootloaderPath: distribution?.plan.required.launcher.resolvedHandoffPath ?? join(
        verification!.paths.payloadRoot,
        verification!.manifest.artifact.entryPath,
      ),
      descriptor: Object.freeze({
        release: Object.freeze({ version: releaseVersion }),
        standalone: Object.freeze({
          digest: pointer.digest,
          protocolVersion: STANDALONE_PROTOCOL_VERSION,
          version: pointer.version,
        }),
      }),
      paths: Object.freeze({
        cacheRoot: input.paths.cacheRoot,
        dataRoot: input.paths.dataRoot,
        installationRoot: distribution?.plan.installationRoot ?? verification!.paths.payloadRoot,
        logsRoot: input.paths.logsRoot,
        resourceRoot: distribution == null
          ? join(verification!.paths.payloadRoot, "resources", "open-design")
          : join(storePaths.channelRoot, "resources"),
        runtimeRoot: input.paths.runtimeRoot,
      }),
      scope: Object.freeze({
        channel: storePaths.channel,
        generation: pointer.generation,
        namespace: storePaths.namespace,
      }),
    }),
    distribution: distribution?.plan ?? null,
    pointer,
    storePaths,
    verification,
  });
}

/** Digest the actual bundled Electron entry, not mutable presentation metadata. */
export async function digestElectronShellEntry(
  entryUrl: string = import.meta.url,
): Promise<`sha256:${string}`> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(fileURLToPath(entryUrl))) {
    hash.update(chunk as Buffer);
  }
  return `sha256:${hash.digest("hex")}`;
}
