import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  shouldUseSdkCutover,
  sdkCutoverPersist,
  sdkDeletePersist,
  sdkTimingPersist,
  sdkGsapTweenPersist,
  sdkGsapKeyframePersist,
  cutoverCommittedOrThrow,
  persistSdkCandidateMutation,
  persistSdkSerialize,
} from "./sdkCutover";
// fallow-ignore-file code-duplication
import { openComposition } from "@hyperframes/sdk";
import { createMemoryAdapter } from "@hyperframes/sdk/adapters/memory";
import type { PatchOperation } from "./sourcePatcher";
import { StudioSaveNetworkError } from "./studioSaveDiagnostics";

vi.mock("../components/editor/manualEditingAvailability", () => ({
  STUDIO_SDK_CUTOVER_ENABLED: true,
  STUDIO_SDK_RESOLVER_SHADOW_ENABLED: false,
}));
vi.mock("./studioTelemetry", () => ({
  trackStudioEvent: vi.fn(),
}));

import { trackStudioEvent } from "./studioTelemetry";

const styleOp = (property: string, value: string): PatchOperation => ({
  type: "inline-style",
  property,
  value,
});

const textOp = (value: string): PatchOperation => ({
  type: "text-content",
  property: "text",
  value,
});

const attrOp = (property: string, value: string): PatchOperation => ({
  type: "attribute",
  property,
  value,
});

const htmlAttrOp = (property: string, value: string): PatchOperation => ({
  type: "html-attribute",
  property,
  value,
});

const candidateTestDeps = () => ({
  publishSession: vi.fn(),
  createCandidateSession: async (
    _serialized: string,
    live: Parameters<typeof sdkCutoverPersist>[4],
  ) => live!,
});

describe("shouldUseSdkCutover", () => {
  it("returns false when flag disabled", () => {
    expect(shouldUseSdkCutover(false, true, "hf-abc", [styleOp("color", "red")])).toBe(false);
  });

  it("returns false when no session", () => {
    expect(shouldUseSdkCutover(true, false, "hf-abc", [styleOp("color", "red")])).toBe(false);
  });

  it("returns false when no hfId", () => {
    expect(shouldUseSdkCutover(true, true, null, [styleOp("color", "red")])).toBe(false);
    expect(shouldUseSdkCutover(true, true, undefined, [styleOp("color", "red")])).toBe(false);
  });

  it("returns false when ops empty", () => {
    expect(shouldUseSdkCutover(true, true, "hf-abc", [])).toBe(false);
  });

  it("returns true for inline-style ops", () => {
    expect(shouldUseSdkCutover(true, true, "hf-abc", [styleOp("color", "red")])).toBe(true);
  });

  it("returns true for text-content ops", () => {
    expect(shouldUseSdkCutover(true, true, "hf-abc", [textOp("hello")])).toBe(true);
  });

  it("returns true for attribute ops", () => {
    expect(shouldUseSdkCutover(true, true, "hf-abc", [attrOp("data-x", "10")])).toBe(true);
  });

  it("returns true for html-attribute ops", () => {
    expect(shouldUseSdkCutover(true, true, "hf-abc", [htmlAttrOp("class", "foo")])).toBe(true);
  });

  it("returns false for an attribute op that maps to a reserved data-* name", () => {
    // {type:'attribute', property:'end'} → 'data-end', which the SDK's
    // validateSetAttribute rejects. Decline the batch so it takes the server
    // path cleanly instead of throwing inside dispatch and falling back per op.
    expect(shouldUseSdkCutover(true, true, "hf-abc", [attrOp("end", "2")])).toBe(false);
    expect(shouldUseSdkCutover(true, true, "hf-abc", [attrOp("data-start", "1")])).toBe(false);
  });

  it("declines a case-variant reserved attribute (SDK lowercases before checking)", () => {
    // attribute op "END" → "data-END" → lower → "data-end" (reserved).
    expect(shouldUseSdkCutover(true, true, "hf-abc", [attrOp("END", "2")])).toBe(false);
  });

  it("declines an html-attribute op whose raw name is reserved", () => {
    // html-attribute ops aren't data-prefixed, so a raw reserved name must still
    // be caught (the SDK throws on it just the same).
    expect(shouldUseSdkCutover(true, true, "hf-abc", [htmlAttrOp("data-end", "3")])).toBe(false);
    expect(shouldUseSdkCutover(true, true, "hf-abc", [htmlAttrOp("DATA-START", "1")])).toBe(false);
  });

  it("declines html-attribute ops with event handler names", () => {
    expect(shouldUseSdkCutover(true, true, "hf-abc", [htmlAttrOp("onclick", "alert(1)")])).toBe(
      false,
    );
    expect(shouldUseSdkCutover(true, true, "hf-abc", [htmlAttrOp("onload", "fetch()")])).toBe(
      false,
    );
  });

  it("declines html-attribute ops with disallowed attribute names", () => {
    expect(shouldUseSdkCutover(true, true, "hf-abc", [htmlAttrOp("formaction", "/x")])).toBe(false);
  });

  it("declines html-attribute ops with dangerous URI schemes", () => {
    expect(
      shouldUseSdkCutover(true, true, "hf-abc", [htmlAttrOp("href", "javascript:alert(1)")]),
    ).toBe(false);
    expect(shouldUseSdkCutover(true, true, "hf-abc", [htmlAttrOp("src", "vbscript:run")])).toBe(
      false,
    );
  });

  it("declines html-attribute ops with dangerous data URIs", () => {
    expect(
      shouldUseSdkCutover(true, true, "hf-abc", [
        htmlAttrOp("href", "data:text/html,<script>alert(1)</script>"),
      ]),
    ).toBe(false);
  });

  it("returns true when ops mix all supported types", () => {
    expect(
      shouldUseSdkCutover(true, true, "hf-abc", [
        styleOp("color", "red"),
        textOp("hello"),
        attrOp("x", "1"),
        htmlAttrOp("class", "foo"),
      ]),
    ).toBe(true);
  });
});

