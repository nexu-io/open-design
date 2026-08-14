import {
  readClosureBindingDescriptor,
  resolveClosureStorePaths,
  type ClosureBindingDescriptor,
} from "@open-design/closure/store";

import { resolvePackagedStandaloneReleaseVersion } from "./config.js";

export type PackagedStandaloneReleaseBindingInput = Readonly<{
  channel: string;
  configuredVersion: string | null | undefined;
  namespace: string;
  root: string;
}>;

export function selectPackagedStandaloneReleaseVersion(
  configuredVersion: string | null | undefined,
  descriptor: Pick<
    ClosureBindingDescriptor,
    "activationAuthorized" | "active" | "lastSuccessful" | "prepared"
  >,
): string {
  const storedVersion = descriptor.activationAuthorized
    ? descriptor.prepared?.releaseVersion
    : descriptor.active?.releaseVersion ?? descriptor.lastSuccessful?.releaseVersion;
  return resolvePackagedStandaloneReleaseVersion(configuredVersion, storedVersion);
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
  return selectPackagedStandaloneReleaseVersion(input.configuredVersion, descriptor);
}
