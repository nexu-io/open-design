// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { jsonResponse, requestUrl } from "./fetchStubTestUtils";
import { assignGsapTargetAutoIdIfNeeded } from "./useDomEditCommitsHelpers";

const selection = {
  hfId: "hf-card",
  selector: '[data-hf-id="hf-card"]',
  selectorIndex: 0,
} as DomEditSelection;

function stubPatch(response: Response) {
  const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], _init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.includes("/api/projects/p1/file-mutations/patch-element/index.html")) return response;
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function assign(over: Partial<Parameters<typeof assignGsapTargetAutoIdIfNeeded>[0]> = {}) {
  const showToast = vi.fn();
  const result = assignGsapTargetAutoIdIfNeeded({
    projectId: "p1",
    targetPath: "index.html",
    selection,
    autoId: "hf-auto-1",
    showToast,
    ...over,
  });
  return { result, showToast };
}

describe("assignGsapTargetAutoIdIfNeeded", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks the patch-element client to ensure the id and returns the one the file holds", async () => {
    const fetchMock = stubPatch(jsonResponse({ changed: true, elementId: "hf-auto-1-2" }));
    const { result } = assign();

    await expect(result).resolves.toBe("hf-auto-1-2");
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("X-Hyperframes-Write-Token")).toBeTruthy();
    expect(JSON.parse(String(init?.body))).toEqual({
      target: { hfId: "hf-card", selector: '[data-hf-id="hf-card"]', selectorIndex: 0 },
      operations: [{ type: "ensure-id", property: "id", value: "hf-auto-1" }],
    });
  });

  it("returns the id the element already holds in the file", async () => {
    stubPatch(jsonResponse({ changed: false, matched: true, elementId: "div" }));
    await expect(assign().result).resolves.toBe("div");
  });

  it.each([
    ["the target is not in the file", { changed: false, matched: false }],
    ["the reply names no id", {}],
  ])("is null with a toast when %s", async (_name, body) => {
    stubPatch(jsonResponse(body));
    const { result, showToast } = assign();

    await expect(result).resolves.toBeNull();
    expect(showToast).toHaveBeenCalledWith(
      "Couldn't assign element id: element not found in index.html",
      "error",
    );
  });

  it("is null with the server's reason in a toast when the patch is refused", async () => {
    stubPatch(
      new Response(JSON.stringify({ error: "target not found" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );
    const { result, showToast } = assign();

    await expect(result).resolves.toBeNull();
    expect(showToast).toHaveBeenCalledWith("Couldn't save edit: target not found", "error");
  });

  it("is null with a plain toast when the refusal has no JSON reason", async () => {
    stubPatch(new Response("boom", { status: 500, headers: { "content-type": "text/plain" } }));
    const { result, showToast } = assign();

    await expect(result).resolves.toBeNull();
    expect(showToast).toHaveBeenCalledWith("Couldn't save edit", "error");
  });

  it("refuses a non-finite target before any request", async () => {
    const fetchMock = stubPatch(jsonResponse({ changed: true }));
    const { result, showToast } = assign({
      selection: { ...selection, selectorIndex: Number.NaN },
    });

    await expect(result).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "Couldn't assign element id because the patch contains invalid values",
      "error",
    );
  });

  it("lets a network failure through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    await expect(assign().result).rejects.toThrow("offline");
  });
});
