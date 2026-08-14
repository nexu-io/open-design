import {
  readClosureBindingDescriptor,
  resolveClosureStorePaths,
  type ClosureBindingDescriptor,
} from "@open-design/closure/store";
import { resolveClosureImmutableMetadataVersion } from "@open-design/closure/update";

import { resolvePackagedStandaloneReleaseVersion } from "./config.js";

export type PackagedStandaloneReleaseBindingInput = Readonly<{
  channel: string;
  configuredVersion: string | null | undefined;
  metadataUrl: string | null;
  namespace: string;
  root: string;
}>;

export function selectPackagedStandaloneReleaseVersion(
  configuredVersion: string | null | undefined,
  descriptor: Pick<
    ClosureBindingDescriptor,
    "activationAuthorized" | "active" | "lastSuccessful" | "prepared"
  >,
  metadataUrl: string | null = null,
): string {
  const storedVersion = descriptor.activationAuthorized
    ? descriptor.prepared?.releaseVersion
    : descriptor.active?.releaseVersion ?? descriptor.lastSuccessful?.releaseVersion;
  const hasConfiguredVersion = configuredVersion != null && configuredVersion.trim().length > 0;
  const exactMetadataVersion = !hasConfiguredVersion && storedVersion == null && metadataUrl != null
    ? resolveClosureImmutableMetadataVersion(metadataUrl)
    : null;
  return resolvePackagedStandaloneReleaseVersion(
    configuredVersion,
    storedVersion ?? exactMetadataVersion,
  );
}

/** Resolve an immutable release from the launch transaction or persisted Closure state. */
export async function resolvePackagedStandaloneReleaseBinding(
  input: PackagedStandaloneReleaseBindingInput,
): Promise<string> {
  const descriptor = await readClosureBindingDescriptor(resolveClosureStorePaths({
    channel: input.channel,
    namespace: input.namespace,
    root: input.root,
  }));
  return selectPackagedStandaloneReleaseVersion(
    input.configuredVersion,
    descriptor,
    input.metadataUrl,
  );
}
