import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createConnection, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createJsonIpcServer } from "../src/json-ipc.js";

describe("JSON IPC request lifecycle", () => {
  it.each([false, true])("dispatches only the first frame while its handler waits (coalesced: %s)", async (coalesced) => {
    const root = await mkdtemp(join(tmpdir(), "open-design-ipc-lifecycle-"));
    const socketPath = process.platform === "win32"
      ? `\\\\.\\pipe\\open-design-ipc-lifecycle-${randomUUID()}`
      : join(root, "ipc.sock");
    const messages: unknown[] = [];
    let markEntered!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { markEntered = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const server = await createJsonIpcServer({
      socketPath,
      handler: async (message: unknown) => {
        messages.push(message);
        markEntered();
        await hold;
        return message;
      },
    });
    let socket: Socket | undefined;

    try {
      socket = createConnection(socketPath);
      await once(socket, "connect");
      socket.resume();
      const closed = once(socket, "close");
      socket.write(coalesced ? '{"id":1}\n{"id":2}\n' : '{"id":1}\n');
      await entered;

      // The server observes this data and the following EOF before closing its
      // side of the connection. Keep the first handler pending throughout, so
      // the assertion does not depend on sleeps or socket chunk timing.
      socket.end(coalesced ? " " : '{"id":2}\n');
      await closed;
      expect(messages).toEqual([{ id: 1 }]);
    } finally {
      release();
      socket?.destroy();
      await server.close();
      await rm(root, { force: true, recursive: true });
    }
  });
});
