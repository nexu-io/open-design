import { join } from "node:path";

import {
  STANDALONE_BOOTLOADER_ENTRY_PATH,
  validateStandaloneHandoffDescriptor,
  type StandaloneHandoffDescriptor,
} from "@open-design/standalone-proto";

const STANDALONE_LAUNCHER_BOOTSTRAP_ENV = "OD_STANDALONE_LAUNCHER_BOOTSTRAP_V1";
const STANDALONE_LAUNCHER_BOOTSTRAP_SCHEMA_VERSION = 1 as const;
const STANDALONE_BODY_COMPONENT_DIRECTORY = "body" as const;

export type StandaloneLauncherBootstrap = Readonly<{
  descriptor: StandaloneHandoffDescriptor;
  schemaVersion: typeof STANDALONE_LAUNCHER_BOOTSTRAP_SCHEMA_VERSION;
}>;

export function validateStandaloneLauncherBootstrap(
  value: unknown,
): StandaloneLauncherBootstrap {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    throw new Error("Standalone launcher bootstrap must be an object");
  }
  const bootstrap = value as Record<string, unknown>;
  const unknownKeys = Object.keys(bootstrap).filter((key) => ![
    "descriptor",
    "schemaVersion",
  ].includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(
      `Standalone launcher bootstrap contains unsupported fields: ${unknownKeys.join(", ")}`,
    );
  }
  if (bootstrap.schemaVersion !== STANDALONE_LAUNCHER_BOOTSTRAP_SCHEMA_VERSION) {
    throw new Error("Standalone launcher bootstrap schemaVersion is unsupported");
  }
  return Object.freeze({
    descriptor: validateStandaloneHandoffDescriptor(bootstrap.descriptor),
    schemaVersion: STANDALONE_LAUNCHER_BOOTSTRAP_SCHEMA_VERSION,
  });
}

export function resolveStandaloneBodyBootloaderPath(
  descriptorInput: StandaloneHandoffDescriptor,
): string {
  const descriptor = validateStandaloneHandoffDescriptor(descriptorInput);
  return join(
    descriptor.paths.installationRoot,
    STANDALONE_BODY_COMPONENT_DIRECTORY,
    STANDALONE_BOOTLOADER_ENTRY_PATH,
  );
}

export function encodeStandaloneLauncherBootstrap(
  value: Omit<StandaloneLauncherBootstrap, "schemaVersion">,
): string {
  const bootstrap = validateStandaloneLauncherBootstrap({
    ...value,
    schemaVersion: STANDALONE_LAUNCHER_BOOTSTRAP_SCHEMA_VERSION,
  });
  return Buffer.from(JSON.stringify(bootstrap), "utf8").toString("base64url");
}

export function createStandaloneLauncherBootstrapEnv(
  value: Omit<StandaloneLauncherBootstrap, "schemaVersion">,
  env: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    ...env,
    [STANDALONE_LAUNCHER_BOOTSTRAP_ENV]: encodeStandaloneLauncherBootstrap(value),
  };
}

export function readStandaloneLauncherBootstrap(
  env: NodeJS.ProcessEnv = process.env,
): StandaloneLauncherBootstrap {
  const encoded = env[STANDALONE_LAUNCHER_BOOTSTRAP_ENV];
  if (typeof encoded !== "string" || encoded.length === 0) {
    throw new Error("Standalone launcher bootstrap is unavailable");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch (error) {
    throw new Error("Standalone launcher bootstrap is invalid", { cause: error });
  }
  return validateStandaloneLauncherBootstrap(parsed);
}
