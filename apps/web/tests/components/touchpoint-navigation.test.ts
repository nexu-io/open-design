// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
const openExternalUrl = vi.hoisted(() => vi.fn(async () => false));
vi.mock("../../src/providers/registry", () => ({ openExternalUrl }));
import { internalActionNavigationUrl, navigateCampaignTarget, requireCampaignAction, resolveCampaignTarget } from "../../src/components/touchpoint-navigation";

describe("shared Test / Production navigation", () => {
  it("preserves internal query and hash on the host origin", () => {
    expect(internalActionNavigationUrl("/projects?view=active#recent", "https://host.example/current")?.href)
      .toBe("https://host.example/projects?view=active#recent");
  });
  it.each(["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)"])("rejects escaped internal target %s", path => {
    expect(internalActionNavigationUrl(path, "https://host.example/current")).toBeNull();
  });
  it.each(["http://example.com", "javascript:alert(1)", "data:text/html,hello", "https://user:secret@example.com"])("rejects unsafe HTTPS target %s", url => {
    expect(resolveCampaignTarget([{ id: "docs", target: { kind: "https", url } }], "docs")).toBeNull();
  });
  it("rejects absent and ambiguous action IDs", () => {
    const action = { id: "docs", target: { kind: "https" as const, url: "https://example.com" } };
    expect(resolveCampaignTarget([action], "other")).toBeNull();
    expect(resolveCampaignTarget([action, action], "docs")).toBeNull();
  });
  it("propagates a declined host open to the component SDK", async () => {
    const target = resolveCampaignTarget([{ id: "docs", target: { kind: "https", url: "https://example.com/docs?q=test#end" } }], "docs");
    if (!target) throw new Error("Expected registered target");
    const accepted = await navigateCampaignTarget(target);
    expect(accepted).toBe(false);
    expect(openExternalUrl).toHaveBeenCalledWith("https://example.com/docs?q=test#end");
    expect(() => requireCampaignAction(accepted)).toThrow("touchpoint_action_denied");
    expect(() => requireCampaignAction(true)).not.toThrow();
  });
});
