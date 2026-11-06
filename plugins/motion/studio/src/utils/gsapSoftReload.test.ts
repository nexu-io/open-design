// fallow-ignore-file code-duplication
// @vitest-environment happy-dom

import { patchRuntimeTweenInPlace } from "../hooks/gsapRuntimePatch";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  readNestedFiles,
  applySoftReload,
  applySoftReloadFinalization,
  ensureMotionPathPluginLoaded,
} from "./gsapSoftReload";

const SCRIPT_TEXT = `
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
tl.to("#box", { opacity: 0.8 });
window.__timelines["root"] = tl;
`;

const MOTION_PATH_SCRIPT_TEXT = `
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
tl.to("#box", { motionPath: { path: [{ x: 0, y: 0 }, { x: 100, y: 50 }] } });
window.__timelines["root"] = tl;
`;

function buildMockIframe(overrides: Record<string, unknown> = {}) {
  const scriptEl = document.createElement("script");
  scriptEl.textContent =
    'const tl = gsap.timeline({ paused: true }); tl.to("#box", { opacity: 0.5 });';
  const container = document.createElement("div");
  container.appendChild(scriptEl);

  const mockTimeline = { kill: vi.fn(), pause: vi.fn() };
  const contentWindow = {
    gsap: { timeline: vi.fn() },
    __hfForceTimelineRebind: vi.fn(),
    __timelines: { root: mockTimeline } as Record<string, typeof mockTimeline>,
    __player: { getTime: () => 2.0, seek: vi.fn() },
    __hfStudioManualEditsApply: vi.fn(),
    __hfSuppressSceneMutations: undefined as undefined | (<T>(fn: () => T) => T),
    ...overrides,
  };

  // Intercept appendChild: when a <script> is appended, simulate execution by
  // repopulating __timelines (mimicking what the real GSAP script would do).
  const realAppendChild = container.appendChild.bind(container);
  container.appendChild = <T extends Node>(node: T): T => {
    const result = realAppendChild(node);
    if (node instanceof HTMLScriptElement && node.textContent?.includes("gsap.timeline")) {
      // Simulate the script populating __timelines
      const cw = contentWindow as { __timelines?: Record<string, unknown> };
      if (cw.__timelines) {
        cw.__timelines.root = { kill: vi.fn(), pause: vi.fn() };
      }
    }
    return result;
  };

  const contentDocument = {
    querySelectorAll: (sel: string) => (sel === "script:not([src])" ? [scriptEl] : []),
    createElement: (tag: string) => document.createElement(tag),
    body: container,
    head: document.createElement("div"),
  };

  return {
    iframe: { contentWindow, contentDocument } as unknown as HTMLIFrameElement,
    contentWindow,
    mockTimeline,
    container,
  };
}

/** A mock iframe whose document holds one GSAP script and one composition root; `byId` answers id selectors. */
function iframeWithComposition(script: string, root: Element, byId: Record<string, Element> = {}) {
  const scriptEl = document.createElement("script");
  scriptEl.textContent = script;
  const container = document.createElement("div");
  container.appendChild(scriptEl);
  const { iframe } = buildMockIframe({ gsap: { timeline: vi.fn(), set: vi.fn() } });
  (iframe as unknown as { contentDocument: unknown }).contentDocument = {
    querySelectorAll: (sel: string) =>
      sel === "script:not([src])"
        ? [scriptEl]
        : sel.includes("composition-id")
          ? [root]
          : byId[sel]
            ? [byId[sel]]
            : [],
    createElement: (tag: string) => document.createElement(tag),
    body: container,
    head: document.createElement("div"),
  };
  return iframe;
}

