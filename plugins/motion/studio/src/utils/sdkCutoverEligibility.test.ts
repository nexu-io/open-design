import { describe, expect, it } from "vitest";
import type { PatchOperation } from "./sourcePatcher";
import { shouldUseSdkCutover, sdkCutoverIneligibleReason } from "./sdkCutoverEligibility";

const styleOp = (property: string, value: string): PatchOperation => ({
  type: "inline-style",
  property,
  value,
});
const textOp = (value: string): PatchOperation => ({
  type: "text-content",
  property: "text",
  value,
});
const attrOp = (property: string, value: string): PatchOperation => ({
  type: "attribute",
  property,
  value,
});
const htmlAttrOp = (property: string, value: string): PatchOperation => ({
  type: "html-attribute",
  property,
  value,
});

const childStyleOp: PatchOperation = {
  type: "inline-style",
  property: "color",
  value: "blue",
  childSelector: ":scope > span",
  childIndex: 0,
};

describe("shouldUseSdkCutover child-scoped operations", () => {
  it("declines child-scoped operations because SDK patch ops target only the parent hfId", () => {
    expect(shouldUseSdkCutover(true, true, "hf-parent", [childStyleOp])).toBe(false);
  });
});

describe("sdkCutoverIneligibleReason", () => {
  // `ineligible_operation` was one string covering four distinct causes, which
  // made the post-flip decline telemetry unactionable: 26 of 30 declines on
  // v0.8.47 landed there, with no way to separate a structural edit the SDK has
  // no vocabulary for (expected, permanent) from a reserved-attribute or
  // unsafe-attribute decline (narrower, and possibly fixable).
  it("names an op type the SDK cannot express", () => {
    expect(
      sdkCutoverIneligibleReason("hf-abc", [
        { type: "split", property: "x", value: "1" } as unknown as PatchOperation,
      ]),
    ).toBe("unsupported_op_type");
  });

  it("names a child-scoped op", () => {
    expect(sdkCutoverIneligibleReason("hf-parent", [childStyleOp])).toBe("child_scoped_op");
  });

  it("names a reserved attribute", () => {
    expect(sdkCutoverIneligibleReason("hf-abc", [attrOp("end", "2")])).toBe("reserved_attribute");
    expect(sdkCutoverIneligibleReason("hf-abc", [htmlAttrOp("DATA-START", "1")])).toBe(
      "reserved_attribute",
    );
  });

  it("names an unsafe html attribute", () => {
    expect(sdkCutoverIneligibleReason("hf-abc", [htmlAttrOp("onclick", "alert(1)")])).toBe(
      "unsafe_html_attribute",
    );
    expect(sdkCutoverIneligibleReason("hf-abc", [htmlAttrOp("href", "javascript:alert(1)")])).toBe(
      "unsafe_html_attribute",
    );
  });

  it("names an empty batch and an unaddressable target", () => {
    expect(sdkCutoverIneligibleReason("hf-abc", [])).toBe("no_ops");
    expect(sdkCutoverIneligibleReason(null, [styleOp("color", "red")])).toBe(
      "target_unaddressable",
    );
  });

  it("returns null when the batch is eligible", () => {
    expect(sdkCutoverIneligibleReason("hf-abc", [styleOp("color", "red")])).toBeNull();
    expect(
      sdkCutoverIneligibleReason("hf-abc", [
        styleOp("color", "red"),
        textOp("hello"),
        attrOp("x", "1"),
        htmlAttrOp("class", "foo"),
      ]),
    ).toBeNull();
  });

  // The reason function must not drift from the predicate it explains: a batch
  // the gate accepts must have no reason, and one it declines must have one.
  it("agrees with shouldUseSdkCutover on every case", () => {
    const cases: PatchOperation[][] = [
      [styleOp("color", "red")],
      [textOp("hello")],
      [attrOp("x", "1")],
      [htmlAttrOp("class", "foo")],
      [attrOp("end", "2")],
      [htmlAttrOp("onclick", "alert(1)")],
      [childStyleOp],
      [{ type: "split", property: "x", value: "1" } as unknown as PatchOperation],
      [],
    ];
    for (const ops of cases) {
      const eligible = shouldUseSdkCutover(true, true, "hf-abc", ops);
      expect(sdkCutoverIneligibleReason("hf-abc", ops) === null).toBe(eligible);
    }
  });
});
