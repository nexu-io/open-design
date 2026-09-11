import { describe, expect, it } from "vitest";
import { bindElectronLaunchNamespace, resolveElectronLaunchNamespace } from "@/runtime/session/launch-scope.js";
import { serializeElectronSessionLaunch } from "@/runtime/session/namespace-paths.js";

describe("Electron launch scope", () => {
  it("preserves effective recovery scope and presentation without a second suffix", () => {
    expect(serializeElectronSessionLaunch("hot-case-headless", "headless")).toEqual(["--namespace=hot-case", "--headless"]);
    expect(serializeElectronSessionLaunch("hot-case", "interactive")).toEqual(["--namespace=hot-case"]);
    expect(() => serializeElectronSessionLaunch("hot-case", "headless")).toThrow("invalid");
  });
  it("binds lifecycle scope before payload arguments without duplicating a matching selection", () => {
    expect(bindElectronLaunchNamespace("hot-case", ["--headless", "--", "payload"])).toEqual(["--headless", "--namespace=hot-case", "--", "payload"]);
    expect(bindElectronLaunchNamespace("hot-case", ["--namespace", "hot-case"])).toEqual(["--namespace", "hot-case"]);
    expect(() => bindElectronLaunchNamespace("hot-case", ["--namespace=other-case"])).toThrow("conflicts");
    expect(() => bindElectronLaunchNamespace("hot-case", ["--user-data-dir=/tmp/override"])).toThrow("forbidden");
  });
  it("uses the installation default or one explicit logical namespace", () => {
    expect(resolveElectronLaunchNamespace("installed", [])).toBe("installed");
    expect(resolveElectronLaunchNamespace("installed", ["--namespace=first-case"])).toBe("first-case");
    expect(resolveElectronLaunchNamespace("installed", ["--namespace", "hot-case", "--headless"])).toBe("hot-case");
    expect(resolveElectronLaunchNamespace("installed", ["--", "--namespace=payload"])).toBe("installed");
  });
  it.each([["--user-data-dir=/tmp/override"], ["--user-data-dir", "/tmp/override"], ["--USER-DATA-DIR=x"]])("rejects raw path overrides %j", (...args) => {
    expect(() => resolveElectronLaunchNamespace("installed", args)).toThrow("user-data-dir overrides are forbidden");
  });
  it.each([["--namespace"], ["--namespace="], ["--namespace", "--headless"], ["--namespace=../other"],
    ["--namespace=first", "--namespace=first"], ["--namespace=UPPER"], ["--namespace=first/other"]])("rejects ambiguous or invalid namespace %j", (...args) => {
    expect(() => resolveElectronLaunchNamespace("installed", args)).toThrow();
  });
});
