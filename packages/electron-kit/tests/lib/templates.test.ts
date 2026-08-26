import { describe, expect, it } from "vitest";

import { renderScalarTemplate } from "@/lib/templates.js";

describe("scalar resource templates", () => {
  it("renders raw scalar tags without HTML escaping", () => {
    expect(renderScalarTemplate({ template: "value={{&VALUE}}\n", values: { VALUE: "A&B<1>" } }))
      .toBe("value=A&B<1>\n");
  });

  it("rejects executable Mustache features, missing values, and drift", () => {
    expect(() => renderScalarTemplate({ template: "{{#VALUE}}x{{/VALUE}}", values: { VALUE: "x" } }))
      .toThrow(/unsupported Mustache token/u);
    expect(() => renderScalarTemplate({ template: "{{VALUE}}", values: { VALUE: "x" } }))
      .toThrow(/unsupported Mustache token/u);
    expect(() => renderScalarTemplate({ template: "{{&VALUE}}", values: {} }))
      .toThrow(/missing scalar template value/u);
    expect(() => renderScalarTemplate({ template: "plain", values: { VALUE: "x" } }))
      .toThrow(/unused scalar template values/u);
  });
});
