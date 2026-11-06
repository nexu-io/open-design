// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";
import { ensureHfIds } from "@hyperframes/parsers/hf-ids";

const stamping = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@hyperframes/parsers/hf-ids", async (importOriginal) => {
  const real = await importOriginal<typeof import("@hyperframes/parsers/hf-ids")>();
  return {
    ...real,
    ensureHfIds: (html: string) => {
      stamping.calls += 1;
      return real.ensureHfIds(html);
    },
  };
});
import {
  applyUndoRestoreToPreview,
  diffSoftReloadableRestore,
  showRestoreInPlace,
} from "./gsapUndoRestore";
import { recordLiveSet } from "./softReloadTargets";
import { applyPatch } from "./sourcePatcher";
import { beginStudioManualEditGesture } from "../components/editor/manualEdits";
import { studioManualEditSavesIn } from "../components/editor/manualEditsDom";
import { writePlainMove, writeTranslatePx } from "../components/editor/plainTranslate";

// ── Bug 2: undo/redo restore soft-apply ──────────────────────────────────────

const wrap = (body: string) => `<html><body>${body}</body></html>`;

describe("diffSoftReloadableRestore", () => {
  it("reports the changed id for an attribute/inline-style-only diff", () => {
    const prev = wrap(`<div id="a" style="translate: 10px 10px">t</div>`);
    const next = wrap(`<div id="a" style="translate: 0px 0px">t</div>`);
    expect(diffSoftReloadableRestore(prev, next)).toEqual({ changedElementKeys: ["id:a"] });
  });

  it("identifies id-less elements by data-hf-id (selector-targeted clips)", () => {
    const prev = wrap(`<div class="sub" data-hf-id="hf-x1" style="z-index: 3">t</div>`);
    const next = wrap(`<div class="sub" data-hf-id="hf-x1" style="z-index: 8">t</div>`);
    expect(diffSoftReloadableRestore(prev, next)).toEqual({ changedElementKeys: ["hf:hf-x1"] });
  });

  it("fails closed when fallback ids are duplicated without unique data-hf-ids", () => {
    const prev = wrap(
      `<div id="dup" style="z-index: 8">first</div><div id="dup" style="z-index: 9">last</div>`,
    );
    const next = wrap(
      `<div id="dup" style="z-index: 3">first</div><div id="dup" style="z-index: 9">last</div>`,
    );
    expect(diffSoftReloadableRestore(prev, next)).toBeNull();
  });

  it("a child change inside an identified CONTAINER is soft (nested identities)", () => {
    // The composition root wraps every clip — the old innerHTML comparison at
    // the root re-detected the child's change and forced a full reload.
    const prev = wrap(
      `<div id="main" data-duration="42"><div class="sub" data-hf-id="hf-x1" data-start="39">t</div></div>`,
    );
    const next = wrap(
      `<div id="main" data-duration="39"><div class="sub" data-hf-id="hf-x1" data-start="26">t</div></div>`,
    );
    expect(diffSoftReloadableRestore(prev, next)).toEqual({
      changedElementKeys: ["id:main", "hf:hf-x1"],
    });
  });

  it("a changed data-hf-id itself is structural — NOT soft-reloadable", () => {
    const prev = wrap(`<div data-hf-id="hf-x1">t</div>`);
    const next = wrap(`<div data-hf-id="hf-x2">t</div>`);
    expect(diffSoftReloadableRestore(prev, next)).toBeNull();
  });

  it("treats a structural change (added element) as NOT soft-reloadable", () => {
    const prev = wrap(`<div id="a">t</div>`);
    const next = wrap(`<div id="a">t</div><div id="a-split">t</div>`);
    expect(diffSoftReloadableRestore(prev, next)).toBeNull();
  });

  it("treats an element text/child change as NOT soft-reloadable", () => {
    const prev = wrap(`<div id="a">one</div>`);
    const next = wrap(`<div id="a">two</div>`);
    expect(diffSoftReloadableRestore(prev, next)).toBeNull();
  });

  it("allows a GSAP-script-only change (no id'd-attribute diff)", () => {
    const prev = wrap(
      `<div id="a">t</div><script>window.__timelines["root"]=gsap.timeline().to("#a",{x:1});</script>`,
    );
    const next = wrap(
      `<div id="a">t</div><script>window.__timelines["root"]=gsap.timeline().to("#a",{x:9});</script>`,
    );
    expect(diffSoftReloadableRestore(prev, next)).toEqual({ changedElementKeys: [] });
  });
});