describe("sdkCutoverPersist", () => {
  const makeDeps = (overrides: Partial<Parameters<typeof sdkCutoverPersist>[5]> = {}) => ({
    editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
    writeProjectFile: vi.fn().mockResolvedValue(undefined),
    reloadPreview: vi.fn(),
    ...candidateTestDeps(),
    ...overrides,
  });

  const makeSession = (hasEl = true) =>
    ({
      getElement: vi.fn().mockReturnValue(hasEl ? { inlineStyles: {} } : null),
      dispatch: vi.fn(),
      // Distinct before/after so the no-op guard (after === before → fall back)
      // treats this as a real change; "after" matches the write assertions.
      serialize: vi
        .fn()
        .mockReturnValueOnce("<html>before</html>")
        .mockReturnValue("<html></html>"),
      batch: vi.fn((fn: () => void) => fn()),
    }) as unknown as Parameters<typeof sdkCutoverPersist>[4];

  it("returns false when session is null", async () => {
    const deps = makeDeps();
    const sel = { hfId: "hf-abc" } as never;
    const result = await sdkCutoverPersist(
      sel,
      [styleOp("color", "red")],
      "before",
      "/path.html",
      null,
      deps,
    );
    expect(result.status).toBe("declined");
  });

  it("returns false when element not found in session", async () => {
    const deps = makeDeps();
    const session = makeSession(false);
    const sel = { hfId: "hf-abc" } as never;
    const result = await sdkCutoverPersist(
      sel,
      [styleOp("color", "red")],
      "before",
      "/path.html",
      session,
      deps,
    );
    expect(result.status).toBe("declined");
  });

  it("tags target_not_found with resolverDisagreement when dispatch could have resolved it", async () => {
    // getElement is canonical-only for a bare id; resolveSnapshot mirrors what
    // dispatch resolves (bare ids anywhere). An element present under a scoped
    // id is dispatchable, so getElement refusing it is a resolver disagreement
    // — and one the shadow event stays silent about.
    const deps = makeDeps();
    const session = makeSession(false);
    (session as unknown as { getElements: () => unknown[] }).getElements = () => [
      { id: "hf-abc", scopedId: "host/hf-abc" },
    ];
    const sel = { hfId: "hf-abc" } as never;

    await sdkCutoverPersist(sel, [styleOp("color", "red")], "before", "/path.html", session, deps);

    expect(trackStudioEvent).toHaveBeenCalledWith(
      "sdk_cutover_declined",
      expect.objectContaining({ reason: "target_not_found", resolverDisagreement: true }),
    );
  });

  it("does not tag resolverDisagreement when the element is genuinely absent", async () => {
    const deps = makeDeps();
    const session = makeSession(false);
    (session as unknown as { getElements: () => unknown[] }).getElements = () => [
      { id: "hf-other", scopedId: "hf-other" },
    ];
    const sel = { hfId: "hf-abc" } as never;
    vi.mocked(trackStudioEvent).mockClear();

    await sdkCutoverPersist(sel, [styleOp("color", "red")], "before", "/path.html", session, deps);

    expect(trackStudioEvent).toHaveBeenLastCalledWith(
      "sdk_cutover_declined",
      expect.objectContaining({ reason: "target_not_found" }),
    );
    expect(vi.mocked(trackStudioEvent).mock.lastCall?.[1]).not.toHaveProperty(
      "resolverDisagreement",
    );
  });

  it("dispatches setStyle for inline-style ops", async () => {
    const deps = makeDeps();
    const session = makeSession(true);
    const sel = { hfId: "hf-abc" } as never;
    const result = await sdkCutoverPersist(
      sel,
      [styleOp("color", "red"), styleOp("opacity", "0.5")],
      "before",
      "/comp.html",
      session,
      deps,
    );
    expect(result.status).toBe("committed");
    expect(session!.dispatch).toHaveBeenCalledWith({
      type: "setStyle",
      target: "hf-abc",
      styles: { color: "red", opacity: "0.5" },
    });
    expect(deps.writeProjectFile).toHaveBeenCalledWith("/comp.html", "<html></html>", "before");
    expect(deps.reloadPreview).toHaveBeenCalled();
  });

  it("dispatches setText for text-content op", async () => {
    const deps = makeDeps();
    const session = makeSession(true);
    const sel = { hfId: "hf-abc" } as never;
    const result = await sdkCutoverPersist(
      sel,
      [textOp("Hello world")],
      "before",
      "/comp.html",
      session,
      deps,
    );
    expect(result.status).toBe("committed");
    expect(session!.dispatch).toHaveBeenCalledWith({
      type: "setText",
      target: "hf-abc",
      value: "Hello world",
    });
  });

  it.each([
    { name: "multi-child targets", children: [{ id: "a" }, { id: "b" }] },
    { name: "single non-html children", children: [{ id: "a", tag: "svg" }] },
  ])("declines text-content cutover for $name", async ({ children }) => {
    const deps = makeDeps();
    const session = makeSession(true);
    (session!.getElement as ReturnType<typeof vi.fn>).mockReturnValue({ children });
    const sel = { hfId: "hf-abc" } as never;
    const result = await sdkCutoverPersist(
      sel,
      [textOp("Hello world")],
      "before",
      "/comp.html",
      session,
      deps,
    );
    expect(result.status).toBe("declined");
    expect(session!.dispatch).not.toHaveBeenCalled();
    expect(deps.writeProjectFile).not.toHaveBeenCalled();
  });

  it("dispatches setAttribute for attribute op with data- prefix", async () => {
    const deps = makeDeps();
    const session = makeSession(true);
    const sel = { hfId: "hf-abc" } as never;
    const result = await sdkCutoverPersist(
      sel,
      [attrOp("x", "42")],
      "before",
      "/comp.html",
      session,
      deps,
    );
    expect(result.status).toBe("committed");
    expect(session!.dispatch).toHaveBeenCalledWith({
      type: "setAttribute",
      target: "hf-abc",
      name: "data-x",
      value: "42",
    });
  });

  it("dispatches setAttribute for html-attribute op", async () => {
    const deps = makeDeps();
    const session = makeSession(true);
    const sel = { hfId: "hf-abc" } as never;
    const result = await sdkCutoverPersist(
      sel,
      [htmlAttrOp("class", "foo bar")],
      "before",
      "/comp.html",
      session,
      deps,
    );
    expect(result.status).toBe("committed");
    expect(session!.dispatch).toHaveBeenCalledWith({
      type: "setAttribute",
      target: "hf-abc",
      name: "class",
      value: "foo bar",
    });
  });

  it("passes caller label to recordEdit", async () => {
    const deps = makeDeps();
    const session = makeSession(true);
    const sel = { hfId: "hf-abc" } as never;
    await sdkCutoverPersist(sel, [styleOp("color", "red")], "before", "/comp.html", session, deps, {
      label: "Resize layer box",
    });
    expect(deps.editHistory.recordEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Resize layer box",
        targets: [{ file: "/comp.html", hfId: "hf-abc" }],
      }),
    );
  });

  it("passes caller coalesceKey to recordEdit", async () => {
    const deps = makeDeps();
    const session = makeSession(true);
    const sel = { hfId: "hf-abc" } as never;
    await sdkCutoverPersist(sel, [styleOp("color", "red")], "before", "/comp.html", session, deps, {
      coalesceKey: "my-key",
    });
    expect(deps.editHistory.recordEdit).toHaveBeenCalledWith(
      expect.objectContaining({ coalesceKey: "my-key" }),
    );
  });

  it("returns false and does not throw on dispatch error", async () => {
    const deps = makeDeps();
    const session = makeSession(true);
    (session!.dispatch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("dispatch failed");
    });
    const sel = { hfId: "hf-abc" } as never;
    const result = await sdkCutoverPersist(
      sel,
      [styleOp("color", "red")],
      "before",
      "/comp.html",
      session,
      deps,
    );
    expect(result.status).toBe("failed");
    expect(deps.reloadPreview).not.toHaveBeenCalled();
  });

  it("wraps all dispatches in session.batch() for atomic rollback", async () => {
    const deps = makeDeps();
    const session = makeSession(true);
    const sel = { hfId: "hf-abc" } as never;
    await sdkCutoverPersist(
      sel,
      [styleOp("color", "red"), styleOp("opacity", "0.5")],
      "before",
      "/comp.html",
      session,
      deps,
    );
    expect(
      (session as unknown as { batch: ReturnType<typeof vi.fn> }).batch,
    ).toHaveBeenCalledOnce();
  });

  it("returns false when second dispatch throws (batch prevents partial mutation)", async () => {
    // inline-style ops coalesce into one setStyle dispatch; use style+text to produce two dispatches.
    const deps = makeDeps();
    const session = makeSession(true);
    let callCount = 0;
    (session!.dispatch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      if (callCount === 2) throw new Error("2nd op failed");
    });
    const sel = { hfId: "hf-abc" } as never;
    const result = await sdkCutoverPersist(
      sel,
      [styleOp("color", "red"), textOp("hello")],
      "before",
      "/comp.html",
      session,
      deps,
    );
    expect(result.status).toBe("failed");
    expect(deps.writeProjectFile).not.toHaveBeenCalled();
    expect(deps.reloadPreview).not.toHaveBeenCalled();
  });
});