describe("applySoftReload", () => {
  it('returns "cannot-soft-reload" when iframe is null', () => {
    expect(applySoftReload(null, SCRIPT_TEXT)).toBe("cannot-soft-reload");
  });

  it('returns "cannot-soft-reload" when scriptText is empty', () => {
    const { iframe } = buildMockIframe();
    expect(applySoftReload(iframe, "")).toBe("cannot-soft-reload");
  });

  it('returns "cannot-soft-reload" when gsap is not on iframe window', () => {
    const { iframe } = buildMockIframe({ gsap: undefined });
    expect(applySoftReload(iframe, SCRIPT_TEXT)).toBe("cannot-soft-reload");
  });

  it('returns "cannot-soft-reload" when __hfForceTimelineRebind is missing', () => {
    const { iframe } = buildMockIframe({ __hfForceTimelineRebind: undefined });
    expect(applySoftReload(iframe, SCRIPT_TEXT)).toBe("cannot-soft-reload");
  });

  it('returns "cannot-soft-reload" when the script registers no scopable key', () => {
    // No __timelines["key"] pattern → targetKeys is empty → can't scope safely.
    const { iframe } = buildMockIframe();
    expect(applySoftReload(iframe, 'gsap.to("#box", { x: 1 });')).toBe("cannot-soft-reload");
  });

  it("kills existing timelines, rebinds, and re-seeks on success", () => {
    const { iframe, contentWindow, mockTimeline } = buildMockIframe();
    const result = applySoftReload(iframe, SCRIPT_TEXT);
    expect(result).toBe("applied");
    expect(mockTimeline.kill).toHaveBeenCalled();
    expect(contentWindow.__hfForceTimelineRebind).toHaveBeenCalled();
    expect(contentWindow.__player.seek).toHaveBeenCalledWith(2.0);
    expect(contentWindow.__hfStudioManualEditsApply).toHaveBeenCalled();
  });

  it("seeks to the caller-supplied currentTime override instead of the iframe's own __player.getTime()", () => {
    // Regression: the iframe's raw __player.getTime() (2.0 here, per the mock)
    // can desync from the studio's authoritative scrub position — e.g. a
    // keyframe-node drag parks the playhead via the store before this reload's
    // async commit resolves. The rebuilt timeline must re-seek to the caller's
    // value, not the iframe's possibly-stale one.
    const { iframe, contentWindow } = buildMockIframe();
    const result = applySoftReload(iframe, SCRIPT_TEXT, { currentTimeOverride: 0 });
    expect(result).toBe("applied");
    expect(contentWindow.__player.seek).toHaveBeenCalledWith(0);
  });

  it("strips a stale inline transform from an orphaned (non-timeline-child) element", () => {
    // Repro: an element dragged via gsap.set whose keyframes were then removed is
    // no longer a timeline child, so the timeline-children sweep misses it. Its
    // stale inline transform must still be cleared so it snaps back to its source
    // (overlay) position instead of rendering offset.
    const orphan = document.createElement("div");
    orphan.style.cssText = "left: 1240px; top: 200px; transform: translate(449px, 0px)";
    Object.assign(orphan, { _gsap: {} }); // GSAP cache marker (set by gsap.set)

    const root = document.createElement("div");
    root.setAttribute("data-composition-id", "root");
    root.appendChild(orphan);
    const iframe = iframeWithComposition(
      'const tl = gsap.timeline({ paused: true }); tl.to("#x", { x: 1 });',
      root,
    );

    applySoftReload(iframe, SCRIPT_TEXT);

    expect(orphan.style.transform).toBe(""); // stale GSAP transform stripped
    expect(orphan.style.left).toBe("1240px"); // authored CSS base preserved
  });

  it("clears what a standalone gsap.set wrote once the new script no longer sets it", () => {
    // An undo of a Design-panel W edit on an animated box removes its gsap.set width.
    const target = document.createElement("div");
    target.id = "target";
    target.style.cssText = "left: 10px; width: 300px";
    Object.assign(target, { _gsap: {} });
    const root = document.createElement("div");
    root.setAttribute("data-composition-id", "root");
    root.appendChild(target);
    const iframe = iframeWithComposition(
      `window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
tl.to("#target", { x: 100 });
gsap.set("#target", { width: 300 });
window.__timelines["root"] = tl;`,
      root,
      { "#target": target },
    );
    const restored = `window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
tl.to("#target", { x: 100 });
window.__timelines["root"] = tl;`;

    applySoftReload(iframe, restored, {
      authoredHtml: `<html><body><div data-composition-id="root"><div id="target" style="left: 10px"></div></div><script>${restored}</script></body></html>`,
    });

    expect(target.style.width).toBe("");
    expect(target.style.left).toBe("10px");
  });

  it("wraps execution in __hfSuppressSceneMutations when available", () => {
    let suppressionCalled = false;
    const { iframe } = buildMockIframe({
      __hfSuppressSceneMutations: <T>(fn: () => T): T => {
        suppressionCalled = true;
        return fn();
      },
    });
    const result = applySoftReload(iframe, SCRIPT_TEXT);
    expect(result).toBe("applied");
    expect(suppressionCalled).toBe(true);
  });

  it('returns "applied" when the re-run re-registers the script\'s expected key', () => {
    // SCRIPT_TEXT registers __timelines["root"]; buildMockIframe's appendChild
    // shim repopulates `root` on execution. The hardened verify checks the
    // expected target key is present (not merely "some key"), so a correct re-run
    // reliably reports "applied" — it doesn't spuriously hit the transient window.
    const { iframe, contentWindow } = buildMockIframe();
    expect(applySoftReload(iframe, SCRIPT_TEXT)).toBe("applied");
    expect(contentWindow.__timelines.root).toBeDefined();
  });

  it('returns "verify-failed" (transient) when the re-run leaves the key empty', () => {
    // No appendChild shim repopulation: the body container has no shim, so the
    // re-run kills __timelines["root"] and the new script doesn't re-register it.
    // That is the TRANSIENT post-run window — surfaced as "verify-failed" so
    // callers know NOT to escalate (the live gsap.set already shows the value).
    const scriptEl = document.createElement("script");
    scriptEl.textContent = 'window.__timelines["root"] = gsap.timeline();';
    const container = document.createElement("div"); // no appendChild shim
    container.appendChild(scriptEl);
    const { iframe } = buildMockIframe();
    (iframe as unknown as { contentDocument: unknown }).contentDocument = {
      querySelectorAll: (sel: string) => (sel === "script:not([src])" ? [scriptEl] : []),
      createElement: (tag: string) => document.createElement(tag),
      body: container,
      head: document.createElement("div"),
    };
    expect(applySoftReload(iframe, SCRIPT_TEXT)).toBe("verify-failed");
  });

  it("editing composition A leaves composition B's timeline intact (scoped kill)", () => {
    // Two comps live side by side; the soft reload only re-runs comp "root".
    // Comp "subscene" must survive untouched — the regression the full remount
    // (re-inline) used to cause.
    const subsceneTimeline = { kill: vi.fn(), pause: vi.fn() };
    const { iframe, contentWindow, mockTimeline } = buildMockIframe({
      __timelines: {
        root: { kill: vi.fn(), pause: vi.fn() },
        subscene: subsceneTimeline,
      } as Record<string, { kill: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }>,
    });
    void mockTimeline;

    expect(applySoftReload(iframe, SCRIPT_TEXT)).toBe("applied");
    // Comp B was never killed and is still registered.
    expect(subsceneTimeline.kill).not.toHaveBeenCalled();
    expect(contentWindow.__timelines.subscene).toBe(subsceneTimeline);
  });

  it("runs synchronously (no async plugin load) when MotionPathPlugin is already present", () => {
    // The preview bootstrap pre-loads MotionPathPlugin, so win.MotionPathPlugin
    // is set before any motion-path edit. The soft reload must then execute the
    // script inline — no CDN <script> appended to <head>, the timeline is
    // repopulated synchronously, and verifyTimelinesPopulated reports the real
    // result (not the optimistic-true async path).
    const headAppends: Node[] = [];
    const head = document.createElement("div");
    const realHeadAppend = head.appendChild.bind(head);
    head.appendChild = <T extends Node>(node: T): T => {
      headAppends.push(node);
      return realHeadAppend(node);
    };
    const { iframe, contentWindow } = buildMockIframe({ MotionPathPlugin: {} });
    (iframe.contentDocument as unknown as { head: unknown }).head = head;

    const result = applySoftReload(iframe, MOTION_PATH_SCRIPT_TEXT);

    expect(result).toBe("applied");
    // No CDN plugin <script> was appended to <head> — ran inline.
    expect(headAppends.filter((n) => n instanceof HTMLScriptElement)).toHaveLength(0);
    expect(contentWindow.__hfForceTimelineRebind).toHaveBeenCalled();
    expect(contentWindow.__player.seek).toHaveBeenCalledWith(2.0);
    expect(contentWindow.__timelines.root).toBeDefined();
  });

  it("falls back to the async plugin load when MotionPathPlugin is genuinely absent", () => {
    const head = document.createElement("div");
    const appendedScripts: HTMLScriptElement[] = [];
    const realHeadAppend = head.appendChild.bind(head);
    head.appendChild = <T extends Node>(node: T): T => {
      if (node instanceof HTMLScriptElement) appendedScripts.push(node);
      return realHeadAppend(node);
    };
    // gsap present but MotionPathPlugin unset → async load path.
    const { iframe, contentWindow } = buildMockIframe({
      MotionPathPlugin: undefined,
      gsap: { timeline: vi.fn(), registerPlugin: vi.fn(), version: "3.14.2" },
    });
    (iframe.contentDocument as unknown as { head: unknown }).head = head;

    const onAsyncFailure = vi.fn();
    const result = applySoftReload(iframe, MOTION_PATH_SCRIPT_TEXT, { onAsyncFailure });

    // Optimistically "applied" (script will run once the plugin loads) — and the
    // script has NOT executed yet, so the timeline isn't rebound synchronously.
    expect(result).toBe("applied");
    expect(appendedScripts).toHaveLength(1);
    expect(appendedScripts[0]!.src).toContain("gsap@3.14.2/dist/MotionPathPlugin");
    expect(contentWindow.__hfForceTimelineRebind).not.toHaveBeenCalled();

    // onerror must NOT run the script (that would reference a missing plugin) —
    // it escalates via onAsyncFailure so the caller can full-reload to recover,
    // and clears the in-flight loading flag.
    appendedScripts[0]!.onerror?.(new Event("error"));
    expect(onAsyncFailure).toHaveBeenCalledTimes(1);
    expect(contentWindow.__hfForceTimelineRebind).not.toHaveBeenCalled();
    expect(contentWindow.__hfMotionPathPluginLoading).toBe(false);
  });

  it("loads a missing soft-reload plugin from the iframe mirror and reports its failure", () => {
    const { iframe, contentWindow } = buildMockIframe({
      gsap: { timeline: vi.fn(), registerPlugin: vi.fn(), version: "3.14.2" },
    });
    const head = iframe.contentDocument!.head;
    const meta = document.createElement("meta");
    meta.name = "hyperframes-gsap-base-url";
    meta.content = "http://localhost:8080/vendor/npm";
    head.appendChild(meta);
    const onAsyncFailure = vi.fn();
    expect(applySoftReload(iframe, MOTION_PATH_SCRIPT_TEXT, { onAsyncFailure })).toBe("applied");
    const plugin = head.querySelector("script");
    expect(plugin?.src).toBe(
      "http://localhost:8080/vendor/npm/gsap@3.14.2/dist/MotionPathPlugin.min.js",
    );
    plugin?.onerror?.(new Event("error"));
    expect(onAsyncFailure).toHaveBeenCalledTimes(1);
    expect(contentWindow.__hfForceTimelineRebind).not.toHaveBeenCalled();
    expect(contentWindow.__hfMotionPathPluginLoading).toBe(false);
    expect(head.querySelectorAll("script")).toHaveLength(1);
  });

  it('returns "cannot-soft-reload" when multiple GSAP scripts exist (ambiguous)', () => {
    const script1 = document.createElement("script");
    script1.textContent = "const tl = gsap.timeline({ paused: true });";
    const script2 = document.createElement("script");
    script2.textContent = 'tl.to("#other", { x: 10 });';
    const container = document.createElement("div");
    container.appendChild(script1);
    container.appendChild(script2);

    const { iframe } = buildMockIframe();
    (iframe as unknown as { contentDocument: unknown }).contentDocument = {
      querySelectorAll: (sel: string) => (sel === "script:not([src])" ? [script1, script2] : []),
      createElement: (tag: string) => document.createElement(tag),
      body: container,
    };
    // Multiple scripts, none registering "root" → can't identify what to replace
    // → structural failure that genuinely needs a full reload.
    expect(applySoftReload(iframe, SCRIPT_TEXT)).toBe("cannot-soft-reload");
  });
});

