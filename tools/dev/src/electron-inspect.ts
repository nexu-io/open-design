import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { callElectronCdp, withElectronCdp, inspectElectronCdpStatus } from "@open-design/shell-electron/lifecycle/inspection";

export type ElectronInspectOptions = {
  cdpUrl?: string; targetId?: string; method?: string; params?: string;
  expression?: string; path?: string; timeoutMs?: string; durationMs?: string; event?: string;
};

/** Keep large debug payloads out of terminal output; full native results remain available on disk. */
export function summarizeInspection(value: unknown): unknown {
  if (typeof value === "string") return value.length > 2_000 ? `${value.slice(0, 160)}… [${value.length} characters]` : value;
  if (Array.isArray(value)) return value.map(summarizeInspection);
  if (value != null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, summarizeInspection(item)]));
  return value;
}

export async function inspectElectronNative(operation: string, discoveryUrl: string, options: ElectronInspectOptions) {
  if (operation === "status") {
    const url = new URL(discoveryUrl);
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("CDP requires an explicit loopback origin");
    return summarizeInspection({ cdp: await inspectElectronCdpStatus({ cdp: { state: "ready", discoveryUrl: url.origin } }) });
  }
  const connection = { discoveryUrl, targetId: options.targetId,
    ...(options.timeoutMs == null ? {} : { timeoutMs: Number(options.timeoutMs) }) };
  const params: unknown = JSON.parse(options.params ?? "{}");
  if (params == null || typeof params !== "object" || Array.isArray(params)) throw new Error("CDP params must be a JSON object");
  if (operation === "events") {
    const duration = Number(options.durationMs ?? 5_000);
    if (!Number.isSafeInteger(duration) || duration < 1 || duration > 60_000) throw new Error("Event duration must be 1–60000ms");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await withElectronCdp({ ...connection, timeoutMs: connection.timeoutMs ?? duration + 10_000 }, async client => {
      let count = 0;
      const unsubscribe = client.subscribe(event => {
        if (options.event == null || event.method === options.event) {
          process.stdout.write(`${JSON.stringify(summarizeInspection(event))}\n`);
          count++;
        }
      });
      try {
        // Domain enable and subscription share one socket, so enable-time events are not lost.
        await client.send({ method: options.method ?? "Runtime.enable", params: params as Record<string, unknown> });
        await new Promise<void>(done => { timer = setTimeout(done, duration); });
        return { events: count, durationMs: duration };
      } finally { unsubscribe(); }
    }); } finally { clearTimeout(timer); }
  }
  let method: string;
  let arguments_: Record<string, unknown>;
  if (operation === "eval") {
    if (!options.expression) throw new Error("inspect eval requires --expression");
    method = "Runtime.evaluate";
    arguments_ = { expression: options.expression, returnByValue: true, awaitPromise: true };
  } else if (operation === "screenshot") {
    if (!options.path) throw new Error("inspect screenshot requires --path");
    method = "Page.captureScreenshot";
    arguments_ = { format: "png" };
  } else if (operation === "cdp") {
    if (!options.method) throw new Error("inspect cdp requires --method");
    method = options.method;
    arguments_ = params as Record<string, unknown>;
  } else throw new Error(`Unsupported desktop inspect operation: ${operation}`);
  const result = await callElectronCdp({ ...connection, method, params: arguments_ });
  if (operation === "eval" && result.exceptionDetails != null) throw new Error(`CDP evaluation failed: ${JSON.stringify(summarizeInspection(result.exceptionDetails))}`);
  if (options.path) {
    const destination = resolve(options.path);
    if (operation === "screenshot" && typeof result.data !== "string") throw new Error("CDP screenshot has no image data");
    const data = operation === "screenshot" ? Buffer.from(result.data as string, "base64") : JSON.stringify(result, null, 2);
    await writeFile(destination, data, { flag: "wx" });
    return { path: destination, bytes: Buffer.byteLength(data) };
  }
  return summarizeInspection(result);
}
