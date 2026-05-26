import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatSourceInstallCliHints } from "../src/cli-hints.js";

describe("formatSourceInstallCliHints", () => {
  it("returns empty output when the daemon URL is unavailable", () => {
    assert.deepEqual(
      formatSourceInstallCliHints({
        daemonUrl: null,
        odBinPath: "/repo/node_modules/.bin/od",
      }),
      [],
    );
  });

  it("prints pnpm exec od guidance and OD_DAEMON_URL export (#2801)", () => {
    const text = formatSourceInstallCliHints({
      daemonUrl: "http://127.0.0.1:49980",
      odBinPath: "/repo/node_modules/.bin/od",
    }).join("\n");

    assert.match(text, /pnpm exec od skills list/);
    assert.match(text, /export OD_DAEMON_URL=http:\/\/127\.0\.0\.1:49980/);
    assert.match(text, /\/repo\/node_modules\/\.bin\/od/);
  });
});
