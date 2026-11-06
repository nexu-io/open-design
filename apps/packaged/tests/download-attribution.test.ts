import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  claimPackagedDownloadAttribution,
  discoverPackagedDownloadAttribution,
  extractDownloadAttributionTokenFromUrl,
} from "../src/download-attribution.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("download attribution token extraction", () => {
  it("extracts the token from the distributor path segment", () => {
    expect(
      extractDownloadAttributionTokenFromUrl(
        "https://download.open-design.ai/mac/arm64/oddl_Abc12345/Open-Design.dmg",
      ),
    ).toBe("oddl_Abc12345");
    expect(
      extractDownloadAttributionTokenFromUrl(
        "https://download.open-design.ai/windows/x64/token-123456/Open%20Design-setup.exe",
      ),
    ).toBe("token-123456");
  });

  it("does not treat GitHub release paths as attributed download URLs", () => {
    expect(
      extractDownloadAttributionTokenFromUrl(
        "https://github.com/nexu-io/open-design/releases/download/open-design-v1/Open-Design-mac-arm64.dmg",
      ),
    ).toBeNull();
  });
});

describe("packaged download attribution lifecycle", () => {
  it("does not re-submit a terminal installer observation on the next launch", async () => {
    const installerObservationRoot = await mkdtemp(join(tmpdir(), "od-download-attribution-"));
    const rawUrl = "https://download.open-design.ai/windows/x64/oddl_terminal_123/Open-Design-setup.exe";
    await writeFile(join(installerObservationRoot, "download-attribution.json"), JSON.stringify({
      token: "oddl_terminal_123", rawUrl,
    }));
    const paths = { installerObservationRoot } as Parameters<typeof discoverPackagedDownloadAttribution>[0];
    const first = await discoverPackagedDownloadAttribution(paths);
    expect(first?.token).toBe("oddl_terminal_123");
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true, status: "claimed", found: true, pending: false, merged: true,
    }), { status: 200 })) as typeof fetch;
    await claimPackagedDownloadAttribution({
      attribution: first,
      daemonUrl: "http://127.0.0.1:17000",
      installerObservationRoot,
    });
    expect(await discoverPackagedDownloadAttribution(paths)).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
