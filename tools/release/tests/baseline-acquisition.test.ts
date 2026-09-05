import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { fetchAcceptedShellBaseline, type AcceptedBaselineFetcher } from "../src/exact/baseline-acquisition.js";

function response(url: string, status: number, body: string) {
  return { bytes: Buffer.from(body), status, url };
}

describe("accepted baseline acquisition", () => {
  it("treats only an explicit missing pointer as a cold channel", async () => {
    const pointerUrl = "https://releases.example/betahyx/accepted/electron/darwin-arm64/latest.json";
    await expect(fetchAcceptedShellBaseline({
      channel: "betahyx", pointerUrl, target: "darwin-arm64", fetcher: async (url) => response(url, 404, "missing"),
    })).resolves.toBeUndefined();
  });

  it("acquires an exactly bound same-origin receipt", async () => {
    const pointerUrl = "https://releases.example/betahyx/accepted/electron/darwin-arm64/latest.json";
    const receiptUrl = "https://releases.example/betahyx/accepted/electron/darwin-arm64/receipt.json";
    const receiptBody = '{"accepted":true}\n';
    const pointerBody = `${JSON.stringify({
      channel: "betahyx", operation: "electron.shell-baseline.latest",
      receipt: { sha256: `sha256:${createHash("sha256").update(receiptBody).digest("hex")}`, size: Buffer.byteLength(receiptBody), url: receiptUrl },
      schemaVersion: 1, target: "darwin-arm64",
    })}\n`;
    const fetcher: AcceptedBaselineFetcher = async (url) => url === pointerUrl
      ? response(url, 200, pointerBody)
      : response(url, 200, receiptBody);
    await expect(fetchAcceptedShellBaseline({ channel: "betahyx", fetcher, pointerUrl, target: "darwin-arm64" }))
      .resolves.toMatchObject({ bytes: Buffer.from(receiptBody) });
  });

  it("fails closed on malformed, cross-origin, or mismatched acquisition", async () => {
    const pointerUrl = "https://releases.example/betahyx/accepted/electron/win32-x64/latest.json";
    const malformed: AcceptedBaselineFetcher = async (url) => response(url, 200, "not-json");
    await expect(fetchAcceptedShellBaseline({ channel: "betahyx", fetcher: malformed, pointerUrl, target: "win32-x64" })).rejects.toThrow(/JSON/u);

    const escaped = JSON.stringify({
      channel: "betahyx", operation: "electron.shell-baseline.latest",
      receipt: { sha256: `sha256:${"a".repeat(64)}`, size: 1, url: "https://evil.example/receipt.json" },
      schemaVersion: 1, target: "win32-x64",
    });
    await expect(fetchAcceptedShellBaseline({
      channel: "betahyx", pointerUrl, target: "win32-x64", fetcher: async (url) => response(url, 200, escaped),
    })).rejects.toThrow(/trusted origin/u);
  });
});
