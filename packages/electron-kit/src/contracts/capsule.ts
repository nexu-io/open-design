import { compareVersions } from "@open-design/standalone";

export const ELECTRON_CAPSULE_PROTOCOL = "electron-capsule-v2" as const;
export type ElectronCapsuleTarget = "darwin-arm64" | "darwin-x64" | "win32-x64";
export type ElectronCapsuleManifest = Readonly<{
  schemaVersion: 1;
  protocol: typeof ELECTRON_CAPSULE_PROTOCOL;
  version: string;
  target: ElectronCapsuleTarget;
  entrypoint: "capsule.cjs";
  requires: Readonly<{ carrierVersion: string }>;
  provides: Readonly<{ shellVersion: string }>;
  archive: Readonly<{ sha256: string; size: number; treeSha256: string }>;
}>;
export type ElectronCapsuleContent = Readonly<Pick<ElectronCapsuleManifest,
  "schemaVersion" | "protocol" | "target" | "entrypoint" | "archive">>;

function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (input == null || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).sort().join(",") !== [...keys].sort().join(",")) throw new Error("invalid Capsule manifest fields");
  return input as Record<string, unknown>;
}
function version(input: unknown): string {
  if (typeof input !== "string") throw new Error("invalid Capsule version");
  compareVersions(input, input);
  return input;
}
function digest(input: unknown): string {
  if (typeof input !== "string" || !/^[a-f0-9]{64}$/u.test(input)) throw new Error("invalid Capsule digest");
  return input;
}

function contentFields(value: Record<string, unknown>): ElectronCapsuleContent {
  const archive = record(value.archive, ["sha256", "size", "treeSha256"]);
  if (value.schemaVersion !== 1 || value.protocol !== ELECTRON_CAPSULE_PROTOCOL || value.entrypoint !== "capsule.cjs"
    || typeof value.target !== "string" || !["darwin-arm64", "darwin-x64", "win32-x64"].includes(value.target)
    || typeof archive.size !== "number" || !Number.isSafeInteger(archive.size) || archive.size <= 0) throw new Error("unsupported Capsule manifest");
  return Object.freeze({ schemaVersion: 1, protocol: ELECTRON_CAPSULE_PROTOCOL,
    target: value.target as ElectronCapsuleTarget, entrypoint: "capsule.cjs",
    archive: Object.freeze({ sha256: digest(archive.sha256), size: archive.size, treeSha256: digest(archive.treeSha256) }),
  });
}

/** Unsigned payload. Existing release signing and exact references authenticate
 * it; neither a separate trust root nor a Capsule latest pointer belongs here. */
export function validateElectronCapsuleManifest(input: unknown): ElectronCapsuleManifest {
  const value = record(input, ["schemaVersion", "protocol", "version", "target", "entrypoint", "requires", "provides", "archive"]);
  const requires = record(value.requires, ["carrierVersion"]), provides = record(value.provides, ["shellVersion"]);
  return Object.freeze({ ...contentFields(value), version: version(value.version),
    requires: Object.freeze({ carrierVersion: version(requires.carrierVersion) }),
    provides: Object.freeze({ shellVersion: version(provides.shellVersion) }),
  });
}

/** Build output has no release version or compatibility policy. */
export function validateElectronCapsuleContent(input: unknown): ElectronCapsuleContent {
  return contentFields(record(input, ["schemaVersion", "protocol", "target", "entrypoint", "archive"]));
}

/** Pure release composition: no compiler, filesystem, signing key or selection. */
export function composeElectronCapsuleManifest(input: Readonly<{
  content: ElectronCapsuleContent;
  version: string;
  minimumCarrierVersion: string;
  providedShellVersion: string;
}>): ElectronCapsuleManifest {
  return validateElectronCapsuleManifest({
    ...validateElectronCapsuleContent(input.content), version: input.version,
    requires: { carrierVersion: input.minimumCarrierVersion }, provides: { shellVersion: input.providedShellVersion },
  });
}

export function assertElectronCapsuleCompatibility(manifest: ElectronCapsuleManifest, carrier: Readonly<{ target: ElectronCapsuleTarget; version: string }>): void {
  const validated = validateElectronCapsuleManifest(manifest);
  if (validated.target !== carrier.target || compareVersions(carrier.version, validated.requires.carrierVersion) < 0) {
    throw new Error("Capsule requires a compatible carrier installation");
  }
}
