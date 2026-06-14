/**
 * Integration test against a live Open Design daemon.
 *
 * Requires a running daemon. Set OD_DAEMON_URL or run:
 *   pnpm tools-dev start --prod
 *
 * Tests the full od_design_handoff flow: list systems → create project →
 * launch design agent → collect files.
 */

import { describe, expect, it } from "vitest";
import { DaemonClient } from "../src/daemon-client.js";

describe("daemon integration", () => {
  // Skip if no daemon is running
  const daemonUrl = process.env.OD_DAEMON_URL ?? "";
  const runIntegration = daemonUrl ? describe : describe.skip;

  runIntegration("live daemon", () => {
    const client = new DaemonClient(daemonUrl);

    it("lists design systems", async () => {
      const systems = await client.listDesignSystems();
      expect(systems.length).toBeGreaterThan(100);
      const stripe = systems.find((s) => s.id === "stripe");
      expect(stripe).toBeDefined();
      expect(stripe?.title).toBeDefined();
    });

    it("creates a project", async () => {
      const result = await client.createProject({
        name: "od-mcp integration test",
        designSystemId: "stripe",
        skillId: "canvas-design",
      });
      expect(result.projectId).toBeTruthy();
      expect(result.projectDir).toMatch(/\.od[/\\]projects[/\\]/);
      expect(result.conversationId).toBeTruthy();
    });

    it("handoff: full flow (cold)", async () => {
      const { projectId, conversationId, projectDir } =
        await client.createProject({
          name: "od-mcp handoff test",
          designSystemId: "stripe",
        });

      const prompt = [
        "You are a design agent.",
        "Create a simple HTML landing page with a hero section.",
        "Use the active design system's colors.",
        "Output: save index.html.",
      ].join("\n");

      const files = await client.runDesignAgent(
        projectId,
        conversationId,
        prompt,
        { maxWaitSeconds: 300 },
      );

      expect(files.length).toBeGreaterThan(0);
      const html = files.find((f) => f.path.endsWith(".html"));
      expect(html).toBeDefined();
      expect(html!.size).toBeGreaterThan(0);
    }, 600_000); // 10-minute timeout for agent generation
  });
});
