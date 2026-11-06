// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { findToolDefinitionError, registerStudioTools } from "./registrar";
import type { ModelContext, ModelContextTool } from "./types";

function tool(overrides: Partial<ModelContextTool> = {}): ModelContextTool {
  return {
    name: "studio_look",
    description: "Read Studio's live state.",
    execute: async () => ({ ok: true }),
    ...overrides,
  };
}

function fakeModelContext(
  registerTool: ModelContext["registerTool"] = vi.fn().mockResolvedValue(undefined),
): ModelContext {
  return { registerTool };
}

function domException(name: string, message = name): DOMException {
  return new DOMException(message, name);
}

describe("findToolDefinitionError", () => {
  it("accepts the names Studio actually uses", () => {
    expect(findToolDefinitionError(tool({ name: "studio_look" }))).toBeNull();
    expect(findToolDefinitionError(tool({ name: "studio.look-2" }))).toBeNull();
  });

  it("rejects a name the browser would reject, naming the tool", () => {
    expect(findToolDefinitionError(tool({ name: "studio look" }))).toMatch(/name must be/);
    expect(findToolDefinitionError(tool({ name: "a".repeat(129) }))).toMatch(/name must be/);
    expect(findToolDefinitionError(tool({ name: "" }))).toMatch(/name must be/);
  });

  it("rejects an empty description", () => {
    expect(findToolDefinitionError(tool({ description: "   " }))).toBe(
      "description must not be empty",
    );
  });
});

describe("registerStudioTools", () => {
  it("registers every tool with the shared abort signal", async () => {
    const registerTool = vi.fn().mockResolvedValue(undefined);
    const controller = new AbortController();

    const report = await registerStudioTools(
      fakeModelContext(registerTool),
      [tool({ name: "studio_look" }), tool({ name: "studio_frame" })],
      controller.signal,
    );

    expect(report.registered).toEqual(["studio_look", "studio_frame"]);
    expect(report.failed).toEqual([]);
    expect(registerTool).toHaveBeenCalledTimes(2);
    expect(registerTool.mock.calls[0]?.[1]).toEqual({ signal: controller.signal });
  });

  it("stops silently when the signal aborts mid-registration", async () => {
    // A StrictMode mount-cleanup-mount rejects the in-flight registrations with
    // AbortError. That is teardown working; it must not surface as a failure or
    // escape as an unhandled rejection.
    const registerTool = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(domException("AbortError"));

    const report = await registerStudioTools(
      fakeModelContext(registerTool),
      [tool({ name: "studio_look" }), tool({ name: "studio_frame" })],
      new AbortController().signal,
    );

    expect(report.registered).toEqual(["studio_look"]);
    expect(report.failed).toEqual([]);
  });

  it("keeps the DOMException name, which is the only thing that tells the gates apart", async () => {
    const registerTool = vi
      .fn()
      .mockRejectedValue(domException("SecurityError", "not origin-keyed"));

    const report = await registerStudioTools(
      fakeModelContext(registerTool),
      [tool()],
      new AbortController().signal,
    );

    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]?.tool).toBe("studio_look");
    expect(report.failed[0]?.name).toBe("SecurityError");
    // Substring, not equality: jsdom prefixes DOMException.message with the
    // name and real browsers do not.
    expect(report.failed[0]?.message).toContain("not origin-keyed");
    expect(report.registered).toEqual([]);
  });

  it("keeps going after one tool fails", async () => {
    const registerTool = vi
      .fn()
      .mockRejectedValueOnce(domException("NotAllowedError", "tools policy"))
      .mockResolvedValueOnce(undefined);

    const report = await registerStudioTools(
      fakeModelContext(registerTool),
      [tool({ name: "studio_look" }), tool({ name: "studio_frame" })],
      new AbortController().signal,
    );

    expect(report.registered).toEqual(["studio_frame"]);
    expect(report.failed.map((f) => f.tool)).toEqual(["studio_look"]);
  });

  it("catches a duplicate name before the browser does, so the report names it", async () => {
    const registerTool = vi.fn().mockResolvedValue(undefined);

    const report = await registerStudioTools(
      fakeModelContext(registerTool),
      [tool({ name: "studio_look" }), tool({ name: "studio_look" })],
      new AbortController().signal,
    );

    expect(report.registered).toEqual(["studio_look"]);
    expect(report.failed).toEqual([
      {
        tool: "studio_look",
        name: "InvalidStateError",
        message: "duplicate tool name in this registration set",
      },
    ]);
    // Registering the same name twice REJECTS rather than replacing, so the
    // second one must never reach the browser.
    expect(registerTool).toHaveBeenCalledTimes(1);
  });

  it("does not send a tool the browser would reject", async () => {
    const registerTool = vi.fn().mockResolvedValue(undefined);

    const report = await registerStudioTools(
      fakeModelContext(registerTool),
      [tool({ name: "studio look" })],
      new AbortController().signal,
    );

    expect(registerTool).not.toHaveBeenCalled();
    expect(report.failed[0]?.name).toBe("InvalidStateError");
  });
});
