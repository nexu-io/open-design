import { randomUUID } from "node:crypto";

import { createJsonIpcServer, type JsonIpcServerHandle } from "@open-design/sidecar";

import {
  ElectronSidecarControlError,
  validateElectronSidecarHandlerTopology,
  validateElectronSidecarSession,
  type ElectronSidecarHandlerTopology,
  type ElectronSidecarSession,
} from "./contracts.js";

export type ElectronSidecarHandlerRequest = Readonly<{
  /** Local dispatch key returned by the Shell normalizer; never a wire envelope. */
  handlerId: string;
  input: unknown;
}>;

export type ElectronSidecarHandlerContext = Readonly<{
  requestId: string;
  session: ElectronSidecarSession;
  signal: AbortSignal;
}>;

export type ElectronSidecarHandler = (
  input: unknown,
  context: ElectronSidecarHandlerContext,
) => unknown | Promise<unknown>;

export type ElectronSidecarControlState = "closed" | "closing" | "open";

export type ElectronSidecarControlStatus = Readonly<{
  handlerIds: readonly string[];
  inFlight: number;
  sessionId: string;
  state: ElectronSidecarControlState;
}>;

export type ElectronSidecarControlLease = Readonly<{
  close(): Promise<void>;
  status(): ElectronSidecarControlStatus;
}>;

type SidecarServerFactory = (input: Readonly<{
  socketPath: string;
  handler(message: unknown): Promise<unknown>;
}>) => Promise<JsonIpcServerHandle>;

function invokeWithLifetime(input: Readonly<{
  handler: ElectronSidecarHandler;
  handlerId: string;
  handlerInput: unknown;
  requestId: string;
  session: ElectronSidecarSession;
  sessionSignal: AbortSignal;
  timeoutMs?: number;
}>): Promise<unknown> {
  const controller = new AbortController();
  const close = () => controller.abort(input.sessionSignal.reason);
  if (input.sessionSignal.aborted) close();
  else input.sessionSignal.addEventListener("abort", close, { once: true });
  let timer: NodeJS.Timeout | undefined;
  if (input.timeoutMs != null) {
    timer = setTimeout(() => controller.abort(new ElectronSidecarControlError(
      "handler-timeout",
      `Electron Sidecar handler timed out: ${input.handlerId}`,
    )), input.timeoutMs);
    timer.unref();
  }
  const aborted = new Promise<never>((_resolve, reject) => {
    const rejectAbort = () => reject(controller.signal.reason ?? new ElectronSidecarControlError(
      "session-closed",
      "Electron Sidecar session closed",
    ));
    if (controller.signal.aborted) rejectAbort();
    else controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  return Promise.race([
    Promise.resolve().then(() => input.handler(input.handlerInput, {
      requestId: input.requestId,
      session: input.session,
      signal: controller.signal,
    })),
    aborted,
  ]).finally(() => {
    if (timer != null) clearTimeout(timer);
    input.sessionSignal.removeEventListener("abort", close);
  });
}

/**
 * Bind one finite Shell declaration to a live Sidecar JSON-IPC endpoint.
 * `normalize` adapts the product wire message locally; electron-kit neither
 * defines nor forwards a generic invoke message and rejects undeclared keys.
 */
export async function openElectronSidecarControl(input: Readonly<{
  session: ElectronSidecarSession;
  topology: ElectronSidecarHandlerTopology;
  normalize(message: unknown): ElectronSidecarHandlerRequest;
  handlers: Readonly<Record<string, ElectronSidecarHandler>>;
  serverFactory?: SidecarServerFactory;
}>): Promise<ElectronSidecarControlLease> {
  const session = validateElectronSidecarSession(input.session);
  const topology = validateElectronSidecarHandlerTopology(input.topology);
  const declaredIds = topology.handlers.map((handler) => handler.id);
  const bindingIds = Object.keys(input.handlers).sort();
  const expectedIds = [...declaredIds].sort();
  if (JSON.stringify(bindingIds) !== JSON.stringify(expectedIds)) {
    throw new ElectronSidecarControlError(
      "invalid-topology",
      "Electron Sidecar handler bindings must exactly match the declared topology",
    );
  }
  const declarations = new Map(topology.handlers.map((handler) => [handler.id, handler]));
  const handlers = Object.freeze({ ...input.handlers });
  const handlerIds = Object.freeze([...declaredIds]);
  const controller = new AbortController();
  const inFlight = new Set<Promise<unknown>>();
  let state: ElectronSidecarControlState = "open";
  let closePromise: Promise<void> | null = null;
  const dispatch = async (message: unknown): Promise<unknown> => {
    if (state !== "open") {
      throw new ElectronSidecarControlError("session-closed", "Electron Sidecar session is not open");
    }
    const request = input.normalize(message);
    const declaration = declarations.get(request.handlerId);
    const handler = handlers[request.handlerId];
    if (declaration == null || handler == null) {
      throw new ElectronSidecarControlError("unknown-handler", `unknown Electron Sidecar handler: ${request.handlerId}`);
    }
    const requestId = randomUUID();
    const invocation = invokeWithLifetime({
      handler,
      handlerId: request.handlerId,
      handlerInput: request.input,
      requestId,
      session,
      sessionSignal: controller.signal,
      timeoutMs: declaration.timeoutMs,
    });
    inFlight.add(invocation);
    void invocation.then(() => inFlight.delete(invocation), () => inFlight.delete(invocation));
    return await invocation;
  };
  const server = await (input.serverFactory ?? createJsonIpcServer)({
    socketPath: session.ipcPath,
    handler: dispatch,
  });
  return Object.freeze({
    status() {
      return Object.freeze({ handlerIds, inFlight: inFlight.size, sessionId: session.sessionId, state });
    },
    async close() {
      if (closePromise == null) {
        closePromise = (async () => {
          state = "closing";
          controller.abort(new ElectronSidecarControlError("session-closed", "Electron Sidecar session closed"));
          let closeError: unknown;
          try { await server.close(); }
          catch (error) { closeError = error; }
          await Promise.allSettled([...inFlight]);
          state = "closed";
          if (closeError != null) throw closeError;
        })();
      }
      await closePromise;
    },
  });
}
