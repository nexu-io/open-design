import { describe, it, expect, beforeEach } from "vitest";
import { recordBreadcrumb, breadcrumbTrail, resetBreadcrumbs } from "./breadcrumbs";

beforeEach(() => resetBreadcrumbs());

describe("breadcrumbTrail", () => {
  it("is empty before anything happens", () => {
    expect(breadcrumbTrail()).toBe("");
  });

  it("records events oldest first with a seconds stamp", () => {
    recordBreadcrumb("studio_session_start", {});
    recordBreadcrumb("studio_render_start", {});
    const trail = breadcrumbTrail();
    expect(trail).toMatch(/^\d+\.\d session_start > \d+\.\d render_start$/);
  });

  it("strips the studio prefix from both event naming styles", () => {
    recordBreadcrumb("studio_render_start", {});
    recordBreadcrumb("studio:save_failure", {});
    expect(breadcrumbTrail()).toContain("render_start");
    expect(breadcrumbTrail()).toContain("save_failure");
    expect(breadcrumbTrail()).not.toContain("studio_");
    expect(breadcrumbTrail()).not.toContain("studio:");
  });

  it("keeps a short discriminator so an event says where it happened", () => {
    recordBreadcrumb("studio:tab_switch", { tab: "renders" });
    expect(breadcrumbTrail()).toContain("tab_switch:renders");
  });

  it("rolls, keeping the most recent run-up rather than the oldest history", () => {
    for (let i = 0; i < 40; i++) recordBreadcrumb(`studio_step_${i}`, {});
    const trail = breadcrumbTrail();
    expect(trail).toContain("step_39");
    expect(trail).not.toContain("step_0 ");
    expect(trail.split(" > ")).toHaveLength(14);
  });

  describe("privacy", () => {
    it("never copies free text, however it is spelled", () => {
      recordBreadcrumb("studio_feedback", {
        comment: "my secret unreleased product name",
        error_message: "/Users/someone/private/path.html",
        stack_trace: "at Object.<anonymous> (/Users/someone/project.ts:1:1)",
      });
      const trail = breadcrumbTrail();
      expect(trail).not.toContain("secret");
      expect(trail).not.toContain("/Users/");
      expect(trail).toContain("feedback");
    });

    it("drops an allowlisted value that is long enough to be prose", () => {
      recordBreadcrumb("studio_thing", {
        action: "a".repeat(200),
      });
      expect(breadcrumbTrail()).toContain("thing");
      expect(breadcrumbTrail()).not.toContain("aaaa");
    });

    it("takes numbers and booleans from allowlisted keys", () => {
      recordBreadcrumb("studio_a", { status: 500 });
      recordBreadcrumb("studio_b", { mode: false });
      expect(breadcrumbTrail()).toContain("a:500");
      expect(breadcrumbTrail()).toContain("b:false");
    });
  });
});
