// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectDomEditLayerItems,
  resolveDomEditSelection,
  buildDomEditPatchTarget,
  buildTextFieldChildLocator,
  readHfId,
  liveLayerElement,
  domEditSelectionToFacts,
} from "./domEditingLayers";
import type { DomEditTextField } from "./domEditingTypes";

const opts = { activeCompositionPath: "index.html", isMasterView: true, skipSourceProbe: true };

function textField(overrides: Partial<DomEditTextField> = {}): DomEditTextField {
  return {
    key: "child:0:span",
    label: "Text 1",
    value: "Hello",
    tagName: "span",
    attributes: [],
    inlineStyles: {},
    computedStyles: {},
    source: "child",
    ...overrides,
  };
}

describe("buildDomEditPatchTarget", () => {
  it("includes hfId when selection has hfId", () => {
    const target = buildDomEditPatchTarget({
      id: undefined,
      hfId: "hf-abc",
      selector: ".foo",
      selectorIndex: 0,
    });
    expect(target.hfId).toBe("hf-abc");
  });

  it("includes id and selector when hfId absent", () => {
    const target = buildDomEditPatchTarget({
      id: "hero",
      hfId: undefined,
      selector: "#hero",
      selectorIndex: undefined,
    });
    expect(target.id).toBe("hero");
    expect(target.hfId).toBeUndefined();
  });
});

describe("readHfId", () => {
  it("returns the attribute value when present", () => {
    const el = document.createElement("div");
    el.setAttribute("data-hf-id", "hf-abc");
    expect(readHfId(el)).toBe("hf-abc");
  });

  it("returns undefined when attribute is absent", () => {
    const el = document.createElement("div");
    expect(readHfId(el)).toBeUndefined();
  });

  it("returns undefined when attribute is empty string", () => {
    const el = document.createElement("div");
    el.setAttribute("data-hf-id", "");
    expect(readHfId(el)).toBeUndefined();
  });

  it("returns undefined when attribute is whitespace-only", () => {
    const el = document.createElement("div");
    el.setAttribute("data-hf-id", "  ");
    expect(readHfId(el)).toBeUndefined();
  });
});

describe("resolveDomEditSelection — hfId from data-hf-id", () => {
  it("populates hfId from the element data-hf-id attribute", async () => {
    const el = document.createElement("div");
    el.id = "hero";
    el.setAttribute("data-hf-id", "hf-x7k2");
    document.body.appendChild(el);

    const selection = await resolveDomEditSelection(el, opts);
    document.body.removeChild(el);

    expect(selection?.hfId).toBe("hf-x7k2");
  });

  it("leaves hfId undefined when element has no data-hf-id", async () => {
    const el = document.createElement("div");
    el.id = "no-hfid-el";
    document.body.appendChild(el);

    const selection = await resolveDomEditSelection(el, opts);
    document.body.removeChild(el);

    expect(selection?.hfId).toBeUndefined();
  });
});

