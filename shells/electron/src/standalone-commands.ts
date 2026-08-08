import { randomUUID } from "node:crypto";

import {
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  type StandaloneHandle,
  type StandaloneHandoffEnvelope,
} from "@open-design/standalone-proto";

export const OPEN_DESIGN_REGISTER_DESKTOP_AUTH_COMMAND =
  "open-design.register-desktop-auth.v1" as const;

/** Shell-side adapter for the product command; transport stays behind StandaloneHandle. */
export function createStandaloneDesktopAuthRegistration(input: Readonly<{
  handoff: StandaloneHandoffEnvelope;
  handle: Pick<StandaloneHandle, "invoke">;
  requestId?: () => string;
}>): (secret: Buffer) => Promise<boolean> {
  const requestId = input.requestId ?? randomUUID;
  return async (secret) => {
    const result = await input.handle.invoke({
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
