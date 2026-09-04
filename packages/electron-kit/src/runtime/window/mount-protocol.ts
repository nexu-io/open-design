import type { ElectronRendererMountAcknowledgement } from "../../contracts/index.js";

export const ELECTRON_RENDERER_MOUNT_CHANNEL = "electron-kit:renderer-mounted:v1";
export const ELECTRON_RENDERER_MOUNT_ARGUMENT = "--electron-renderer-mount=";

export function parseElectronRendererMountAcknowledgement(
  argv: readonly string[],
): ElectronRendererMountAcknowledgement {
  const argument = argv.find((candidate) => candidate.startsWith(ELECTRON_RENDERER_MOUNT_ARGUMENT));
  if (argument == null) throw new Error("Electron renderer mount acknowledgement is unavailable");
  const decoded = JSON.parse(
    Buffer.from(argument.slice(ELECTRON_RENDERER_MOUNT_ARGUMENT.length), "base64").toString("utf8"),
  ) as Partial<ElectronRendererMountAcknowledgement>;
  if (
    decoded.channel !== ELECTRON_RENDERER_MOUNT_CHANNEL
    || typeof decoded.attemptId !== "string"
    || typeof decoded.bindingDigest !== "string"
    || typeof decoded.nonce !== "string"
  ) throw new Error("Electron renderer mount acknowledgement is invalid");
  return Object.freeze({
    attemptId: decoded.attemptId,
    bindingDigest: decoded.bindingDigest,
    channel: decoded.channel,
    nonce: decoded.nonce,
  });
}
