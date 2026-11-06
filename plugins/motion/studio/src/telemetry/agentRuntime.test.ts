// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import {
  agentRuntimeProperty,
  resetAgentRuntimeForTests,
  resolveAgentRuntime,
} from "./agentRuntime";

afterEach(() => {
  resetAgentRuntimeForTests();
  delete window.__HF_CLI_AGENT_RUNTIME;
});

describe("the agent driving this studio", () => {
  it("reads what the CLI published", () => {
    window.__HF_CLI_AGENT_RUNTIME = "claude_code";
    expect(resolveAgentRuntime()).toBe("claude_code");
    expect(agentRuntimeProperty()).toBe("claude_code");
  });

  it("is null when nothing published one — a studio opened by hand", () => {
    expect(resolveAgentRuntime()).toBeNull();
  });

  it("treats an empty string as nothing, not as a value", () => {
    // Two encodings of the same fact is what turns a breakdown into a phantom
    // gap; "" and absent must not be separate rows.
    window.__HF_CLI_AGENT_RUNTIME = "";
    expect(resolveAgentRuntime()).toBeNull();
  });

  it("reports 'none' rather than nothing as a property", () => {
    // Most sessions are people, and that is a finding. An omitted property
    // could not tell it apart from an event that predates the property.
    expect(agentRuntimeProperty()).toBe("none");
  });

  it("memoizes, so a later overwrite cannot split one session in two", () => {
    window.__HF_CLI_AGENT_RUNTIME = "codex";
    expect(resolveAgentRuntime()).toBe("codex");
    window.__HF_CLI_AGENT_RUNTIME = "cursor";
    expect(resolveAgentRuntime()).toBe("codex");
  });
});