// ── Finalization-only path: seek → rebind → manual edits, with NO script
// execution — the flashless sync for timing edits that changed no script.
describe("applySoftReloadFinalization", () => {
  it("seeks, rebinds, and reapplies manual edits without touching any script", () => {
    const { iframe, contentWindow, container, mockTimeline } = buildMockIframe();
    const scriptsBefore = container.querySelectorAll("script").length;

    expect(applySoftReloadFinalization(iframe, 2.0)).toBe(true);

    expect(contentWindow.__player.seek).toHaveBeenCalledWith(2.0);
    expect(contentWindow.__hfForceTimelineRebind).toHaveBeenCalledTimes(1);
    expect(contentWindow.__hfStudioManualEditsApply).toHaveBeenCalledTimes(1);
    // No script executed or removed; the live timeline was never killed.
    expect(container.querySelectorAll("script").length).toBe(scriptsBefore);
    expect(mockTimeline.kill).not.toHaveBeenCalled();
    expect(contentWindow.__timelines.root).toBe(mockTimeline);
  });

  describe("play state", () => {
    function playerThatLogs(playing: boolean) {
      const calls: string[] = [];
      const player = {
        getTime: () => 2.0,
        isPlaying: () => playing,
        seek: vi.fn(() => calls.push("seek")),
        play: vi.fn(() => calls.push("play")),
      };
      const built = buildMockIframe({
        __player: player,
        __hfForceTimelineRebind: vi.fn(() => calls.push("rebind")),
        __hfStudioManualEditsApply: vi.fn(() => calls.push("edits")),
      });
      return { ...built, player, calls };
    }

    it("resumes playing once the timeline is rebuilt when an edit lands during playback", () => {
      const { iframe, calls } = playerThatLogs(true);

      expect(applySoftReloadFinalization(iframe, 2.0)).toBe(true);

      expect(calls).toEqual(["seek", "rebind", "edits", "play"]);
    });

    it("leaves a paused player paused", () => {
      const { iframe, player } = playerThatLogs(false);

      expect(applySoftReloadFinalization(iframe, 2.0)).toBe(true);

      expect(player.seek).toHaveBeenCalledWith(2.0);
      expect(player.play).not.toHaveBeenCalled();
    });

    it("resumes after a script soft reload too, which shares the finalization", () => {
      const { iframe, calls } = playerThatLogs(true);

      expect(applySoftReload(iframe, SCRIPT_TEXT)).toBe("applied");

      expect(calls.at(-1)).toBe("play");
    });
  });

  it("runs inside __hfSuppressSceneMutations when the runtime provides it", () => {
    const suppress = vi.fn(<T>(fn: () => T): T => fn());
    const { iframe, contentWindow } = buildMockIframe({
      __hfSuppressSceneMutations: suppress,
    });

    expect(applySoftReloadFinalization(iframe, 1.5)).toBe(true);

    expect(suppress).toHaveBeenCalledTimes(1);
    expect(contentWindow.__hfForceTimelineRebind).toHaveBeenCalledTimes(1);
  });

  it("does NOT require gsap — a script-less runtime with the rebind hook works", () => {
    const { iframe, contentWindow } = buildMockIframe({ gsap: undefined });
    expect(applySoftReloadFinalization(iframe, 0)).toBe(true);
    expect(contentWindow.__hfForceTimelineRebind).toHaveBeenCalledTimes(1);
  });

  it("returns false when the iframe or the rebind hook is unavailable", () => {
    expect(applySoftReloadFinalization(null, 0)).toBe(false);
    const { iframe } = buildMockIframe({ __hfForceTimelineRebind: undefined });
    expect(applySoftReloadFinalization(iframe, 0)).toBe(false);
  });

  it("returns false when the rebind throws (caller full-reloads)", () => {
    const { iframe } = buildMockIframe({
      __hfForceTimelineRebind: vi.fn(() => {
        throw new Error("runtime mid-teardown");
      }),
    });
    expect(applySoftReloadFinalization(iframe, 0)).toBe(false);
  });
});