describe("transactional SDK candidate publication", () => {
  const html = `<!DOCTYPE html><html data-composition-variables='[]'><body>
<div data-hf-id="hf-stage" data-hf-root><div data-hf-id="hf-box" data-start="0" data-duration="1"></div>
<script>var tl = gsap.timeline({ paused: true });
tl.to('[data-hf-id="hf-box"]', { duration: 1, x: 100 }, 0);
window.__timelines = { main: tl };</script></div>
</body></html>`;

  it.each([
    [
      "style",
      (session: Awaited<ReturnType<typeof openComposition>>) =>
        session.setStyle("hf-box", { color: "red" }),
    ],
    [
      "timing",
      (session: Awaited<ReturnType<typeof openComposition>>) =>
        session.setTiming("hf-box", { start: 2 }),
    ],
    [
      "delete",
      (session: Awaited<ReturnType<typeof openComposition>>) => session.removeElement("hf-box"),
    ],
    [
      "variables",
      (session: Awaited<ReturnType<typeof openComposition>>) =>
        session.declareVariable({ id: "title", type: "string", label: "Title", default: "Hello" }),
    ],
    [
      "grouping/structure",
      (session: Awaited<ReturnType<typeof openComposition>>) =>
        session.addElement(null, 0, '<div data-hf-group="group-1"></div>'),
    ],
    [
      "GSAP",
      (session: Awaited<ReturnType<typeof openComposition>>) => {
        const animationId = session.getElement("hf-box")?.animationIds[0];
        if (!animationId) throw new Error("missing fixture animation");
        session.setGsapTween(animationId, { ease: "power2.in" });
      },
    ],
  ])(
    "restores disk and keeps the live session unchanged when %s history fails",
    async (_name, mutate) => {
      const live = await openComposition(html, { history: false });
      const liveBefore = live.serialize();
      let disk = html;
      const publishSession = vi.fn();
      const result = await persistSdkCandidateMutation(
        live,
        "/comp.html",
        html,
        {
          editHistory: { recordEdit: vi.fn().mockRejectedValue(new Error("history failed")) },
          writeProjectFile: vi.fn(async (_path: string, content: string) => {
            disk = content;
          }),
          reloadPreview: vi.fn(),
          publishSession,
        },
        mutate,
        { label: `Edit ${_name}` },
      );

      expect(result.status).toBe("failed");
      expect(disk).toBe(html);
      expect(live.serialize()).toBe(liveBefore);
      expect(publishSession).not.toHaveBeenCalled();
      expect(() => cutoverCommittedOrThrow(result)).toThrow("history failed");
      live.dispose();
    },
  );

  it("disposes a mutated real candidate and leaves the live session unpublished when the write fails", async () => {
    const live = await openComposition(html, { history: false });
    const liveBefore = live.serialize();
    let candidate: Awaited<ReturnType<typeof openComposition>> | undefined;
    let disposeCandidate: ReturnType<typeof vi.spyOn> | undefined;
    const publishSession = vi.fn().mockReturnValue("published");
    const writeError = new Error("write failed");
    const writeProjectFile = vi.fn().mockRejectedValue(writeError);
    const result = await persistSdkCandidateMutation(
      live,
      "/comp.html",
      html,
      {
        editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
        writeProjectFile,
        reloadPreview: vi.fn(),
        createCandidateSession: async (source) => {
          candidate = await openComposition(source, { history: false });
          disposeCandidate = vi.spyOn(candidate, "dispose");
          return candidate;
        },
        publishSession,
      },
      (next) => next.setStyle("hf-box", { color: "red" }),
    );

    expect(result).toMatchObject({ status: "failed", error: writeError });
    expect(writeProjectFile).toHaveBeenCalledOnce();
    expect(writeProjectFile.mock.calls[0]?.[0]).toBe("/comp.html");
    expect(writeProjectFile.mock.calls[0]?.[1]).toContain("color: red");
    expect(live.serialize()).toBe(liveBefore);
    expect(publishSession).not.toHaveBeenCalled();
    expect(disposeCandidate).toHaveBeenCalledOnce();
    live.dispose();
  });

  it("publishes the candidate only after write and history commit", async () => {
    const live = await openComposition(html, { history: false });
    const liveBefore = live.serialize();
    const order: string[] = [];
    let published: Awaited<ReturnType<typeof openComposition>> | undefined;
    const result = await persistSdkCandidateMutation(
      live,
      "/comp.html",
      html,
      {
        editHistory: {
          recordEdit: vi.fn(async () => {
            order.push("history");
          }),
        },
        writeProjectFile: vi.fn(async () => {
          order.push("write");
        }),
        reloadPreview: vi.fn(() => order.push("refresh")),
        publishSession: ({ candidate }) => {
          order.push("publish");
          published = candidate;
          return "published";
        },
      },
      (candidate) => candidate.setStyle("hf-box", { color: "red" }),
    );

    expect(result.status).toBe("committed");
    expect(order).toEqual(["write", "history", "publish", "refresh"]);
    expect(live.serialize()).toBe(liveBefore);
    expect(published?.serialize()).toContain("color: red");
    live.dispose();
    published?.dispose();
  });

  it("keeps the durable commit authoritative when a publisher throws after publication", async () => {
    const live = await openComposition(html, { history: false });
    let disk = html;
    let published: Awaited<ReturnType<typeof openComposition>> | undefined;
    const recordEdit = vi.fn().mockResolvedValue(undefined);
    const writeProjectFile = vi.fn(async (_path: string, content: string) => {
      disk = content;
    });
    const result = await persistSdkCandidateMutation(
      live,
      "/comp.html",
      html,
      {
        editHistory: { recordEdit },
        writeProjectFile,
        reloadPreview: vi.fn(),
        publishSession: ({ candidate }) => {
          published = candidate;
          throw new Error("cleanup after publish failed");
        },
      },
      (candidate) => candidate.setStyle("hf-box", { color: "red" }),
    );

    expect(result.status).toBe("committed");
    expect(disk).toContain("color: red");
    expect(writeProjectFile).toHaveBeenCalledTimes(1);
    expect(recordEdit).toHaveBeenCalledTimes(1);
    expect(published?.serialize()).toContain("color: red");
    live.dispose();
    published?.dispose();
  });

  it("serializes overlapping SDK edits and rebases each candidate on the latest disk bytes", async () => {
    const live = await openComposition(html, { history: false });
    let disk = html;
    const published: Array<Awaited<ReturnType<typeof openComposition>>> = [];
    const writeProjectFile = vi.fn(async (_path: string, content: string) => {
      // Yield inside the write to make overlap deterministic.
      await Promise.resolve();
      disk = content;
    });
    const deps = {
      editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
      writeProjectFile,
      readProjectFile: vi.fn(async () => disk),
      reloadPreview: vi.fn(),
      publishSession: ({ candidate }) => {
        published.push(candidate);
        return "published";
      },
    };

    const [first, second] = await Promise.all([
      persistSdkCandidateMutation(live, "/comp.html", html, deps, (candidate) =>
        candidate.setStyle("hf-box", { color: "red" }),
      ),
      persistSdkCandidateMutation(live, "/comp.html", html, deps, (candidate) =>
        candidate.setStyle("hf-box", { backgroundColor: "blue" }),
      ),
    ]);

    expect(first.status).toBe("committed");
    expect(second.status).toBe("committed");
    expect(disk).toContain("color: red");
    expect(disk).toContain("background-color: blue");
    expect(writeProjectFile).toHaveBeenCalledTimes(2);
    live.dispose();
    for (const candidate of published) candidate.dispose();
  });

  it("does not resurrect an element a prior REST write already deleted, even with a stale live session", async () => {
    // A delete persists via the server REST path, then a same-gesture ripple
    // move reaches an SDK-eligible batch persist while `live` was never
    // reloaded. Prove the candidate rebases on the post-delete disk bytes.
    const twoElementHtml = `<!DOCTYPE html><html data-composition-variables='[]'><body>
<div data-hf-id="hf-stage" data-hf-root>
<div data-hf-id="hf-a" data-start="0" data-duration="2"></div>
<div data-hf-id="hf-b" data-start="5" data-duration="2"></div>
</div>
</body></html>`;
    const live = await openComposition(twoElementHtml, { history: false });

    // Disk already reflects hf-b's deletion — a separate write that completed
    // before this persist started, exactly like the delete's own REST call
    // that `handleTimelineElementsDelete` awaits before the ripple begins.
    const postDelete = await openComposition(twoElementHtml, { history: false });
    postDelete.removeElement("hf-b");
    let disk = postDelete.serialize();
    postDelete.dispose();
    expect(disk).not.toContain("hf-b");

    const writeProjectFile = vi.fn(async (_path: string, content: string) => {
      disk = content;
    });
    const deps = {
      editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
      writeProjectFile,
      readProjectFile: vi.fn(async () => disk),
      reloadPreview: vi.fn(),
      publishSession: vi.fn().mockReturnValue("published"),
    };

    // The ripple: only survivors move, mirroring resolveShiftedElements — this
    // never touches hf-b, which `live` (unlike disk) still believes exists.
    const result = await persistSdkCandidateMutation(
      live,
      "/comp.html",
      twoElementHtml,
      deps,
      (candidate) => candidate.setTiming("hf-a", { start: 3 }),
    );

    expect(result.status).toBe("committed");
    expect(disk).not.toContain("hf-b");
    const written = await openComposition(disk, { history: false });
    expect(written.getElement("hf-a")?.start).toBe(3);
    expect(written.getElement("hf-b")).toBeNull();
    written.dispose();
    live.dispose();
  });

  it("fails instead of cloning stale bytes when the authoritative queued read rejects", async () => {
    const live = await openComposition(html, { history: false });
    let disk = html;
    let readCount = 0;
    const writeProjectFile = vi.fn(async (_path: string, content: string) => {
      disk = content;
    });
    const deps = {
      editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
      writeProjectFile,
      readProjectFile: vi.fn(async () => {
        readCount++;
        if (readCount === 1) return disk;
        throw new Error("transient read failure");
      }),
      reloadPreview: vi.fn(),
      publishSession: vi.fn().mockReturnValue("published"),
    };

    const first = await persistSdkCandidateMutation(live, "/comp.html", html, deps, (candidate) =>
      candidate.setStyle("hf-box", { color: "red" }),
    );
    const second = await persistSdkCandidateMutation(live, "/comp.html", html, deps, (candidate) =>
      candidate.setStyle("hf-box", { backgroundColor: "blue" }),
    );

    expect(first.status).toBe("committed");
    expect(second).toMatchObject({ status: "failed", error: new Error("transient read failure") });
    expect(disk).toContain("color: red");
    expect(disk).not.toContain("background-color: blue");
    expect(writeProjectFile).toHaveBeenCalledTimes(1);
    live.dispose();
  });

  it("does not publish a delayed candidate after the active composition switches", async () => {
    const liveA = await openComposition(html, { history: false });
    const liveB = await openComposition(html.replace("hf-box", "hf-other"), { history: false });
    const candidateA = await openComposition(html, { history: false });
    const disposeCandidate = vi.spyOn(candidateA, "dispose");
    let activePath = "/a.html";
    let currentSession = liveA;
    let releaseHistory: (() => void) | undefined;
    const historyStarted = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    let notifyHistoryStarted: (() => void) | undefined;
    const didStartHistory = new Promise<void>((resolve) => {
      notifyHistoryStarted = resolve;
    });
    const published: Array<Awaited<ReturnType<typeof openComposition>>> = [];
    const refresh = vi.fn();
    const pending = persistSdkCandidateMutation(
      liveA,
      "/a.html",
      html,
      {
        editHistory: {
          recordEdit: vi.fn(async () => {
            notifyHistoryStarted?.();
            await historyStarted;
          }),
        },
        writeProjectFile: vi.fn().mockResolvedValue(undefined),
        readProjectFile: vi.fn().mockResolvedValue(html),
        reloadPreview: vi.fn(),
        refresh,
        createCandidateSession: vi.fn().mockResolvedValue(candidateA),
        publishSession: ({ candidate, expectedSession, targetPath }) => {
          if (activePath !== targetPath || currentSession !== expectedSession) {
            return "rejected-inactive-target";
          }
          currentSession = candidate;
          published.push(candidate);
          return "published";
        },
      },
      (candidate) => candidate.setStyle("hf-box", { color: "red" }),
    );

    await didStartHistory;
    activePath = "/b.html";
    currentSession = liveB;
    releaseHistory?.();

    expect((await pending).status).toBe("committed");
    expect(currentSession).toBe(liveB);
    expect(published).toHaveLength(0);
    expect(disposeCandidate).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
    liveA.dispose();
    liveB.dispose();
  });
});

