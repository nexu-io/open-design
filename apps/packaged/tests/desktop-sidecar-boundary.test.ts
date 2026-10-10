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

  it("turns desktop auth transport failures into a false registration result", () => {
    const main = source("../src/index.ts");
    const registrationStart = main.indexOf("registerDesktopAuth: async (secret) => {");
    const registrationEnd = main.indexOf("windowTitle:", registrationStart);
    expect(registrationStart).toBeGreaterThanOrEqual(0);
    expect(registrationEnd).toBeGreaterThan(registrationStart);
    const registration = main.slice(registrationStart, registrationEnd);
    expect(registration).toContain("try {");
    expect(registration).toContain("catch {\n        return false;");
  });
});