describe("resolveDomEditSelection — source probe on re-resolve", () => {
  afterEach(() => vi.unstubAllGlobals());
  const probing = { activeCompositionPath: "index.html", isMasterView: true, projectId: "p" };

  it("asks the server once per node and target; re-resolving the same pair keeps the answer", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ exists: [false] }) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const el = document.createElement("div");
    el.id = "generated";
    document.body.appendChild(el);

    const first = await resolveDomEditSelection(el, probing);
    const again = await resolveDomEditSelection(el, { ...probing, previous: first });
    el.id = "renamed";
    await resolveDomEditSelection(el, { ...probing, previous: again });
    el.id = "generated";
    const replaced = document.createElement("div");
    replaced.id = "generated";
    el.replaceWith(replaced);
    await resolveDomEditSelection(replaced, { ...probing, previous: again });
    replaced.remove();

    expect(first?.existsInSource).toBe(false);
    expect(again?.existsInSource).toBe(false);
    expect(again?.capabilities.canMove).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("resolveDomEditSelection — data-hf-group capture", () => {
  // <div id="parent"><div data-hf-group="Group 1"><div data-hf-group="Group 2">
  //   <span id="child"/></div></div></div>
  function buildNestedGroups() {
    const parent = document.createElement("div");
    parent.id = "parent";
    const outer = document.createElement("div");
    outer.setAttribute("data-hf-group", "Group 1");
    const inner = document.createElement("div");
    inner.setAttribute("data-hf-group", "Group 2");
    const child = document.createElement("span");
    child.id = "child";
    inner.appendChild(child);
    outer.appendChild(inner);
    parent.appendChild(outer);
    document.body.appendChild(parent);
    return { parent, outer, inner, child };
  }

  it("selects the outermost group as a unit when clicking a child (not drilled in)", async () => {
    const { parent, outer, child } = buildNestedGroups();
    const selection = await resolveDomEditSelection(child, opts);
    document.body.removeChild(parent);

    expect(selection?.element).toBe(outer);
    expect(selection?.selector).toBe('[data-hf-group="Group 1"]');
  });

  it("resolves an explicit agent target without promoting it to the group", async () => {
    const { parent, child } = buildNestedGroups();
    const selection = await resolveDomEditSelection(child, { ...opts, exactTarget: true });
    document.body.removeChild(parent);

    expect(selection?.element).toBe(child);
    expect(selection?.id).toBe("child");
  });

  it("selects the next nested group when drilled into the outer group", async () => {
    const { parent, outer, inner, child } = buildNestedGroups();
    const selection = await resolveDomEditSelection(child, { ...opts, activeGroupElement: outer });
    document.body.removeChild(parent);

    expect(selection?.element).toBe(inner);
    expect(selection?.selector).toBe('[data-hf-group="Group 2"]');
  });

  it("selects the child when drilled all the way into the innermost group", async () => {
    const { parent, inner, child } = buildNestedGroups();
    const selection = await resolveDomEditSelection(child, { ...opts, activeGroupElement: inner });
    document.body.removeChild(parent);

    expect(selection?.element).toBe(child);
    expect(selection?.id).toBe("child");
  });

  it("layer tree is scoped to the group's members when drilled in", () => {
    const root = document.createElement("div");
    root.setAttribute("data-composition-id", "main");
    const group = document.createElement("div");
    group.setAttribute("data-hf-group", "Group 1");
    const inside = document.createElement("div");
    inside.id = "inside";
    const outside = document.createElement("div");
    outside.id = "outside";
    group.appendChild(inside);
    root.appendChild(group);
    root.appendChild(outside);
    document.body.appendChild(root);

    const opts2 = { activeCompositionPath: "index.html", isMasterView: true };
    const full = collectDomEditLayerItems(root, opts2).map((i) => i.id);
    const scoped = collectDomEditLayerItems(root, { ...opts2, activeGroupElement: group }).map(
      (i) => i.id,
    );
    document.body.removeChild(root);

    expect(full).toContain("outside");
    expect(scoped).toContain("inside");
    expect(scoped).not.toContain("outside");
  });

  it("exits the drilled-into group and selects the outside element (non-sticky drill)", async () => {
    const { parent, inner } = buildNestedGroups();
    const outside = document.createElement("div");
    outside.id = "outside";
    document.body.appendChild(outside);

    const selection = await resolveDomEditSelection(outside, {
      ...opts,
      activeGroupElement: inner,
    });
    document.body.removeChild(parent);
    document.body.removeChild(outside);

    // Drill-in is non-sticky: clicking outside the active group exits it and
    // resolves the clicked element normally (rather than selecting nothing).
    expect(selection?.id).toBe("outside");
  });
});

describe("buildTextFieldChildLocator", () => {
  it("locates a child field using its DOM-derived sourceChildIndex", () => {
    const fields = [textField({ key: "child:0:span", sourceChildIndex: 0 })];

    expect(buildTextFieldChildLocator(fields, "child:0:span")).toEqual({
      childSelector: ":scope > span",
      childIndex: 0,
    });
  });

  it("fails closed for a synthetic child field with no sourceChildIndex", () => {
    // A field built by buildDefaultDomEditTextField (e.g. "add text field")
    // has never been read back from the live DOM, so its true position among
    // same-tag siblings is unknown. Guessing it by counting same-tag "child"
    // fields elsewhere in the array can silently point at the wrong element.
    const fields = [
      textField({ key: "child:0:span", sourceChildIndex: 0 }),
      textField({ key: "child:new:1", tagName: "span" }),
    ];

    expect(buildTextFieldChildLocator(fields, "child:new:1")).toBeNull();
  });

  it("returns null for a self-sourced field", () => {
    const fields = [textField({ key: "self:0:div", source: "self", sourceChildIndex: 0 })];

    expect(buildTextFieldChildLocator(fields, "self:0:div")).toBeNull();
  });

  it("returns null for an unknown field key", () => {
    const fields = [textField({ key: "child:0:span", sourceChildIndex: 0 })];

    expect(buildTextFieldChildLocator(fields, "missing")).toBeNull();
  });
});

function compositionWith(count: number, child: (el: HTMLElement, i: number) => void): HTMLElement {
  const root = document.createElement("div");
  root.setAttribute("data-composition-id", "index.html");
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    child(el, i);
    root.append(el);
  }
  return root;
}

describe("collectDomEditLayerItems item budget", () => {
  const documentWith = (count: number) => compositionWith(count, (el, i) => (el.id = `el-${i}`));

  it("returns the whole document by default", () => {
    // A default cap here silently truncated the marquee's candidate list: a drag
    // over the whole canvas only ever saw the first 80 elements, so everything
    // past them was unselectable and survived a Delete.
    expect(collectDomEditLayerItems(documentWith(200), opts)).toHaveLength(200);
  });

  it("truncates only when a caller asks for a rendering budget", () => {
    expect(collectDomEditLayerItems(documentWith(200), opts, 80)).toHaveLength(80);
  });
});

