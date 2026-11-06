// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { reapplyPositionEditsAfterSeek } from "./manualEditsSeekReapply";
import { STUDIO_BOX_SIZE_ATTR, STUDIO_HEIGHT_PROP, STUDIO_WIDTH_PROP } from "./manualEditsTypes";

/**
 * A resize commit hands the size to a GSAP tween, and a soft reload reverts the
 * old timeline before the new one renders — GSAP restores each tween's recorded
 * starting width on the way out. Nothing else held the size across that window,
 * so the element sat at its stylesheet size for a few hundred milliseconds: the
 * jump after a resize. Worse, the next gesture then started from a box that
 * disagreed with the studio's own vars and snapped on its first move.
 *
 * The seek reapply is what closes the window, and it used to stand aside for
 * exactly the elements that need it — the ones GSAP sizes.
 */
describe("box size survives a seek while GSAP owns the size", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    Reflect.deleteProperty(window, "__timelines");
  });

  function cardSizedByGsap(): HTMLElement {
    const el = document.createElement("div");
    el.id = "card";
    el.setAttribute(STUDIO_BOX_SIZE_ATTR, "true");
    el.style.setProperty(STUDIO_WIDTH_PROP, "305px");
    el.style.setProperty(STUDIO_HEIGHT_PROP, "202px");
    document.body.append(el);
    // A timeline that animates this element's width/height, as the committed
    // resize leaves behind.
    Object.assign(window, {
      __timelines: {
        main: {
          getChildren: () => [{ targets: () => [el], vars: { width: 305, height: 202 } }],
        },
      },
    });
    return el;
  }

  it("re-applies the committed size after the timeline gave it back", () => {
    const el = cardSizedByGsap();
    // The revert: GSAP puts the tween's recorded starting size back.
    el.style.width = "395px";
    el.style.height = "261px";

    reapplyPositionEditsAfterSeek(document);

    expect(el.style.width).toBe("305px");
    expect(el.style.height).toBe("202px");
  });

  it("leaves an element alone once its studio size is cleared", () => {
    const el = cardSizedByGsap();
    el.style.removeProperty(STUDIO_WIDTH_PROP);
    el.style.removeProperty(STUDIO_HEIGHT_PROP);
    el.style.width = "395px";

    reapplyPositionEditsAfterSeek(document);

    expect(el.style.width).toBe("395px");
  });
});
