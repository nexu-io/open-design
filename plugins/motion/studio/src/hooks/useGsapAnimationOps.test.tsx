// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { patchElementInHtml } from "@hyperframes/studio-server/source-mutation";
import { jsonResponse } from "./fetchStubTestUtils";
import { useGsapAnimationOps } from "./useGsapAnimationOps";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HookApi = ReturnType<typeof useGsapAnimationOps>;

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const selection = { id: "box", selector: "#box" } as DomEditSelection;

function renderOps(
  commitMutationSafely: (...args: unknown[]) => Promise<void>,
  commitMutation: (...args: unknown[]) => Promise<void> = vi.fn(async () => undefined),
  projectId: string | null = "project",
): HookApi {
  const captured: { api: HookApi | null } = { api: null };
  function Probe() {
    captured.api = useGsapAnimationOps({
      projectIdRef: { current: projectId },
      activeCompPath: "index.html",
      commitMutation,
      commitMutationSafely,
      showToast: vi.fn(),
      sdkSession: null,
      sdkDeps: null,
    });
    return null;
  }

  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  cleanup = () => act(() => root.unmount());
  if (!captured.api) throw new Error("hook did not initialize");
  return captured.api;
}

const CARDS = `<div data-hf-id="hf-a" class="card"></div><div data-hf-id="hf-b" class="card"></div>`;

function mountCards(): HTMLElement[] {
  document.body.innerHTML = CARDS;
  return [...document.body.querySelectorAll<HTMLElement>(".card")];
}

function addTo(api: HookApi, element: HTMLElement, hfId: string): Promise<void> {
  return api.addGsapAnimation({ element, hfId } as unknown as DomEditSelection, "from");
}

/** The patch-element route over an in-memory copy of CARDS, patched by the server's own code. */
function serveCards() {
  let html = CARDS;
  return {
    handle(init?: RequestInit): Response {
      const { target, operations } = JSON.parse(String(init?.body));
      const result = patchElementInHtml(html, target, operations);
      const changed = result.html !== html;
      html = result.html;
      return jsonResponse({
        ok: true,
        changed,
        matched: result.matched,
        elementId: result.elementId,
      });
    },
    stub(route: (init: RequestInit | undefined, call: number) => Promise<Response>) {
      let calls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_input: unknown, init?: RequestInit) => route(init, ++calls)),
      );
    },
    ids(): Record<string, string | null> {
      const doc = new DOMParser().parseFromString(html, "text/html");
      return Object.fromEntries(
        [...doc.querySelectorAll("[data-hf-id]")].map((el) => [
          el.getAttribute("data-hf-id"),
          el.getAttribute("id"),
        ]),
      );
    },
  };
}

function deferredCommit() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { commitMutationSafely: vi.fn(() => promise), release };
}

