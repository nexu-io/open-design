import { describe, expect, it } from "vitest";

import { probeWebuiStatus, type WebuiIpcRequester } from "../../src/webui/ipc.js";

// A requester that rejects with a Node-style error (optionally carrying a code).
const rejectWith = (message: string, code?: string): WebuiIpcRequester => {
  return () => Promise.reject(Object.assign(new Error(message), code != null ? { code } : {}));
};

describe("probeWebuiStatus", () => {
  it("returns the live instance URLs on a STATUS reply", async () => {
    const reply = { url: "http://localhost:7456", daemonUrl: "http://localhost:7457" };
    const request: WebuiIpcRequester = async () => reply;
    expect(await probeWebuiStatus("/x.sock", request)).toEqual(reply);
  });

  it("treats a missing / refused socket as not running (null)", async () => {
    expect(await probeWebuiStatus("/x.sock", rejectWith("ENOENT", "ENOENT"))).toBeNull();
    expect(await probeWebuiStatus("/x.sock", rejectWith("refused", "ECONNREFUSED"))).toBeNull();
  });

  it("RETHROWS a connected reply with no url (live socket → protocol failure, not not-running)", async () => {
    // Once request() resolves the socket is live, so an empty/missing url is a
    // wedged/regressed worker, not a free namespace — must not look like null.
    await expect(probeWebuiStatus("/x.sock", async () => ({}))).rejects.toThrow("invalid STATUS reply");
    await expect(probeWebuiStatus("/x.sock", async () => ({ url: "" }))).rejects.toThrow("invalid STATUS reply");
  });

  it("RETHROWS a timed-out probe so start cannot race into a duplicate launch", async () => {
    // requestJsonIpc's timeout rejection is a plain Error with no `code`.
    await expect(
      probeWebuiStatus("/x.sock", rejectWith("IPC request timed out: /x.sock")),
    ).rejects.toThrow("IPC request timed out");
  });

  it("RETHROWS permission and protocol failures instead of reporting not-running", async () => {
    await expect(probeWebuiStatus("/x.sock", rejectWith("denied", "EACCES"))).rejects.toThrow("denied");
    await expect(probeWebuiStatus("/x.sock", rejectWith("IPC request failed"))).rejects.toThrow(
      "IPC request failed",
    );
  });
});
