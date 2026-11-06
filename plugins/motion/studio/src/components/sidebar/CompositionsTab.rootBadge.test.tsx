// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { resolveMasterCompositionPath } from "../../utils/studioUrlState";
import { mountCompositionsTab } from "./compositionsTabTestUtils";

const mount = (compositions: string[], masterCompositionPath: string | null) =>
  mountCompositionsTab({ compositions, masterCompositionPath });

describe("CompositionsTab root badge", () => {
  it("marks the composition matching masterCompositionPath as root", () => {
    const compositions = ["index.html", "compositions/headline.html"];
    const host = mount(compositions, resolveMasterCompositionPath(compositions));
    const cards = host.querySelectorAll<HTMLElement>('[draggable="true"]');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain("Root");
    expect(cards[1]?.textContent).not.toContain("Root");
  });

  it("marks nothing as root when masterCompositionPath is null", () => {
    const compositions = ["compositions/hero.html", "compositions/outro.html"];
    const host = mount(compositions, null);
    const cards = host.querySelectorAll<HTMLElement>('[draggable="true"]');
    expect(cards[0]?.textContent).not.toContain("Root");
    expect(cards[1]?.textContent).not.toContain("Root");
  });
});
