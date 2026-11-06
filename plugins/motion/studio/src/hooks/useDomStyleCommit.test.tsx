// @vitest-environment happy-dom
import { act, createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDomStyleCommit, type UseDomStyleCommitOptions } from "../index";
import { makeSelection } from "./domSelectionTestHarness";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));

const SOURCE = '<div id="card" style="color: red">Card</div>';

/** Each patch answers with the next status in `failures` (none left: success). */
function stubServer(failures: number[] = []) {
  const patches: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
      if (url.includes("/api/projects/p1/files/")) return json({ content: SOURCE });
      if (url.includes("/api/projects/p1/file-mutations/patch-element/")) {
        patches.push(JSON.parse(String(init?.body)));
        const status = failures.shift();
        if (status) return new Response(JSON.stringify({ error: "refused" }), { status });
        return json({
          ok: true,
          changed: true,
          matched: true,
          content: "<div>saved</div>",
          path: "index.html",
          version: "v2",
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
  return patches;
}

function renderHost(options: Partial<UseDomStyleCommitOptions> = {}) {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const doc = iframe.contentDocument;
  if (!doc) throw new Error("Expected iframe document");
  doc.body.innerHTML = SOURCE;
  const element = doc.getElementById("card") as HTMLElement;
  const recordEdit = vi.fn(async () => {});
  const api: { current: ReturnType<typeof useDomStyleCommit> | null } = { current: null };
  function Host() {
    const iframeRef = useRef<HTMLIFrameElement | null>(iframe);
    api.current = useDomStyleCommit({
      projectId: "p1",
      iframeRef,
      writeProjectFile: vi.fn(async () => {}),
      recordEdit,
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
  return { element, recordEdit, hook, unmount: () => act(() => root.unmount()) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("useDomStyleCommit, from the package entry", () => {
  it("applies several properties live and saves them as one patch and one undo step", async () => {
    const patches = stubServer();
    const { element, recordEdit, hook, unmount } = renderHost();

    const outcome = await hook().commitStyle(makeSelection("card", element), {
      color: "blue",
      "font-size": "40px",
    });
    await hook().waitForPendingSaves();

    expect(outcome.ok).toBe(true);
    expect(element.style.color).toBe("blue");
    expect(element.style.fontSize).toBe("40px");
    expect(patches).toHaveLength(1);
    expect((patches[0] as { operations: unknown[] }).operations).toHaveLength(2);
    expect(recordEdit).toHaveBeenCalledTimes(1);
    expect(recordEdit).toHaveBeenCalledWith(expect.objectContaining({ label: "Edit layer style" }));
    unmount();
  });

  it("refuses geometry and read-only selections with a reason, and writes nothing", async () => {
    const patches = stubServer();
    const { element, hook, unmount } = renderHost();
    const selection = makeSelection("card", element);

    await expect(hook().commitStyle(selection, { width: "10px" })).resolves.toEqual({
      ok: false,
      reason: "geometry-property",
    });
    const readOnly = {
      ...selection,
      capabilities: { ...selection.capabilities, canEditStyles: false },
    };
    await expect(hook().commitStyle(readOnly, { color: "blue" })).resolves.toEqual({
      ok: false,
      reason: "styles-not-editable",
    });
    expect(patches).toHaveLength(0);
    expect(element.style.color).toBe("red");
    unmount();
  });

  it("never lets a failed save revert a later edit's property", async () => {
    stubServer([500]);
    const { element, hook, unmount } = renderHost();
    const selection = makeSelection("card", element);

    const first = hook().commitStyle(selection, { color: "blue" });
    const second = hook().commitStyle(selection, { color: "green", "font-size": "40px" });

    expect((await first).ok).toBe(false);
    expect((await second).ok).toBe(true);
    expect(element.style.color).toBe("green");
    unmount();
  });

  it("saves again after a conflict paused the queue", async () => {
    stubServer([409]);
    const { element, hook, unmount } = renderHost();
    const selection = makeSelection("card", element);

    expect((await hook().commitStyle(selection, { color: "blue" })).ok).toBe(false);
    expect((await hook().commitStyle(selection, { color: "green" })).ok).toBe(true);
    unmount();
  });

  it("refuses without a project", async () => {
    stubServer();
    const { element, hook, unmount } = renderHost({ projectId: null });
    await expect(
      hook().commitStyle(makeSelection("card", element), { color: "blue" }),
    ).resolves.toEqual({
      ok: false,
      reason: "no-project",
    });
    unmount();
  });
});