function buildBootstrapIframe(overrides: Record<string, unknown> = {}) {
  const head = document.createElement("div");
  const appendedScripts: HTMLScriptElement[] = [];
  const realHeadAppend = head.appendChild.bind(head);
  head.appendChild = <T extends Node>(node: T): T => {
    if (node instanceof HTMLScriptElement) appendedScripts.push(node);
    return realHeadAppend(node);
  };

  const registerPlugin = vi.fn();
  const contentWindow = {
    gsap: { registerPlugin } as Record<string, unknown> | undefined,
    MotionPathPlugin: undefined as unknown,
    __hfMotionPathPluginLoading: undefined as boolean | undefined,
    ...overrides,
  };
  const contentDocument = {
    createElement: (tag: string) => document.createElement(tag),
    head,
  };
  return {
    iframe: { contentWindow, contentDocument } as unknown as HTMLIFrameElement,
    contentWindow,
    appendedScripts,
    registerPlugin,
  };
}

describe("ensureMotionPathPluginLoaded", () => {
  it("no-ops when the iframe is null", () => {
    expect(() => ensureMotionPathPluginLoaded(null)).not.toThrow();
  });

  it("no-ops when gsap is unavailable", () => {
    const { iframe, appendedScripts } = buildBootstrapIframe({ gsap: undefined });
    ensureMotionPathPluginLoaded(iframe);
    expect(appendedScripts).toHaveLength(0);
  });

  describe("when gsap is not there yet at load", () => {
    const post = (source: unknown, type = "ready") => {
      const event = new MessageEvent("message", { data: { source: "hf-preview", type } });
      Object.defineProperty(event, "source", { value: source });
      window.dispatchEvent(event);
    };

    it("loads the plugin once that iframe's runtime is ready", () => {
      const { iframe, contentWindow, appendedScripts } = buildBootstrapIframe({ gsap: undefined });
      ensureMotionPathPluginLoaded(iframe);
      contentWindow.gsap = { registerPlugin: vi.fn() };
      post({});
      post(contentWindow, "timeline");
      expect(appendedScripts).toHaveLength(0);
      post(contentWindow);
      post(contentWindow);
      expect(appendedScripts).toHaveLength(1);
      expect(appendedScripts[0]!.src).toContain("MotionPathPlugin");
    });

    it("stops listening at the first ready, even when it brought no gsap", () => {
      const { iframe, contentWindow, appendedScripts } = buildBootstrapIframe({ gsap: undefined });
      ensureMotionPathPluginLoaded(iframe);
      post(contentWindow);
      contentWindow.gsap = { registerPlugin: vi.fn() };
      post(contentWindow);
      expect(appendedScripts).toHaveLength(0);
    });

    it("drops a preview that never became ready once a newer one loads", () => {
      const stale = buildBootstrapIframe({ gsap: undefined });
      ensureMotionPathPluginLoaded(stale.iframe);
      ensureMotionPathPluginLoaded(buildBootstrapIframe({ gsap: undefined }).iframe);
      stale.contentWindow.gsap = { registerPlugin: vi.fn() };
      post(stale.contentWindow);
      expect(stale.appendedScripts).toHaveLength(0);
    });

    it("does not wait when the runtime already booted, since its ready has gone out", () => {
      const { iframe, contentWindow, appendedScripts } = buildBootstrapIframe({
        gsap: undefined,
        __playerReady: true,
      });
      ensureMotionPathPluginLoaded(iframe);
      contentWindow.gsap = { registerPlugin: vi.fn() };
      post(contentWindow);
      expect(appendedScripts).toHaveLength(0);
    });
  });

  it("loads the plugin at the composition's own gsap version", () => {
    const { iframe, appendedScripts } = buildBootstrapIframe({
      gsap: { version: "3.14.2", registerPlugin: vi.fn() },
    });
    ensureMotionPathPluginLoaded(iframe);
    expect(appendedScripts[0]!.src).toBe(
      "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/MotionPathPlugin.min.js",
    );
  });

  it("preloads from the iframe mirror once, retaining the runtime version", () => {
    const { iframe, appendedScripts, contentWindow, registerPlugin } = buildBootstrapIframe({
      gsap: { version: "3.14.2", registerPlugin: vi.fn() },
    });
    const meta = document.createElement("meta");
    meta.name = "hyperframes-gsap-base-url";
    meta.content = "http://localhost:8080/vendor/npm";
    iframe.contentDocument!.head.appendChild(meta);
    ensureMotionPathPluginLoaded(iframe);
    ensureMotionPathPluginLoaded(iframe);
    expect(appendedScripts).toHaveLength(1);
    expect(appendedScripts[0]!.src).toBe(
      "http://localhost:8080/vendor/npm/gsap@3.14.2/dist/MotionPathPlugin.min.js",
    );
    appendedScripts[0]!.onerror?.(new Event("error"));
    expect(contentWindow.__hfMotionPathPluginLoading).toBe(false);
    expect(registerPlugin).not.toHaveBeenCalled();
    expect(appendedScripts).toHaveLength(1);
  });

  it.each([
    ["3.15.0", "/api/vendor/npm/gsap@3.15.0/dist/MotionPathPlugin.min.js"],
    ["3.14.2", "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/MotionPathPlugin.min.js"],
  ])(
    "preloads gsap %s from the host's bundled copy only when it holds that version",
    (version, url) => {
      const { iframe, appendedScripts } = buildBootstrapIframe({
        gsap: { version, registerPlugin: vi.fn() },
      });
      const meta = document.createElement("meta");
      meta.name = "hyperframes-gsap-base-url";
      meta.content = "/api/vendor/npm";
      iframe.contentDocument!.head.appendChild(meta);
      ensureMotionPathPluginLoaded(iframe);
      expect(appendedScripts).toHaveLength(1);
      expect(appendedScripts[0]!.getAttribute("src")).toBe(url);
    },
  );

  it("appends the plugin script once and registers it on load", () => {
    const { iframe, contentWindow, appendedScripts, registerPlugin } = buildBootstrapIframe();
    ensureMotionPathPluginLoaded(iframe);
    expect(appendedScripts).toHaveLength(1);
    expect(appendedScripts[0]!.src).toContain("MotionPathPlugin");
    expect(contentWindow.__hfMotionPathPluginLoading).toBe(true);

    // Simulate the CDN load completing; the plugin is now present.
    contentWindow.MotionPathPlugin = {};
    appendedScripts[0]!.onload?.(new Event("load"));
    expect(registerPlugin).toHaveBeenCalledWith(contentWindow.MotionPathPlugin);
    expect(contentWindow.__hfMotionPathPluginLoading).toBe(false);
  });

  it("is idempotent: a second call while loading does not append a second script", () => {
    const { iframe, appendedScripts } = buildBootstrapIframe();
    ensureMotionPathPluginLoaded(iframe);
    ensureMotionPathPluginLoaded(iframe);
    expect(appendedScripts).toHaveLength(1);
  });

  it("registers an already-present plugin without appending a script", () => {
    const plugin = {};
    const { iframe, appendedScripts, registerPlugin } = buildBootstrapIframe({
      MotionPathPlugin: plugin,
    });
    ensureMotionPathPluginLoaded(iframe);
    expect(appendedScripts).toHaveLength(0);
    expect(registerPlugin).toHaveBeenCalledWith(plugin);
  });

  it("clears the loading flag and still resolves when the CDN load errors", () => {
    const { iframe, contentWindow, appendedScripts } = buildBootstrapIframe();
    ensureMotionPathPluginLoaded(iframe);
    appendedScripts[0]!.onerror?.(new Event("error"));
    expect(contentWindow.__hfMotionPathPluginLoading).toBe(false);
    // A subsequent call can retry (plugin still absent, flag cleared).
    ensureMotionPathPluginLoaded(iframe);
    expect(appendedScripts).toHaveLength(2);
  });
});

