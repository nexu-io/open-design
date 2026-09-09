import { canonicalJson, compareVersions, sha256Hex, validateShellIdentity, type ArtifactReference, type StandaloneShellIdentity } from "@open-design/standalone";
import { validateNodePlatformResource, type NodePlatformResource } from "@open-design/standalone/packages";

export const ELECTRON_CAPSULE_PROTOCOL = "electron-capsule-v6" as const;
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
  platform: NodePlatformResource;
}>;
export type ElectronCapsuleContent = Readonly<Pick<ElectronCapsuleManifest,
  "schemaVersion" | "protocol" | "target" | "entrypoint" | "archive">>;

/** Electron metadata binds both objects; compatibility has one authority in
 * the referenced, independently signed manifest, never a second latest feed. */
export type ElectronCapsuleRelease = Readonly<{
  schemaVersion: 1;
  manifest: Readonly<ArtifactReference>;
  archive: Readonly<ArtifactReference>;
}>;

export function validateElectronCapsuleRelease(input: unknown): ElectronCapsuleRelease {
  const value = record(input, ["schemaVersion", "manifest", "archive"]);
  if (value.schemaVersion !== 1) throw new Error("unsupported Capsule release binding");
  const reference = (input: unknown): Readonly<ArtifactReference> => {
    const ref = record(input, ["url", "sha256", "size"]);
    if (typeof ref.url !== "string" || typeof ref.size !== "number" || !Number.isSafeInteger(ref.size) || ref.size <= 0) throw new Error("invalid Capsule release reference");
    const url = new URL(ref.url);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error("invalid Capsule release URL");
    return Object.freeze({ url: ref.url, sha256: digest(ref.sha256), size: ref.size });
  };
  return Object.freeze({ schemaVersion: 1, manifest: reference(value.manifest), archive: reference(value.archive) });
}

/** Call after authenticating the exact manifest bytes through Standalone. */
export function assertElectronCapsuleReleaseManifest(binding: ElectronCapsuleRelease, input: unknown, target: ElectronCapsuleTarget): ElectronCapsuleManifest {
  const release = validateElectronCapsuleRelease(binding), manifest = validateElectronCapsuleManifest(input);
  if (manifest.target !== target || manifest.archive.sha256 !== release.archive.sha256 || manifest.archive.size !== release.archive.size) {
    throw new Error("Capsule release manifest escaped its exact distribution binding");
  }
  return manifest;
}

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
  const value = record(input, ["schemaVersion", "protocol", "version", "target", "entrypoint", "requires", "provides", "archive", "platform"]);
  const requires = record(value.requires, ["carrierVersion"]), provides = record(value.provides, ["shellVersion"]);
  const platform = validateNodePlatformResource(value.platform);
  if (platform.target !== value.target || platform.blob.sources.length === 0) throw new Error("Capsule requires an exact external platform source for its target");
  return Object.freeze({ ...contentFields(value), version: version(value.version), platform,
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
  platform: NodePlatformResource;
  version: string;
  minimumCarrierVersion: string;
  providedShellVersion: string;
}>): ElectronCapsuleManifest {
  return validateElectronCapsuleManifest({
    ...validateElectronCapsuleContent(input.content), version: input.version, platform: input.platform,
    requires: { carrierVersion: input.minimumCarrierVersion }, provides: { shellVersion: input.providedShellVersion },
  });
}

export function assertElectronCapsuleCompatibility(manifest: ElectronCapsuleManifest, carrier: Readonly<{ target: ElectronCapsuleTarget; version: string }>): void {
  const validated = validateElectronCapsuleManifest(manifest);
  if (validated.target !== carrier.target || compareVersions(carrier.version, validated.requires.carrierVersion) < 0) {
    throw new Error("Capsule requires a compatible carrier installation");
  }
}

/** Call only with authenticated Capsule metadata and the verified physical
 * installation. Capability is not an installer identity. Version-only metadata
 * changes preserve build identity but never the exact runtime binding digest. */
export function resolveElectronCompositeShellIdentity(input: ElectronCapsuleManifest, carrier: Readonly<{
  target: ElectronCapsuleTarget;
  shell: StandaloneShellIdentity;
}>): Readonly<StandaloneShellIdentity> {
  const manifest = validateElectronCapsuleManifest(input);
  validateShellIdentity(carrier.shell);
  if (carrier.shell.type !== "electron") throw new Error("Electron Capsule requires an Electron carrier");
  assertElectronCapsuleCompatibility(manifest, { target: carrier.target, version: carrier.shell.version });
  const { schemaVersion, protocol, target, entrypoint, archive } = manifest;
  const buildHash = electronCompositeShellBuildHash({ schemaVersion, protocol, target, entrypoint, archive }, carrier.shell.buildHash, manifest.platform);
  return Object.freeze({ type: "electron", version: manifest.provides.shellVersion, buildHash,
    digest: sha256Hex(canonicalJson({ carrier: carrier.shell, capsule: manifest })) });
}

/** Release-neutral capability fingerprint shared by runtime and publication.
 * Content descriptors cannot carry release versions or installer identity. */
export function electronCompositeShellBuildHash(input: ElectronCapsuleContent, carrierBuildHash: string, platformInput: NodePlatformResource): string {
  const content = validateElectronCapsuleContent(input);
  const platform = validateNodePlatformResource(platformInput);
  if (platform.target !== content.target) throw new Error("Capsule platform target mismatch");
  return sha256Hex(canonicalJson({ protocol: content.protocol, target: content.target,
    carrierBuildHash: digest(carrierBuildHash), archive: content.archive,
    platform: { schemaVersion: platform.schemaVersion, target: platform.target, treeSha256: platform.treeSha256,
      executables: platform.executables, blob: { sha256: platform.blob.sha256, size: platform.blob.size, mediaType: platform.blob.mediaType } } }));
}