describe("persistSdkSerialize — shared per-file transaction boundary", () => {
  const html = `<!DOCTYPE html><html data-composition-variables='[]'><body>
<div data-hf-id="hf-stage" data-hf-root><div data-hf-id="hf-box" data-start="0" data-duration="1"></div></div>
</body></html>`;

  const makeDeps = (disk: { current: string }) => ({
    editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
    writeProjectFile: vi.fn(async (_path: string, content: string) => {
      disk.current = content;
    }),
    readProjectFile: vi.fn(async () => disk.current),
    reloadPreview: vi.fn(),
  });

  it("rebases overlapping whole-file transforms on the latest committed bytes", async () => {
    const disk = { current: "<html><body></body></html>" };
    let releaseFirstWrite: (() => void) | undefined;
    const firstWriteStarted = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    let notifyFirstWriteStarted: (() => void) | undefined;
    const didStartFirstWrite = new Promise<void>((resolve) => {
      notifyFirstWriteStarted = resolve;
    });
    const deps = makeDeps(disk);
    deps.writeProjectFile.mockImplementationOnce(async (_path: string, content: string) => {
      notifyFirstWriteStarted?.();
      await firstWriteStarted;
      disk.current = content;
    });

    const first = persistSdkSerialize(
      (before) => before.replace("</body>", "<div>A</div></body>"),
      "/comp.html",
      disk.current,
      deps,
    );
    await didStartFirstWrite;
    const second = persistSdkSerialize(
      (before) => before.replace("</body>", "<div>B</div></body>"),
      "/comp.html",
      disk.current,
      deps,
    );
    releaseFirstWrite?.();
    await Promise.all([first, second]);

    expect(disk.current).toContain("<div>A</div>");
    expect(disk.current).toContain("<div>B</div>");
  });

  it("shares the same queue with candidate mutations", async () => {
    const disk = { current: html };
    const live = await openComposition(html, { history: false });
    const published: Array<Awaited<ReturnType<typeof openComposition>>> = [];
    const deps = {
      ...makeDeps(disk),
      publishSession: ({
        candidate,
      }: {
        candidate: Awaited<ReturnType<typeof openComposition>>;
      }) => {
        published.push(candidate);
        return "published";
      },
    };
    let releaseCandidateWrite: (() => void) | undefined;
    const candidateWriteGate = new Promise<void>((resolve) => {
      releaseCandidateWrite = resolve;
    });
    let notifyCandidateWriteStarted: (() => void) | undefined;
    const candidateWriteStarted = new Promise<void>((resolve) => {
      notifyCandidateWriteStarted = resolve;
    });
    deps.writeProjectFile.mockImplementationOnce(async (_path: string, content: string) => {
      notifyCandidateWriteStarted?.();
      await candidateWriteGate;
      disk.current = content;
    });

    const candidateEdit = persistSdkCandidateMutation(live, "/comp.html", html, deps, (candidate) =>
      candidate.setStyle("hf-box", { color: "red" }),
    );
    await candidateWriteStarted;
    const islandEdit = persistSdkSerialize(
      (before) => before.replace("</body>", "<script>island</script></body>"),
      "/comp.html",
      html,
      deps,
    );
    releaseCandidateWrite?.();
    await Promise.all([candidateEdit, islandEdit]);

    expect(disk.current).toContain("color: red");
    expect(disk.current).toContain("<script>island</script>");
    live.dispose();
    for (const candidate of published) candidate.dispose();
  });
});