function buildLiveIframe(bodyHtml: string) {
  const doc = document.implementation.createHTMLDocument("");
  doc.body.innerHTML = bodyHtml;
  const contentWindow = {
    gsap: { timeline: () => {} },
    __hfForceTimelineRebind: () => {},
    __timelines: {} as Record<string, unknown>,
    __player: { getTime: () => 3, seek: vi.fn() },
    __hfStudioManualEditsApply: vi.fn(),
  };
  return {
    iframe: { contentWindow, contentDocument: doc } as unknown as HTMLIFrameElement,
    contentWindow,
    doc,
  };
}

describe("applyUndoRestoreToPreview", () => {
  const ROOT = "index.html";

  it("takes GSAP's composed transform off the preview it is about to reload", () => {
    // Undoing "enable keyframes" removes the script: no in-place patch expresses that, so the
    // preview reloads — and until it lands it shows where the timeline last put the box, though
    // the file it is going back to places it with CSS and no inline transform at all.
    const tween = `window.__timelines["root"]=gsap.timeline().to("#a",{x:139.893,y:-195.508});`;
    const film = (box: string, script: string) =>
      `<div data-composition-id="root"><div id="a"${box}>a</div></div>${script}`;
    const composed = ` style="transform: translate(139.893px, -195.508px)"`;
    const { iframe, doc } = buildLiveIframe(film(composed, `<script>${tween}</script>`));
    recordLiveSet(doc.getElementById("a")!, { x: 139.893, y: -195.508 });
    const files = {
      [ROOT]: {
        previous: wrap(film("", `<script>${tween}</script>`)),
        restored: wrap(film("", "")),
      },
    };

    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, vi.fn())).toBe("full");

    expect(doc.getElementById("a")!.style.transform).toBe("");
  });

  it("leaves a still-animated element alone when the restore only removes another", () => {
    // Nothing about the animation changed: #a is where the live timeline put it, and the reload
    // re-renders it. Clearing it here would flash the box back to its authored place first.
    const script = `window.__timelines["root"]=gsap.timeline().to("#a",{x:100});`;
    const film = (body: string) =>
      `<div data-composition-id="root">${body}</div><script>${script}</script>`;
    const { iframe, doc } = buildLiveIframe(
      film(`<div id="a" style="transform: translate(100px, 0px)">a</div><div id="b">b</div>`),
    );
    recordLiveSet(doc.getElementById("a")!, { x: 100 });
    const files = {
      [ROOT]: {
        previous: wrap(film(`<div id="a">a</div><div id="b">b</div>`)),
        restored: wrap(film(`<div id="a">a</div>`)),
      },
    };

    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, vi.fn())).toBe("full");

    expect(doc.getElementById("a")!.style.transform).toBe("translate(100px, 0px)");
  });

  it("never stamps an undo whose sides are both already stamped", () => {
    const film = (color: string) =>
      `<div id="root" data-composition-id="root"><div id="target" style="background-color: ${color}">T</div><p>caption</p></div>`;
    const blue = ensureHfIds(film("blue"));
    const red = blue.replace("background-color: blue", "background-color: red");
    const { iframe } = buildLiveIframe(red);
    stamping.calls = 0;

    const files = { [ROOT]: { previous: wrap(red), restored: wrap(blue) } };
    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, vi.fn())).toBe("soft");
    expect(stamping.calls).toBe(0);
  });

  it("repaints in place an undo back to the film before Studio first stamped it", () => {
    const film = (color: string) =>
      `<div id="root" data-composition-id="root"><div id="target" style="background-color: ${color}">T</div><p>caption</p></div>`;
    // The preview stamped the film as it loaded; the first edit wrote those stamps with its red.
    const edited = ensureHfIds(film("blue")).replace(
      "background-color: blue",
      "background-color: red",
    );
    const { iframe, doc } = buildLiveIframe(edited);
    const reloadPreview = vi.fn();
    const files = { [ROOT]: { previous: wrap(edited), restored: wrap(film("blue")) } };

    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview)).toBe("soft");
    expect(reloadPreview).not.toHaveBeenCalled();
    expect((doc.getElementById("target") as HTMLElement).style.backgroundColor).toBe("blue");
  });

  it("soft-applies an attribute/style-only restore: syncs the live element, no full reload", () => {
    const { iframe, contentWindow, doc } = buildLiveIframe(
      `<div id="a" style="translate: 10px 10px" data-hf-path-offset="true">t</div>`,
    );
    const reloadPreview = vi.fn();
    const files = {
      [ROOT]: {
        previous: wrap(
          `<div id="a" style="translate: 10px 10px" data-hf-path-offset="true">t</div>`,
        ),
        restored: wrap(`<div id="a" style="translate: 0px 0px" data-hf-path-offset="true">t</div>`),
      },
    };
    const outcome = applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview);
    expect(outcome).toBe("soft");
    expect(reloadPreview).not.toHaveBeenCalled();
    // Live element reverted to the restored inline style.
    expect(doc.getElementById("a")!.getAttribute("style")).toBe("translate: 0px 0px");
    // No GSAP script in the restore → the manual-edit reapply runs, playhead held.
    expect(contentWindow.__player.seek).toHaveBeenCalledWith(3);
    expect(contentWindow.__hfStudioManualEditsApply).toHaveBeenCalled();
  });

  it("syncs a data-hf-id-identified live element (no DOM id) without reloading", () => {
    const { iframe, doc } = buildLiveIframe(
      `<div class="sub" data-hf-id="hf-x1" style="z-index: 8">t</div>`,
    );
    const reloadPreview = vi.fn();
    const files = {
      [ROOT]: {
        previous: wrap(`<div class="sub" data-hf-id="hf-x1" style="z-index: 8">t</div>`),
        restored: wrap(`<div class="sub" data-hf-id="hf-x1" style="z-index: 3">t</div>`),
      },
    };
    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview)).toBe("soft");
    expect(reloadPreview).not.toHaveBeenCalled();
    expect(doc.querySelector('[data-hf-id="hf-x1"]')!.getAttribute("style")).toBe("z-index: 3");
  });

  it.each([
    { label: "first", firstRestored: 3, lastRestored: 9 },
    { label: "last", firstRestored: 8, lastRestored: 3 },
  ])(
    "soft-restores the $label element when authored ids are duplicated",
    ({ firstRestored, lastRestored }) => {
      const markup = (firstZ: number, lastZ: number) =>
        `<div id="dup" data-hf-id="hf-first" style="z-index: ${firstZ}">first</div>` +
        `<div id="dup" data-hf-id="hf-last" style="z-index: ${lastZ}">last</div>`;
      const { iframe, doc } = buildLiveIframe(markup(8, 9));
      const reloadPreview = vi.fn();
      const files = {
        [ROOT]: {
          previous: wrap(markup(8, 9)),
          restored: wrap(markup(firstRestored, lastRestored)),
        },
      };

      expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview)).toBe("soft");
      expect(reloadPreview).not.toHaveBeenCalled();
      expect(doc.querySelector('[data-hf-id="hf-first"]')!.getAttribute("style")).toBe(
        `z-index: ${firstRestored}`,
      );
      expect(doc.querySelector('[data-hf-id="hf-last"]')!.getAttribute("style")).toBe(
        `z-index: ${lastRestored}`,
      );
    },
  );

  describe("an undo that re-runs a changed script matches a fresh load of the restored file", () => {
    const script = (extra: string) => `window.__timelines["root"]=gsap.timeline();${extra}`;
    const root = (body: string) => `<div data-composition-id="root">${body}</div>`;
    const undoScriptEdit = (
      live: string,
      authored: string,
      edit: string,
      patchedLive?: (doc: Document) => void,
    ) => {
      const { iframe, contentWindow, doc } = buildLiveIframe(
        `${root(live)}<script>${script(patchedLive ? "" : edit)}</script>`,
      );
      patchedLive?.(doc);
      const clearProps = (targets: HTMLElement[]) =>
        targets.forEach((t) => t.removeAttribute("style"));
      Object.assign(contentWindow.gsap, { set: clearProps });
      for (const el of doc.querySelectorAll("[style*=transform]")) Object.assign(el, { _gsap: {} });
      const files = {
        [ROOT]: {
          previous: wrap(`${root(authored)}<script>${script(edit)}</script>`),
          restored: wrap(`${root(authored)}<script>${script("")}</script>`),
        },
      };
      expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, vi.fn())).toBe("soft");
      return doc;
    };

    it("drops the size marks a resize left on the live element", () => {
      const doc = undoScriptEdit(
        `<div id="a" data-hf-studio-box-size="true" style="width: 502px; --hf-studio-width: 502px; --hf-studio-height: 334px">t</div>`,
        `<div id="a" style="width: 300px">t</div>`,
        `tl.set("#a",{width:502,height:334},0);`,
      );
      expect(doc.getElementById("a")!.hasAttribute("data-hf-studio-box-size")).toBe(false);
      expect(doc.getElementById("a")!.getAttribute("style")).toBe("width: 300px");
    });

    it("drops the width a W edit set live, though the preview never ran its gsap.set", () => {
      // The Design panel applies W to the live element and writes the set only to the file.
      const doc = undoScriptEdit(
        `<div id="a" style="left: 10px; width: 300px">t</div>`,
        `<div id="a" style="left: 10px">t</div>`,
        `gsap.set("#a",{width:300});`,
        (live) => recordLiveSet(live.getElementById("a")!, { width: 300 }),
      );
      const { style } = doc.getElementById("a")!;
      expect([style.width, style.left]).toEqual(["", "10px"]);
    });

    it("keeps the authored inline rotation of an element GSAP moved", () => {
      const doc = undoScriptEdit(
        `<div id="r" style="left: 10px; transform: translate(116px, 72px) rotate(20deg)">t</div>`,
        `<div id="r" style="left: 10px; transform: rotate(20deg)">t</div>`,
        `gsap.set("#r",{x:116,y:72});`,
      );
      expect(doc.getElementById("r")!.style.transform).toBe("rotate(20deg)");
    });

    it("drops the translate mask GSAP wrote over a stylesheet translate", () => {
      const doc = undoScriptEdit(
        `<h1 id="t" style="opacity: 0.5; translate: none; transform: translate(116px, -113px)">t</h1>`,
        `<h1 id="t">t</h1>`,
        `gsap.set("#t",{x:116,y:-113});`,
      );
      expect(doc.getElementById("t")!.style.getPropertyValue("translate")).toBe("");
    });
  });

  it("full-reloads without partially restoring when any changed live target is missing", () => {
    const { iframe, doc } = buildLiveIframe(`<div id="a" style="z-index: 8">a</div>`);
    const reloadPreview = vi.fn();
    const files = {
      [ROOT]: {
        previous: wrap(
          `<div id="a" style="z-index: 8">a</div><div id="b" style="z-index: 8">b</div>`,
        ),
        restored: wrap(
          `<div id="a" style="z-index: 3">a</div><div id="b" style="z-index: 3">b</div>`,
        ),
      },
    };

    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview)).toBe("full");
    expect(reloadPreview).toHaveBeenCalledTimes(1);
    // Target a resolved first, but the preflight found missing b before syncing either.
    expect(doc.getElementById("a")!.getAttribute("style")).toBe("z-index: 8");
  });

  it("counts a script-only restore applied in place, so a reload requested before it loads again", () => {
    const script = (x: number) => `window.__timelines["root"]=gsap.timeline().to("#a",{x:${x}});`;
    const page = (x: number) => `<div id="a">t</div><script>${script(x)}</script>`;
    const { iframe, doc } = buildLiveIframe(page(2));
    const before = studioManualEditSavesIn(doc);
    const files = { [ROOT]: { previous: wrap(page(2)), restored: wrap(page(1)) } };
    applyUndoRestoreToPreview(iframe, ROOT, files, 3, vi.fn());
    expect(studioManualEditSavesIn(doc)).toBeGreaterThan(before);
  });

  it("does NOT re-run an UNCHANGED GSAP script for an attribute-only restore", () => {
    // The live doc holds a script element; a re-run would mutate/remove it
    // (applySoftReload removes stale script elements before re-running).
    const script = `window.__timelines["root"]=gsap.timeline().to("#a",{x:1});`;
    const { iframe, contentWindow, doc } = buildLiveIframe(
      `<div id="a" style="z-index: 8">t</div><script>${script}</script>`,
    );
    const reloadPreview = vi.fn();
    const files = {
      [ROOT]: {
        previous: wrap(`<div id="a" style="z-index: 8">t</div><script>${script}</script>`),
        restored: wrap(`<div id="a" style="z-index: 3">t</div><script>${script}</script>`),
      },
    };
    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview)).toBe("soft");
    expect(reloadPreview).not.toHaveBeenCalled();
    // The live script element is untouched — rebind-only finalization ran instead.
    expect(doc.querySelectorAll("script")).toHaveLength(1);
    expect(doc.querySelector("script")!.textContent).toBe(script);
    expect(contentWindow.__player.seek).toHaveBeenCalledWith(3);
    expect(contentWindow.__hfStudioManualEditsApply).toHaveBeenCalled();
    expect(doc.getElementById("a")!.getAttribute("style")).toBe("z-index: 3");
  });

  it("full-reloads a changed two-script restore without partially touching the live DOM", () => {
    const previousScripts = [
      `window.__timelines["root"]=gsap.timeline().to("#a",{x:1});`,
      `window.__timelines["captions"]=gsap.timeline().to("#a",{y:1});`,
    ];
    const restoredScripts = previousScripts.map((script) => script.replace(":1", ":9"));
    const scripts = (values: string[]) =>
      values.map((value) => `<script>${value}</script>`).join("");
    const { iframe, doc } = buildLiveIframe(
      `<div id="a" style="z-index: 8">t</div>${scripts(previousScripts)}`,
    );
    const reloadPreview = vi.fn();
    const files = {
      [ROOT]: {
        previous: wrap(`<div id="a" style="z-index: 8">t</div>${scripts(previousScripts)}`),
        restored: wrap(`<div id="a" style="z-index: 3">t</div>${scripts(restoredScripts)}`),
      },
    };

    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview)).toBe("full");
    expect(reloadPreview).toHaveBeenCalledTimes(1);
    expect(doc.getElementById("a")!.getAttribute("style")).toBe("z-index: 8");
    expect([...doc.querySelectorAll("script")].map((script) => script.textContent)).toEqual(
      previousScripts,
    );
  });

  it("full-reloads a style restore on a GSAP-parsed element when the file has two scripts", () => {
    const scripts = [
      `<script>window.__timelines["root"]=gsap.timeline().to("#a",{x:1});</script>`,
      `<script>window.__timelines["captions"]=gsap.timeline().to("#a",{y:1});</script>`,
    ].join("");
    const { iframe, doc } = buildLiveIframe(`<div id="a" style="z-index: 8">t</div>${scripts}`);
    Object.assign(doc.getElementById("a")!, { _gsap: {} });
    const reloadPreview = vi.fn();
    const files = {
      [ROOT]: {
        previous: wrap(`<div id="a" style="z-index: 8">t</div>${scripts}`),
        restored: wrap(`<div id="a" style="z-index: 3">t</div>${scripts}`),
      },
    };

    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview)).toBe("full");
    expect(reloadPreview).toHaveBeenCalledTimes(1);
  });

  it("full-reloads a multi-file restore", () => {
    const { iframe } = buildLiveIframe(`<div id="a">t</div>`);
    const reloadPreview = vi.fn();
    const files = {
      [ROOT]: {
        previous: wrap(`<div id="a" style="x">t</div>`),
        restored: wrap(`<div id="a">t</div>`),
      },
      "scenes/intro.html": { previous: "a", restored: "b" },
    };
    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview)).toBe("full");
    expect(reloadPreview).toHaveBeenCalledTimes(1);
  });

  it("full-reloads a structural restore (split/delete undo)", () => {
    const { iframe } = buildLiveIframe(`<div id="a">t</div><div id="a-split">t</div>`);
    const reloadPreview = vi.fn();
    const files = {
      [ROOT]: {
        previous: wrap(`<div id="a">t</div><div id="a-split">t</div>`),
        restored: wrap(`<div id="a">t</div>`),
      },
    };
    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview)).toBe("full");
    expect(reloadPreview).toHaveBeenCalledTimes(1);
  });

  it("blanks a restored scene's live hash before reloading, so the scene swap takes it", () => {
    const { iframe, doc } = buildLiveIframe(
      `<div data-hf-scene="scene0" data-composition-file="scenes/intro.html"><h1>Rep0</h1></div>` +
        `<div data-hf-scene="scene1" data-composition-file="scenes/outro.html"></div>`,
    );
    const meta = doc.createElement("meta");
    meta.name = "hf-scene-parts";
    meta.content = JSON.stringify({ shared: "s", scenes: { scene0: "h0", scene1: "h1" } });
    doc.head.append(meta);
    let partsAtReload: unknown;
    const reloadPreview = vi.fn(() => (partsAtReload = JSON.parse(meta.content)));
    const files = {
      "scenes/intro.html": { previous: "<h1>Rep0</h1>", restored: "<h1>Alpha</h1>" },
    };
    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview)).toBe("full");
    expect(partsAtReload).toEqual({ shared: "s", scenes: { scene0: "", scene1: "h1" } });

    const withRoot = {
      ...files,
      [ROOT]: { previous: wrap("<p>b</p>"), restored: wrap("<p>a</p>") },
    };
    applyUndoRestoreToPreview(iframe, ROOT, withRoot, 3, reloadPreview);
    // A restored page outside every scene forces the full reload, never a partial swap.
    expect(partsAtReload).toEqual({ shared: "", scenes: { scene0: "", scene1: "h1" } });
  });

  it("leaves the scene hashes alone on a soft restore, so the next edit can still swap", () => {
    const { iframe, doc } = buildLiveIframe(`<div id="a" style="color: red">t</div>`);
    const meta = doc.createElement("meta");
    meta.name = "hf-scene-parts";
    meta.content = JSON.stringify({ shared: "s", scenes: { scene0: "h0" } });
    doc.head.append(meta);
    const files = {
      [ROOT]: {
        previous: wrap(`<div id="a" style="color: red">t</div>`),
        restored: wrap(`<div id="a" style="color: blue">t</div>`),
      },
    };
    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, vi.fn())).toBe("soft");
    expect(JSON.parse(meta.content)).toEqual({ shared: "s", scenes: { scene0: "h0" } });
  });

  it.each([
    ["a restored stylesheet leaves the shared hash", "styles.css", '{"shared":"s","scenes":{}}'],
    ["an unreadable manifest still reloads", "scenes/intro.html", "not json"],
  ])("%s", (_name, path, content) => {
    const { iframe, doc } = buildLiveIframe(`<div id="a">t</div>`);
    const meta = doc.createElement("meta");
    meta.name = "hf-scene-parts";
    meta.content = content;
    doc.head.append(meta);
    const reloadPreview = vi.fn();
    const files = { [path]: { previous: "a", restored: "b" } };
    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview)).toBe("full");
    expect(reloadPreview).toHaveBeenCalledTimes(1);
    expect(meta.content).toBe(content);
  });

  const SUB = "compositions/sub.html";
  const sub = (style: string, rootAttrs = "") =>
    `<template id="sub-template"><div data-hf-id="hf-root" id="sub" data-composition-id="sub"${rootAttrs}><div ${style} data-hf-id="hf-t" id="target"></div></div></template>`;
  const host = (style: string) =>
    `<div data-composition-file="${SUB}" data-hf-id="hf-host"><div data-hf-inner-root="true" data-hf-authored-id="sub" data-hf-id="hf-root"><div data-hf-id="hf-t" id="target" ${style}></div></div></div>`;

  it("restores a sub-composition file in place, on every host that inlines it", () => {
    const { iframe, doc } = buildLiveIframe(
      host(`style="clip-path: inset(0px 40px 0px 0px);"`) +
        host(`style="clip-path: inset(0px 40px 0px 0px);"`),
    );
    const reloadPreview = vi.fn();
    const files = {
      [SUB]: { previous: sub(`style="clip-path: inset(0px 40px 0px 0px)"`), restored: sub("") },
    };
    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview)).toBe("soft");
    expect(reloadPreview).not.toHaveBeenCalled();
    const targets = [...doc.querySelectorAll('[data-hf-id="hf-t"]')];
    expect(targets.map((el) => el.getAttribute("style"))).toEqual([null, null]);
  });

  it("full-reloads a sub-composition restore that changes the file's own root", () => {
    const { iframe } = buildLiveIframe(host(""));
    const reloadPreview = vi.fn();
    const files = { [SUB]: { previous: sub("", ' data-width="10"'), restored: sub("") } };
    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview)).toBe("full");
    expect(reloadPreview).toHaveBeenCalledTimes(1);
  });

  it("full-reloads a sub-composition restore whose file has a GSAP script", () => {
    const { iframe, doc } = buildLiveIframe(host(`style="clip-path: inset(0px 40px 0px 0px);"`));
    const reloadPreview = vi.fn();
    const script = `<script>gsap.timeline().to("#target", { x: 10 });</script>`;
    const scripted = (style: string) =>
      sub(style).replace("</div></template>", `${script}</div></template>`);
    const files = {
      [SUB]: {
        previous: scripted(`style="clip-path: inset(0px 40px 0px 0px)"`),
        restored: scripted(""),
      },
    };
    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview)).toBe("full");
    expect(reloadPreview).toHaveBeenCalledTimes(1);
    expect(doc.querySelector('[data-hf-id="hf-t"]')?.getAttribute("style")).toContain("clip-path");
  });

  it("full-reloads when the restore touches a sub-comp, not the active comp", () => {
    const { iframe } = buildLiveIframe(`<div id="a">t</div>`);
    const reloadPreview = vi.fn();
    const files = { "scenes/intro.html": { previous: "a", restored: "b" } };
    expect(applyUndoRestoreToPreview(iframe, ROOT, files, 3, reloadPreview)).toBe("full");
    expect(reloadPreview).toHaveBeenCalledTimes(1);
  });
});