describe("useGsapAnimationOps settlement", () => {
  it.each([
    ["update", (api: HookApi) => api.updateGsapMeta(selection, "anim-1", { duration: 2 })],
    ["delete", (api: HookApi) => api.deleteGsapAnimation(selection, "anim-1")],
  ])("keeps %s pending until the shared preview synchronizer settles", async (_name, run) => {
    const deferred = deferredCommit();
    const api = renderOps(deferred.commitMutationSafely);
    let settled = false;

    const resultPromise = run(api).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    deferred.release();
    await resultPromise;
    expect(settled).toBe(true);
  });

  it("soft-reloads the preview when adding an animation", async () => {
    const commitMutation = vi.fn(async () => undefined);
    const api = renderOps(
      vi.fn(async () => undefined),
      commitMutation,
    );

    await api.addGsapAnimation(selection, "from");

    expect(commitMutation).toHaveBeenCalledWith(
      selection,
      expect.objectContaining({ type: "add" }),
      expect.objectContaining({ softReload: true }),
    );
  });

  it.each([
    ["saved", true, "div"],
    ["refused", false, null],
  ])(
    "an id-less element takes the file's id only when the id write is %s",
    async (_name, saved, id) => {
      const server = serveCards();
      const [element] = mountCards();
      server.stub(async (init) =>
        saved ? server.handle(init) : jsonResponse({ error: "file changed" }, 409),
      );
      const commitMutation = vi.fn(async () => undefined);
      const api = renderOps(
        vi.fn(async () => undefined),
        commitMutation,
      );

      await addTo(api, element!, "hf-a");

      expect(element!.getAttribute("id")).toBe(id);
      expect(server.ids()).toEqual({ "hf-a": id, "hf-b": null });
      expect(commitMutation).toHaveBeenCalledTimes(id ? 1 : 0);
    },
  );

  it("a reply lost after the id is saved never lets a sibling reuse that id", async () => {
    const server = serveCards();
    const [first, second] = mountCards();
    server.stub(async (init, call) => {
      const reply = server.handle(init);
      if (call === 1) throw new TypeError("connection reset");
      return reply;
    });
    const commitMutation = vi.fn(async () => undefined);
    const api = renderOps(
      vi.fn(async () => undefined),
      commitMutation,
    );

    await expect(addTo(api, first!, "hf-a")).rejects.toThrow("connection reset");
    await addTo(api, second!, "hf-b");

    expect(server.ids()).toEqual({ "hf-a": "div", "hf-b": "div-2" });
    expect(second!.id).toBe("div-2");
    expect(commitMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetSelector: "#div-2" }),
      expect.anything(),
    );

    await addTo(api, first!, "hf-a");

    expect(server.ids()).toEqual({ "hf-a": "div", "hf-b": "div-2" });
    expect(first!.id).toBe("div");
  });

  it("a refused add never strips the id an overlapping saved add gave the same element", async () => {
    const server = serveCards();
    const [element] = mountCards();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.stub(async (init, call) => {
      if (call !== 1) return server.handle(init);
      await held;
      return jsonResponse({ error: "file changed" }, 409);
    });
    const api = renderOps(vi.fn(async () => undefined));

    const refused = addTo(api, element!, "hf-a");
    await addTo(api, element!, "hf-a");
    release();
    await refused;

    expect(server.ids()["hf-a"]).toBeTruthy();
    expect(element!.id).toBe(server.ids()["hf-a"]);
  });

  it("overlapping adds on siblings take the ids the file holds, never one id twice", async () => {
    const server = serveCards();
    const [first, second] = mountCards();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.stub(async (init, call) => {
      if (call === 1) await held;
      return server.handle(init);
    });
    const api = renderOps(vi.fn(async () => undefined));

    const adding = addTo(api, first!, "hf-a");
    await addTo(api, second!, "hf-b");
    release();
    await adding;

    const ids = server.ids();
    expect(new Set([ids["hf-a"], ids["hf-b"]])).toEqual(new Set(["div", "div-2"]));
    expect([first!.id, second!.id]).toEqual([ids["hf-a"], ids["hf-b"]]);
  });

  it("leaves no id when the id write never reaches the file", async () => {
    const [element] = mountCards();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    const api = renderOps(vi.fn(async () => undefined));

    await expect(addTo(api, element!, "hf-a")).rejects.toThrow("offline");
    expect(element!.hasAttribute("id")).toBe(false);
  });

  it("leaves no id when there is no project to save it to", async () => {
    const [element] = mountCards();
    const api = renderOps(
      vi.fn(async () => undefined),
      undefined,
      null,
    );

    await addTo(api, element!, "hf-a");

    expect(element!.hasAttribute("id")).toBe(false);
  });

  it("soft-reloads the preview when deleting an animation", async () => {
    const commitMutationSafely = vi.fn(async () => undefined);
    const api = renderOps(commitMutationSafely);

    await api.deleteGsapAnimation(selection, "anim-1");

    expect(commitMutationSafely).toHaveBeenCalledWith(
      selection,
      expect.objectContaining({ type: "delete" }),
      expect.objectContaining({ softReload: true }),
    );
  });
});
