import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import {
  buildDomEditStylePatchOperation,
  buildElementAgentPrompt,
  collectDomEditLayerItems,
  countDomEditChildLayers,
  findElementForSelection,
  findElementForTimelineElement,
  getDomEditNonEditableReason,
  getDomEditTargetKey,
  isLargeRasterDomEditSelection,
  isTextEditableSelection,
  resolveVisualDomEditSelectionTarget,
  serializeDomEditTextFields,
  type DomEditSelection,
  resolveDomEditCapabilities,
  resolveDomEditSelection,
} from "./domEditing";
import { buildElementLabel, normalizeTimelineCompositionSource } from "./domEditingDom";

function createDocument(markup: string): Document {
  const window = new Window();
  Object.assign(window, { SyntaxError });
  window.document.body.innerHTML = markup;
  return window.document;
}

function setElementRect(
  element: HTMLElement,
  rect: Partial<Pick<DOMRect, "left" | "top" | "width" | "height">>,
) {
  const left = rect.left ?? 0;
  const top = rect.top ?? 0;
  const width = rect.width ?? 100;
  const height = rect.height ?? 40;
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: left,
      y: top,
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      toJSON: () => null,
    }),
  });
}

describe("resolveDomEditCapabilities", () => {
  it("marks absolute px-positioned layers as movable and resizable", () => {
    expect(
      resolveDomEditCapabilities({
        selector: "#card",
        inlineStyles: {
          left: "120px",
          top: "80px",
          width: "240px",
          height: "140px",
        },
        computedStyles: {
          position: "absolute",
          left: "120px",
          top: "80px",
          width: "240px",
          height: "140px",
          transform: "none",
        },
        isCompositionHost: false,
        isMasterView: false,
      }),
    ).toEqual({
      canSelect: true,
      canEditStyles: true,
      canMove: true,
      canResize: true,
      canCrop: true,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
      reasonIfDisabled: undefined,
    });
  });

  it("rejects flex/grid children for move and resize", () => {
    expect(
      resolveDomEditCapabilities({
        selector: "#chip",
        tagName: "div",
        inlineStyles: {},
        computedStyles: {
          position: "static",
          display: "block",
          left: "auto",
          top: "auto",
          width: "180px",
          height: "64px",
          transform: "none",
        },
        isCompositionHost: false,
        isMasterView: false,
      }),
    ).toMatchObject({
      canSelect: true,
      canEditStyles: true,
      canMove: false,
      canResize: false,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
      reasonIfDisabled: undefined,
    });
  });

  it("rejects transform-driven geometry", () => {
    expect(
      resolveDomEditCapabilities({
        selector: "#card",
        inlineStyles: {
          left: "120px",
          top: "80px",
          width: "240px",
          height: "140px",
        },
        computedStyles: {
          position: "absolute",
          left: "120px",
          top: "80px",
          width: "240px",
          height: "140px",
          transform: "matrix(1, 0, 0, 1, 12, 0)",
        },
        isCompositionHost: false,
        isMasterView: false,
      }),
    ).toMatchObject({
      canMove: false,
      canResize: false,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
    });
  });

  it("treats identity transforms left behind by animation libraries as movable", () => {
    expect(
      resolveDomEditCapabilities({
        selector: "#card",
        inlineStyles: {
          left: "120px",
          top: "80px",
          width: "240px",
          height: "140px",
        },
        computedStyles: {
          position: "absolute",
          left: "120px",
          top: "80px",
          width: "240px",
          height: "140px",
          transform: "matrix(1, 0, 0, 1, 0, 0)",
        },
        isCompositionHost: false,
        isMasterView: false,
      }),
    ).toMatchObject({
      canMove: true,
      canResize: true,
      canApplyManualOffset: true,
    });
  });

  it("treats identity matrix3d transforms as movable", () => {
    expect(
      resolveDomEditCapabilities({
        selector: "#card",
        inlineStyles: {
          left: "120px",
          top: "80px",
          width: "240px",
          height: "140px",
        },
        computedStyles: {
          position: "absolute",
          left: "120px",
          top: "80px",
          width: "240px",
          height: "140px",
          transform: "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)",
        },
        isCompositionHost: false,
        isMasterView: false,
      }),
    ).toMatchObject({
      canMove: true,
      canResize: true,
    });
  });

  it("allows imported absolute media to resize from computed px geometry", () => {
    expect(
      resolveDomEditCapabilities({
        selector: "#photo",
        inlineStyles: {
          inset: "0",
          width: "100%",
          height: "100%",
        },
        computedStyles: {
          position: "absolute",
          left: "0px",
          top: "0px",
          width: "330px",
          height: "228px",
          transform: "none",
        },
        isCompositionHost: false,
        isMasterView: false,
      }),
    ).toMatchObject({
      canMove: true,
      canResize: true,
    });
  });
});