// The authored-opacity restore: before the script re-runs (and its tweens
// re-capture bounds), every animated element's inline opacity must be put back
// to its AUTHORED value — from the after-write file HTML when provided, else
// from the parse-time stamp. Otherwise a runtime transient (the color-grading
// hide's 0, a mid-flight tween value) becomes a permanent tween bound.
describe("applySoftReload authored-style restore", () => {
  afterEach(() => document.body.replaceChildren());

  function buildIframeWithTarget(el: Element, overrides: Record<string, unknown> = {}) {
    const scriptEl = document.createElement("script");
    scriptEl.textContent =
      'const tl = gsap.timeline({ paused: true }); tl.to("#box", { opacity: 0.5 });';
    const tl = {
      kill: vi.fn(),
      pause: vi.fn(),
      getChildren: () => [{ targets: () => [el] }],
    };
    const contentWindow = {
      gsap: { timeline: vi.fn(), set: vi.fn() },
      __hfForceTimelineRebind: vi.fn(),
      __timelines: { root: tl } as Record<string, unknown>,
      __player: { getTime: () => 2.0, seek: vi.fn() },
      __hfStudioManualEditsApply: vi.fn(),
      ...overrides,
    };
    const container = document.createElement("div");
    container.appendChild(scriptEl);
    // Intercept only POST-SETUP appends: simulate the re-run script
    // repopulating __timelines (as in buildMockIframe).
    const realAppendChild = container.appendChild.bind(container);
    container.appendChild = <T extends Node>(node: T): T => {
      const result = realAppendChild(node);
      if (node instanceof HTMLScriptElement && node.textContent?.includes("gsap.timeline")) {
        contentWindow.__timelines.root = { kill: vi.fn(), pause: vi.fn() };
      }
      return result;
    };
    const contentDocument = {
      querySelectorAll: (sel: string) => (sel === "script:not([src])" ? [scriptEl] : []),
      createElement: (tag: string) => document.createElement(tag),
      body: container,
      head: document.createElement("div"),
    };
    return { iframe: { contentWindow, contentDocument } as unknown as HTMLIFrameElement };
  }

  /** Run one restore cycle over `el` and return the final inline opacity. */
  function restoreOpacity(el: HTMLElement, authoredHtml?: string): string {
    const { iframe } = buildIframeWithTarget(el);
    expect(applySoftReload(iframe, SCRIPT_TEXT, authoredHtml ? { authoredHtml } : {})).toBe(
      "applied",
    );
    return el.style.getPropertyValue("opacity");
  }

  it("flushes only elements when a tween targets a plain object (the runtime's duration filler)", () => {
    const el = document.createElement("div");
    // GSAP's clearProps writes target.style.cssText, which throws on a plain object.
    const set = vi.fn((targets: Array<{ style: CSSStyleDeclaration }>) => {
      for (const t of targets) t.style.cssText = "";
    });
    const { iframe } = buildIframeWithTarget(el, {
      gsap: { timeline: vi.fn(), set },
      __timelines: {
        root: {
          kill: vi.fn(),
          getChildren: () => [{ targets: () => [el] }, { targets: () => [{}] }],
        },
      },
    });

    expect(applySoftReload(iframe, SCRIPT_TEXT)).toBe("applied");
    expect(set).toHaveBeenCalledWith([el], { clearProps: "all" });
  });

  it("falls back to a full reload, and says why, when the flush throws", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { iframe } = buildIframeWithTarget(document.createElement("div"), {
      gsap: {
        timeline: vi.fn(),
        set: vi.fn(() => {
          throw new Error("flush failed");
        }),
      },
    });

    expect(applySoftReload(iframe, SCRIPT_TEXT)).toBe("cannot-soft-reload");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("soft reload threw"),
      expect.any(Error),
    );
    error.mockRestore();
  });

  it("restores opacity from the after-write HTML (matched by data-hf-id)", () => {
    const el = document.createElement("img");
    el.setAttribute("data-hf-id", "hf-1");
    el.style.setProperty("opacity", "0", "important"); // the grading hide

    const opacity = restoreOpacity(
      el,
      '<html><body><img data-hf-id="hf-1" style="opacity: 0.98"></body></html>',
    );

    expect(opacity).toBe("0.98");
    expect(el.style.getPropertyPriority("opacity")).toBe("");
  });

  it("keeps the stamp for an element whose hf-id the written file lacks, even if it shares an id", () => {
    const el = document.createElement("img");
    el.id = "title-card";
    el.setAttribute("data-hf-id", "hf-from-another-file");
    el.setAttribute("data-hf-authored-opacity", "0.5");
    el.style.opacity = "0";

    const opacity = restoreOpacity(
      el,
      '<html><body><img id="title-card" style="opacity: 0.9"></body></html>',
    );

    expect(opacity).toBe("0.5");
  });

  it("does not take a runtime clone's opacity from its plain template", () => {
    const el = document.createElement("li");
    el.id = "item";
    el.setAttribute("data-hf-authored-opacity", "0.5");
    el.style.opacity = "0";

    const opacity = restoreOpacity(
      el,
      '<html><body><template><li id="item" style="opacity: 0.3"></li></template></body></html>',
    );

    expect(opacity).toBe("0.5");
  });

  it("falls back to the parse-time stamp when no after-write HTML is given", () => {
    const el = document.createElement("img");
    el.setAttribute("data-hf-authored-opacity", "0.75");
    el.style.opacity = "0.123"; // mid-flight tween transient

    expect(restoreOpacity(el)).toBe("0.75");
  });

  it("an empty stamp (authored none) removes the inline opacity", () => {
    const el = document.createElement("img");
    el.setAttribute("data-hf-authored-opacity", "");
    el.style.opacity = "0";

    expect(restoreOpacity(el)).toBe("");
  });

  it("restores the file's inline translate, rotate and scale and drops GSAP's transform", () => {
    const el = document.createElement("div");
    el.setAttribute("data-hf-id", "hf-1");
    el.style.cssText =
      "left: 10px; translate: none; rotate: none; scale: none; transform: translate(9px, 9px)";
    const { iframe } = buildIframeWithTarget(el);
    const authoredHtml = `<html><body><div data-hf-id="hf-1" style="translate: 60px 40px; rotate: 15deg; scale: 1.5"></div></body></html>`;
    expect(applySoftReload(iframe, SCRIPT_TEXT, { authoredHtml })).toBe("applied");
    const read = (prop: string) => el.style.getPropertyValue(prop);
    expect(["translate", "rotate", "scale", "transform"].map(read)).toEqual([
      "60px 40px",
      "15deg",
      "1.5",
      "",
    ]);
  });

  it("keeps an SVG child's authored inline transform", () => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    el.setAttribute("data-hf-id", "hf-1");
    el.setAttribute("style", "transform: translate(9px, 9px) rotate(20deg)");
    const { iframe } = buildIframeWithTarget(el);
    const authoredHtml = `<html><body><svg><rect data-hf-id="hf-1" style="transform: rotate(20deg)"></rect></svg></body></html>`;
    applySoftReload(iframe, SCRIPT_TEXT, { authoredHtml });
    expect(el.style.transform).toBe("rotate(20deg)");
  });

  it("the finalize seek cannot paint the killed timeline over the restored transform", () => {
    const el = document.createElement("div");
    el.style.cssText = "translate: none; transform: translate3d(77.5px, 40px, 0px)";
    const children = [{ targets: () => [el] }];
    const killed = {
      kill: vi.fn(),
      getChildren: () => children,
      clear: () => void children.splice(0),
    };
    // The runtime still seeks the timeline it captured at load until the rebind swaps it.
    const seek = () =>
      children.forEach(() => (el.style.transform = "translate3d(77.5px, 0px, 0px)"));
    let transformAtRebind: string | null = null;
    const { iframe } = buildIframeWithTarget(el, {
      __timelines: { root: killed },
      __player: { getTime: () => 1, seek },
      __hfForceTimelineRebind: () => (transformAtRebind = el.style.transform),
    });
    applySoftReload(iframe, SCRIPT_TEXT);
    expect(transformAtRebind).toBe("");
  });

  // The preview inlines a sub-composition into a host that names its file.
  function inlinedIn(file: string, el: HTMLElement): HTMLElement {
    const host = document.createElement("div");
    host.setAttribute("data-composition-file", file);
    host.appendChild(el);
    document.body.appendChild(host);
    return el;
  }

  function answerQueries(iframe: HTMLIFrameElement, styled: Element, root: Element): void {
    const doc = iframe.contentDocument as unknown as { querySelectorAll: (s: string) => unknown };
    const query = doc.querySelectorAll;
    doc.querySelectorAll = (sel: string) =>
      sel.includes("transform") ? [styled] : sel.includes("composition-id") ? [root] : query(sel);
  }
  const SUB_FILE = `<template id="sub-template"><div id="sub" data-composition-id="sub">
    <div id="nroot" data-hf-id="hf-n" style="left: 560px; top: 300px"></div></div></template>`;

  it("gives a root tween's nested target what its own file authors for what GSAP wrote", () => {
    const el = document.createElement("div");
    el.id = "nroot";
    el.setAttribute("data-hf-id", "hf-n");
    // GSAP folded the stylesheet translate into its transform, masked it, and wrote the tweened width.
    el.style.cssText =
      "left: 560px; top: 300px; width: 337px; translate: none; transform: translate(12.5px, 0px)";
    inlinedIn("compositions/sub.html", el);
    const tween = { targets: () => [el], vars: { x: 50, width: 400, duration: 4 } };
    const { iframe } = buildIframeWithTarget(el, {
      __timelines: { root: { kill: vi.fn(), getChildren: () => [tween] } },
    });
    const authoredHtml = `<html><body><div id="root"></div></body></html>`;
    const nestedFiles = new Map([["compositions/sub.html", SUB_FILE]]);

    expect(applySoftReload(iframe, SCRIPT_TEXT, { authoredHtml, nestedFiles })).toBe("applied");
    expect(el.getAttribute("style")).toBe("left: 560px; top: 300px;");
  });

  it("puts back a root element's tweened width from the file instead of the live value", () => {
    const el = document.createElement("div");
    el.setAttribute("data-hf-id", "hf-1");
    el.style.cssText = "left: 700px; width: 366px";
    const tween = { targets: () => [el], vars: { width: 450, duration: 4 } };
    const { iframe } = buildIframeWithTarget(el, {
      __timelines: { root: { kill: vi.fn(), getChildren: () => [tween] } },
    });
    const authoredHtml = `<html><body><div data-hf-id="hf-1" style="left: 700px"></div></body></html>`;

    expect(applySoftReload(iframe, SCRIPT_TEXT, { authoredHtml })).toBe("applied");
    expect(el.getAttribute("style")).toBe("left: 700px;");
  });

  it("leaves what a nested composition's own timeline animates to that timeline", () => {
    const el = inlinedIn("compositions/sub.html", document.createElement("div"));
    el.id = "nroot";
    el.style.cssText = "translate: none; transform: translate(40px, 10px)";
    const sub = { getChildren: () => [{ targets: () => [el], vars: { x: 100 } }] };
    const { iframe } = buildIframeWithTarget(el, {
      __timelines: { root: { kill: vi.fn(), getChildren: () => [sub] }, sub },
    });
    const readFile = vi.fn(async () => SUB_FILE);

    expect(readNestedFiles(iframe, SCRIPT_TEXT, readFile)).toBeNull();
    applySoftReload(iframe, SCRIPT_TEXT);

    expect(readFile).not.toHaveBeenCalled();
    expect(el.style.cssText).toBe("translate: none; transform: translate(40px, 10px);");
  });

  it("a nested composition's reload leaves a GSAP transform in the top-level file alone", () => {
    const host = document.createElement("div");
    host.setAttribute("data-composition-id", "root");
    host.setAttribute("data-composition-file", "compositions/sub.html");
    const outside = Object.assign(document.createElement("div"), { _gsap: {} });
    outside.style.cssText = "rotate: none; transform: rotate(30deg)";
    const { iframe } = buildIframeWithTarget(host, {
      __timelines: { root: { kill: vi.fn(), getChildren: () => [] } },
    });
    answerQueries(iframe, outside, host);

    applySoftReload(iframe, SCRIPT_TEXT, { authoredHtml: SUB_FILE });

    expect(outside.style.cssText).toBe("rotate: none; transform: rotate(30deg);");
  });

  it("a nested composition's reload leaves its element that the top-level timeline animates alone", () => {
    const host = document.createElement("div");
    host.setAttribute("data-composition-id", "root");
    host.setAttribute("data-composition-file", "compositions/sub.html");
    const el = Object.assign(document.createElement("div"), { _gsap: {} });
    // The top-level tween folded the stylesheet translate into its transform.
    el.style.cssText = "translate: none; transform: translate(23.75px, 5px)";
    host.appendChild(el);
    const main = { getChildren: () => [{ targets: () => [el], vars: { x: 50 } }] };
    const { iframe } = buildIframeWithTarget(host, {
      __timelines: { root: { kill: vi.fn(), getChildren: () => [] }, main },
    });
    answerQueries(iframe, el, host);

    applySoftReload(iframe, SCRIPT_TEXT, {
      authoredHtml: SUB_FILE,
    });

    expect(el.style.cssText).toBe("translate: none; transform: translate(23.75px, 5px);");
  });

  it("a nested composition's own reload restores its element from the file just written", () => {
    const host = document.createElement("div");
    host.setAttribute("data-composition-id", "root");
    host.setAttribute("data-composition-file", "compositions/sub.html");
    const el = document.createElement("div");
    el.id = "nroot";
    el.setAttribute("data-hf-id", "hf-n");
    el.style.cssText = "left: 560px; top: 300px; width: 337px";
    host.appendChild(el);
    const tween = { targets: () => [el], vars: { width: 400 } };
    const { iframe } = buildIframeWithTarget(el, {
      __timelines: { root: { kill: vi.fn(), getChildren: () => [tween] } },
    });
    answerQueries(iframe, el, host);
    const readFile = vi.fn(async () => SUB_FILE);

    expect(readNestedFiles(iframe, SCRIPT_TEXT, readFile)).toBeNull();
    applySoftReload(iframe, SCRIPT_TEXT, { authoredHtml: SUB_FILE });

    expect(readFile).not.toHaveBeenCalled();
    expect(el.getAttribute("style")).toBe("left: 560px; top: 300px;");
  });

  it("reads only the other composition files a top-level re-run resets elements of", async () => {
    const el = inlinedIn("compositions/sub.html", document.createElement("div"));
    const tween = { targets: () => [el], vars: { width: 400 } };
    const { iframe } = buildIframeWithTarget(el, {
      __timelines: { root: { kill: vi.fn(), getChildren: () => [tween] } },
    });
    const readFile = vi.fn(async () => SUB_FILE);

    const files = await readNestedFiles(iframe, SCRIPT_TEXT, readFile);

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(files).toEqual(new Map([["compositions/sub.html", SUB_FILE]]));
  });

  it("escalates, touching nothing, when a nested file the reset needs could not be read", () => {
    const el = inlinedIn("compositions/sub.html", document.createElement("div"));
    el.style.cssText = "width: 337px; translate: none";
    const tween = { targets: () => [el], vars: { width: 400 } };
    const set = vi.fn();
    const { iframe } = buildIframeWithTarget(el, {
      gsap: { timeline: vi.fn(), set },
      __timelines: { root: { kill: vi.fn(), getChildren: () => [tween] } },
    });

    expect(applySoftReload(iframe, SCRIPT_TEXT, { nestedFiles: null })).toBe("cannot-soft-reload");
    expect(set).not.toHaveBeenCalled();
    expect(el.style.cssText).toBe("width: 337px; translate: none;");
  });

  it("keeps the runtime's own inline writes: only what GSAP wrote comes back from the file", () => {
    const el = document.createElement("div");
    el.setAttribute("data-hf-id", "hf-1");
    // The runtime's layout pass wrote position and a data-width size; GSAP wrote the mask and transform.
    el.style.cssText =
      "left: 10px; position: absolute; width: 300px; translate: none; transform: translate(50px, 0px)";
    const tween = { targets: () => [el], vars: { x: 50 } };
    const { iframe } = buildIframeWithTarget(el, {
      __timelines: { root: { kill: vi.fn(), getChildren: () => [tween] } },
    });
    const authoredHtml = `<html><body><div data-hf-id="hf-1" style="left: 10px"></div></body></html>`;

    applySoftReload(iframe, SCRIPT_TEXT, { authoredHtml });

    expect(el.getAttribute("style")).toBe("left: 10px; position: absolute; width: 300px;");
  });
});

