import { parseClosureImmutableMetadataVersion } from "@open-design/closure/update";
import type { StandaloneReleaseIntent } from "@open-design/standalone/protocol";

function cleanVersion(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized == null || normalized.length === 0 ? null : normalized;
}

/**
 * Project immutable launch input into protocol intent. Shell never reads the
 * Closure Store or interprets mutable release metadata.
 */
export function resolvePackagedStandaloneReleaseIntent(input: Readonly<{
  configuredVersion: string | null | undefined;
  metadataUrl: string | null;
}>): StandaloneReleaseIntent {
  const configuredVersion = cleanVersion(input.configuredVersion);
  if (configuredVersion != null) {
    return Object.freeze({ kind: "exact", releaseVersion: configuredVersion });
  }
  const metadataVersion = input.metadataUrl == null
    ? null
    : parseClosureImmutableMetadataVersion(input.metadataUrl);
  return metadataVersion == null
    ? Object.freeze({ kind: "resume-or-bootstrap" })
    : Object.freeze({ kind: "exact", releaseVersion: metadataVersion });
}
