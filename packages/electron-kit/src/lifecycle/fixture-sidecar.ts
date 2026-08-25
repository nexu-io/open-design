type ParentMessage =
  | Readonly<{ type: "start"; readiness: Readonly<{ generationId: string; instanceId: string; attachmentId: string }> }>
  | Readonly<{ type: "heartbeat"; correlationId: string }>
  | Readonly<{ type: "stop"; correlationId: string }>;

type ChildMessage =
  | Readonly<{ type: "ready"; readiness: Readonly<{ generationId: string; instanceId: string; attachmentId: string }> }>
  | Readonly<{ type: "heartbeat-ack"; correlationId: string }>
  | Readonly<{ type: "stopped"; correlationId: string }>;

function send(message: ChildMessage): void {
  if (process.send == null) throw new Error("fixture sidecar requires an IPC parent");
  process.send(message);
}

process.on("message", (value: unknown) => {
  if (value == null || typeof value !== "object") return;
  const message = value as ParentMessage;
  if (message.type === "start") {
    send({ type: "ready", readiness: message.readiness });
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