describe("resolveVisualDomEditSelectionTarget", () => {
  // fallow-ignore-next-line code-duplication
  it("prefers the visible leaf under the pointer over an oversized container", () => {
    const document = createDocument(`
      <section id="container" class="hero-shell">
        <span id="headline" class="headline">Launch faster</span>
      </section>
    `);
    const container = document.getElementById("container") as HTMLElement;
    const headline = document.getElementById("headline") as HTMLElement;
    setElementRect(container, { width: 900, height: 520 });
    setElementRect(headline, { left: 240, top: 160, width: 180, height: 36 });

    expect(
      resolveVisualDomEditSelectionTarget([container, headline], {
        activeCompositionPath: "index.html",
      }),
    ).toBe(headline);
  });

  it("skips hidden and zero-size elements before picking a rendered candidate", () => {
    const document = createDocument(`
      <div id="hidden" style="display: none">Hidden</div>
      <div id="empty">Empty</div>
      <div id="visible">Visible</div>
    `);
    const hidden = document.getElementById("hidden") as HTMLElement;
    const empty = document.getElementById("empty") as HTMLElement;
    const visible = document.getElementById("visible") as HTMLElement;
    setElementRect(hidden, { width: 120, height: 32 });
    setElementRect(empty, { width: 0, height: 0 });
    setElementRect(visible, { width: 120, height: 32 });

    expect(
      resolveVisualDomEditSelectionTarget([hidden, empty, visible], {
        activeCompositionPath: "index.html",
      }),
    ).toBe(visible);
  });

  it("skips transparent elements that still report a box", () => {
    const document = createDocument(`
      <button id="transparent" style="opacity: 0">Transparent</button>
      <button id="visible">Visible</button>
    `);
    const transparent = document.getElementById("transparent") as HTMLElement;
    const visible = document.getElementById("visible") as HTMLElement;
    setElementRect(transparent, { width: 120, height: 32 });
    setElementRect(visible, { width: 120, height: 32 });

    expect(
      resolveVisualDomEditSelectionTarget([transparent, visible], {
        activeCompositionPath: "index.html",
      }),
    ).toBe(visible);
  });

  it("falls back to the nearest stable editable ancestor when a visual child has no target", () => {
    const document = createDocument(`
      <section id="card">
        <span>Unlabeled copy</span>
      </section>
    `);
    const card = document.getElementById("card") as HTMLElement;
    const span = card.querySelector("span") as HTMLElement;
    setElementRect(card, { width: 400, height: 200 });
    setElementRect(span, { left: 40, top: 40, width: 140, height: 28 });

    expect(
      resolveVisualDomEditSelectionTarget([span, card], {
        activeCompositionPath: "index.html",
      }),
    ).toBe(card);
  });

  it("keeps explicit layer selection able to target containers", async () => {
    const document = createDocument(`
      <section id="container" class="hero-shell">
        <span id="headline" class="headline">Launch faster</span>
      </section>
    `);
    const container = document.getElementById("container") as HTMLElement;
    const headline = document.getElementById("headline") as HTMLElement;
    setElementRect(container, { width: 900, height: 520 });
    setElementRect(headline, { left: 240, top: 160, width: 180, height: 36 });

    const visualTarget = resolveVisualDomEditSelectionTarget([container, headline], {
      activeCompositionPath: "index.html",
    });
    const explicitSelection = await resolveDomEditSelection(container, {
      activeCompositionPath: "index.html",
      isMasterView: false,
    });

    expect(visualTarget).toBe(headline);
    expect(explicitSelection?.id).toBe("container");
  });

  it("prefers the visually-on-top sibling over a deeper element in a separate visual layer", () => {
    const document = createDocument(`
      <div id="comp-root">
        <div id="sub-comp" class="sub-comp">
          <img id="sf-chrome" class="sf-chrome" style="width:100%;height:100%" />
        </div>
        <video id="pip-studio" class="pip-studio" style="position:absolute;z-index:15" />
      </div>
    `);
    const pipStudio = document.getElementById("pip-studio") as HTMLElement;
    const sfChrome = document.getElementById("sf-chrome") as HTMLElement;
    const subComp = document.getElementById("sub-comp") as HTMLElement;
    setElementRect(pipStudio, { left: 50, top: 50, width: 320, height: 320 });
    setElementRect(sfChrome, { left: 0, top: 0, width: 1920, height: 1080 });
    setElementRect(subComp, { left: 0, top: 0, width: 1920, height: 1080 });

    expect(
      resolveVisualDomEditSelectionTarget([pipStudio, subComp, sfChrome], {
        activeCompositionPath: "index.html",
      }),
    ).toBe(pipStudio);
  });
});

