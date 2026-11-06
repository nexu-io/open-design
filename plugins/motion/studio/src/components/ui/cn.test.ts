/**
 * The two things `cn` must do that a bare `clsx` cannot: drop a losing class
 * from the same group, and know the two class families `theme.css` invents.
 */
import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("keeps only the last class from a group", () => {
    expect(cn("text-sm", "text-step-11")).toBe("text-step-11");
    expect(cn("text-step-11", "text-sm")).toBe("text-sm");
  });

  it("takes clsx-style conditionals", () => {
    const cond = true;
    expect(cn("px-3", cond && "px-4")).toBe("px-4");
    expect(cn("px-3", !cond && "px-4")).toBe("px-3");
  });

  it("merges the control heights against each other", () => {
    expect(cn("h-ctl", "h-ctl-lg")).toBe("h-ctl-lg");
    expect(cn("h-ctl-lg", "h-8")).toBe("h-8");
    expect(cn("size-ctl", "size-ctl-sm")).toBe("size-ctl-sm");
  });

  it("keeps a type step and a text colour apart", () => {
    // Both are `text-*`; only one is a font size.
    expect(cn("text-step-11", "text-text-2")).toBe("text-step-11 text-text-2");
  });
});
