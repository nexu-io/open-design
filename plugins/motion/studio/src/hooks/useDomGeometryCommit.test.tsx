// @vitest-environment happy-dom
import { act, createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  useDomGeometryCommit,
  usePlayerStore,
  type DomEditOverlayProps,
  type UseDomGeometryCommitOptions,
} from "../index";
import { makeSelection } from "./domSelectionTestHarness";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

const SOURCE = '<div id="card">Card</div><div id="other">Other</div>';

/** GSAP already renders this element's transform, so a move takes the GSAP writer. */
function gsapPositioned(element: HTMLElement): HTMLElement {
  return Object.assign(element, { _gsap: { renderTransform: () => {} } });
}

/** A warm parse where only another element animates, and a GSAP writer answering `status`. */
function stubServer(status = 200, parseStatus = 200) {
  const mutations: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const json = (body: unknown, code = 200) =>
        new Response(JSON.stringify(body), {
          status: code,
          headers: { "content-type": "application/json" },
        });
      if (url.includes("/api/projects/p1/gsap-animations/")) {
        if (parseStatus !== 200) return json({ error: "down" }, parseStatus);
        return json({
          animations: [
            {
              id: "other-fade",
              targetSelector: "#other",
              method: "to",
              position: 0,
              duration: 1,
              properties: { opacity: 1 },
              propertyGroup: "opacity",
            },
          ],
        });
      }
      if (url.includes("/api/projects/p1/gsap-mutations/")) {
        mutations.push(JSON.parse(String(init?.body)));
        if (status !== 200) return json({ error: "refused" }, status);
        return json({ ok: true, changed: true, before: "BEFORE", after: "AFTER" });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
  return mutations;
}

function renderHost(options: Partial<UseDomGeometryCommitOptions> = {}) {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const doc = iframe.contentDocument;
  if (!doc) throw new Error("Expected iframe document");
  doc.body.innerHTML = SOURCE;
  const element = doc.getElementById("card") as HTMLElement;
  const recordEdit = vi.fn(async () => {});
  const writeProjectFile = vi.fn(async () => {});
  const reloadPreview = vi.fn();
  const api: { current: ReturnType<typeof useDomGeometryCommit> | null } = { current: null };
  function Host() {
    const iframeRef = useRef<HTMLIFrameElement | null>(iframe);
    api.current = useDomGeometryCommit({
      projectId: "p1",
      iframeRef,
      writeProjectFile,
      recordEdit,
      reloadPreview,
      ...options,
    });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Host)));
  const hook = () => {
    if (!api.current) throw new Error("Expected the hook to render");
    return api.current;
  };
  return {
    element,
    recordEdit,
    hook,
    rerender: () => act(() => root.render(createElement(Host))),
    unmount: () => act(() => root.unmount()),
  };
}