describe("isLargeRasterDomEditSelection", () => {
  it("flags large image and background targets for raster click fallback", () => {
    expect(
      isLargeRasterDomEditSelection(
        {
          tagName: "img",
          boundingBox: { x: 0, y: 0, width: 1920, height: 1080 },
          computedStyles: {},
        },
        { width: 1920, height: 1080 },
      ),
    ).toBe(true);

    expect(
      isLargeRasterDomEditSelection(
        {
          tagName: "div",
          boundingBox: { x: 0, y: 0, width: 1280, height: 720 },
          computedStyles: { "background-image": 'url("hero.png")' },
        },
        { width: 1920, height: 1080 },
      ),
    ).toBe(true);
  });

  it("does not flag small media or text selections", () => {
    expect(
      isLargeRasterDomEditSelection(
        {
          tagName: "img",
          boundingBox: { x: 80, y: 80, width: 96, height: 96 },
          computedStyles: {},
        },
        { width: 1920, height: 1080 },
      ),
    ).toBe(false);

    expect(
      isLargeRasterDomEditSelection(
        {
          tagName: "h1",
          boundingBox: { x: 0, y: 0, width: 1600, height: 300 },
          computedStyles: {},
        },
        { width: 1920, height: 1080 },
      ),
    ).toBe(false);
  });
});

