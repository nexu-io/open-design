import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CLOSURE_PROTOCOL_VERSION } from "@open-design/closure-proto";
import { STANDALONE_PROTOCOL_VERSION } from "@open-design/standalone-proto";

const workspaceRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

describe("normalized Standalone boundary", () => {
  it("publishes the same handoff protocol version that bootloader.mjs accepts", () => {
    expect(CLOSURE_PROTOCOL_VERSION).toBe(STANDALONE_PROTOCOL_VERSION);
  });

  it("keeps legacy stamps and physical IPC out of every new consumer", async () => {
    const files = [
      "apps/standalone/src/sidecars.ts",
      "apps/daemon/src/sidecar/standalone-control.ts",
      "apps/web/sidecar/standalone-control.ts",
    ];
    for (const path of files) {
      const source = await readFile(join(workspaceRoot, path), "utf8");
      expect(source, path).not.toMatch(/@open-design\/sidecar-proto/u);
      expect(source, path).not.toMatch(/createJsonIpc|readProcessStamp|bootstrapSidecarRuntime/u);
      expect(source, path).not.toMatch(/endpointPath|incarnation|socketPath/u);
    }
  });

  it("keeps release/store/update policy out of the fossil bootloader", async () => {
    const source = await readFile(
      join(workspaceRoot, "apps", "standalone", "src", "bootloader.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /from\s+["'][^"']*(?:closure-(?:store|update)|download)[^"']*["']/u,
    );
    expect(source).toContain("handoff-conflict");
  });
});
