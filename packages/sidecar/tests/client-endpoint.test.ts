import { isAbsolute } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolveSidecarClientEndpoint, type SidecarStamp } from "../src/index.js";

const stamp: SidecarStamp = {
  app: "daemon",
  channel: "prerelease",
  mode: "headless",
  namespace: "release-prerelease",
  source: "packaged",
};

describe("resolveSidecarClientEndpoint", () => {
  const originalTmpdir = process.env.TMPDIR;
  afterEach(() => {
    if (originalTmpdir == null) delete process.env.TMPDIR;
    else process.env.TMPDIR = originalTmpdir;
  });

  it("distinguishes modes of the same namespace", () => {
    expect(resolveSidecarClientEndpoint(stamp)).not.toBe(resolveSidecarClientEndpoint({ ...stamp, mode: "runtime" }));
  });

  it.skipIf(process.platform === "win32")("resolves an absolute path under the caller's temporary directory", () => {
    process.env.TMPDIR = "/private/var/folders/od-endpoint-test/T";
    const endpoint = resolveSidecarClientEndpoint(stamp);
    expect(isAbsolute(endpoint)).toBe(true);
    expect(endpoint.startsWith("/private/var/folders/od-endpoint-test/T/")).toBe(true);

    // A receiver with a different TMPDIR would compute a different path, which
    // is why registrations must carry this value rather than the stamp.
    process.env.TMPDIR = "/tmp";
    expect(resolveSidecarClientEndpoint(stamp)).not.toBe(endpoint);
  });
});