describe("resolveDomEditSelection", () => {
  it("keeps composition host transforms disabled in master view", () => {
    expect(
      resolveDomEditCapabilities({
        selector: "#detail-host",
        inlineStyles: {
          left: "80px",
          top: "60px",
          width: "320px",
          height: "220px",
        },
        computedStyles: {
          position: "absolute",
          left: "80px",
          top: "60px",
          width: "320px",
          height: "220px",
          transform: "none",
        },
        isCompositionHost: true,
        isMasterView: true,
      }),
    ).toEqual({
      canSelect: true,
      canEditStyles: false,
      canMove: true,
      canResize: true,
      canCrop: true,
      canApplyManualOffset: false,
      canApplyManualSize: false,
      canApplyManualRotation: false,
      reasonIfDisabled: "Select an internal layer to transform it.",
    });
  });

  it("keeps the full-canvas stage layer transform disabled while allowing style edits", async () => {
    const document = createDocument(`
      <div data-hf-id="hf-stage" id="stage">
        <button id="cta">Add to basket</button>
      </div>
    `);
    document.documentElement.setAttribute("data-composition-id", "root");
    document.documentElement.setAttribute("data-width", "1920");
    document.documentElement.setAttribute("data-height", "1080");
    setElementRect(document.documentElement, { left: 0, top: 0, width: 1920, height: 1080 });
    const stage = document.getElementById("stage") as HTMLElement;
    setElementRect(stage, { left: 0, top: 0, width: 1920, height: 1080 });

    const selection = await resolveDomEditSelection(stage, {
      activeCompositionPath: null,
      isMasterView: true,
      skipSourceProbe: true,
    });

    expect(selection?.id).toBe("stage");
    expect(selection?.capabilities).toMatchObject({
      canSelect: true,
      canEditStyles: true,
      canMove: false,
      canResize: false,
      canApplyManualOffset: false,
      canApplyManualSize: false,
      canApplyManualRotation: false,
      reasonIfDisabled: "The root composition defines the preview bounds.",
    });
  });

  it("keeps direct full-bleed absolute layers editable", async () => {
    const document = createDocument(`
      <div id="hero" style="position: absolute; left: 0; top: 0; width: 1920px; height: 1080px;"></div>
    `);
    document.documentElement.setAttribute("data-composition-id", "root");
    document.documentElement.setAttribute("data-width", "1920");
    document.documentElement.setAttribute("data-height", "1080");
    setElementRect(document.documentElement, { left: 0, top: 0, width: 1920, height: 1080 });
    const hero = document.getElementById("hero") as HTMLElement;
    setElementRect(hero, { left: 0, top: 0, width: 1920, height: 1080 });

    const selection = await resolveDomEditSelection(hero, {
      activeCompositionPath: null,
      isMasterView: true,
      skipSourceProbe: true,
    });

    expect(selection?.id).toBe("hero");
    expect(selection?.capabilities).toMatchObject({
      canSelect: true,
      canEditStyles: true,
      canMove: true,
      canResize: true,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
    });
  });

  it("lets full-canvas layers opt out of root-layer classification", async () => {
    const document = createDocument(`
      <div data-hf-allow-root-edit id="editable-stage">
        <button id="cta">Add to basket</button>
      </div>
    `);
    document.documentElement.setAttribute("data-composition-id", "root");
    document.documentElement.setAttribute("data-width", "1920");
    document.documentElement.setAttribute("data-height", "1080");
    setElementRect(document.documentElement, { left: 0, top: 0, width: 1920, height: 1080 });
    const editableStage = document.getElementById("editable-stage") as HTMLElement;
    setElementRect(editableStage, { left: 0, top: 0, width: 1920, height: 1080 });

    const selection = await resolveDomEditSelection(editableStage, {
      activeCompositionPath: null,
      isMasterView: true,
      skipSourceProbe: true,
    });

    expect(selection?.id).toBe("editable-stage");
    expect(selection?.capabilities.canApplyManualOffset).toBe(true);
  });

  it("resolves child clicks inside a composition host to the child in master view", async () => {
    const document = createDocument(`
      <div data-composition-id="main">
        <div
          id="detail-host"
          class="clip"
          data-composition-id="detail-card"
          data-composition-file="compositions/detail-card.html"
        >
          <span id="inner-copy">Nested scene</span>
        </div>
      </div>
    `);

    const child = document.getElementById("inner-copy") as HTMLElement;
    const selection = await resolveDomEditSelection(child, {
      activeCompositionPath: null,
      isMasterView: true,
    });

    expect(selection?.id).toBe("inner-copy");
    expect(selection?.sourceFile).toBe("compositions/detail-card.html");
    expect(selection?.isCompositionHost).toBe(false);
    expect(selection?.capabilities.canApplyManualOffset).toBe(true);
    expect(selection?.capabilities.canEditStyles).toBe(true);
  });

  // fallow-ignore-next-line code-duplication
  it("does not prefer a scene host clip ancestor when selecting inside it", async () => {
    const document = createDocument(`
      <div data-composition-id="main">
        <div
          id="detail-host"
          class="clip"
          data-composition-id="detail-card"
          data-composition-file="compositions/detail-card.html"
        >
          <span id="inner-copy">Nested scene</span>
        </div>
      </div>
    `);

    const child = document.getElementById("inner-copy") as HTMLElement;
    const selection = await resolveDomEditSelection(child, {
      activeCompositionPath: null,
      isMasterView: true,
      preferClipAncestor: true,
    });

    expect(selection?.id).toBe("inner-copy");
    expect(selection?.sourceFile).toBe("compositions/detail-card.html");
    expect(selection?.isCompositionHost).toBe(false);
  });

  it("still prefers an internal clip ancestor inside a scene", async () => {
    const document = createDocument(`
      <div data-composition-id="main">
        <div
          id="detail-host"
          class="clip"
          data-composition-id="detail-card"
          data-composition-file="compositions/detail-card.html"
        >
          <section id="nested-card" class="clip">
            <span id="inner-copy">Nested scene</span>
          </section>
        </div>
      </div>
    `);

    const child = document.getElementById("inner-copy") as HTMLElement;
    const selection = await resolveDomEditSelection(child, {
      activeCompositionPath: null,
      isMasterView: true,
      preferClipAncestor: true,
    });

    expect(selection?.id).toBe("nested-card");
    expect(selection?.sourceFile).toBe("compositions/detail-card.html");
    expect(selection?.isCompositionHost).toBe(false);
  });

  it("scopes class selector indexing to the same source file", async () => {
    const document = createDocument(`
      <div data-composition-id="main">
        <div class="chip">Root chip</div>
        <div data-composition-id="nested" data-composition-file="compositions/nested.html">
          <div class="chip">Nested chip</div>
        </div>
      </div>
    `);

    const rootChip = document.getElementsByClassName("chip")[0] as HTMLElement;
    const selection = await resolveDomEditSelection(rootChip, {
      activeCompositionPath: null,
      isMasterView: true,
    });

    expect(selection?.sourceFile).toBe("index.html");
    expect(selection?.selector).toBe(".chip");
    expect(selection?.selectorIndex).toBe(0);
    expect(findElementForSelection(document, selection!, null)).toBe(rootChip);
  });

  it("resolves nested duplicate ids from master view without treating root as the nested source", async () => {
    const document = createDocument(`
      <div data-composition-id="main">
        <div id="card">Root card</div>
        <div data-composition-id="nested" data-composition-file="scenes/nested.html">
          <div id="card">Nested card</div>
        </div>
      </div>
    `);

    const nestedCard = document.querySelector(
      '[data-composition-file="scenes/nested.html"] #card',
    ) as HTMLElement;
    const selection = await resolveDomEditSelection(nestedCard, {
      activeCompositionPath: null,
      isMasterView: true,
    });

    expect(selection?.sourceFile).toBe("scenes/nested.html");
    expect(findElementForSelection(document, selection!, null)).toBe(nestedCard);
  });

  it("does not throw when a generated timeline identity is passed as a selector", () => {
    const document = createDocument(`
      <div data-composition-id="main">
        <div class="topline">Logo</div>
      </div>
    `);

    expect(() =>
      findElementForSelection(
        document,
        {
          id: "index.html:Hyperframes Logo Light:0",
          selector:
            '[data-composition-id="index.html:Hyperframes Logo Light:0"],#index.html:Hyperframes Logo Light:0',
          sourceFile: "index.html",
        },
        null,
      ),
    ).not.toThrow();
    expect(
      findElementForSelection(
        document,
        {
          id: "index.html:Hyperframes Logo Light:0",
          selector:
            '[data-composition-id="index.html:Hyperframes Logo Light:0"],#index.html:Hyperframes Logo Light:0',
          sourceFile: "index.html",
        },
        null,
      ),
    ).toBeNull();
  });

  it("escapes ids and composition ids when creating stable selectors", async () => {
    const document = createDocument(`
      <div data-composition-id="main">
        <div id="logo:light">Logo</div>
        <div data-composition-id="scene:one">Scene</div>
      </div>
    `);
    const logo = document.getElementById("logo:light") as HTMLElement;
    const scene = Array.from(document.querySelectorAll("[data-composition-id]")).find(
      (element) => element.getAttribute("data-composition-id") === "scene:one",
    ) as HTMLElement;

    const logoSelection = await resolveDomEditSelection(logo, {
      activeCompositionPath: null,
      isMasterView: true,
    });
    const sceneSelection = await resolveDomEditSelection(scene, {
      activeCompositionPath: null,
      isMasterView: true,
    });

    expect(logoSelection?.selector).not.toBe("#logo:light");
    expect(findElementForSelection(document, logoSelection!, null)).toBe(logo);
    expect(sceneSelection?.selector).toBe('[data-composition-id="scene:one"]');
    expect(findElementForSelection(document, sceneSelection!, null)).toBe(scene);
  });

  it("prefers the nearest clip ancestor on single-click style selection", async () => {
    const document = createDocument(`
      <section id="card" class="clip" style="left: 10px; top: 20px; width: 200px; height: 100px; position: absolute;">
        <p id="copy">Hello</p>
      </section>
    `);

    const child = document.getElementById("copy") as HTMLElement;
    const selection = await resolveDomEditSelection(child, {
      activeCompositionPath: null,
      isMasterView: false,
      preferClipAncestor: true,
    });

    expect(selection?.id).toBe("card");
    expect(selection?.selector).toBe("#card");
  });

  it("can resolve the exact child when clip-ancestor preference is disabled", async () => {
    const document = createDocument(`
      <section id="card" class="clip" style="left: 10px; top: 20px; width: 200px; height: 100px; position: absolute;">
        <p id="copy">Hello</p>
      </section>
    `);

    const child = document.getElementById("copy") as HTMLElement;
    const selection = await resolveDomEditSelection(child, {
      activeCompositionPath: null,
      isMasterView: false,
      preferClipAncestor: false,
    });

    expect(selection?.id).toBe("copy");
    expect(selection?.selector).toBe("#copy");
  });

  it("keeps a transparent overflow mask structural when directly selecting its headline", async () => {
    const document = createDocument(`
      <template id="source-template"></template>
      <section class="hl-block">
        <div class="hl-mask" style="overflow: hidden; background: transparent">
          <h1 class="hl-text">Launch title</h1>
        </div>
      </section>
    `);
    const headline = document.querySelector<HTMLElement>(".hl-text")!;
    setElementRect(headline, { left: 44, top: 52, width: 220, height: 48 });
    const selection = await resolveDomEditSelection(headline, {
      activeCompositionPath: "index.html",
      isMasterView: false,
      preferClipAncestor: false,
    });

    expect(selection?.element).toBe(headline);
    expect(selection?.selector).toBe(".hl-text");
    expect(selection?.textFields).toMatchObject([{ source: "self", tagName: "h1" }]);
    expect(selection?.boundingBox).toEqual({ x: 44, y: 52, width: 220, height: 48 });
    // Explicit layer navigation remains free to resolve the structural mask.
    const mask = document.querySelector<HTMLElement>(".hl-mask")!;
    expect(
      (
        await resolveDomEditSelection(mask, {
          activeCompositionPath: "index.html",
          isMasterView: false,
          preferClipAncestor: false,
        })
      )?.element,
    ).toBe(mask);
  });

  // fallow-ignore-next-line code-duplication
  it("collects simple child text blocks as separate editable fields", async () => {
    const document = createDocument(`
      <section id="card" class="clip" style="left: 10px; top: 20px; width: 200px; height: 100px; position: absolute;">
        <strong>Headline</strong>
        <span>Supporting copy</span>
      </section>
    `);

    const selection = await resolveDomEditSelection(
      document.getElementById("card") as HTMLElement,
      {
        activeCompositionPath: null,
        isMasterView: false,
      },
    );

    expect(selection?.textFields.map((field) => field.label)).toEqual(["Text 1", "Text 2"]);
    expect(selection?.textFields.map((field) => field.value)).toEqual([
      "Headline",
      "Supporting copy",
    ]);
  });

  it("preserves user-entered text spacing in editable text fields", async () => {
    const document = createDocument(`
      <section id="card" class="clip" style="position: absolute;">
        <strong>Headline with trailing space </strong>
      </section>
    `);

    const selection = await resolveDomEditSelection(
      document.getElementById("card") as HTMLElement,
      {
        activeCompositionPath: null,
        isMasterView: false,
      },
    );

    expect(selection?.textFields[0]?.value).toBe("Headline with trailing space ");
  });

  it("keeps an emptied text layer editable so users can type into it again", async () => {
    const document = createDocument(`
      <div id="card" class="clip" style="position: absolute;"></div>
    `);

    const selection = await resolveDomEditSelection(
      document.getElementById("card") as HTMLElement,
      {
        activeCompositionPath: null,
        isMasterView: false,
      },
    );

    expect(selection?.textFields).toMatchObject([
      {
        key: "self:0:div",
        label: "Content",
        value: "",
        source: "self",
      },
    ]);
    expect(selection ? isTextEditableSelection(selection) : false).toBe(true);
  });

  it("keeps emptied child text layers editable after their content is cleared", async () => {
    const document = createDocument(`
      <div id="card" class="clip" style="position: absolute;">
        <strong></strong>
        <span></span>
      </div>
    `);

    const selection = await resolveDomEditSelection(
      document.getElementById("card") as HTMLElement,
      {
        activeCompositionPath: null,
        isMasterView: false,
      },
    );

    expect(selection?.textFields.map((field) => field.tagName)).toEqual(["strong", "span"]);
    expect(selection?.textFields.map((field) => field.value)).toEqual(["", ""]);
  });

  it("explains anonymous child elements that resolve to an editable parent", async () => {
    const document = createDocument(`
      <div data-composition-id="main">
        <div id="card">
          <strong>Headline</strong>
        </div>
      </div>
    `);

    const child = document.querySelector("strong") as HTMLElement;
    const selection = await resolveDomEditSelection(child, {
      activeCompositionPath: null,
      isMasterView: false,
      preferClipAncestor: false,
    });

    expect(selection?.id).toBe("card");
    expect(getDomEditNonEditableReason(child, selection)).toBe("Selection resolves to Card");
  });

  it("does not mark an element as non-editable when Studio can edit it directly", async () => {
    const document = createDocument(`
      <div data-composition-id="main">
        <div id="card">Editable</div>
      </div>
    `);

    const element = document.getElementById("card") as HTMLElement;
    const selection = await resolveDomEditSelection(element, {
      activeCompositionPath: null,
      isMasterView: false,
    });

    expect(getDomEditNonEditableReason(element, selection)).toBeNull();
  });

  it("keeps duplicate class targets distinct for history keys", () => {
    const first = getDomEditTargetKey({
      sourceFile: "index.html",
      selector: ".card",
      selectorIndex: 0,
    });
    const second = getDomEditTargetKey({
      sourceFile: "index.html",
      selector: ".card",
      selectorIndex: 1,
    });

    expect(first).not.toBe(second);
  });

  it("reads a preview prefix only from a URL, not from a project folder named preview", () => {
    expect(normalizeTimelineCompositionSource("sections/preview/x.html")).toBe(
      "sections/preview/x.html",
    );
    expect(
      normalizeTimelineCompositionSource(
        "http://localhost:5190/api/projects/p/preview/sections/x.html",
      ),
    ).toBe("sections/x.html");
    expect(normalizeTimelineCompositionSource("/api/projects/p/preview/comp/sections/x.html")).toBe(
      "sections/x.html",
    );
  });

  it("names a repeated section by its authored id, not its runtime instance id", () => {
    const document = createDocument(`
      <div data-composition-id="benefit-fresh__hf2" data-hf-original-composition-id="benefit-fresh"></div>
    `);

    expect(buildElementLabel(document.querySelector("div") as HTMLElement)).toBe("Benefit Fresh");
  });

  it("finds a composition host authored with a ./ path", () => {
    const document = createDocument(`
      <div data-composition-id="scene" data-composition-file="./compositions/scene.html"></div>
    `);

    expect(
      findElementForTimelineElement(
        document,
        { id: "scene", compositionSrc: "./compositions/scene.html" },
        { activeCompositionPath: null, isMasterView: true },
      )?.getAttribute("data-composition-id"),
    ).toBe("scene");
  });

  it("resolves generated timeline ids without throwing", () => {
    const document = createDocument(`
      <div data-composition-id="hook">
        <div class="topline">Topline</div>
      </div>
    `);

    expect(
      findElementForTimelineElement(
        document,
        { id: "index.html:Hyperframes Logo Light:0", sourceFile: "index.html" },
        {
          activeCompositionPath: null,
          isMasterView: true,
        },
      ),
    ).toBeNull();
  });

  it("falls back to the root composition for standalone manifest clips without DOM targets", () => {
    const document = createDocument(`
      <div data-composition-id="hook">
        <div class="topline">Topline</div>
        <div class="scene-shell">Scene</div>
      </div>
    `);
    const root = document.querySelector("[data-composition-id]") as HTMLElement;

    expect(
      findElementForTimelineElement(
        document,
        { id: "compositions/hook.html:Hyperframes Logo Light:0" },
        {
          activeCompositionPath: "compositions/hook.html",
          isMasterView: false,
        },
      ),
    ).toBe(root);
  });

  it("resolves the standalone composition root when the fallback clip carries source metadata", () => {
    const document = createDocument(`
      <div data-composition-id="manual">
        <div class="scene-shell">Scene</div>
      </div>
    `);
    const root = document.querySelector("[data-composition-id]") as HTMLElement;

    expect(
      findElementForTimelineElement(
        document,
        {
          id: "manual",
          compositionSrc: "compositions/manual.html",
          selector: '[data-composition-id="manual"]',
          sourceFile: "compositions/manual.html",
        },
        {
          activeCompositionPath: "compositions/manual.html",
          isMasterView: false,
        },
      ),
    ).toBe(root);
  });

  it("normalizes preview URLs when resolving master timeline composition clips", () => {
    const document = createDocument(`
      <div data-composition-id="main">
        <div
          id="slide-1"
          data-composition-id="slide-core-conviction"
          data-composition-src="compositions/slide-01-core-conviction.html"
        >
          <h1>Core Conviction</h1>
        </div>
      </div>
    `);
    const slide = document.getElementById("slide-1") as HTMLElement;

    expect(
      findElementForTimelineElement(
        document,
        {
          id: "slide-1",
          compositionSrc:
            "http://127.0.0.1:5176/api/projects/apple-presentation-download/preview/compositions/slide-01-core-conviction.html",
        },
        {
          activeCompositionPath: null,
          isMasterView: true,
        },
      ),
    ).toBe(slide);
  });

  it("does not fall back to the root composition when an explicit timeline selector misses", () => {
    const document = createDocument(`
      <div data-composition-id="hook">
        <div class="topline">Topline</div>
      </div>
    `);

    expect(
      findElementForTimelineElement(
        document,
        { selector: ".missing", sourceFile: "compositions/hook.html" },
        {
          activeCompositionPath: "compositions/hook.html",
          isMasterView: false,
        },
      ),
    ).toBeNull();
  });
});

