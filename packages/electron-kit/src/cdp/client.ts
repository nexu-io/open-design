import { listElectronCdpTargets } from "./inspection.js";

export type ElectronCdpConnection = Readonly<{
  discoveryUrl: string;
  targetId?: string;
  timeoutMs?: number;
}>;
export type ElectronCdpMessage = Readonly<{ method: string; params?: Record<string, unknown> }>;

function localEndpoint(value: string, protocols: string[]): URL {
  const url = new URL(value);
  if (!protocols.includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || url.username || url.password || url.hash || url.search) throw new Error("CDP requires an explicit loopback endpoint");
  return url;
}

/** Native CDP only: no product bridge, implicit focus, command retry or lifecycle ownership. */
export async function withElectronCdp<T>(input: ElectronCdpConnection, operation: (client: Readonly<{
  send(message: ElectronCdpMessage): Promise<Record<string, unknown>>;
  subscribe(listener: (event: ElectronCdpMessage) => void): () => void;
}>) => Promise<T>): Promise<T> {
  const timeout = input.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 600_000) throw new Error("Invalid CDP timeout");
  const endpoint = localEndpoint(input.discoveryUrl, ["http:"]);
  if (endpoint.pathname !== "/") throw new Error("CDP discovery must be an origin");
  const signal = AbortSignal.timeout(timeout);
  const targets = await listElectronCdpTargets(endpoint.origin, signal);
  let socketUrl: string | undefined;
  if (input.targetId === "browser") {
    const response = await fetch(`${endpoint.origin}/json/version`, { signal, redirect: "error" });
    if (!response.ok) throw new Error(`CDP browser discovery failed: ${response.status}`);
    socketUrl = (await response.json() as { webSocketDebuggerUrl?: string }).webSocketDebuggerUrl;
  } else {
    const selected = targets.filter(target => input.targetId ? target.id === input.targetId : target.type === "page");
    if (selected.length !== 1) throw new Error("Select one CDP target explicitly; discovery matched zero or multiple pages");
    socketUrl = selected[0]!.webSocketDebuggerUrl;
  }
  if (!socketUrl) throw new Error("CDP target has no WebSocket endpoint");
  const address = localEndpoint(socketUrl, ["ws:"]);
  if (address.host !== endpoint.host) throw new Error("CDP target escaped the discovery endpoint");
  signal.throwIfAborted();
  const socket = new WebSocket(address);
  let rejectSession!: (error: Error) => void;
  const disconnected = new Promise<never>((_resolve, reject) => { rejectSession = reject; });
  void disconnected.catch(() => undefined);
  let sequence = 0;
  const pending = new Map<number, { resolve(value: Record<string, unknown>): void; reject(error: Error): void }>();
  const listeners = new Set<(event: ElectronCdpMessage) => void>();
  const fail = (error: Error) => { rejectSession(error); for (const request of pending.values()) request.reject(error); pending.clear(); };
  const closed = () => fail(new Error("CDP connection closed"));
  const aborted = () => { fail(new Error("CDP operation timed out")); socket.close(); };
  const received = (event: MessageEvent) => {
    try {
      const message = JSON.parse(String(event.data));
      if (typeof message.id === "number") {
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.error) request.reject(new Error(`CDP command failed: ${JSON.stringify(message.error)}`));
        else request.resolve(message.result ?? {});
      } else if (typeof message.method === "string") {
        for (const listener of listeners) listener(message);
      }
    } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
  };
  socket.addEventListener("message", received);
  socket.addEventListener("close", closed);
  socket.addEventListener("error", closed);
  signal.addEventListener("abort", aborted, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { socket.removeEventListener("open", opened); socket.removeEventListener("error", failed); socket.removeEventListener("close", failed); signal.removeEventListener("abort", failed); };
      const opened = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error("CDP connection could not open")); };
      socket.addEventListener("open", opened, { once: true });
      socket.addEventListener("error", failed, { once: true });
      socket.addEventListener("close", failed, { once: true });
      signal.addEventListener("abort", failed, { once: true });
      if (signal.aborted) failed();
    });
    return await Promise.race([disconnected, operation({
      send(message) {
        signal.throwIfAborted();
        if (!/^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/.test(message.method)) throw new Error("Invalid native CDP method");
        if (socket.readyState !== WebSocket.OPEN) throw new Error("CDP connection is not open");
        return new Promise((resolve, reject) => {
          const id = ++sequence;
          pending.set(id, { resolve, reject });
          try { socket.send(JSON.stringify({ id, ...message })); }
          catch (error) { pending.delete(id); reject(error); }
        });
      },
      subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    })]);
  } finally {
    signal.removeEventListener("abort", aborted);
    socket.removeEventListener("message", received);
    socket.removeEventListener("close", closed);
    socket.removeEventListener("error", closed);
    fail(new Error("CDP session disposed"));
    listeners.clear();
    socket.close();
  }
}

export async function callElectronCdp(input: ElectronCdpConnection & ElectronCdpMessage) {
  return withElectronCdp(input, client => client.send({ method: input.method, params: input.params }));
}