describe("sdkDeletePersist", () => {
  const makeDeps = () => ({
    editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
    writeProjectFile: vi.fn().mockResolvedValue(undefined),
    reloadPreview: vi.fn(),
    ...candidateTestDeps(),
  });

  const makeSession = (hasEl = true) =>
    ({
      getElement: vi.fn().mockReturnValue(hasEl ? { id: "hf-abc" } : null),
      removeElement: vi.fn(),
      serialize: vi
        .fn()
        .mockReturnValueOnce("<html>before-snap</html>")
        .mockReturnValue("<html>after</html>"),
      batch: vi.fn((fn: () => void) => fn()),
    }) as unknown as Parameters<typeof sdkDeletePersist>[3];

  it("returns false when session is null", async () => {
    expect(
      (await sdkDeletePersist("hf-abc", "before", "/comp.html", null, makeDeps())).status,
    ).toBe("declined");
  });

  it("returns false when element not found in session", async () => {
    const session = makeSession(false);
    expect(
      (await sdkDeletePersist("hf-abc", "before", "/comp.html", session, makeDeps())).status,
    ).toBe("declined");
  });

  it("calls removeElement and writes serialized content", async () => {
    const deps = makeDeps();
    const session = makeSession(true);
    const result = await sdkDeletePersist("hf-abc", "before", "/comp.html", session, deps);
    expect(result.status).toBe("committed");
    expect(session!.removeElement).toHaveBeenCalledWith("hf-abc");
    expect(deps.writeProjectFile).toHaveBeenCalledWith(
      "/comp.html",
      "<html>after</html>",
      "before",
    );
  });

  it("records edit history with before/after diff", async () => {
    const deps = makeDeps();
    const session = makeSession(true);
    await sdkDeletePersist("hf-abc", "before-content", "/comp.html", session, deps);
    expect(deps.editHistory.recordEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Delete element",
        files: { "/comp.html": { before: "before-content", after: "<html>after</html>" } },
      }),
    );
  });

  it("calls reloadPreview on success", async () => {
    const deps = makeDeps();
    const session = makeSession(true);
    await sdkDeletePersist("hf-abc", "before", "/comp.html", session, deps);
    expect(deps.reloadPreview).toHaveBeenCalled();
  });

  it("returns false and does not write on removeElement error", async () => {
    const deps = makeDeps();
    const session = makeSession(true);
    (session!.removeElement as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("remove failed");
    });
    const result = await sdkDeletePersist("hf-abc", "before", "/comp.html", session, deps);
    expect(result.status).toBe("failed");
    expect(deps.writeProjectFile).not.toHaveBeenCalled();
    expect(deps.reloadPreview).not.toHaveBeenCalled();
  });
});