describe("applySoftReload over a composition's own markup", () => {
  // A live preview whose top-level timeline has no children; `_gsap` marks what a script set.
  function reloadRoot(markup: string, held: string[]) {
    const doc = document.implementation.createHTMLDocument("");
    doc.body.innerHTML = `${markup}<script>${SCRIPT_TEXT}</script>`;
    for (const id of held) Object.assign(doc.getElementById(id)!, { _gsap: {} });
    const set = vi.fn();
    const contentWindow = {
      gsap: { timeline: vi.fn(), set },
      __hfForceTimelineRebind: vi.fn(),
      __timelines: { root: { kill: vi.fn(), getChildren: () => [] } } as Record<string, unknown>,
      __player: { getTime: () => 0, seek: vi.fn() },
    };
    const iframe = { contentWindow, contentDocument: doc } as unknown as HTMLIFrameElement;
    const cleared = () => (set.mock.calls[0]?.[0] as Element[] | undefined)?.map((el) => el.id);
    return { doc, iframe, cleared };
  }

  it("resets an element a standalone gsap.set holds even when no inline transform is left", () => {
    const { iframe, cleared } = reloadRoot(
      `<div data-composition-id="root"><div id="held" style="left: 5px"></div><div id="plain"></div></div>`,
      ["held"],
    );

    applySoftReload(iframe, SCRIPT_TEXT);

    expect(cleared()).toEqual(["held"]);
  });

  it("leaves what a nested composition's script holds alone, but resets that composition's host", () => {
    const { doc, iframe, cleared } = reloadRoot(
      `<div data-composition-id="root"><div id="host" data-composition-id="sub">` +
        `<div id="nested" style="transform: translate(90px, 60px)"></div></div></div>`,
      ["host", "nested"],
    );

    applySoftReload(iframe, SCRIPT_TEXT);

    expect(cleared()).toEqual(["host"]);
    expect(doc.getElementById("nested")!.style.transform).toBe("translate(90px, 60px)");
  });

  it("reloads in full when the re-run builds its DOM a second time", () => {
    const { doc, iframe } = reloadRoot(`<div id="root" data-composition-id="root"></div>`, []);
    const append = doc.body.appendChild.bind(doc.body);
    // What a script's createElement or template clone does each time it runs.
    doc.body.appendChild = <T extends Node>(node: T): T => {
      doc.getElementById("root")!.appendChild(doc.createElement("div"));
      return append(node);
    };

    expect(applySoftReload(iframe, SCRIPT_TEXT)).toBe("cannot-soft-reload");
  });
});

