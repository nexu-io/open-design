import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function source(relativePath: string): string {
  return readFileSync(join(here, relativePath), "utf8").replace(/\r\n?/g, "\n");
}

describe("packaged desktop sidecar boundary", () => {
  it("forwards every desktop business action", () => {
    const packagedMain = source("../src/index.ts");
    const desktopMain = source("../../desktop/src/main/index.ts");
    const actions = (source: string, startAt = 0) => {
      const handlersStart = source.indexOf("handlers: Object.fromEntries([", startAt);
      const lifecycleStart = source.indexOf("lifecycle:", handlersStart);
      expect(handlersStart).toBeGreaterThanOrEqual(0);
      expect(lifecycleStart).toBeGreaterThan(handlersStart);
      return source.slice(handlersStart, lifecycleStart).match(/SIDECAR_MESSAGES\.[A-Z_]+/g);
    };

    expect(actions(packagedMain)).toEqual(
      actions(desktopMain, desktopMain.indexOf("if (isDirectEntry())")),
    );
  });

  it('uses the shared fail-closed desktop auth registrar', () => {
    const main = source("../src/index.ts");
    const registrationStart = main.indexOf('registerDesktopAuth: (secret) => registerDesktopAuthWithDaemon(client, secret)');
    const registrationEnd = main.indexOf("windowTitle:", registrationStart);
    expect(registrationStart).toBeGreaterThanOrEqual(0);
    expect(registrationEnd).toBeGreaterThan(registrationStart);
    expect(main).toMatch(/import\s*\{[^}]*registerDesktopAuthWithDaemon[^}]*\}\s*from\s*"@open-design\/desktop\/main"/s);
  });
});
