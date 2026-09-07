import { describe, expect, it } from "vitest";
import { attributeIssues } from "../src/pipeline.js";
import { ISSUE_CODES } from "../src/errors.js";
import type { Census, Issue } from "../src/types.js";

/**
 * Where a finding says it comes from, when a viewport edit is in play.
 *
 * A lint finding a saved tweak CAUSED was blamed on the scene.json line that
 * authored the part — a line carrying no scale, prescribing "apply scale
 * before export", which is impossible there because the tweak system
 * re-applies the edit on every compile. The provenance contract is exactly
 * about never sending a reader to a line that cannot fix the finding.
 *
 * The redirect has to earn itself in both directions: only a tweak that
 * actually moves the part may take the blame, and an authored origin is
 * never hidden behind one — the shipped transform is the authored value with
 * the edit on top, so both addresses travel.
 */
const census = (provenance?: Record<string, { file: string; line: number | null }>): Census =>
  ({ provenance }) as unknown as Census;

const scaleIssue = (): Issue => ({
  code: ISSUE_CODES.UNAPPLIED_SCALE,
  severity: "warning",
  message: "carries unapplied scale (1.77, 1, 1)",
  hint: "apply object scale before export",
  file: "scene.json",
  target: "prp_slat_4",
});

describe("attributeIssues — viewport-edit provenance", () => {
  it("redirects a scale finding to tweaks.json when a real edit exists", () => {
    const [issue] = attributeIssues([scaleIssue()], census({}), {
      prp_slat_4: { scale: [1.77, 1, 1] },
    });
    expect(issue!.file).toBe("tweaks.json");
    expect(issue!.hint).toContain("viewport edit");
    expect(issue!.detail?.tweakChannel).toBe("scale");
    const origin = issue!.detail?.origin as Array<{ at: string }>;
    expect(origin[0]!.at).toBe("tweaks.json");
  });

  it("keeps the authored origin beside the edit, so neither address is hidden", () => {
    const [issue] = attributeIssues(
      [scaleIssue()],
      census({ prp_slat_4: { file: "scene.json", line: 19 } }),
      { prp_slat_4: { scale: [1.77, 1, 1] } },
    );
    const origin = issue!.detail?.origin as Array<{ at: string }>;
    expect(origin.map((o) => o.at)).toEqual(["tweaks.json", "scene.json:19"]);
    expect(issue!.hint).toContain("scene.json:19");
  });

  it("does not blame an IDENTITY edit — a gesture that ended where it began", () => {
    // The viewer records a channel for any gesture, so "a record exists" is
    // not "the edit caused this". Blaming an identity edit sends the reader
    // to clear something that was never the cause.
    const [issue] = attributeIssues(
      [scaleIssue()],
      census({ prp_slat_4: { file: "scene.json", line: 19 } }),
      { prp_slat_4: { scale: [1, 1, 1] } },
    );
    expect(issue!.file).toBe("scene.json");
    const origin = issue!.detail?.origin as Array<{ at: string }>;
    expect(origin.map((o) => o.at)).toEqual(["scene.json:19"]);
  });

  it("leaves a finding alone when the part carries no edit at all", () => {
    const [issue] = attributeIssues(
      [scaleIssue()],
      census({ prp_slat_4: { file: "scene.json", line: 19 } }),
      { prp_other: { scale: [2, 2, 2] } },
    );
    expect(issue!.file).toBe("scene.json");
  });

  it("redirects even when the census carries no provenance map", () => {
    // The redirect depends on tweaks.json, not on the build script's line
    // map; gating it behind provenance left the wrong address standing on
    // every scene whose census has no origins.
    const [issue] = attributeIssues([scaleIssue()], census(undefined), {
      prp_slat_4: { scale: [1.77, 1, 1] },
    });
    expect(issue!.file).toBe("tweaks.json");
  });

  it("never touches a code a viewport edit cannot cause", () => {
    const floating: Issue = {
      code: ISSUE_CODES.NOT_GROUNDED,
      severity: "warning",
      message: "floats 0.02m above the ground plane",
      file: "scene.json",
      target: "prp_slat_4",
    };
    const [issue] = attributeIssues(
      [floating],
      census({ prp_slat_4: { file: "scene.json", line: 19 } }),
      { prp_slat_4: { scale: [1.77, 1, 1] } },
    );
    expect(issue!.file).toBe("scene.json");
  });
});
