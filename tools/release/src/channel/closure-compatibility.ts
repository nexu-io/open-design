import { CLOSURE_DISTRIBUTION_CONTROL_SCHEMA_VERSION } from "@open-design/closure/protocol";
import { parseReleaseVersion, type ReleaseChannel } from "@open-design/release";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function currentControlMinimum(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const control = value.closureControl;
  if (!isRecord(control) || control.schemaVersion !== CLOSURE_DISTRIBUTION_CONTROL_SCHEMA_VERSION) {
    return null;
  }
  const compatibility = control.shellCompatibility;
  if (!isRecord(compatibility)) return null;
  const electron = compatibility.electron;
  if (!isRecord(electron) || !isRecord(electron.version)) return null;
  return typeof electron.version.min === "string" ? electron.version.min : null;
}

/**
 * Freeze an exact channel's Shell floor for one shallow-control protocol epoch.
 * Existing metadata carrying the current control schema is authoritative. A
 * missing/legacy/unknown control starts a new epoch at this release, so an old
 * Shell takes the installer-required path before reading the Closure graph.
 */
export function resolveExactClosureMinShellVersion(input: Readonly<{
  channel: ReleaseChannel;
  latestMetadataJson: string | null;
  releaseVersion: string;
}>): string {
  parseReleaseVersion(input.releaseVersion, input.channel);
  if (input.latestMetadataJson == null) return input.releaseVersion;

  let latest: unknown;
  try {
    latest = JSON.parse(input.latestMetadataJson) as unknown;
  } catch {
    return input.releaseVersion;
  }
  const existing = currentControlMinimum(latest);
  if (existing == null) return input.releaseVersion;
  try {
    parseReleaseVersion(existing, input.channel);
  } catch {
    return input.releaseVersion;
  }
  return existing;
}
