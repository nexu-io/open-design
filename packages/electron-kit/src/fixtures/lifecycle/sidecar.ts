import { randomUUID } from "node:crypto";

type ParentMessage =
  | Readonly<{ type: "start"; readiness: Readonly<{ generationId: string; instanceId: string; attachmentId: string }> }>
  | Readonly<{ type: "heartbeat"; correlationId: string }>
  | Readonly<{ type: "stop"; correlationId: string }>;

type ChildMessage =
  | Readonly<{ type: "ready"; readiness: Readonly<{ generationId: string; instanceId: string; attachmentId: string }> }>
  | Readonly<{ type: "heartbeat-ack"; correlationId: string }>
  | Readonly<{ type: "stopped"; correlationId: string }>;

type UpdaterResponse = Readonly<{
  type: "shell-updater-response";
  correlationId: string;
  ok: boolean;
  result?: unknown;
  error?: Readonly<{ code: string; message: string }>;
}>;

function send(message: ChildMessage): void {
  if (process.send == null) throw new Error("fixture sidecar requires an IPC parent");
  process.send(message);
}

async function requestUpdater(operation: "read" | "invoke", action?: "check" | "download" | "install"): Promise<any> {
  if (process.send == null) throw new Error("fixture Closure requires an IPC parent");
  const correlationId = randomUUID();
  return await new Promise((resolve, reject) => {
    const onMessage = (value: unknown) => {
      const message = value as Partial<UpdaterResponse>;
      if (message.type !== "shell-updater-response" || message.correlationId !== correlationId) return;
      process.off("message", onMessage);
      if (message.ok === true) resolve(message.result);
      else reject(Object.assign(new Error(message.error?.message ?? "Shell updater request failed"), { code: message.error?.code }));
    };
    process.on("message", onMessage);
    process.send!({ type: "shell-updater-request", correlationId, operation, ...(action == null ? {} : { action }) });
  });
}

async function prepareShellUpdate(): Promise<void> {
  let snapshot = await requestUpdater("read");
  if (snapshot.state === "idle" || snapshot.state === "failed") snapshot = (await requestUpdater("invoke", "check")).snapshot;
  if (snapshot.state === "available") snapshot = (await requestUpdater("invoke", "download")).snapshot;
  if (snapshot.state !== "ready") throw new Error(`fixture Closure could not prepare Shell update: ${snapshot.state}`);
}

process.on("message", (value: unknown) => {
  if (value == null || typeof value !== "object") return;
  const message = value as ParentMessage;
  if (message.type === "start") {
    void (async () => {
      if (process.env.ELECTRON_KIT_FIXTURE_PREPARE_UPDATE === "1") await prepareShellUpdate();
      send({ type: "ready", readiness: message.readiness });
      if (process.env.ELECTRON_KIT_FIXTURE_INSTALL_UPDATE === "1") {
        setTimeout(() => { void requestUpdater("invoke", "install").catch(() => undefined); }, 100).unref();
      }
    })().catch((error: unknown) => {
      console.error("[electron-kit fixture Closure] startup failed", error);
      process.exitCode = 1;
      process.disconnect?.();
    });
    return;
  }
  if (message.type === "heartbeat") {
    send({ type: "heartbeat-ack", correlationId: message.correlationId });
    return;
  }
  if (message.type === "stop") {
    send({ type: "stopped", correlationId: message.correlationId });
    process.disconnect?.();
  }
});

process.on("disconnect", () => process.exit());