describe("a gsap.set a live patch applied", () => {
  it("is cleared by the next soft reload once the new script no longer sets it, and only once", () => {
    const markup = `<div data-composition-id="root"><div id="a" style="left: 10px"></div></div>`;
    const doc = document.implementation.createHTMLDocument("");
    doc.body.innerHTML = `${markup}<script>window.__timelines["root"]=gsap.timeline();</script>`;
    const set = (target: HTMLElement | HTMLElement[], vars: Record<string, unknown>) => {
      for (const el of [target].flat()) {
        if (vars.clearProps) el.removeAttribute("style");
        else for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, `${v}px`);
      }
    };
    const iframe = {
      contentDocument: doc,
      contentWindow: {
        gsap: { timeline: () => {}, set },
        __hfForceTimelineRebind: () => {},
        __timelines: {},
        __player: { getTime: () => 0, seek: () => {} },
      },
    } as unknown as HTMLIFrameElement;
    const el = doc.getElementById("a")!;
    const reload = () => {
      const script = `window.__timelines["root"]=gsap.timeline();gsap.set("#a",{width:300});`;
      applySoftReload(iframe, script, { authoredHtml: `${markup}<script>${script}</script>` });
    };

    // W 300, then H 200, then a commit that removes height from the set.
    patchRuntimeTweenInPlace(iframe, "#a", { kind: "global-set", props: { width: 300 } });
    patchRuntimeTweenInPlace(iframe, "#a", { kind: "global-set", props: { height: 200 } });
    reload();
    expect([el.style.height, el.style.left]).toEqual(["", "10px"]);

    el.style.height = "50px";
    reload();
    expect(el.style.height).toBe("50px");
  });
});