beforeEach(() => {
  usePlayerStore.setState({ previewBooted: true, timelineProjectId: "p1" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("useDomGeometryCommit, from the package entry", () => {
  it("takes the host's own preview reload, with no fallback", () => {
    expectTypeOf<UseDomGeometryCommitOptions["reloadPreview"]>().toEqualTypeOf<() => void>();
  });

  it("plugs into DomEditOverlay and saves a move as one GSAP write and one undo step", async () => {
    const mutations = stubServer();
    const { element, recordEdit, hook, unmount } = renderHost();
    const overlayCommits: Pick<
      DomEditOverlayProps,
      "onPathOffsetCommit" | "onGroupPathOffsetCommit" | "onBoxSizeCommit" | "onRotationCommit"
    > = {
      onPathOffsetCommit: hook().commitPathOffset,
      onGroupPathOffsetCommit: hook().commitGroupPathOffset,
      onBoxSizeCommit: hook().commitBoxSize,
      onRotationCommit: hook().commitRotation,
    };

    const card = makeSelection("card", gsapPositioned(element));
    const outcome = await overlayCommits.onPathOffsetCommit(card, {
      x: 40,
      y: 20,
    });

    expect(outcome).toEqual({ ok: true, changed: true });
    expect(mutations).toEqual([
      expect.objectContaining({ type: "add", targetSelector: "#card", method: "set" }),
    ]);
    expect(recordEdit).toHaveBeenCalledTimes(1);
    expect(recordEdit).toHaveBeenCalledWith(
      expect.objectContaining({ files: { "index.html": { before: "BEFORE", after: "AFTER" } } }),
    );
    unmount();
  });

  function stubPatchServer(patchStatus = 200) {
    const calls = { urls: [] as string[], patches: [] as unknown[] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        calls.urls.push(url);
        if (url.includes("/patch-element/")) calls.patches.push(JSON.parse(String(init?.body)));
        const saved = {
          ok: true,
          changed: true,
          matched: true,
          path: "index.html",
          content: "AFTER",
          version: "v2",
        };
        const body = url.includes("/files/") ? { content: SOURCE } : saved;
        const status = url.includes("/patch-element/") ? patchStatus : 200;
        return new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    return calls;
  }

  it("saves a GSAP-free move as its inline translate, with no GSAP script and no animation read", async () => {
    const calls = stubPatchServer();
    const { element, recordEdit, hook, unmount } = renderHost();

    const card = makeSelection("card", element);
    await expect(hook().commitPathOffset(card, { x: 130.5, y: 90 })).resolves.toEqual({
      ok: true,
      changed: true,
    });

    expect(element.style.getPropertyValue("translate")).toBe("130.5px 90px");
    expect(calls.patches).toEqual([
      expect.objectContaining({
        operations: [
          { type: "inline-style", property: "translate", value: "130.5px 90px" },
          { type: "attribute", property: "data-hf-studio-original-inline-translate", value: "" },
        ],
      }),
    ]);
    expect(calls.urls.filter((url) => url.includes("gsap"))).toEqual([]);
    expect(recordEdit).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("saves a GSAP-free resize as its inline size, with no GSAP script and no animation read", async () => {
    const calls = stubPatchServer();
    const { element, recordEdit, hook, unmount } = renderHost();

    await expect(
      hook().commitBoxSize(makeSelection("card", element), { width: 300, height: 90 }),
    ).resolves.toEqual({ ok: true, changed: true });

    expect(element.style.getPropertyValue("width")).toBe("300px");
    expect(calls.patches).toEqual([
      expect.objectContaining({
        operations: expect.arrayContaining([
          { type: "inline-style", property: "width", value: "300px" },
          { type: "inline-style", property: "height", value: "90px" },
        ]),
      }),
    ]);
    expect(calls.urls.filter((url) => url.includes("gsap"))).toEqual([]);
    expect(recordEdit).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("puts a GSAP-free element's translate back when its move cannot be saved", async () => {
    stubPatchServer(500);
    const { element, hook, unmount } = renderHost();
    element.style.setProperty("translate", "40px 30px");

    await expect(
      hook().commitPathOffset(makeSelection("card", element), { x: 1, y: 2 }),
    ).rejects.toThrow();
    expect(element.style.getPropertyValue("translate")).toBe("40px 30px");
    unmount();
  });

  it("refuses a CSS move GSAP has folded into its x/y, writes nothing, and hands the translate back", async () => {
    const calls = stubPatchServer();
    const { element, hook, unmount } = renderHost();
    element.style.setProperty("translate", "none");
    Object.assign(element, { _gsap: { renderTransform: () => {}, x: "94px", y: "66px" } });
    const set = vi.fn();
    Object.assign(element.ownerDocument.defaultView!, { gsap: { set } });

    await expect(
      hook().commitPathOffset(
        makeSelection("card", element),
        { x: 1, y: 2 },
        { plainTranslate: true },
      ),
    ).rejects.toThrow(/animation took over/);
    delete (element.ownerDocument.defaultView as { gsap?: unknown }).gsap;
    expect(calls.patches).toEqual([]);
    expect(set).toHaveBeenCalledWith(element, { x: 0, y: 0, xPercent: 0, yPercent: 0 });
    unmount();
  });

  it("saves a CSS move GSAP has only parsed, with nothing folded into its x/y", async () => {
    const calls = stubPatchServer();
    const { element, hook, unmount } = renderHost();
    Object.assign(element, {
      _gsap: { renderTransform: () => {}, x: "0px", y: "0px", xPercent: 0 },
    });

    await expect(
      hook().commitPathOffset(
        makeSelection("card", element),
        { x: 1, y: 2 },
        { plainTranslate: true },
      ),
    ).resolves.toEqual({ ok: true, changed: true });
    expect(calls.patches).toHaveLength(1);
    unmount();
  });

  it("leaves a later move's translate alone when an earlier move's save fails", async () => {
    stubPatchServer(500);
    const { element, hook, unmount } = renderHost();
    element.style.setProperty("translate", "40px 30px");

    const saving = hook().commitPathOffset(makeSelection("card", element), { x: 1, y: 2 });
    element.style.setProperty("translate", "7px 8px");
    await expect(saving).rejects.toThrow();
    expect(element.style.getPropertyValue("translate")).toBe("7px 8px");
    unmount();
  });

  it("keeps the same commits across renders, so the overlay's handlers stay put", () => {
    stubServer();
    const { hook, rerender, unmount } = renderHost();
    const first = hook();
    rerender();
    expect(hook().commitPathOffset).toBe(first.commitPathOffset);
    expect(hook().commitRotation).toBe(first.commitRotation);
    unmount();
  });

  it("rejects a move the server refuses, so the overlay undoes it", async () => {
    stubServer(500);
    const showToast = vi.fn();
    const { element, recordEdit, hook, unmount } = renderHost({ showToast });

    await expect(
      hook().commitPathOffset(makeSelection("card", gsapPositioned(element)), { x: 40, y: 20 }),
    ).rejects.toThrow();
    expect(recordEdit).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.any(String), "error");
    unmount();
  });

  it("undoes a resize whose animations cannot be read, and saves nothing", async () => {
    const mutations = stubServer(200, 500);
    const showToast = vi.fn();
    const restore = vi.fn();
    const { element, recordEdit, hook, unmount } = renderHost({ showToast });
    // GSAP renders the card's transform, so its resize reads animations first.
    Object.assign(element, { _gsap: { renderTransform: () => undefined } });

    await expect(
      hook().commitBoxSize(
        makeSelection("card", element),
        { width: 300, height: 90 },
        undefined,
        restore,
      ),
    ).rejects.toThrow();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.any(String), "error");
    expect(mutations).toHaveLength(0);
    expect(recordEdit).not.toHaveBeenCalled();
    unmount();
  });

  it.each([
    ["the player shows another project", { timelineProjectId: "another-project" }],
    ["the preview has not booted", { previewBooted: false }],
  ])("refuses at once when %s", async (_state, store) => {
    const mutations = stubServer();
    usePlayerStore.setState(store);
    const restore = vi.fn();
    const showToast = vi.fn();
    const { element, hook, unmount } = renderHost({ showToast });

    await expect(
      hook().commitBoxSize(
        makeSelection("card", element),
        { width: 300, height: 90 },
        undefined,
        restore,
      ),
    ).rejects.toThrow("has not loaded yet");
    expect(restore).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("not loaded"), "error");
    expect(mutations).toHaveLength(0);
    unmount();
  });

  it("waits for a move still being saved", async () => {
    const mutations = stubServer();
    const { element, recordEdit, hook, unmount } = renderHost();

    const card = makeSelection("card", gsapPositioned(element));
    const move = hook().commitPathOffset(card, { x: 40, y: 20 });
    await hook().waitForPendingSaves();

    expect(mutations).toHaveLength(1);
    expect(recordEdit).toHaveBeenCalledTimes(1);
    await move;
    unmount();
  });

  it("rejects without a project and writes nothing", async () => {
    const mutations = stubServer();
    const { element, hook, unmount } = renderHost({ projectId: null });

    await expect(
      hook().commitRotation(makeSelection("card", element), { angle: 15 }),
    ).rejects.toThrow("No project is open");
    expect(mutations).toHaveLength(0);
    unmount();
  });
});

describe("useDomGeometryCommit, one word of a staggered phrase", () => {
  const WORDS = ["How", "we", "build", "videos", "at", "scale", "every", "day"];
  const PHRASE = WORDS.map((w, i) => `<span class="w" data-hf-id="hf-w${i}">${w}</span>`).join("");

  function stubPhraseServer(patchStatuses: number[] = []) {
    const calls = { patches: [] as unknown[], gsapMutations: [] as unknown[] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const json = (body: unknown) =>
          new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
        if (url.includes("/api/projects/p1/gsap-animations/")) {
          return json({
            animations: [
              {
                id: ".w-from-200",
                targetSelector: ".w",
                method: "from",
                position: 0.2,
                duration: 0.6,
                properties: { y: 60, opacity: 0 },
              },
            ],
          });
        }
        if (url.includes("/api/projects/p1/files/")) return json({ content: PHRASE });
        if (url.includes("/api/projects/p1/file-mutations/patch-element/")) {
          calls.patches.push(JSON.parse(String(init?.body)));
          const status = patchStatuses.shift();
          if (status) {
            return new Response(JSON.stringify({ error: "the file changed on disk" }), {
              status,
              headers: { "content-type": "application/json" },
            });
          }
          return json({
            ok: true,
            changed: true,
            matched: true,
            path: "index.html",
            content: "AFTER",
            version: "v2",
          });
        }
        if (url.includes("/api/projects/p1/gsap-mutations/")) {
          calls.gsapMutations.push(JSON.parse(String(init?.body)));
          return json({ ok: true, changed: true, before: "B", after: "A" });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    return calls;
  }

  function mountWord(element: HTMLElement) {
    element.ownerDocument.body.innerHTML = PHRASE;
    const word = element.ownerDocument.querySelector<HTMLElement>('[data-hf-id="hf-w0"]')!;
    Object.defineProperties(word, {
      offsetLeft: { get: () => 100 + (Number.parseFloat(word.style.left) || 0) },
      offsetTop: { get: () => 200 + (Number.parseFloat(word.style.top) || 0) },
    });
    const selection = makeSelection("How", gsapPositioned(word));
    return { ...selection, id: undefined, selector: ".w", hfId: "hf-w0" };
  }

  it("saves left/top on the dragged word only and never rewrites the shared tween", async () => {
    const calls = stubPhraseServer();
    const { element, recordEdit, hook, unmount } = renderHost();
    const selection = mountWord(element);

    await expect(hook().commitPathOffset(selection, { x: 40, y: 20 })).resolves.toEqual({
      ok: true,
      changed: true,
    });

    expect(calls.gsapMutations).toHaveLength(0);
    expect(calls.patches).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({ hfId: "hf-w0" }),
        operations: [
          { type: "inline-style", property: "position", value: "relative" },
          { type: "inline-style", property: "left", value: "40px" },
          { type: "inline-style", property: "top", value: "20px" },
        ],
      }),
    ]);
    expect(recordEdit).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("saves a later move after a conflict refused the first, and says what happened", async () => {
    const calls = stubPhraseServer([409]);
    const showToast = vi.fn();
    const { element, recordEdit, hook, unmount } = renderHost({ showToast });
    const selection = mountWord(element);

    await expect(hook().commitPathOffset(selection, { x: 40, y: 20 })).rejects.toThrow();
    expect(showToast.mock.calls.map((call) => call[0])).toEqual([
      "Couldn't save edit: the file changed on disk",
    ]);
    await expect(hook().commitPathOffset(selection, { x: 40, y: 20 })).resolves.toEqual({
      ok: true,
      changed: true,
    });

    expect(calls.patches).toHaveLength(2);
    expect(recordEdit).toHaveBeenCalledTimes(1);
    unmount();
  });
});