describe("collectDomEditLayerItems selector-index cost", () => {
  // Attached, unlike the fixture above: a detached subtree is invisible to
  // document.querySelectorAll, so the occurrence lookup would find nothing.
  function attachedRootWithSharedClass(count: number): HTMLElement {
    const root = compositionWith(count, (el) => (el.className = "box"));
    document.body.append(root);
    return root;
  }

  /** Class-selector document queries made by one walk over `count` sibling cards. */
  function classSelectorQueries(count: number): number {
    const root = attachedRootWithSharedClass(count);
    const doc = root.ownerDocument;
    const real = doc.querySelectorAll.bind(doc);
    let calls = 0;
    Object.defineProperty(doc, "querySelectorAll", {
      configurable: true,
      value: (selector: string) => {
        if (selector.startsWith(".")) calls += 1;
        return real(selector);
      },
    });
    try {
      expect(collectDomEditLayerItems(root, opts)).toHaveLength(count);
      return calls;
    } finally {
      delete (doc as Partial<Document>).querySelectorAll;
      root.remove();
    }
  }

  // The occurrence index is resolved here, for every item, so an unshared index
  // costs one whole-document query per element — quadratic once a composition
  // repeats a card or tile class. Owning the pass here rather than at each call
  // site is what keeps the layers panel, the marquee and the agent's look tool
  // linear too; invariance across a 4x fixture fails for any per-element term.
  it("resolves a shared selector once per walk, not once per element", () => {
    expect(classSelectorQueries(48)).toBe(classSelectorQueries(12));
    expect(classSelectorQueries(12)).toBe(1);
  });
});

describe("liveLayerElement", () => {
  it("finds a replaced layer again in its own file when a sub-composition repeats its id", () => {
    document.body.innerHTML =
      '<div data-composition-id="main">' +
      '<div data-composition-id="strip" data-composition-src="compositions/strip.html">' +
      '<div id="card-1">strip</div></div><div id="card-1">root</div></div>';
    const stale = document.createElement("div");
    const layer = {
      key: "index.html:card-1:0",
      element: stale,
      label: "card-1",
      tagName: "div",
      depth: 0,
      childCount: 0,
      id: "card-1",
      sourceFile: "index.html",
    };

    expect(liveLayerElement(layer, document, "index.html").textContent).toBe("root");
    expect(
      liveLayerElement({ ...layer, sourceFile: "compositions/strip.html" }, document, "index.html")
        .textContent,
    ).toBe("strip");
  });
});

describe("domEditSelectionToFacts hasAudio", () => {
  async function factsFor(html: string) {
    document.body.innerHTML = html;
    const node = document.body.firstElementChild;
    if (!(node instanceof HTMLElement)) throw new Error("expected element");
    const selection = await resolveDomEditSelection(node, opts);
    document.body.innerHTML = "";
    if (!selection) throw new Error("expected selection");
    return domEditSelectionToFacts(selection);
  }

  it("is true for an unmuted video, false for muted or data-has-audio=false", async () => {
    expect((await factsFor(`<video id="v1"></video>`)).hasAudio).toBe(true);
    expect((await factsFor(`<video id="v2" data-has-audio="true"></video>`)).hasAudio).toBe(true);
    expect((await factsFor(`<video id="v3" muted></video>`)).hasAudio).toBe(false);
    expect((await factsFor(`<video id="v4" data-has-audio="false"></video>`)).hasAudio).toBe(false);
    expect((await factsFor(`<div id="d1"></div>`)).hasAudio).toBe(false);
  });
});

describe("collectDomEditLayerItems and clips the runtime hid", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  });

  // As the runtime marks and styles a clip outside the playhead, with its rule that hides the clip's contents.
  function filmWithHiddenScene(hiddenStyle: string): HTMLElement {
    document.head.innerHTML = `<style>[data-hf-clip-hidden][data-hf-clip-hidden] * { visibility: hidden !important; }</style>`;
    const cells = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => `<div id="${prefix}-${i}"></div>`).join("");
    document.body.innerHTML =
      `<div data-composition-id="main">` +
      `<div id="now" data-start="0" data-duration="5">${cells("now", 3)}</div>` +
      `<div id="later" data-start="5" data-duration="5" data-hf-clip-hidden style="${hiddenStyle}">${cells("later", 50)}</div>` +
      `</div>`;
    return document.querySelector<HTMLElement>("[data-composition-id]")!;
  }

  it("lists what is on screen without reading the style of anything inside a hidden clip", () => {
    const root = filmWithHiddenScene("visibility: hidden");
    const read = vi.spyOn(window, "getComputedStyle");
    const ids = collectDomEditLayerItems(root, opts).map((item) => item.id);
    const insideHidden = read.mock.calls.filter(([el]) =>
      document.getElementById("later")!.contains(el),
    );
    expect(ids).toEqual(["now", "now-0", "now-1", "now-2"]);
    expect(insideHidden).toHaveLength(0);
  });

  // Older shader builds reveal a clip through its inline style alone, leaving the mark on.
  it("still lists a marked clip whose inline style shows it", () => {
    const root = filmWithHiddenScene("visibility: visible");
    const ids = collectDomEditLayerItems(root, opts).map((item) => item.id);
    expect(ids).toContain("later");
  });
});
