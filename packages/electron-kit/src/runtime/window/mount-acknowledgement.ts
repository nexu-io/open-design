import { randomBytes } from "node:crypto";

import type { ElectronRendererMountAcknowledgement } from "../../contracts/index.js";
import type { ElectronStartupSignal } from "../startup/attempt.js";
import {
  ELECTRON_RENDERER_MOUNT_ARGUMENT,
  ELECTRON_RENDERER_MOUNT_CHANNEL,
} from "./mount-protocol.js";

export { ELECTRON_RENDERER_MOUNT_CHANNEL } from "./mount-protocol.js";

type ElectronIpcEvent = Readonly<{ sender: unknown }>;
type ElectronIpcListener = (event: ElectronIpcEvent, payload: unknown) => void;

export type ElectronRendererMountIpc = Readonly<{
  on(channel: string, listener: ElectronIpcListener): void;
  removeListener(channel: string, listener: ElectronIpcListener): void;
}>;

export type ElectronRendererMountBarrier = Readonly<{
  ready: Promise<void>;
  dispose(): void;
}>;

function matchesAcknowledgement(
  value: unknown,
  expected: ElectronRendererMountAcknowledgement,
): boolean {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.attemptId === expected.attemptId
    && candidate.bindingDigest === expected.bindingDigest
    && candidate.channel === expected.channel
    && candidate.nonce === expected.nonce;
}

export function createElectronRendererMountAcknowledgement(
  signal: ElectronStartupSignal,
): ElectronRendererMountAcknowledgement {
  return Object.freeze({
    attemptId: signal.attemptId,
    bindingDigest: signal.bindingDigest,
    channel: ELECTRON_RENDERER_MOUNT_CHANNEL,
    nonce: randomBytes(32).toString("base64url"),
  });
}

export function serializeElectronRendererMountAcknowledgement(
  acknowledgement: ElectronRendererMountAcknowledgement,
): string {
  return `${ELECTRON_RENDERER_MOUNT_ARGUMENT}${Buffer.from(JSON.stringify(acknowledgement)).toString("base64")}`;
}

export function installElectronRendererMountBarrier(input: Readonly<{
  acknowledgement: ElectronRendererMountAcknowledgement;
  ipc: ElectronRendererMountIpc;
  sender: unknown;
  signal: AbortSignal;
}>): ElectronRendererMountBarrier {
  let settled = false;
  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const dispose = () => {
    if (settled) return;
    settled = true;
    input.ipc.removeListener(input.acknowledgement.channel, receive);
    input.signal.removeEventListener("abort", abort);
  };
  const receive: ElectronIpcListener = (event, payload) => {
    if (settled || event.sender !== input.sender || !matchesAcknowledgement(payload, input.acknowledgement)) return;
    dispose();
    resolveReady();
  };
  const abort = () => {
    if (settled) return;
    const reason = input.signal.reason ?? new Error("Electron renderer mount acknowledgement aborted");
    dispose();
    rejectReady(reason);
  };
  input.ipc.on(input.acknowledgement.channel, receive);
  if (input.signal.aborted) abort();
  else input.signal.addEventListener("abort", abort, { once: true });
  return Object.freeze({ ready, dispose });
}
