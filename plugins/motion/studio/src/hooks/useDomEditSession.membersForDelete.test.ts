import { describe, expect, it } from "vitest";
import { membersForDelete } from "./useDomEditSession";
import type { DomEditSelection } from "../components/editor/domEditingTypes";

const sel = (id: string) => ({ id }) as DomEditSelection;

describe("membersForDelete", () => {
  it("takes the whole group when the caller asks to expand", () => {
    const group = [sel("a"), sel("b"), sel("c")];
    expect(membersForDelete(sel("a"), group, { expandGroup: true })).toEqual(group);
  });

  it("takes only the primary otherwise, so Cut removes what it copied", () => {
    // Cut copies the primary alone. Expanding here put one element on the
    // clipboard and removed every other member of the group with it.
    const group = [sel("a"), sel("b"), sel("c")];
    expect(membersForDelete(sel("a"), group)).toEqual([sel("a")]);
  });

  it("falls back to the primary when there is no group", () => {
    expect(membersForDelete(sel("a"), [], { expandGroup: true })).toEqual([sel("a")]);
  });
});
