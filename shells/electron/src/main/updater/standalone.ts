import { hasStandaloneDistributionMetadata } from "./feed.js";

export type DesktopStandaloneUpdatePreparation =
  | { architecture: "legacy" }
  | { architecture: "standalone"; minimumShellVersion: string | null; route: "shell" }
  | {
      architecture: "standalone";
      releaseVersion: string;
      route: "closure";
      state: "current" | "prepared";
    };

export type StandaloneUpdatePreparationPort = (
  metadata: Record<string, unknown>,
  options: { activateOnRestart: boolean },
) => Promise<DesktopStandaloneUpdatePreparation>;

export async function resolveStandaloneMetadataPreparation(input: Readonly<{
  activateOnRestart: boolean;
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
        activateOnRestart: input.activateOnRestart,
      });
  return Object.freeze({ modern, preparation });
}