describe("sdkTimingPersist", () => {
  const makeDeps = () => ({
    editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
    writeProjectFile: vi.fn().mockResolvedValue(undefined),
    reloadPreview: vi.fn(),
    ...candidateTestDeps(),
  });

  const makeSession = (hasEl = true) =>
    ({
      getElement: vi.fn().mockReturnValue(hasEl ? { id: "hf-clip" } : null),
      setTiming: vi.fn(),
      serialize: vi
        .fn()
        .mockReturnValueOnce("<html>before</html>")
        .mockReturnValue("<html>after</html>"),
      batch: vi.fn((fn: () => void) => fn()),
    }) as unknown as Parameters<typeof sdkTimingPersist>[3];

  it("returns false when session is null", async () => {
    expect(
      (await sdkTimingPersist("hf-clip", "/comp.html", { start: 1 }, null, makeDeps())).status,
    ).toBe("declined");
  });

  it("returns false when element not found in session", async () => {
    const session = makeSession(false);
    expect(
      (await sdkTimingPersist("hf-clip", "/comp.html", { start: 1 }, session, makeDeps())).status,
    ).toBe("declined");
  });

  it("calls setTiming with provided update and writes serialized content", async () => {
    const deps = makeDeps();
    const session = makeSession(true);
    const result = await sdkTimingPersist(
      "hf-clip",
      "/comp.html",
      { start: 2, duration: 5, trackIndex: 1 },
      session,
      deps,
    );
    expect(result.status).toBe("committed");
    expect(session!.setTiming).toHaveBeenCalledWith("hf-clip", {
      start: 2,
      duration: 5,
      trackIndex: 1,
    });
    expect(deps.writeProjectFile).toHaveBeenCalledWith(
      "/comp.html",
      "<html>after</html>",
      "<html>before</html>",
    );
  });

  it("captures before-state before setTiming dispatch", async () => {
    const deps = makeDeps();
    const session = makeSession(true);
    await sdkTimingPersist("hf-clip", "/comp.html", { start: 3 }, session, deps);
    expect(deps.editHistory.recordEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        files: { "/comp.html": { before: "<html>before</html>", after: "<html>after</html>" } },
      }),
    );
  });

  it("returns false and does not write on setTiming error", async () => {
    const deps = makeDeps();
    const session = makeSession(true);
    (session!.setTiming as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("timing error");
    });
    const result = await sdkTimingPersist("hf-clip", "/comp.html", { start: 1 }, session, deps);
    expect(result.status).toBe("failed");
    expect(deps.writeProjectFile).not.toHaveBeenCalled();
  });

  // Finding #12: undo baseline must be the EXACT on-disk bytes (matching the
  // style/delete paths), not a normalized SDK serialize() re-emit — otherwise
  // undoing a timing edit reformats the whole file.
  it("records the on-disk content (not serialize()) as the undo before when a reader is provided", async () => {
    const deps = {
      ...makeDeps(),
      readProjectFile: vi.fn().mockResolvedValue("<html>EXACT ON-DISK BYTES</html>"),
    };
    const session = makeSession(true);
    await sdkTimingPersist("hf-clip", "/comp.html", { start: 3 }, session, deps);
    expect(deps.readProjectFile).toHaveBeenCalledWith("/comp.html");
    expect(deps.readProjectFile).toHaveBeenCalledOnce();
    expect(deps.editHistory.recordEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        files: {
          "/comp.html": { before: "<html>EXACT ON-DISK BYTES</html>", after: "<html>after</html>" },
        },
      }),
    );
  });

  it("fails without writing when the authoritative reader throws", async () => {
    const deps = {
      ...makeDeps(),
      readProjectFile: vi.fn().mockRejectedValue(new Error("read failed")),
    };
    const session = makeSession(true);
    const result = await sdkTimingPersist("hf-clip", "/comp.html", { start: 3 }, session, deps);
    expect(result).toMatchObject({ status: "failed", error: new Error("read failed") });
    expect(deps.writeProjectFile).not.toHaveBeenCalled();
    expect(deps.editHistory.recordEdit).not.toHaveBeenCalled();
  });
});

describe("sdkGsapTweenPersist — undo baseline (finding #12)", () => {
  const makeSession = () =>
    ({
      getElement: vi.fn().mockReturnValue({ id: "hf-box" }),
      setGsapTween: vi.fn(),
      serialize: vi
        .fn()
        .mockReturnValueOnce("<html>serialized-before</html>")
        .mockReturnValue("<html>after</html>"),
      batch: vi.fn((fn: () => void) => fn()),
    }) as unknown as Parameters<typeof sdkGsapTweenPersist>[2];

  it("records the on-disk content as the undo before, not serialize()", async () => {
    const deps = {
      editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
      writeProjectFile: vi.fn().mockResolvedValue(undefined),
      reloadPreview: vi.fn(),
      readProjectFile: vi.fn().mockResolvedValue("<html>on-disk gsap bytes</html>"),
      ...candidateTestDeps(),
    };
    const session = makeSession();
    await sdkGsapTweenPersist(
      "/comp.html",
      { kind: "set", animationId: "tw-1", properties: { ease: "power3.in" } },
      session,
      deps,
    );
    expect(deps.readProjectFile).toHaveBeenCalledOnce();
    expect(deps.editHistory.recordEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        files: {
          "/comp.html": { before: "<html>on-disk gsap bytes</html>", after: "<html>after</html>" },
        },
      }),
    );
  });
});

