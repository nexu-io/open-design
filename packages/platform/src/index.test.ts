import { describe, expect, it } from "vitest";

import {
  createProcessStampArgs,
  matchesStampedProcess,
  readProcessStampFromCommand,
  type ProcessStampContract,
} from "./index.js";

type FakeStamp = {
  app: "api" | "ui";
  ipc: string;
  mode: "dev" | "runtime";
  namespace: string;
  source: "tool" | "pack";
};

const fakeContract: ProcessStampContract<FakeStamp> = {
  stampFields: ["app", "mode", "namespace", "ipc", "source"],
  stampFlags: {
    app: "--fake-app",
    ipc: "--fake-ipc",
    mode: "--fake-mode",
    namespace: "--fake-namespace",
    source: "--fake-source",
  },
  normalizeStamp(input) {
    const value = input as Partial<FakeStamp>;
    if (value.app !== "api" && value.app !== "ui") throw new Error("invalid app");
    if (value.mode !== "dev" && value.mode !== "runtime") throw new Error("invalid mode");
    if (typeof value.namespace !== "string" || value.namespace.length === 0) throw new Error("invalid namespace");
    if (typeof value.ipc !== "string" || value.ipc.length === 0) throw new Error("invalid ipc");
    if (value.source !== "tool" && value.source !== "pack") throw new Error("invalid source");
    return {
      app: value.app,
      ipc: value.ipc,
      mode: value.mode,
      namespace: value.namespace,
      source: value.source,
    };
  },
  normalizeStampCriteria(input = {}) {
    const value = input as Partial<FakeStamp>;
    return {
      ...(value.app == null ? {} : { app: value.app }),
      ...(value.ipc == null ? {} : { ipc: value.ipc }),
      ...(value.mode == null ? {} : { mode: value.mode }),
      ...(value.namespace == null ? {} : { namespace: value.namespace }),
      ...(value.source == null ? {} : { source: value.source }),
    };
  },
};

const stamp: FakeStamp = {
  app: "ui",
  ipc: "/tmp/fake-product/ipc/stamp-boundary-a/ui.sock",
  mode: "dev",
  namespace: "stamp-boundary-a",
  source: "tool",
};

describe("generic process stamp primitives", () => {
  it("serializes descriptor-defined stamp flags", () => {
    const args = createProcessStampArgs(stamp, fakeContract);

    expect(args).toHaveLength(5);
    expect(args.join(" ")).toContain("--fake-app=ui");
    expect(args.join(" ")).toContain("--fake-mode=dev");
    expect(args.join(" ")).toContain("--fake-namespace=stamp-boundary-a");
    expect(args.join(" ")).toContain("--fake-ipc=/tmp/fake-product/ipc/stamp-boundary-a/ui.sock");
    expect(args.join(" ")).toContain("--fake-source=tool");
  });

  it("reads and matches stamped process commands using the descriptor", () => {
    const command = ["node", "ui.js", ...createProcessStampArgs(stamp, fakeContract)].join(" ");

    expect(readProcessStampFromCommand(command, fakeContract)).toEqual(stamp);
    expect(matchesStampedProcess({ command }, { app: "ui", namespace: stamp.namespace, source: "tool" }, fakeContract)).toBe(true);
    expect(matchesStampedProcess({ command }, { namespace: "stamp-boundary-b" }, fakeContract)).toBe(false);
    expect(matchesStampedProcess({ command }, { source: "pack" }, fakeContract)).toBe(false);
  });
});
