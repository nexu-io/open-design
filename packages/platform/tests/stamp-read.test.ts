import { describe, expect, it } from "vitest";

import {
  readFlagValue,
  readProcessStamp,
  readProcessStampFromCommand,
  type ProcessStampContract,
} from "../src/index.js";

type FakeStamp = {
  app: "api" | "ui";
  namespace: string;
};

const fakeContract: ProcessStampContract<FakeStamp> = {
  stampFields: ["app", "namespace"],
  stampFlags: { app: "--fake-app", namespace: "--fake-namespace" },
  normalizeStamp(input) {
    const value = input as Partial<FakeStamp>;
    if (value.app !== "api" && value.app !== "ui") throw new Error("invalid app");
    if (typeof value.namespace !== "string" || value.namespace.length === 0) throw new Error("invalid namespace");
    return { app: value.app, namespace: value.namespace };
  },
  normalizeStampCriteria(input = {}) {
    const value = input as Partial<FakeStamp>;
    return {
      ...(value.app == null ? {} : { app: value.app }),
      ...(value.namespace == null ? {} : { namespace: value.namespace }),
    };
  },
};

describe("readFlagValue", () => {
  it("returns the inline value when the flag is written as --flag=value", () => {
    expect(readFlagValue(["--name=ui", "--other"], "--name")).toBe("ui");
  });

  it("returns the next argv element when the flag is written as --flag value", () => {
    expect(readFlagValue(["--name", "ui", "--other"], "--name")).toBe("ui");
  });

  it("returns null when the flag is absent", () => {
    expect(readFlagValue(["--other", "x"], "--name")).toBeNull();
    expect(readFlagValue([], "--name")).toBeNull();
  });

  it("returns null when the trailing flag has no value", () => {
    expect(readFlagValue(["--name"], "--name")).toBeNull();
  });

  it("does not match a flag that shares only a prefix", () => {
    expect(readFlagValue(["--namespace=ns"], "--name")).toBeNull();
  });
});

describe("readProcessStamp", () => {
  it("returns the normalized stamp when every flag resolves", () => {
    const args = ["--fake-app=ui", "--fake-namespace=alpha"];
    expect(readProcessStamp(args, fakeContract)).toEqual({ app: "ui", namespace: "alpha" });
  });

  it("returns null when normalizeStamp throws on missing or invalid values", () => {
    expect(readProcessStamp(["--fake-app=ui"], fakeContract)).toBeNull();
    expect(readProcessStamp(["--fake-app=bogus", "--fake-namespace=alpha"], fakeContract)).toBeNull();
    expect(readProcessStamp([], fakeContract)).toBeNull();
  });
});

describe("readProcessStampFromCommand", () => {
  it("splits the command on whitespace before reading flag values", () => {
    const command = "node ui.js --fake-app=ui --fake-namespace=alpha";
    expect(readProcessStampFromCommand(command, fakeContract)).toEqual({ app: "ui", namespace: "alpha" });
  });

  it("returns null when the command line lacks the contract's flags", () => {
    expect(readProcessStampFromCommand("node ui.js --unrelated=value", fakeContract)).toBeNull();
  });
});