describe("an undo that lands while the layer is being dragged", () => {
  const ROOT = "index.html";
  const undone = `<div id="a" style="width: 120px; translate: 90px 60px" data-start="2" data-hf-studio-original-inline-translate="">t</div>`;
  const restored = wrap(`<div id="a" style="width: 100px" data-start="1">t</div>`);
  const files = { [ROOT]: { previous: wrap(undone), restored } };
  const saveDrop = (el: HTMLElement, file: string) =>
    writePlainMove(el, { x: 20, y: 110 }).reduce((html, op) => applyPatch(html, "a", op), file);

  function dragging(drag: boolean) {
    const { iframe, doc } = buildLiveIframe(undone);
    const el = doc.getElementById("a")!;
    if (drag) beginStudioManualEditGesture(el, "move");
    if (drag) writeTranslatePx(el, { x: 70, y: 110 });
    else el.style.setProperty("opacity", "0.5");
    applyUndoRestoreToPreview(iframe, ROOT, files, 3, vi.fn());
    return el;
  }

  it("keeps the translate the drag is drawing and reverts the rest", () => {
    const el = dragging(true);

    expect(el.style.getPropertyValue("translate")).toBe("70px 110px");
    expect(el.style.getPropertyValue("width")).toBe("100px");
    expect(el.getAttribute("data-start")).toBe("1");
    expect(el.hasAttribute("data-hf-studio-manual-edit-gesture")).toBe(true);
  });

  it("saves the drop onto the undone file, the same bytes as dragging the undone layer", () => {
    const el = dragging(true);
    const fresh = new DOMParser().parseFromString(restored, "text/html").getElementById("a")!;

    const saved = saveDrop(el, restored);

    expect(saved).toBe(saveDrop(fresh, restored));
    expect(saved).toContain("width: 100px; translate: 20px 110px");
    expect(saved).not.toContain("120px");
  });

  it("keeps the box where it is when the press has not moved it yet", () => {
    const { iframe, doc } = buildLiveIframe(undone);
    const el = doc.getElementById("a")!;
    beginStudioManualEditGesture(el, "move");

    applyUndoRestoreToPreview(iframe, ROOT, files, 3, vi.fn());

    expect(el.style.getPropertyValue("translate")).toBe("90px 60px");
    expect(el.style.getPropertyValue("width")).toBe("100px");
  });

  it("reverts the translate under a gesture that draws nothing, such as a text edit", () => {
    const { iframe, doc } = buildLiveIframe(undone);
    const el = doc.getElementById("a")!;
    beginStudioManualEditGesture(el, "edit");

    applyUndoRestoreToPreview(iframe, ROOT, files, 3, vi.fn());

    expect(el.style.getPropertyValue("translate")).toBe("");
    expect(el.hasAttribute("data-hf-studio-manual-edit-gesture")).toBe(true);
  });

  it("keeps the drag's translate when the undo is shown in place", () => {
    const { iframe, doc } = buildLiveIframe(undone);
    const el = doc.getElementById("a")!;
    beginStudioManualEditGesture(el, "move");
    writeTranslatePx(el, { x: 70, y: 110 });

    expect(showRestoreInPlace(iframe, ROOT, files, 3)).not.toBeNull();

    expect(el.style.getPropertyValue("translate")).toBe("70px 110px");
    expect(el.style.getPropertyValue("width")).toBe("100px");
  });

  it("counts an undo shown or applied in place, so a reload requested before it loads again", () => {
    const { iframe, doc } = buildLiveIframe(undone);
    const before = studioManualEditSavesIn(doc);

    showRestoreInPlace(iframe, ROOT, files, 3);
    expect(studioManualEditSavesIn(doc)).toBeGreaterThan(before);
    const shown = studioManualEditSavesIn(doc);
    applyUndoRestoreToPreview(iframe, ROOT, files, 3, vi.fn());
    expect(studioManualEditSavesIn(doc)).toBeGreaterThan(shown);
  });

  it("keeps a drag that started after the undo was shown when the undo is put back", () => {
    const { iframe, doc } = buildLiveIframe(undone);
    const el = doc.getElementById("a")!;
    const putBack = showRestoreInPlace(iframe, ROOT, files, 3)!;
    beginStudioManualEditGesture(el, "move");
    writeTranslatePx(el, { x: 70, y: 110 });

    putBack(3);

    expect(el.style.getPropertyValue("translate")).toBe("70px 110px");
    expect(el.style.getPropertyValue("width")).toBe("120px");
  });

  it("keeps the drag's translate when the undo re-runs a GSAP script", () => {
    const script = (extra: string) =>
      `<script>window.__timelines["root"]=gsap.timeline();${extra}</script>`;
    const layer = `<div id="a" data-hf-studio-path-offset="true" style="translate: 40px 30px">t</div>`;
    const { iframe, contentWindow, doc } = buildLiveIframe(
      `${layer}${script("tl.set('#b',{x:1});")}`,
    );
    Object.assign(contentWindow.gsap, { set: () => {} });
    const el = doc.getElementById("a")!;
    beginStudioManualEditGesture(el, "move");
    writeTranslatePx(el, { x: 70, y: 110 });
    const scripted = {
      [ROOT]: {
        previous: wrap(`<div id="a">t</div>${script("tl.set('#b',{x:1});")}`),
        restored: wrap(`<div id="a">t</div>${script("")}`),
      },
    };

    expect(applyUndoRestoreToPreview(iframe, ROOT, scripted, 3, vi.fn())).toBe("soft");

    expect(el.style.getPropertyValue("translate")).toBe("70px 110px");
  });

  it("restores a layer no gesture is drawing exactly as before", () => {
    const el = dragging(false);
    const want = new DOMParser().parseFromString(restored, "text/html").getElementById("a")!;

    expect(el.getAttributeNames().map((n) => [n, el.getAttribute(n)])).toEqual(
      want.getAttributeNames().map((n) => [n, want.getAttribute(n)]),
    );
  });
});
