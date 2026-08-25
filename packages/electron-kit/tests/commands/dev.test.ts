import { describe, expect, it } from "vitest";

import { normalizeElectronDevArgv } from "@/commands/dev.js";

describe("Electron dev command", () => {
  it("removes pnpm's script separator before forwarding Electron switches", () => {
    expect(normalizeElectronDevArgv(["--", "--headless", "--user-data-dir=/tmp/isolated"])).toEqual([
      "--headless",
      "--user-data-dir=/tmp/isolated",
    ]);
    expect(normalizeElectronDevArgv(["--headless"])).toEqual(["--headless"]);
  });
});