describe("patch builders and prompt builder", () => {
  it("builds style patch operations", () => {
    expect(buildDomEditStylePatchOperation("background-color", "rgb(15, 23, 42)")).toEqual({
      type: "inline-style",
      property: "background-color",
      value: "rgb(15, 23, 42)",
    });
  });

  it("builds an agent prompt with source and selector context", () => {
    const selection = {
      element: {} as HTMLElement,
      id: "editable-card",
      selector: "#editable-card",
      selectorIndex: undefined,
      sourceFile: "index.html",
      compositionPath: "index.html",
      compositionSrc: undefined,
      isCompositionHost: false,
      label: "Drag me first",
      tagName: "div",
      boundingBox: { x: 108, y: 112, width: 380, height: 196 },
      textContent: "Drag me first",
      dataAttributes: {},
      inlineStyles: {
        left: "108px",
        top: "112px",
        width: "380px",
        height: "196px",
      },
      computedStyles: {
        position: "absolute",
        left: "108px",
        top: "112px",
        width: "380px",
        height: "196px",
        color: "rgb(248, 250, 252)",
      },
      textFields: [
        {
          key: "self:0:div",
          label: "Content",
          value: "Drag me first",
          tagName: "div",
          attributes: [],
          inlineStyles: {},
          computedStyles: {},
          source: "self",
        },
      ],
      capabilities: {
        canSelect: true,
        canEditStyles: true,
        canMove: true,
        canResize: true,
        canApplyManualOffset: true,
        canApplyManualSize: true,
        canApplyManualRotation: true,
      },
    } satisfies DomEditSelection;

    const prompt = buildElementAgentPrompt({
      selection,
      currentTime: 1.25,
      tagSnippet: `<div id="editable-card" style="position:absolute; left: 108px; top: 112px; width: 380px; height: 196px; color: rgb(248, 250, 252)"`,
    });

    expect(prompt).toContain("## HyperFrames element edit request v1");
    expect(prompt).toContain("Schema version: 1");
    expect(prompt).toContain("Source file: index.html");
    expect(prompt).toContain("Selector: #editable-card");
    expect(prompt).toContain("Playback time:");
    expect(prompt).toContain("Text fields:");
    expect(prompt).toContain('key=self:0:div; tag=<div>; source=self; text="Drag me first"');
    expect(prompt).toContain("Inline styles:");
    expect(prompt).toContain("Computed styles (browser-resolved):");
    expect(prompt).toContain("Target HTML:");
    expect(prompt).toContain("Guardrails:");
    expect(prompt).toContain("Do not modify other elements' data-* attributes or positioning");
  });

  it("uses an absolute source path in copied agent prompts when provided", () => {
    const selection = {
      element: {} as HTMLElement,
      id: "editable-card",
      selector: "#editable-card",
      selectorIndex: undefined,
      sourceFile: "index.html",
      compositionPath: "index.html",
      compositionSrc: undefined,
      isCompositionHost: false,
      label: "Drag me first",
      tagName: "div",
      boundingBox: { x: 108, y: 112, width: 380, height: 196 },
      textContent: "Drag me first",
      dataAttributes: {},
      inlineStyles: {},
      computedStyles: {},
      textFields: [],
      capabilities: {
        canSelect: true,
        canEditStyles: true,
        canMove: true,
        canResize: true,
        canApplyManualOffset: true,
        canApplyManualSize: true,
        canApplyManualRotation: true,
      },
    } satisfies DomEditSelection;

    const prompt = buildElementAgentPrompt({
      selection,
      currentTime: 1.25,
      sourceFilePath: "/tmp/hf-studio-project/index.html",
    });

    expect(prompt).toContain("Source file: /tmp/hf-studio-project/index.html");
    expect(prompt).not.toContain("Source file: index.html");
  });

  it("includes raster click context in copied agent prompts", () => {
    const selection = {
      element: {} as HTMLElement,
      id: undefined,
      selector: ".hero-bg",
      selectorIndex: undefined,
      sourceFile: "index.html",
      compositionPath: "index.html",
      compositionSrc: undefined,
      isCompositionHost: false,
      label: "Hero Bg",
      tagName: "img",
      boundingBox: { x: 0, y: 0, width: 1920, height: 1080 },
      textContent: null,
      dataAttributes: {},
      inlineStyles: {},
      computedStyles: {},
      textFields: [],
      capabilities: {
        canSelect: true,
        canEditStyles: true,
        canMove: true,
        canResize: true,
        canApplyManualOffset: true,
        canApplyManualSize: true,
        canApplyManualRotation: true,
      },
    } satisfies DomEditSelection;

    const prompt = buildElementAgentPrompt({
      selection,
      currentTime: 3,
      selectionContext:
        "The user clicked visible text that is baked into the selected image/background.",
      userInstruction: "Change the title copy.",
    });

    expect(prompt).toContain("Selection context:");
    expect(prompt).toContain(
      "The user clicked visible text that is baked into the selected image/background.",
    );
    expect(prompt).toContain("Change the title copy.");
  });

  it("serializes child text fields back into HTML", () => {
    expect(
      serializeDomEditTextFields([
        {
          key: "child:0:strong",
          label: "Text 1",
          value: "Headline <1>",
          tagName: "strong",
          attributes: [],
          inlineStyles: {
            "font-size": "22px",
          },
          computedStyles: {},
          source: "child",
        },
        {
          key: "child:1:span",
          label: "Text 2",
          value: "Details & more",
          tagName: "span",
          attributes: [],
          inlineStyles: {},
          computedStyles: {},
          source: "child",
        },
      ]),
    ).toBe(
      '<strong data-hf-text-key="child:0:strong" style="font-size: 22px">Headline &lt;1&gt;</strong><span data-hf-text-key="child:1:span">Details &amp; more</span>',
    );
  });

  it("collects nested timeline layers with stable keys and child counts", () => {
    const doc = createDocument(`
      <div data-composition-id="hook" data-composition-file="compositions/hook.html">
        <section class="scene-shell">
          <div class="topline">
            <span class="brand">HyperFrames</span>
            <span class="badge">Alpha</span>
          </div>
        </section>
      </div>
    `);
    const root = doc.querySelector(".scene-shell") as HTMLElement;
    const layers = collectDomEditLayerItems(root, {
      activeCompositionPath: "compositions/hook.html",
      isMasterView: false,
    });

    expect(
      countDomEditChildLayers(root, {
        activeCompositionPath: "compositions/hook.html",
        isMasterView: false,
      }),
    ).toBe(3);
    expect(layers.map((layer) => layer.label)).toEqual([
      "Scene Shell",
      "Topline",
      "Brand",
      "Badge",
    ]);
    expect(layers[0]?.childCount).toBe(1);
    expect(layers.find((layer) => layer.label === "Brand")?.key).toBe(
      "compositions/hook.html:.brand:0",
    );
  });

  it("collects timeline layers with SVG descendants without crashing", () => {
    const doc = createDocument(`
      <div data-composition-id="hook" data-composition-file="compositions/hook.html">
        <section class="scene-shell">
          <svg class="brand-mark" viewBox="0 0 24 24">
            <path class="brand-path" d="M0 0h24v24H0z"></path>
          </svg>
          <div class="title">HyperFrames</div>
        </section>
      </div>
    `);
    const root = doc.querySelector(".scene-shell") as HTMLElement;

    expect(() =>
      collectDomEditLayerItems(root, {
        activeCompositionPath: "compositions/hook.html",
        isMasterView: false,
      }),
    ).not.toThrow();
  });
});

