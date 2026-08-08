import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { compareStandaloneVersions, STANDALONE_PROTOCOL_VERSION } from "@open-design/standalone-proto";
import {
  readClosureBindingDescriptor,
  resolveClosureStorePaths,
  verifyStoredClosureCandidate,
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
  pointer: ClosureRuntimePointer;
  storePaths: ClosureStorePaths;
  verification: StoredClosureVerification;
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
  if (pointer.platform !== platform) {
    throw new ElectronStandaloneBindingError(
      "standalone-invalid",
      `Committed Standalone platform ${pointer.platform} does not match ${platform}`,
    );
  }

  let verification: StoredClosureVerification;
  try {
    verification = await verifyStoredClosureCandidate(storePaths, pointer);
  } catch (error) {
    throw new ElectronStandaloneBindingError(
      "standalone-invalid",
      "Committed Standalone failed immutable Store verification",
      { cause: error },
    );
  }
  const minShellVersion = verification.manifest.compatibility.shell.minVersion;
  if (compareStandaloneVersions(input.shellVersion, minShellVersion) < 0) {
    throw new ElectronStandaloneBindingError(
      "installer-required",
      `Standalone requires Electron Shell ${minShellVersion} or newer`,
    );
  }

  return Object.freeze({
    binding: Object.freeze({
      bootloaderPath: join(
        verification.paths.payloadRoot,
        verification.manifest.artifact.entryPath,
      ),
      descriptor: Object.freeze({
        release: Object.freeze({ version: releaseVersion }),
        shell: Object.freeze({
          digest: input.shellDigest,
          type: "electron",
          version: input.shellVersion,
        }),
        standalone: Object.freeze({
          digest: pointer.digest,
          protocolVersion: STANDALONE_PROTOCOL_VERSION,
          version: pointer.version,
        }),
      }),
      paths: Object.freeze({
        cacheRoot: input.paths.cacheRoot,
        dataRoot: input.paths.dataRoot,
        installationRoot: verification.paths.payloadRoot,
        logsRoot: input.paths.logsRoot,
        resourceRoot: join(verification.paths.payloadRoot, "resources", "open-design"),
        runtimeRoot: input.paths.runtimeRoot,
      }),
      scope: Object.freeze({
        channel: storePaths.channel,
        generation: pointer.generation,
        namespace: storePaths.namespace,
      }),
    }),
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
