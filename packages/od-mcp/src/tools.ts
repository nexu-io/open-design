/**
 * MCP tool definitions and handler dispatch.
 *
 * Tools are defined as plain objects matching the MCP JSON-RPC schema
 * (no SDK dependency — the MCP protocol is simple enough to hand-roll).
 * Each handler receives the parsed input and returns a JSON-serialisable
 * result.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DaemonClient } from "./daemon-client.js";

// ── Tool definitions ──

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const tools: ToolDef[] = [
  {
    name: "od_design_handoff",
    description:
      "Send a UI design request to Open Design. Creates a project with the chosen design system, launches a design agent, waits for completion, and returns the generated file paths. One round trip.",
    inputSchema: {
      type: "object",
      properties: {
        designSystemId: {
          type: "string",
          description:
            "Brand style to apply. Call od_design_list_systems to see available options (e.g. stripe, linear, airbnb).",
        },
        brief: {
          type: "string",
          description:
            "Free-text design brief in markdown. Include page type, sections, content, and constraints. A template is at skills/od-design-handoff/assets/design-brief-template.md.",
        },
        projectName: {
          type: "string",
          description: "Human-readable project name.",
        },
        skillId: {
          type: "string",
          description:
            "Design skill to use. Leave empty for the default 'canvas-design'.",
        },
      },
      required: ["designSystemId", "brief", "projectName"],
    },
  },
  {
    name: "od_design_list_systems",
    description:
      "List available design systems (brand styles) in the local Open Design installation.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ── Handler dispatch ──

export async function handleToolCall(
  name: string,
  input: Record<string, unknown>,
  client: DaemonClient,
): Promise<unknown> {
  switch (name) {
    case "od_design_list_systems": {
      const systems = await client.listDesignSystems();
      return {
        content: [
          {
            type: "text",
            text: systems
              .map(
                (s) =>
                  `- **${s.id}**${s.title ? ` — ${s.title}` : ""}`,
              )
              .join("\n"),
          },
        ],
      };
    }

    case "od_design_handoff": {
      const designSystemId = input.designSystemId as string;
      const brief = input.brief as string;
      const projectName = input.projectName as string;
      const skillId = (input.skillId as string) || undefined;

      // Create project + write brief (setup phase, not included in
      // the "design handoff complete" elapsed measurement).
      const { projectId, projectDir, conversationId } =
        await client.createProject({
          name: projectName,
          designSystemId,
          skillId,
        });

      await mkdir(projectDir, { recursive: true });
      await writeFile(join(projectDir, "design-brief.md"), brief, "utf-8");

      const prompt = [
        `You are working on a design project named "${projectName}".`,
        `The active design system is "${designSystemId}".`,
        ``,
        `Read the design brief at design-brief.md and create the UI.`,
        `Output HTML/CSS artifacts. Save index.html.`,
      ].join("\n");

      // Agent run: clock starts now so the elapsed figure reflects
      // only the design-agent wall-clock, not the filesystem setup.
      const agentStart = Date.now();
      const files = await client.runDesignAgent(
        projectId,
        conversationId,
        prompt,
      );

      const elapsedSeconds = Math.round(
        (Date.now() - agentStart) / 1000,
      );

      return {
        content: [
          {
            type: "text",
            text: [
              `Design handoff complete in ${elapsedSeconds}s.`,
              ``,
              `**Project**: ${projectId}`,
              `**Directory**: ${projectDir}`,
              `**Status**: completed`,
              `**Files**:`,
              ...files.map((f) => `- ${f.path} (${f.size} bytes)`),
              ``,
              `Read the generated files from ${projectDir}/artifacts/, then integrate into the user's project.`,
            ].join("\n"),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