describe("hfId — find, key, capabilities (R7 fixes)", () => {
  it("getDomEditTargetKey keeps two hfId-only elements distinct", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = getDomEditTargetKey({ sourceFile: "index.html", hfId: "hf-aaa" } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = getDomEditTargetKey({ sourceFile: "index.html", hfId: "hf-bbb" } as any);
    expect(a).not.toBe(b);
  });

  it("findElementForSelection finds element by data-hf-id when no id or selector", () => {
    const doc = createDocument(`
      <div data-composition-id="root">
        <div data-hf-id="hf-xyz789" class="clip" style="position:absolute;left:0;top:0;width:100px;height:100px;"></div>
      </div>
    `);
    const el = doc.querySelector('[data-hf-id="hf-xyz789"]') as HTMLElement;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = findElementForSelection(doc, { hfId: "hf-xyz789" } as any);
    expect(found).toBe(el);
  });

  it("resolveDomEditCapabilities enables editing for hfId-only element (no CSS selector)", () => {
    const result = resolveDomEditCapabilities({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hfId: "hf-abc" as any,
      selector: undefined,
      inlineStyles: { left: "10px", top: "20px", width: "100px", height: "50px" },
      computedStyles: {
        position: "absolute",
        left: "10px",
        top: "20px",
        width: "100px",
        height: "50px",
      },
      isCompositionHost: false,
      isInsideLockedComposition: false,
      isMasterView: false,
    });
    expect(result.canSelect).toBe(true);
    expect(result.canMove).toBe(true);
  });
});
