import { hasStandaloneDistributionMetadata } from "./feed.js";

export type DesktopStandaloneUpdatePreparation =
  | { architecture: "legacy" }
  | { architecture: "standalone"; minimumShellVersion: string | null; route: "shell" }
  | {
      activationSource: "silent-policy" | "user-restart" | null;
      architecture: "standalone";
      releaseVersion: string;
      route: "closure";
      state: "current" | "prepared";
    };

export type StandaloneUpdatePreparationPort = (
  metadata: Record<string, unknown>,
  options: { activationSource?: "silent-policy" | "user-restart" },
) => Promise<DesktopStandaloneUpdatePreparation>;

export async function resolveStandaloneMetadataPreparation(input: Readonly<{
  activationSource?: "silent-policy" | "user-restart";
  metadata: Record<string, unknown>;
  prepare?: StandaloneUpdatePreparationPort;
}>): Promise<Readonly<{
  modern: boolean;
  preparation: DesktopStandaloneUpdatePreparation | null;
}>> {
  const modern = hasStandaloneDistributionMetadata(input.metadata);
  const preparation = input.prepare == null
    ? (modern ? null : { architecture: "legacy" as const })
    : await input.prepare(input.metadata, {
        ...(input.activationSource == null ? {} : { activationSource: input.activationSource }),
      });
  return Object.freeze({ modern, preparation });
}
