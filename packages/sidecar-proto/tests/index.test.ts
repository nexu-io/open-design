import { describe, expect, it } from "vitest";

import {
  APP_KEYS,
  normalizeDaemonSidecarMessage,
  normalizeDesktopSidecarMessage,
  normalizeNamespace,
  normalizeSidecarStamp,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  SIDECAR_SOURCES,
  SIDECAR_STAMP_FIELDS,
  STAMP_APP_FLAG,
  STAMP_IPC_FLAG,
  STAMP_MODE_FLAG,
  STAMP_NAMESPACE_FLAG,
  STAMP_SOURCE_FLAG,
} from "../src/index.js";

const validStamp = {
  app: APP_KEYS.WEB,
  ipc: "/tmp/open-design/ipc/contract-check/web.sock",
  mode: "dev" as const,
  namespace: "contract-check",
  source: SIDECAR_SOURCES.TOOLS_DEV,
};

describe("open-design sidecar contract", () => {
  it("exports the canonical five-field stamp descriptor", () => {
    expect(SIDECAR_STAMP_FIELDS).toEqual(["app", "mode", "namespace", "ipc", "source"]);
    expect(OPEN_DESIGN_SIDECAR_CONTRACT.stampFlags).toEqual({
      app: STAMP_APP_FLAG,
      ipc: STAMP_IPC_FLAG,
      mode: STAMP_MODE_FLAG,
      namespace: STAMP_NAMESPACE_FLAG,
      source: STAMP_SOURCE_FLAG,
    });
  });

  it("accepts the explicit namespace contract", () => {
    expect(normalizeNamespace("contract-check_1.alpha")).toBe("contract-check_1.alpha");
  });

  it("rejects path-like or whitespace namespaces", () => {
    expect(() => normalizeNamespace("../other")).toThrow();
    expect(() => normalizeNamespace(" contract-check")).toThrow();
    expect(() => normalizeNamespace("contract check")).toThrow();
  });

  it("accepts exactly app, mode, namespace, ipc, and source", () => {
    expect(normalizeSidecarStamp(validStamp)).toEqual(validStamp);
  });

  it("rejects legacy or extra stamp fields", () => {
    expect(() => normalizeSidecarStamp({ ...validStamp, runtimeToken: "legacy" })).toThrow();
    expect(() => normalizeSidecarStamp({ ...validStamp, role: "web-sidecar" })).toThrow();
  });

  it("rejects non-contract sidecar sources", () => {
    expect(() => normalizeSidecarStamp({ ...validStamp, source: "custom-script" })).toThrow();
  });

  it("validates daemon IPC messages", () => {
    expect(normalizeDaemonSidecarMessage({ type: SIDECAR_MESSAGES.STATUS })).toEqual({ type: "status" });
    expect(normalizeDaemonSidecarMessage({ type: SIDECAR_MESSAGES.SHUTDOWN })).toEqual({ type: "shutdown" });
    expect(() => normalizeDaemonSidecarMessage({ input: {}, type: SIDECAR_MESSAGES.EVAL })).toThrow();
  });

  it("validates desktop IPC message inputs", () => {
    expect(normalizeDesktopSidecarMessage({ input: { expression: "location.href" }, type: SIDECAR_MESSAGES.EVAL })).toEqual({
      input: { expression: "location.href" },
      type: "eval",
    });
    expect(() => normalizeDesktopSidecarMessage({ input: { expression: 42 }, type: SIDECAR_MESSAGES.EVAL })).toThrow();
    expect(() => normalizeDesktopSidecarMessage({ input: { selector: "" }, type: SIDECAR_MESSAGES.CLICK })).toThrow();
  });
});
