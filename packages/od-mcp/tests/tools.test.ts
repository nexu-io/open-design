import { describe, expect, it } from "vitest";
import { tools, type ToolDef } from "../src/tools.js";

describe("od-mcp tools", () => {
  it("exposes od_design_list_systems", () => {
    const tool = tools.find((t: ToolDef) => t.name === "od_design_list_systems");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.type).toBe("object");
    expect(tool?.inputSchema.properties).toEqual({});
  });

  it("exposes od_design_handoff with required fields", () => {
    const tool = tools.find((t: ToolDef) => t.name === "od_design_handoff");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toEqual([
      "designSystemId",
      "brief",
      "projectName",
    ]);
    expect(
      tool?.inputSchema.properties?.["designSystemId"],
    ).toBeDefined();
  });
});
