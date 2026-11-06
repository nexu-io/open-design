import { describe, expect, it } from "vitest";
import { LINK_LABEL_COLORS, linkLabelColor } from "./linkLabelColor";

describe("linkLabelColor", () => {
  it("has no colour for an unlinked clip", () => {
    expect(linkLabelColor(undefined)).toBeNull();
    expect(linkLabelColor("")).toBeNull();
  });

  it("walks the palette in lk-N order, wrapping", () => {
    expect(linkLabelColor("lk-1")).toBe(LINK_LABEL_COLORS[0]);
    expect(linkLabelColor("lk-2")).toBe(LINK_LABEL_COLORS[1]);
    expect(linkLabelColor(`lk-${LINK_LABEL_COLORS.length + 1}`)).toBe(LINK_LABEL_COLORS[0]);
  });

  it("is deterministic for hand-written ids", () => {
    expect(linkLabelColor("talk-pair")).toBe(linkLabelColor("talk-pair"));
    expect(LINK_LABEL_COLORS).toContain(linkLabelColor("talk-pair"));
  });
});