describe("sdkGsapTweenPersist — per-file serialization (finding #8)", () => {
  it("routes the read-modify-write through the shared file coordinator", async () => {
    const order: string[] = [];
    let writeResolve: (() => void) | null = null;
    let writeCall = 0;
    const deps = {
      editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
      // First write blocks until we release it, so without serialization the
      // second op's serialize()/dispatch would interleave ahead of it.
      writeProjectFile: vi.fn().mockImplementation((_p: string, content: string) => {
        writeCall++;
        order.push(`write-start:${content}`);
        if (writeCall === 1) {
          return new Promise<void>((res) => {
            writeResolve = () => {
              order.push(`write-done:${content}`);
              res();
            };
          });
        }
        order.push(`write-done:${content}`);
        return Promise.resolve();
      }),
      reloadPreview: vi.fn(),
      ...candidateTestDeps(),
    };

    let serializeCall = 0;
    const session = {
      getElement: vi.fn().mockReturnValue({ id: "hf-box" }),
      setGsapTween: vi.fn(() => order.push("dispatch")),
      serialize: vi.fn(() => {
        serializeCall++;
        // before-1, after-1, before-2, after-2
        return `<html>${serializeCall % 2 === 1 ? "before" : "after"}-${Math.ceil(serializeCall / 2)}</html>`;
      }),
      batch: vi.fn((fn: () => void) => fn()),
    } as unknown as Parameters<typeof sdkGsapTweenPersist>[2];

    const p1 = sdkGsapTweenPersist(
      "/comp.html",
      { kind: "set", animationId: "tw-1", properties: { ease: "a" } },
      session,
      deps,
    );
    const p2 = sdkGsapTweenPersist(
      "/comp.html",
      { kind: "set", animationId: "tw-1", properties: { ease: "b" } },
      session,
      deps,
    );
    // Let the first op finish candidate construction and reach its blocked write.
    await vi.waitFor(() => expect(writeResolve).not.toBeNull());
    writeResolve?.();
    await Promise.all([p1, p2]);

    // The second op's write must NOT start before the first op's write completes.
    const firstWriteDone = order.findIndex((entry) => entry.startsWith("write-done:"));
    const writeStarts = order
      .map((entry, index) => (entry.startsWith("write-start:") ? index : -1))
      .filter((index) => index >= 0);
    const secondWriteStart = writeStarts[1] ?? -1;
    expect(firstWriteDone).toBeGreaterThanOrEqual(0);
    expect(secondWriteStart).toBeGreaterThan(firstWriteDone);
  });
});

describe("sdkGsapTweenPersist", () => {
  const makeDeps = () => ({
    editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
    writeProjectFile: vi.fn().mockResolvedValue(undefined),
    reloadPreview: vi.fn(),
    ...candidateTestDeps(),
  });

  const makeSession = (opts?: { addGsapTween?: string; hasEl?: boolean }) =>
    ({
      getElement: vi.fn().mockReturnValue(opts?.hasEl !== false ? { id: "hf-box" } : null),
      addGsapTween: vi.fn().mockReturnValue(opts?.addGsapTween ?? "tw-1"),
      setGsapTween: vi.fn(),
      removeGsapTween: vi.fn(),
      serialize: vi
        .fn()
        .mockReturnValueOnce("<html>before</html>")
        .mockReturnValue("<html>after</html>"),
      batch: vi.fn((fn: () => void) => fn()),
    }) as unknown as Parameters<typeof sdkGsapTweenPersist>[2];

  it("returns false when session is null", async () => {
    expect(
      await sdkGsapTweenPersist(
        "/comp.html",
        { kind: "remove", animationId: "tw-1" },
        null,
        makeDeps(),
      ),
    ).toMatchObject({ status: "declined" });
  });

  it("calls addGsapTween and writes for kind=add", async () => {
    const deps = makeDeps();
    const session = makeSession();
    const result = await sdkGsapTweenPersist(
      "/comp.html",
      {
        kind: "add",
        target: "hf-box",
        spec: { method: "to", duration: 1, properties: { opacity: 1 } },
      },
      session,
      deps,
    );
    expect(result.status).toBe("committed");
    expect(session!.addGsapTween).toHaveBeenCalledWith(
      "hf-box",
      expect.objectContaining({ method: "to" }),
    );
    expect(deps.writeProjectFile).toHaveBeenCalledWith(
      "/comp.html",
      "<html>after</html>",
      "<html>before</html>",
    );
  });

  it("returns false for kind=add when element not found", async () => {
    const deps = makeDeps();
    const session = makeSession({ hasEl: false });
    const result = await sdkGsapTweenPersist(
      "/comp.html",
      { kind: "add", target: "hf-box", spec: { method: "to", properties: { x: 100 } } },
      session,
      deps,
    );
    expect(result.status).toBe("declined");
    expect(deps.writeProjectFile).not.toHaveBeenCalled();
  });

  it("calls setGsapTween and writes for kind=set", async () => {
    const deps = makeDeps();
    const session = makeSession();
    const result = await sdkGsapTweenPersist(
      "/comp.html",
      { kind: "set", animationId: "tw-1", properties: { ease: "power3.in" } },
      session,
      deps,
    );
    expect(result.status).toBe("committed");
    expect(session!.setGsapTween).toHaveBeenCalledWith("tw-1", { ease: "power3.in" });
    expect(deps.reloadPreview).toHaveBeenCalled();
  });

  it("calls removeGsapTween for kind=remove", async () => {
    const deps = makeDeps();
    const session = makeSession();
    const result = await sdkGsapTweenPersist(
      "/comp.html",
      { kind: "remove", animationId: "tw-1" },
      session,
      deps,
    );
    expect(result.status).toBe("committed");
    expect(session!.removeGsapTween).toHaveBeenCalledWith("tw-1");
  });

  it("returns false and does not write on SDK error", async () => {
    const deps = makeDeps();
    const session = makeSession();
    (session!.removeGsapTween as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("gsap error");
    });
    const result = await sdkGsapTweenPersist(
      "/comp.html",
      { kind: "remove", animationId: "tw-1" },
      session,
      deps,
    );
    expect(result.status).toBe("failed");
    expect(deps.writeProjectFile).not.toHaveBeenCalled();
  });
});

