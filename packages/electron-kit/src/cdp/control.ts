import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createElectronContractInvocationExpression } from "@open-design/electron-contract/automation";

import { parseElectronCdpActivePort, type ElectronCdpDiscovery } from "../runtime/session/cdp.js";

type JsonObject = Record<string, any>;

function record(value: unknown, label: string): JsonObject {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as JsonObject;
}

function exactKeys(value: JsonObject, keys: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${label} fields are invalid`);
}

function allowedKeys(value: JsonObject, keys: readonly string[], label: string): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error(`${label} fields are invalid`);
}

async function waitForDiscovery(userDataRoot: string, timeoutMs: number): Promise<Extract<ElectronCdpDiscovery, { state: "ready" }>> {
  const path = resolve(userDataRoot, "DevToolsActivePort"), deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const discovery = parseElectronCdpActivePort(await readFile(path, "utf8"));
      if (discovery.state === "ready") return discovery;
    }
    catch (error) {
      if (Date.now() >= deadline) throw new Error("Electron CDP discovery timed out", { cause: error });
      await new Promise((done) => setTimeout(done, 100));
    }
  }
}

async function pageWebSocketUrl(discoveryUrl: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(`${discoveryUrl}/json/list`, { redirect: "error" });
      if (response.ok) {
        const targets = await response.json() as JsonObject[];
        const page = targets.find((target) => target.type === "page" && typeof target.webSocketDebuggerUrl === "string");
        if (page != null) return page.webSocketDebuggerUrl;
      }
    } catch { /* Chromium may still be publishing its first page target. */ }
    if (Date.now() >= deadline) throw new Error("Electron CDP page discovery timed out");
    await new Promise((done) => setTimeout(done, 100));
  }
}

async function openSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolveOpen, reject) => {
    socket.addEventListener("open", () => resolveOpen(), { once: true });
    socket.addEventListener("error", () => reject(new Error("Electron CDP WebSocket failed to open")), { once: true });
  });
  return socket;
}

async function command(socket: WebSocket, method: string, params: JsonObject): Promise<JsonObject> {
  return await new Promise((resolveResult, reject) => {
    const id = 1;
    const onMessage = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as JsonObject;
      if (message.id !== id) return;
      cleanup();
      if (message.error != null) reject(new Error(`Electron CDP command failed: ${JSON.stringify(message.error)}`));
      else resolveResult(message.result);
    };
    const onClose = () => {
      cleanup();
      reject(new Error("Electron CDP WebSocket closed"));
    };
    const cleanup = () => {
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
    };
    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", onClose, { once: true });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function invocationError(evaluated: JsonObject): Error | undefined {
  if (evaluated.exceptionDetails == null && evaluated.result?.subtype !== "error") return undefined;
  return new Error(`Electron contract invocation failed: ${JSON.stringify(evaluated.exceptionDetails ?? evaluated.result)}`);
}

function isContractUnavailable(error: Error): boolean {
  return error.message.includes("Electron contract method is unavailable");
}

function isContextLoss(error: Error): boolean {
  return error.message.includes("Execution context was destroyed")
    || error.message.includes("Cannot find context with specified id")
    || error.message.includes("Inspected target navigated or closed")
    || error.message.includes("Electron CDP WebSocket closed");
}

async function invokeContract(
  discoveryUrl: string,
  invocation: Readonly<{ path: readonly string[]; args: readonly unknown[]; settleOnContextDestroyed: boolean }>,
  deadline: number,
): Promise<unknown> {
  for (;;) {
    let socket: WebSocket | undefined;
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Electron CDP contract invocation timed out");
      socket = await openSocket(await pageWebSocketUrl(discoveryUrl, remaining));
      const evaluated = await command(socket, "Runtime.evaluate", {
        awaitPromise: true,
        expression: createElectronContractInvocationExpression(invocation.path, invocation.args),
        returnByValue: true,
      });
      const error = invocationError(evaluated);
      if (error != null) throw error;
      return evaluated.result?.value;
    } catch (error) {
      const reason = error instanceof Error ? error : new Error(String(error));
      if (invocation.settleOnContextDestroyed && isContextLoss(reason)) {
        return Object.freeze({ outcome: "context-destroyed" });
      }
      if (!isContractUnavailable(reason) && !isContextLoss(reason)) throw reason;
      if (Date.now() >= deadline) throw new Error("Electron CDP contract invocation timed out", { cause: reason });
      await new Promise((done) => setTimeout(done, 100));
    } finally {
      socket?.close();
    }
  }
}

async function closeBrowser(discoveryUrl: string, deadline: number): Promise<void> {
  let socket: WebSocket | undefined;
  try {
    const remaining = Math.min(deadline - Date.now(), 2_000);
    if (remaining <= 0) return;
    socket = await openSocket(await pageWebSocketUrl(discoveryUrl, remaining));
    await command(socket, "Browser.close", {});
  } catch {
    // Browser.close commonly tears down the transport before its response is
    // observable. The runtime shutdown log remains the authoritative proof.
  } finally {
    socket?.close();
  }
}

export async function executeElectronCdpContractControl(value: unknown): Promise<Readonly<{ discoveryUrl: string; results: readonly unknown[] }>> {
  const input = record(value, "Electron CDP contract request");
  exactKeys(input, ["close", "invocations", "operation", "schemaVersion", "timeoutMs", "userDataRoot"], "Electron CDP contract request");
  if (input.schemaVersion !== 1 || input.operation !== "electron.cdp.contract.invoke" || typeof input.userDataRoot !== "string"
    || typeof input.close !== "boolean" || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1_000 || input.timeoutMs > 120_000
    || !Array.isArray(input.invocations) || input.invocations.length === 0) {
    throw new Error("Electron CDP contract request is invalid");
  }
  const invocations = input.invocations.map((value: unknown, index: number) => {
    const invocation = record(value, `Electron CDP invocation ${index}`);
    allowedKeys(invocation, ["args", "path", "settleOnContextDestroyed"], `Electron CDP invocation ${index}`);
    if (!Array.isArray(invocation.path) || !Array.isArray(invocation.args)
      || (invocation.settleOnContextDestroyed != null && typeof invocation.settleOnContextDestroyed !== "boolean")) {
      throw new Error(`Electron CDP invocation ${index} is invalid`);
    }
    return Object.freeze({
      path: invocation.path as string[],
      args: invocation.args,
      settleOnContextDestroyed: invocation.settleOnContextDestroyed === true,
    });
  });
  const discovery = await waitForDiscovery(input.userDataRoot, input.timeoutMs);
  const deadline = Date.now() + input.timeoutMs;
  const results: unknown[] = [];
  for (const invocation of invocations) results.push(await invokeContract(discovery.discoveryUrl, invocation, deadline));
  if (input.close) await closeBrowser(discovery.discoveryUrl, deadline);
  return Object.freeze({ discoveryUrl: discovery.discoveryUrl, results: Object.freeze(results) });
}

export async function runElectronCdpContractControl(requestPath: string, receiptPath: string): Promise<void> {
  const request = JSON.parse(await readFile(resolve(requestPath), "utf8"));
  const result = await executeElectronCdpContractControl(request);
  await writeFile(resolve(receiptPath), `${JSON.stringify({ schemaVersion: 1, operation: "electron.cdp.contract.invoked", ...result }, null, 2)}\n`);
}
