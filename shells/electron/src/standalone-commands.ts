import { randomUUID } from "node:crypto";

import {
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  type StandaloneHandle,
  type StandaloneHandoffEnvelope,
  type StandaloneProtocolJsonValue,
} from "@open-design/standalone/protocol";

export const OPEN_DESIGN_REGISTER_DESKTOP_AUTH_COMMAND =
  "open-design.register-desktop-auth.v1" as const;
export const OPEN_DESIGN_PREPARE_UPDATE_COMMAND =
  "open-design.prepare-update.v1" as const;

export type StandaloneUpdatePreparation =
  | { architecture: "legacy" }
  | { architecture: "standalone"; minimumShellVersion: string | null; route: "shell" }
  | {
      activationSource: "silent-policy" | "user-restart" | null;
      architecture: "standalone";
      releaseVersion: string;
      route: "closure";
      state: "current" | "prepared";
    };

/** Shell-side adapter for the product command; transport stays behind StandaloneHandle. */
export function createStandaloneDesktopAuthRegistration(input: Readonly<{
  attachmentId: string;
  handoff: StandaloneHandoffEnvelope;
  handle: Pick<StandaloneHandle, "invoke">;
  requestId?: () => string;
}>): (secret: Buffer) => Promise<boolean> {
  const requestId = input.requestId ?? randomUUID;
  return async (secret) => {
    const result = await input.handle.invoke({
      attachmentId: input.attachmentId,
      command: OPEN_DESIGN_REGISTER_DESKTOP_AUTH_COMMAND,
      handoff: input.handoff,
      input: { secret: secret.toString("base64") },
      requestId: requestId(),
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    });
    return result.outcome === "completed"
      && result.output != null
      && typeof result.output === "object"
      && !Array.isArray(result.output)
      && result.output.accepted === true;
  };
}

/** Transport release metadata to Standalone without interpreting legacy fields. */
export function createStandaloneUpdatePreparation(input: Readonly<{
  attachmentId: string;
  handoff: StandaloneHandoffEnvelope;
  handle: Pick<StandaloneHandle, "invoke">;
  requestId?: () => string;
}>): (
  metadata: Record<string, unknown>,
  options?: { activationSource?: "silent-policy" | "user-restart" },
) => Promise<StandaloneUpdatePreparation> {
  const requestId = input.requestId ?? randomUUID;
  return async (metadata, options = {}) => {
    const result = await input.handle.invoke({
      attachmentId: input.attachmentId,
      command: OPEN_DESIGN_PREPARE_UPDATE_COMMAND,
      handoff: input.handoff,
      input: {
        ...(options.activationSource == null ? {} : { activationSource: options.activationSource }),
        metadata,
      } as StandaloneProtocolJsonValue,
      requestId: requestId(),
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    });
    if (result.outcome !== "completed" || result.output == null || typeof result.output !== "object" || Array.isArray(result.output)) {
      throw new Error("Standalone update preparation failed");
    }
    const output = result.output as Record<string, unknown>;
    if (output.architecture === "legacy") return { architecture: "legacy" };
    if (output.architecture !== "standalone" || (output.route !== "shell" && output.route !== "closure")) {
      throw new Error("Standalone update preparation returned an invalid route");
    }
    if (output.route === "shell") {
      return {
        architecture: "standalone",
        minimumShellVersion: typeof output.minimumShellVersion === "string" ? output.minimumShellVersion : null,
        route: "shell",
      };
    }
    if (
      typeof output.releaseVersion !== "string"
      || (output.state !== "current" && output.state !== "prepared")
    ) throw new Error("Standalone update preparation returned an invalid Closure state");
    return {
      architecture: "standalone",
      activationSource: output.activationSource === "silent-policy" || output.activationSource === "user-restart"
        ? output.activationSource
        : null,
      releaseVersion: output.releaseVersion,
      route: "closure",
      state: output.state,
    };
  };
}