describe("sdkGsapKeyframePersist", () => {
  const makeDeps = () => ({
    editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
    writeProjectFile: vi.fn().mockResolvedValue(undefined),
    reloadPreview: vi.fn(),
    ...candidateTestDeps(),
  });

  const makeSession = () =>
    ({
      dispatch: vi.fn(),
      serialize: vi
        .fn()
        .mockReturnValueOnce("<html>before</html>")
        .mockReturnValue("<html>after</html>"),
      batch: vi.fn((fn: () => void) => fn()),
    }) as unknown as Parameters<typeof sdkGsapKeyframePersist>[4];

  it("returns false when session is null", async () => {
    expect(
      await sdkGsapKeyframePersist("/comp.html", "tw-1", 50, { opacity: 0.5 }, null, makeDeps()),
    ).toMatchObject({ status: "declined" });
  });

  it("dispatches addGsapKeyframe and writes serialized content", async () => {
    const deps = makeDeps();
    const session = makeSession();
    const result = await sdkGsapKeyframePersist(
      "/comp.html",
      "tw-1",
      50,
      { opacity: 0.5 },
      session,
      deps,
    );
    expect(result.status).toBe("committed");
    expect(session!.dispatch).toHaveBeenCalledWith({
      type: "addGsapKeyframe",
      animationId: "tw-1",
      position: 50,
      value: { opacity: 0.5 },
    });
    expect(deps.writeProjectFile).toHaveBeenCalledWith(
      "/comp.html",
      "<html>after</html>",
      "<html>before</html>",
    );
    expect(deps.reloadPreview).toHaveBeenCalled();
  });

  it("returns false and does not write on dispatch error", async () => {
    const deps = makeDeps();
    const session = makeSession();
    (session!.dispatch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("dispatch failed");
    });
    const result = await sdkGsapKeyframePersist(
      "/comp.html",
      "tw-1",
      25,
      { x: 100 },
      session,
      deps,
    );
    expect(result.status).toBe("failed");
    expect(deps.writeProjectFile).not.toHaveBeenCalled();
  });
});

describe("sdkCutoverPersist — GSAP script preservation (integration)", () => {
  const makeDeps = () => ({
    editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
    writeProjectFile: vi.fn().mockResolvedValue(undefined),
    reloadPreview: vi.fn(),
    ...candidateTestDeps(),
  });

  it("preserves GSAP <script> block and data-position-mode through setStyle dispatch", async () => {
    const html = `<!DOCTYPE html><html><head></head><body>
<div data-hf-id="hf-layer" style="color: blue; opacity: 1"></div>
<script data-hf-gsap data-position-mode="relative">
gsap.timeline().to('[data-hf-id="hf-layer"]', { duration: 1, x: 100 });
</script>
</body></html>`;
    const comp = await openComposition(html, { persist: createMemoryAdapter() });
    const deps = makeDeps();
    const sel = { hfId: "hf-layer" } as never;
    const result = await sdkCutoverPersist(
      sel,
      [{ type: "inline-style", property: "color", value: "red" }],
      html,
      "/comp.html",
      comp,
      deps,
    );
    expect(result.status).toBe("committed");
    const written = (deps.writeProjectFile as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1] as string;
    expect(written).toContain("data-hf-gsap");
    expect(written).toContain('data-position-mode="relative"');
    expect(written).toContain("gsap.timeline()");
  });
});

describe("sdk_cutover_failed classification (error_kind)", () => {
  const makeDeps = (overrides: Partial<Parameters<typeof sdkCutoverPersist>[5]> = {}) => ({
    editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
    writeProjectFile: vi.fn().mockResolvedValue(undefined),
    reloadPreview: vi.fn(),
    ...candidateTestDeps(),
    ...overrides,
  });

  const makeSession = () =>
    ({
      getElement: vi.fn().mockReturnValue({ inlineStyles: {} }),
      dispatch: vi.fn(),
      serialize: vi
        .fn()
        .mockReturnValueOnce("<html>before</html>")
        .mockReturnValue("<html></html>"),
      batch: vi.fn((fn: () => void) => fn()),
    }) as unknown as Parameters<typeof sdkCutoverPersist>[4];

  beforeEach(() => {
    vi.mocked(trackStudioEvent).mockClear();
  });

  // The production gate event this fix exists for: a bare `TypeError` from an
  // UNWRAPPED raw fetch (`readProjectFile`'s implementation in
  // useProjectFileWriter.ts, or writeProjectFile's own preflight — neither
  // wraps as StudioSaveNetworkError). Without the message-based fallback in
  // `cutoverErrorKind`, this files as `error_kind: "sdk"` and trips the
  // cutover-failure rollback gate on a network blip the SDK never owned.
  it("classifies a bare fetch TypeError from readProjectFile as network", async () => {
    const deps = makeDeps({
      readProjectFile: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    });
    const session = makeSession();
    const sel = { hfId: "hf-abc" } as never;

    const result = await sdkCutoverPersist(
      sel,
      [styleOp("color", "red")],
      "before",
      "/path.html",
      session,
      deps,
    );

    expect(result.status).toBe("failed");
    expect(trackStudioEvent).toHaveBeenCalledWith(
      "sdk_cutover_failed",
      expect.objectContaining({ family: "dom", error_kind: "network" }),
    );
  });

  it("classifies StudioSaveNetworkError from writeProjectFile as network", async () => {
    const deps = makeDeps({
      writeProjectFile: vi.fn().mockRejectedValue(new StudioSaveNetworkError("Failed to save")),
    });
    const session = makeSession();
    const sel = { hfId: "hf-abc" } as never;

    const result = await sdkCutoverPersist(
      sel,
      [styleOp("color", "red")],
      "before",
      "/path.html",
      session,
      deps,
    );

    expect(result.status).toBe("failed");
    expect(trackStudioEvent).toHaveBeenCalledWith(
      "sdk_cutover_failed",
      expect.objectContaining({ family: "dom", error_kind: "network" }),
    );
  });

  it("classifies a plain error as an sdk defect, not network", async () => {
    const deps = makeDeps({
      writeProjectFile: vi.fn().mockRejectedValue(new Error("disk full")),
    });
    const session = makeSession();
    const sel = { hfId: "hf-abc" } as never;

    const result = await sdkCutoverPersist(
      sel,
      [styleOp("color", "red")],
      "before",
      "/path.html",
      session,
      deps,
    );

    expect(result.status).toBe("failed");
    expect(trackStudioEvent).toHaveBeenCalledWith(
      "sdk_cutover_failed",
      expect.objectContaining({ family: "dom", error_kind: "sdk" }),
    );
  });
});
