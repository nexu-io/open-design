// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DomEditProvider } from "../../contexts/DomEditContext";
import { TimelineEditProvider } from "../../contexts/TimelineEditContext";
import { jsonResponse, requestUrl } from "../../hooks/fetchStubTestUtils";
import { useTimelineEditing } from "../../hooks/useTimelineEditing";
import { useEditHistoryActions, type EditHistoryHandle } from "../../hooks/useEditHistoryActions";
import { usePreviewPersistence } from "../../hooks/usePreviewPersistence";
import { groupInfoFor } from "../lib/timelineGroupInfo";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { serializeAutomation, type HfAutomation } from "@hyperframes/core/audio-automation";
import { groupAutomationElement } from "./groupAutomationElement";
import { useAutomationLanes, type AutomationLaneBinding } from "./useAutomationLanes";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type CanEdit = NonNullable<Parameters<typeof useTimelineEditing>[0]["canEdit"]>;
type DomEditValue = Parameters<typeof DomEditProvider>[0]["value"];

const SOURCE =
  '<audio id="music" data-start="0" data-duration="12" data-track-index="0"></audio>' +
  '<hf-audio-group id="hf-group"></hf-audio-group>';
const LOCKED = { blocked: true as const, reason: "Reserved by an agent" };
const NEXT = { version: 1 as const, lanes: [{ target: "volume", points: [{ t: 0, v: 0.5 }] }] };

const music: TimelineElement = {
  id: "music",
  key: "music",
  domId: "music",
  tag: "audio",
  start: 0,
  duration: 12,
  track: 0,
  sourceFile: "index.html",
};

const group = groupAutomationElement({ id: "hf-group", label: "Music", anchorKey: 0 }, 12);
const BOTH_LANES = [
  { lane: "clip", target: music, field: "automation" },
  { lane: "group", target: group, field: "audioGroupAutomation" },
] as const;
const curve = (v: number): HfAutomation => ({
  version: 1,
  lanes: [{ target: "volume", points: [{ t: 0, v }] }],
});

afterEach(() => {
  document.body.innerHTML = "";
  usePlayerStore.getState().reset();
  vi.unstubAllGlobals();
});

function mountLanes(target: TimelineElement, canEdit?: CanEdit, recording = false) {
  let projectId = "p1";
  let composition = "index.html";
  // Every file but the open one, by `${project}/${path}`.
  const files = new Map<string, string>();
  const isRecordingRef = { current: recording };
  let file = SOURCE;
  let reads = 0;
  let undoTo = SOURCE;
  let undoPath: string | null = null;
  let undoHeld = Promise.resolve();
  const held = new Map<number, Promise<void>>();
  const broken = new Set<number>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      if (!requestUrl(input).includes("/files/")) return jsonResponse({});
      const n = ++reads;
      await held.get(n);
      if (broken.has(n)) throw new Error("offline");
      const [, owner, path] = /projects\/([^/]+)\/files\/([^?]+)/.exec(requestUrl(input)) ?? [];
      const at = `${owner}/${decodeURIComponent(path ?? "")}`;
      return jsonResponse({ content: at === `${projectId}/${composition}` ? file : files.get(at) });
    }),
  );
  const put = (path: string, content: string) => {
    if (path === composition) file = content;
    else files.set(`${projectId}/${path}`, content);
  };
  const holdRead = (n: number) => {
    let release = () => {};
    held.set(n, new Promise<void>((resolve) => (release = resolve)));
    return release;
  };
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  iframe.contentDocument!.body.innerHTML = SOURCE;
  usePlayerStore.getState().setElements([{ ...music, audioGroup: "hf-group" }]);
  const writeProjectFile = vi.fn(async (path: string, content: string) => put(path, content));
  const refresh = vi.fn(async () => {});
  const selection = { id: target.id };
  const previewIframeRef = { current: iframe };
  let binding: AutomationLaneBinding | null = null;
  let history: ReturnType<typeof useEditHistoryActions> | null = null;
  const editHistory = {
    // In the file queue, like the real step, so saves started meanwhile queue behind it.
    undo: async ({ serialize }: Parameters<EditHistoryHandle["undo"]>[0]) => {
      const path = undoPath ?? composition;
      const step = async () => {
        await undoHeld;
        const previous = path === composition ? file : (files.get(`${projectId}/${path}`) ?? "");
        put(path, undoTo);
        const restored = { [path]: { previous, restored: undoTo } };
        return { ok: true, label: "Undo", paths: [path], files: restored };
      };
      return serialize ? serialize([path], step) : step();
    },
    redo: async () => ({ ok: false, reason: "empty" }),
  };

  function Probe() {
    binding = useAutomationLanes().bind(target, true);
    return null;
  }
  function Host() {
    const editing = useTimelineEditing({
      projectId,
      activeCompPath: composition,
      timelineElements: [music],
      showToast: () => {},
      writeProjectFile,
      recordEdit: async () => {},
      reloadPreview: () => {},
      previewIframeRef,
      pendingTimelineEditPathRef: { current: new Set<string>() },
      uploadProjectFiles: async () => [],
      canEdit,
      isRecordingRef,
    });
    const persistence = usePreviewPersistence({
      showToast: () => {},
      readOptionalProjectFile: async () => "",
      writeProjectFile,
      recordEdit: async () => {},
      previewIframeRef,
      activeCompPathRef: { current: composition },
      reloadPreview: () => {},
    });
    history = useEditHistoryActions({
      editHistory,
      readOptionalProjectFile: async () => "",
      readProjectFile: async () => file,
      writeProjectFile,
      showToast: () => {},
      syncHistoryPreviewAfterApply: persistence.syncHistoryPreviewAfterApply,
      waitForPendingDomEditSaves: persistence.waitForPendingDomEditSaves,
      // As App.tsx wires it.
      onAfterUndoRedo: (restore) => editing.restoreLiveLanes(restore),
      activeCompPath: composition,
    });
    const domEdit = {
      domEditSelectionRef: { current: selection },
      refreshDomEditSelectionFromPreview: refresh,
    } as unknown as DomEditValue;
    return (
      <DomEditProvider value={domEdit}>
        <TimelineEditProvider
          value={{
            onSetElementAttributeLive: editing.setElementFxAttribute.setLive,
            onSetElementAttributeQuiet: editing.setElementFxAttribute.setQuiet,
            onSetAudioGroupAttributeLive: editing.setAudioGroupAttribute.setLive,
            onSetAudioGroupAttributeQuiet: editing.setAudioGroupAttribute.setQuiet,
            // As useTimelineEditCallbacks maps them.
            onRevertElementAttributeLive: editing.setElementFxAttribute.revertLive,
            onRevertAudioGroupAttributeLive: editing.setAudioGroupAttribute.revertLive,
          }}
        >
          <Probe />
        </TimelineEditProvider>
      </DomEditProvider>
    );
  }

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<Host />));
  const commit = async (next: HfAutomation = NEXT) => {
    let outcome: unknown;
    await act(async () => {
      outcome = await binding!.onCommit(next);
    });
    return outcome;
  };
  const preview = (next: HfAutomation = NEXT) => act(() => binding!.onPreview(next));
  const startCommit = (next: HfAutomation) => binding!.onCommit(next);
  return {
    commit,
    startCommit,
    preview,
    writeProjectFile,
    refresh,
    selection,
    iframe,
    setFile: (next: string) => (file = next),
    file: () => file,
    reads: () => reads,
    failRead: (n: number) => broken.add(n),
    // A different project whose file, preview and store hold the same clip, unedited.
    switchProject: (next: string, content = SOURCE) => {
      files.set(`${projectId}/${composition}`, file);
      projectId = next;
      file = files.get(`${next}/${composition}`) ?? content;
      iframe.contentDocument!.body.innerHTML = SOURCE;
      usePlayerStore.getState().setElements([{ ...music, audioGroup: "hf-group" }]);
      act(() => root.render(<Host />));
    },
    // Another composition of the same project, loaded into the preview with `stored` in the store.
    switchComposition: (next: string, content: string, stored: TimelineElement) => {
      files.set(`${projectId}/${composition}`, file);
      composition = next;
      file = files.get(`${projectId}/${next}`) ?? content;
      iframe.contentDocument!.body.innerHTML = file;
      usePlayerStore.getState().setElements([stored]);
      act(() => root.render(<Host />));
    },
    fileAt: (path: string) => (path === composition ? file : files.get(`${projectId}/${path}`)),
    put,
    // Cmd+Z through the real history actions: the file goes back to `to`, the preview soft-restores.
    undo: async (to: string, path?: string) => {
      undoTo = to;
      undoPath = path ?? null;
      await act(async () => {
        await history!.undo();
      });
    },
    // An undo whose round trip waits for the returned release.
    startUndo: (to: string) => {
      let release = () => {};
      undoTo = to;
      undoHeld = new Promise<void>((resolve) => (release = resolve));
      return { release, done: history!.undo() };
    },
    // A cancelled gesture's last live write, which puts its start back.
    cancel: (next: HfAutomation) => act(() => binding!.onPreview(next, true)),
    setRecording: (next: boolean) => (isRecordingRef.current = next),
    holdRead,
  };
}

describe("useAutomationLanes saves report what happened", () => {
  it("saves a clip's automation, and the lane and the panel read it back", async () => {
    const { commit, writeProjectFile, refresh, selection } = mountLanes(music);
    expect(await commit()).toEqual({ status: "saved" });
    expect(writeProjectFile.mock.calls[0]?.[1]).toContain("data-automation=");
    expect(usePlayerStore.getState().elements[0]?.automation).toContain('"volume"');
    expect(refresh).toHaveBeenCalledWith(selection);
  });

  it("refuses an automation edit on a locked clip and writes nothing", async () => {
    const { commit, writeProjectFile } = mountLanes(music, () => LOCKED);
    expect(await commit()).toEqual({ status: "refused", reason: "Reserved by an agent" });
    expect(writeProjectFile).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().elements[0]?.automation).toBeUndefined();
  });

  it("puts a dragged preview back when the lock refuses the release", async () => {
    const { commit, iframe, preview } = mountLanes(music, () => LOCKED);
    preview();
    const node = iframe.contentDocument!.getElementById("music");
    expect(node?.getAttribute("data-automation")).toContain('"volume"');
    await commit();
    expect(node?.hasAttribute("data-automation")).toBe(false);
  });

  it("puts a dragged preview back when a recording refuses the release", async () => {
    const { commit, iframe, preview, writeProjectFile } = mountLanes(music, undefined, true);
    preview();
    expect(await commit()).toEqual({
      status: "refused",
      reason: "Cannot edit timeline while recording",
    });
    expect(iframe.contentDocument!.getElementById("music")?.hasAttribute("data-automation")).toBe(
      false,
    );
    expect(writeProjectFile).not.toHaveBeenCalled();
  });

  it("resolves an automation edit whose write fails as failed", async () => {
    const { commit, writeProjectFile, iframe } = mountLanes(music);
    writeProjectFile.mockRejectedValue(new Error("disk full"));
    expect(await commit()).toEqual({
      status: "failed",
      reason: expect.stringContaining("disk full"),
    });
    expect(iframe.contentDocument!.getElementById("music")?.hasAttribute("data-automation")).toBe(
      false,
    );
  });

  it("refuses a group lane edit when a member is locked", async () => {
    const { commit, writeProjectFile } = mountLanes(group, (el) =>
      el.id === "music" ? LOCKED : true,
    );
    expect(await commit()).toEqual({ status: "refused", reason: "Reserved by an agent" });
    expect(writeProjectFile).not.toHaveBeenCalled();
  });

  it("saves a group lane on the group and mirrors it to the members", async () => {
    const { commit, writeProjectFile } = mountLanes(group);
    expect(await commit()).toEqual({ status: "saved" });
    expect(writeProjectFile.mock.calls[0]?.[1]).toMatch(
      /<hf-audio-group id="hf-group" data-automation=/,
    );
    expect(usePlayerStore.getState().elements[0]?.audioGroupAutomation).toContain('"volume"');
  });

  it("keeps what an earlier save wrote when a later one fails while it is in flight", async () => {
    const { startCommit, preview, writeProjectFile, iframe, setFile } = mountLanes(music);
    const saved = serializeAutomation(NEXT);
    let landFirst = () => {};
    writeProjectFile
      .mockImplementationOnce(
        (_path, content) =>
          new Promise<void>((resolve) => {
            landFirst = () => {
              setFile(content);
              resolve();
            };
          }),
      )
      .mockRejectedValueOnce(new Error("disk full"));
    preview();
    const first = startCommit(NEXT);
    await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(1)));
    const later = {
      version: 1 as const,
      lanes: [{ target: "volume", points: [{ t: 0, v: 0.9 }] }],
    };
    preview(later);
    const second = startCommit(later);
    landFirst();
    let outcomes: unknown[] = [];
    await act(async () => {
      outcomes = await Promise.all([first, second]);
    });
    expect(outcomes).toMatchObject([{ status: "saved" }, { status: "failed" }]);
    expect(iframe.contentDocument!.getElementById("music")?.getAttribute("data-automation")).toBe(
      saved,
    );
    expect(usePlayerStore.getState().elements[0]?.automation).toBe(saved);
  });

  it("never lets an older failed save's recovery land over a newer save", async () => {
    const { commit, startCommit, preview, writeProjectFile, iframe, file, reads, holdRead } =
      mountLanes(music);
    const at = (v: number) => ({
      version: 1 as const,
      lanes: [{ target: "volume", points: [{ t: 0, v }] }],
    });
    expect(await commit(at(0.5))).toEqual({ status: "saved" });
    const releaseRecovery = holdRead(3);
    writeProjectFile.mockRejectedValueOnce(new Error("offline"));
    preview(at(0.9));
    const older = startCommit(at(0.9));
    await act(() => vi.waitFor(() => expect(reads()).toBe(3)));
    preview(at(0.7));
    const newer = startCommit(at(0.7));
    releaseRecovery();
    let outcomes: unknown[] = [];
    await act(async () => {
      outcomes = await Promise.all([older, newer]);
    });
    expect(outcomes).toMatchObject([{ status: "failed" }, { status: "saved" }]);
    const landed = serializeAutomation(at(0.7));
    const saved = new DOMParser().parseFromString(file(), "text/html");
    expect(saved.getElementById("music")?.getAttribute("data-automation")).toBe(landed);
    expect(iframe.contentDocument!.getElementById("music")?.getAttribute("data-automation")).toBe(
      landed,
    );
    expect(usePlayerStore.getState().elements[0]?.automation).toBe(landed);
  });

  it("keeps a newer save when an older failed save cannot read the file back", async () => {
    const { startCommit, preview, writeProjectFile, iframe, file, failRead } = mountLanes(music);
    const at = (v: number) => ({
      version: 1 as const,
      lanes: [{ target: "volume", points: [{ t: 0, v }] }],
    });
    let failOlder = () => {};
    writeProjectFile.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          failOlder = () => reject(new Error("offline"));
        }),
    );
    preview(at(0.9));
    const older = startCommit(at(0.9));
    await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(1)));
    preview(at(0.7));
    const newer = startCommit(at(0.7));
    failRead(3);
    failOlder();
    await act(async () => {
      await Promise.all([older, newer]);
    });
    const landed = serializeAutomation(at(0.7));
    const saved = new DOMParser().parseFromString(file(), "text/html");
    expect(saved.getElementById("music")?.getAttribute("data-automation")).toBe(landed);
    expect(iframe.contentDocument!.getElementById("music")?.getAttribute("data-automation")).toBe(
      landed,
    );
    expect(usePlayerStore.getState().elements[0]?.automation).toBe(landed);
  });

  it.each([
    { lane: "clip", target: music, field: "automation", newer: "fails" },
    { lane: "clip", target: music, field: "automation", newer: "is refused" },
    { lane: "group", target: group, field: "audioGroupAutomation", newer: "fails" },
    { lane: "group", target: group, field: "audioGroupAutomation", newer: "is refused" },
  ] as const)(
    "keeps a landed $lane save when a newer one $newer and cannot read the file back",
    async ({ target, field, newer: how }) => {
      const {
        startCommit,
        writeProjectFile,
        iframe,
        file,
        setFile,
        failRead,
        reads,
        setRecording,
      } = mountLanes(target);
      const at = (v: number) => ({
        version: 1 as const,
        lanes: [{ target: "volume", points: [{ t: 0, v }] }],
      });
      let landOlder = () => {};
      writeProjectFile
        .mockImplementationOnce(
          (_path, content) =>
            new Promise<void>((resolve) => {
              landOlder = () => {
                setFile(content);
                resolve();
              };
            }),
        )
        .mockRejectedValueOnce(new Error("offline"));
      const older = startCommit(at(0.5));
      await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(1)));
      if (how === "is refused") setRecording(true);
      const newer = startCommit(at(0.9));
      failRead(how === "fails" ? 3 : reads() + 1);
      landOlder();
      await act(async () => {
        await Promise.all([older, newer]);
      });
      const want = serializeAutomation(at(0.5));
      const saved = new DOMParser().parseFromString(file(), "text/html");
      expect(saved.getElementById(target.id)?.getAttribute("data-automation")).toBe(want);
      expect(
        iframe.contentDocument!.getElementById(target.id)?.getAttribute("data-automation"),
      ).toBe(want);
      expect(usePlayerStore.getState().elements[0]?.[field]).toBe(want);
    },
  );

  it.each([{ olderReadsBack: true }, { olderReadsBack: false }])(
    "never settles on a value that was not saved when a refused save cannot read the file back (older reads back: $olderReadsBack)",
    async ({ olderReadsBack }) => {
      const { startCommit, preview, writeProjectFile, iframe, failRead, setRecording } =
        mountLanes(music);
      const at = (v: number) => ({
        version: 1 as const,
        lanes: [{ target: "volume", points: [{ t: 0, v }] }],
      });
      let failOlder = () => {};
      writeProjectFile.mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            failOlder = () => reject(new Error("offline"));
          }),
      );
      preview(at(0.9));
      const older = startCommit(at(0.9));
      await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(1)));
      preview(at(0.7));
      setRecording(true);
      const refused = startCommit(at(0.7));
      failRead(2);
      if (!olderReadsBack) failRead(3);
      failOlder();
      await act(async () => {
        await Promise.all([older, refused]);
      });
      expect(iframe.contentDocument!.getElementById("music")?.hasAttribute("data-automation")).toBe(
        false,
      );
      expect(usePlayerStore.getState().elements[0]?.automation).toBeUndefined();
    },
  );

  it.each([
    { lane: "clip", target: music, field: "automation", trigger: "offline" },
    { lane: "clip", target: music, field: "automation", trigger: "element gone" },
    { lane: "group", target: group, field: "audioGroupAutomation", trigger: "offline" },
    { lane: "group", target: group, field: "audioGroupAutomation", trigger: "element gone" },
  ] as const)(
    "puts a $lane drag back when its first save fails ($trigger) and cannot read the file back",
    async ({ target, field, trigger }) => {
      const { commit, preview, writeProjectFile, iframe, setFile, failRead } = mountLanes(target);
      const at = (v: number) => ({
        version: 1 as const,
        lanes: [{ target: "volume", points: [{ t: 0, v }] }],
      });
      if (trigger === "offline") {
        writeProjectFile.mockRejectedValueOnce(new Error("offline"));
        failRead(2);
      } else {
        setFile("<html><body></body></html>");
      }
      preview(at(0.9));
      expect(await commit(at(0.9))).toMatchObject({ status: "failed" });
      expect(
        iframe.contentDocument!.getElementById(target.id)?.hasAttribute("data-automation"),
      ).toBe(false);
      expect(usePlayerStore.getState().elements[0]?.[field]).toBeUndefined();
    },
  );

  it.each([
    { lane: "clip", target: music, field: "automation", dragReadFails: false },
    { lane: "clip", target: music, field: "automation", dragReadFails: true },
    { lane: "group", target: group, field: "audioGroupAutomation", dragReadFails: false },
    { lane: "group", target: group, field: "audioGroupAutomation", dragReadFails: true },
  ] as const)(
    "never verifies a $lane drag's before-value that an unsaved paste left behind (drag read fails: $dragReadFails)",
    async ({ target, field, dragReadFails }) => {
      const { startCommit, commit, preview, writeProjectFile, iframe, failRead } =
        mountLanes(target);
      const at = (v: number) => ({
        version: 1 as const,
        lanes: [{ target: "volume", points: [{ t: 0, v }] }],
      });
      let failPaste = () => {};
      writeProjectFile
        .mockImplementationOnce(
          () =>
            new Promise<void>((_resolve, reject) => {
              failPaste = () => reject(new Error("offline"));
            }),
        )
        .mockRejectedValueOnce(new Error("offline"));
      failRead(2);
      failRead(4);
      if (dragReadFails) failRead(3);
      const paste = startCommit(at(0.5));
      await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(1)));
      preview(at(0.9));
      failPaste();
      await act(async () => {
        await paste;
      });
      expect(await commit(at(0.9))).toMatchObject({ status: "failed" });
      expect(
        iframe.contentDocument!.getElementById(target.id)?.hasAttribute("data-automation"),
      ).toBe(false);
      expect(usePlayerStore.getState().elements[0]?.[field]).toBeUndefined();
    },
  );

  it("reverts a refused drag to the last saved value when its before-value was never saved", async () => {
    let locked = false;
    const { startCommit, commit, preview, writeProjectFile, iframe, failRead } = mountLanes(
      music,
      () => (locked ? LOCKED : true),
    );
    const at = (v: number) => ({
      version: 1 as const,
      lanes: [{ target: "volume", points: [{ t: 0, v }] }],
    });
    expect(await commit(at(0.3))).toEqual({ status: "saved" });
    let failPaste = () => {};
    writeProjectFile.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          failPaste = () => reject(new Error("offline"));
        }),
    );
    failRead(3);
    const paste = startCommit(at(0.5));
    await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(2)));
    preview(at(0.9));
    failPaste();
    await act(async () => {
      await paste;
    });
    locked = true;
    expect(await commit(at(0.9))).toMatchObject({ status: "refused" });
    const saved = serializeAutomation(at(0.3));
    expect(iframe.contentDocument!.getElementById("music")?.getAttribute("data-automation")).toBe(
      saved,
    );
    expect(usePlayerStore.getState().elements[0]?.automation).toBe(saved);
  });

  it.each([
    { lane: "clip", target: music, field: "automation" },
    { lane: "group", target: group, field: "audioGroupAutomation" },
  ] as const)(
    "never settles another project's saved $lane value when a save cannot read the file back",
    async ({ target, field }) => {
      const { commit, preview, writeProjectFile, iframe, failRead, switchProject } =
        mountLanes(target);
      const at = (v: number) => ({
        version: 1 as const,
        lanes: [{ target: "volume", points: [{ t: 0, v }] }],
      });
      preview(at(0.5));
      expect(await commit(at(0.5))).toEqual({ status: "saved" });
      switchProject("p2");
      writeProjectFile.mockRejectedValueOnce(new Error("offline"));
      failRead(3);
      expect(await commit(at(0.9))).toMatchObject({ status: "failed" });
      expect(
        iframe.contentDocument!.getElementById(target.id)?.hasAttribute("data-automation"),
      ).toBe(false);
      expect(usePlayerStore.getState().elements[0]?.[field]).toBeUndefined();
    },
  );

  it.each([{ held: "write" }, { held: "read" }] as const)(
    "leaves a new project alone when a save made before the switch lands after it (held: $held)",
    async ({ held }) => {
      const {
        startCommit,
        preview,
        writeProjectFile,
        iframe,
        setFile,
        holdRead,
        reads,
        switchProject,
      } = mountLanes(music);
      const at = (v: number) => ({
        version: 1 as const,
        lanes: [{ target: "volume", points: [{ t: 0, v }] }],
      });
      let land = () => {};
      if (held === "write") {
        writeProjectFile.mockImplementationOnce(
          (_path, content) =>
            new Promise<void>((resolve) => {
              land = () => {
                setFile(content);
                resolve();
              };
            }),
        );
      } else {
        land = holdRead(1);
      }
      preview(at(0.5));
      const saving = startCommit(at(0.5));
      await act(() =>
        vi.waitFor(() =>
          held === "write"
            ? expect(writeProjectFile).toHaveBeenCalledTimes(1)
            : expect(reads()).toBe(1),
        ),
      );
      switchProject("p2");
      land();
      await act(async () => {
        await saving;
      });
      expect(iframe.contentDocument!.getElementById("music")?.hasAttribute("data-automation")).toBe(
        false,
      );
      expect(usePlayerStore.getState().elements[0]?.automation).toBeUndefined();
    },
  );

  it("reads a failed save back from its own project after a switch", async () => {
    const { startCommit, writeProjectFile, iframe, failRead, reads, switchProject } =
      mountLanes(music);
    const at = (v: number) => ({
      version: 1 as const,
      lanes: [{ target: "volume", points: [{ t: 0, v }] }],
    });
    let failFirst = () => {};
    writeProjectFile
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            failFirst = () => reject(new Error("offline"));
          }),
      )
      .mockImplementationOnce(async () => {
        failRead(reads() + 1);
        throw new Error("offline");
      });
    const first = startCommit(at(0.5));
    await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(1)));
    const doc = new DOMParser().parseFromString(SOURCE, "text/html");
    doc.getElementById("music")!.setAttribute("data-automation", serializeAutomation(at(0.3)));
    const other = doc.body.innerHTML;
    switchProject("p2", other);
    failFirst();
    await act(async () => {
      await first;
    });
    switchProject("p1");
    await act(async () => {
      await startCommit(at(0.9));
    });
    expect(iframe.contentDocument!.getElementById("music")?.hasAttribute("data-automation")).toBe(
      false,
    );
    expect(usePlayerStore.getState().elements[0]?.automation).toBeUndefined();
  });

  it.each([
    { lane: "clip", target: music, field: "automation", later: "fails" },
    { lane: "clip", target: music, field: "automation", later: "is refused" },
    { lane: "group", target: group, field: "audioGroupAutomation", later: "fails" },
    { lane: "group", target: group, field: "audioGroupAutomation", later: "is refused" },
  ] as const)(
    "never brings back a $lane value an undo removed when a later save $later and cannot read the file back",
    async ({ target, field, later }) => {
      const {
        commit,
        startCommit,
        preview,
        writeProjectFile,
        iframe,
        setFile,
        failRead,
        reads,
        setRecording,
      } = mountLanes(target);
      const at = (v: number) => ({
        version: 1 as const,
        lanes: [{ target: "volume", points: [{ t: 0, v }] }],
      });
      preview(at(0.5));
      expect(await commit(at(0.5))).toEqual({ status: "saved" });
      // Undo: file, preview and store go back to the clip without automation.
      setFile(SOURCE);
      iframe.contentDocument!.body.innerHTML = SOURCE;
      usePlayerStore.getState().setElements([{ ...music, audioGroup: "hf-group" }]);
      if (later === "fails") {
        writeProjectFile.mockImplementationOnce(async () => {
          failRead(reads() + 1);
          throw new Error("offline");
        });
      } else {
        setRecording(true);
        failRead(reads() + 1);
      }
      await act(async () => {
        await startCommit(at(0.9));
      });
      expect(
        iframe.contentDocument!.getElementById(target.id)?.hasAttribute("data-automation"),
      ).toBe(false);
      expect(usePlayerStore.getState().elements[0]?.[field]).toBeUndefined();
    },
  );

  it("reads a failed save back from its own project while another save is in flight across a switch", async () => {
    const { startCommit, writeProjectFile, iframe, failRead, holdRead, reads, switchProject } =
      mountLanes(music);
    const at = (v: number) => ({
      version: 1 as const,
      lanes: [{ target: "volume", points: [{ t: 0, v }] }],
    });
    let failFirst = () => {};
    writeProjectFile
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            failFirst = () => reject(new Error("offline"));
          }),
      )
      .mockRejectedValueOnce(new Error("offline"));
    const first = startCommit(at(0.5));
    await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(1)));
    const second = startCommit(at(0.7));
    const doc = new DOMParser().parseFromString(SOURCE, "text/html");
    doc.getElementById("music")!.setAttribute("data-automation", serializeAutomation(at(0.3)));
    switchProject("p2", doc.body.innerHTML);
    const releaseSecond = holdRead(4);
    failRead(4);
    failFirst();
    await act(() => vi.waitFor(() => expect(reads()).toBe(4)));
    switchProject("p1");
    releaseSecond();
    await act(async () => {
      await Promise.all([first, second]);
    });
    expect(iframe.contentDocument!.getElementById("music")?.hasAttribute("data-automation")).toBe(
      false,
    );
    expect(usePlayerStore.getState().elements[0]?.automation).toBeUndefined();
  });

  it("leaves the store to a newer pending save when an older one lands", async () => {
    const { startCommit, writeProjectFile, setFile, holdRead } = mountLanes(music);
    const at = (v: number) => ({
      version: 1 as const,
      lanes: [{ target: "volume", points: [{ t: 0, v }] }],
    });
    let landOlder = () => {};
    writeProjectFile.mockImplementationOnce(
      (_path, content) =>
        new Promise<void>((resolve) => {
          landOlder = () => {
            setFile(content);
            resolve();
          };
        }),
    );
    const older = startCommit(at(0.5));
    await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(1)));
    const releaseNewer = holdRead(2);
    const newer = startCommit(at(0.9));
    landOlder();
    await act(async () => {
      await older;
    });
    expect(usePlayerStore.getState().elements[0]?.automation).toBeUndefined();
    releaseNewer();
    await act(async () => {
      await newer;
    });
    expect(usePlayerStore.getState().elements[0]?.automation).toBe(serializeAutomation(at(0.9)));
  });

  it("keeps a newer release's preview while an older save fails under it", async () => {
    const { startCommit, preview, writeProjectFile, iframe, holdRead } = mountLanes(music);
    const at = (v: number) => ({
      version: 1 as const,
      lanes: [{ target: "volume", points: [{ t: 0, v }] }],
    });
    const shown = () =>
      iframe.contentDocument!.getElementById("music")?.getAttribute("data-automation");
    let failOlder = () => {};
    writeProjectFile.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          failOlder = () => reject(new Error("offline"));
        }),
    );
    preview(at(0.9));
    const older = startCommit(at(0.9));
    await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(1)));
    const releaseNewer = holdRead(2);
    preview(at(0.7));
    const newer = startCommit(at(0.7));
    failOlder();
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(shown()).toBe(serializeAutomation(at(0.7)));
    releaseNewer();
    await act(async () => {
      await Promise.all([older, newer]);
    });
    expect(shown()).toBe(serializeAutomation(at(0.7)));
  });

  it("keeps a newer live drag's preview when an older save's recovery lands", async () => {
    const { startCommit, preview, writeProjectFile, iframe, reads, holdRead } = mountLanes(music);
    const at = (v: number) => ({
      version: 1 as const,
      lanes: [{ target: "volume", points: [{ t: 0, v }] }],
    });
    const releaseRecovery = holdRead(2);
    writeProjectFile.mockRejectedValueOnce(new Error("offline"));
    preview(at(0.9));
    const older = startCommit(at(0.9));
    await act(() => vi.waitFor(() => expect(reads()).toBe(2)));
    preview(at(0.7));
    releaseRecovery();
    await act(async () => {
      await older;
    });
    expect(iframe.contentDocument!.getElementById("music")?.getAttribute("data-automation")).toBe(
      serializeAutomation(at(0.7)),
    );
  });

  it("reverts a refused drag to the file after an older save failed under it", async () => {
    let locked = false;
    const { commit, startCommit, preview, writeProjectFile, iframe } = mountLanes(music, () =>
      locked ? LOCKED : true,
    );
    const at = (v: number) => ({
      version: 1 as const,
      lanes: [{ target: "volume", points: [{ t: 0, v }] }],
    });
    let failFirst = () => {};
    writeProjectFile.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          failFirst = () => reject(new Error("offline"));
        }),
    );
    preview(at(0.9));
    const older = startCommit(at(0.9));
    await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(1)));
    preview(at(0.7));
    failFirst();
    await act(async () => {
      await older;
    });
    locked = true;
    expect(await commit(at(0.7))).toMatchObject({ status: "refused" });
    expect(iframe.contentDocument!.getElementById("music")?.hasAttribute("data-automation")).toBe(
      false,
    );
    expect(usePlayerStore.getState().elements[0]?.automation).toBeUndefined();
  });

  it("stores a save that lands after a newer live write was cancelled", async () => {
    const { startCommit, preview, writeProjectFile, setFile } = mountLanes(music);
    const at = (v: number) => ({
      version: 1 as const,
      lanes: [{ target: "volume", points: [{ t: 0, v }] }],
    });
    let land = () => {};
    writeProjectFile.mockImplementationOnce(
      (_path, content) =>
        new Promise<void>((resolve) => {
          land = () => {
            setFile(content);
            resolve();
          };
        }),
    );
    preview(at(0.5));
    const saving = startCommit(at(0.5));
    await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(1)));
    preview(at(0.9));
    preview(at(0.5));
    land();
    await act(async () => {
      await saving;
    });
    expect(usePlayerStore.getState().elements[0]?.automation).toBe(serializeAutomation(at(0.5)));
  });

  it.each([
    { lane: "clip", target: music, field: "automation", pendingLands: true, expected: 0.7 },
    { lane: "clip", target: music, field: "automation", pendingLands: false, expected: null },
    {
      lane: "group",
      target: group,
      field: "audioGroupAutomation",
      pendingLands: true,
      expected: 0.7,
    },
    {
      lane: "group",
      target: group,
      field: "audioGroupAutomation",
      pendingLands: false,
      expected: null,
    },
  ] as const)(
    "agrees with the file when a $lane drag is refused between an older failure and a pending save (lands: $pendingLands)",
    async ({ target, field, pendingLands, expected }) => {
      let locked = false;
      const { commit, startCommit, preview, writeProjectFile, iframe, file, setFile } = mountLanes(
        target,
        () => (locked ? LOCKED : true),
      );
      const stored = () => usePlayerStore.getState().elements[0]?.[field] ?? null;
      const shown = () =>
        iframe.contentDocument!.getElementById(target.id)?.getAttribute("data-automation") ?? null;
      const at = (v: number) => ({
        version: 1 as const,
        lanes: [{ target: "volume", points: [{ t: 0, v }] }],
      });
      let failOlder = () => {};
      let finishPending = () => {};
      writeProjectFile
        .mockImplementationOnce(
          () =>
            new Promise<void>((_resolve, reject) => {
              failOlder = () => reject(new Error("offline"));
            }),
        )
        .mockImplementationOnce(
          (_path, content) =>
            new Promise<void>((resolve, reject) => {
              finishPending = () => {
                if (!pendingLands) return reject(new Error("offline"));
                setFile(content);
                resolve();
              };
            }),
        );
      preview(at(0.9));
      const older = startCommit(at(0.9));
      await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(1)));
      preview(at(0.7));
      const pending = startCommit(at(0.7));
      preview(at(0.5));
      failOlder();
      await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(2)));
      expect(shown()).toBe(serializeAutomation(at(0.5)));
      locked = true;
      expect(await commit(at(0.5))).toMatchObject({ status: "refused" });
      finishPending();
      await act(async () => {
        await Promise.all([older, pending]);
      });
      const want = expected === null ? null : serializeAutomation(at(expected));
      const saved = new DOMParser().parseFromString(file(), "text/html");
      expect(saved.getElementById(target.id)?.getAttribute("data-automation") ?? null).toBe(want);
      expect(shown()).toBe(want);
      expect(stored()).toBe(want);
    },
  );

  it.each([
    { lane: "clip", target: music, field: "automation", newer: "saves", expected: 0.7 },
    { lane: "clip", target: music, field: "automation", newer: "fails", expected: 0.9 },
    { lane: "clip", target: music, field: "automation", newer: "is refused", expected: 0.9 },
    { lane: "group", target: group, field: "audioGroupAutomation", newer: "saves", expected: 0.7 },
    { lane: "group", target: group, field: "audioGroupAutomation", newer: "fails", expected: 0.9 },
    {
      lane: "group",
      target: group,
      field: "audioGroupAutomation",
      newer: "is refused",
      expected: 0.9,
    },
  ] as const)(
    "lands saves in the order they start when an older $lane save reads slowly and the newer one $newer",
    async ({ target, field, newer, expected }) => {
      const {
        startCommit,
        preview,
        writeProjectFile,
        iframe,
        file,
        holdRead,
        setFile,
        setRecording,
      } = mountLanes(target);
      const at = (v: number) => ({
        version: 1 as const,
        lanes: [{ target: "volume", points: [{ t: 0, v }] }],
      });
      writeProjectFile.mockImplementation(async (_path, content) => {
        if (newer === "fails" && content.includes("0.7")) throw new Error("offline");
        setFile(content);
      });
      const releaseOlder = holdRead(1);
      preview(at(0.9));
      const older = startCommit(at(0.9));
      if (newer === "is refused") setRecording(true);
      preview(at(0.7));
      const pending = startCommit(at(0.7));
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
      releaseOlder();
      await act(async () => {
        await Promise.all([older, pending]);
      });
      const want = serializeAutomation(at(expected));
      const saved = new DOMParser().parseFromString(file(), "text/html");
      expect(saved.getElementById(target.id)?.getAttribute("data-automation")).toBe(want);
      expect(
        iframe.contentDocument!.getElementById(target.id)?.getAttribute("data-automation"),
      ).toBe(want);
      expect(usePlayerStore.getState().elements[0]?.[field]).toBe(want);
    },
  );

  it("settles on a queued save that lands after an earlier one fails", async () => {
    const { startCommit, preview, writeProjectFile, iframe, setFile } = mountLanes(music);
    let failFirst = () => {};
    writeProjectFile
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            failFirst = () => reject(new Error("offline"));
          }),
      )
      .mockImplementationOnce(async (_path, content) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        setFile(content);
      });
    preview();
    const first = startCommit(NEXT);
    await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(1)));
    const later = {
      version: 1 as const,
      lanes: [{ target: "volume", points: [{ t: 0, v: 0.9 }] }],
    };
    preview(later);
    const second = startCommit(later);
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    failFirst();
    let outcomes: unknown[] = [];
    await act(async () => {
      outcomes = await Promise.all([first, second]);
    });
    expect(outcomes).toMatchObject([{ status: "failed" }, { status: "saved" }]);
    const landed = serializeAutomation(later);
    expect(iframe.contentDocument!.getElementById("music")?.getAttribute("data-automation")).toBe(
      landed,
    );
    expect(usePlayerStore.getState().elements[0]?.automation).toBe(landed);
  });

  it("settles on the file when two overlapping saves both fail", async () => {
    const { startCommit, preview, writeProjectFile, iframe } = mountLanes(music);
    let failFirst = () => {};
    writeProjectFile
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            failFirst = () => reject(new Error("offline"));
          }),
      )
      .mockRejectedValueOnce(new Error("offline"));
    preview();
    const first = startCommit(NEXT);
    await act(() => vi.waitFor(() => expect(writeProjectFile).toHaveBeenCalledTimes(1)));
    const later = {
      version: 1 as const,
      lanes: [{ target: "volume", points: [{ t: 0, v: 0.9 }] }],
    };
    preview(later);
    const second = startCommit(later);
    failFirst();
    let outcomes: unknown[] = [];
    await act(async () => {
      outcomes = await Promise.all([first, second]);
    });
    expect(outcomes).toMatchObject([{ status: "failed" }, { status: "failed" }]);
    expect(iframe.contentDocument!.getElementById("music")?.hasAttribute("data-automation")).toBe(
      false,
    );
    expect(usePlayerStore.getState().elements[0]?.automation).toBeUndefined();
  });

  it("puts a group's dragged preview and mirror back when a recording refuses the release", async () => {
    const { commit, preview, iframe } = mountLanes(group, undefined, true);
    preview();
    expect(usePlayerStore.getState().elements[0]?.audioGroupAutomation).toContain('"volume"');
    expect(await commit()).toMatchObject({ status: "refused" });
    expect(
      iframe.contentDocument!.getElementById("hf-group")?.hasAttribute("data-automation"),
    ).toBe(false);
    expect(usePlayerStore.getState().elements[0]?.audioGroupAutomation).toBeUndefined();
  });

  it.each(
    BOTH_LANES.flatMap((lane) =>
      (["mid-drag", "with a live write left open"] as const).flatMap((undo) =>
        (["is refused", "goes offline"] as const).map((release) => ({ ...lane, undo, release })),
      ),
    ),
  )(
    "keeps the undone $lane value when an undo lands $undo and the next save $release with no read-back",
    async ({ target, field, undo: when, release }) => {
      const h = mountLanes(target);
      expect(await h.commit(curve(0.2))).toEqual({ status: "saved" });
      const base = h.file();
      expect(await h.commit(curve(0.5))).toEqual({ status: "saved" });
      h.preview(curve(0.9));
      if (when === "mid-drag") {
        await h.undo(base);
        h.preview(curve(0.9));
      } else {
        h.preview(curve(0.5));
        await h.undo(base);
      }
      if (release === "is refused") h.setRecording(true);
      else h.failRead(h.reads() + 2);
      h.failRead(h.reads() + 1);
      await act(async () => {
        await h.startCommit(curve(0.9));
      });
      const want = serializeAutomation(curve(0.2));
      const saved = new DOMParser().parseFromString(h.file(), "text/html");
      expect(saved.getElementById(target.id)?.getAttribute("data-automation")).toBe(want);
      expect(
        h.iframe.contentDocument!.getElementById(target.id)?.getAttribute("data-automation"),
      ).toBe(want);
      expect(usePlayerStore.getState().elements[0]?.[field]).toBe(want);
    },
  );

  it("clears a group's mirrored automation when an undo soft-restores the group without it", async () => {
    const { commit, iframe, undo, setFile } = mountLanes(group);
    const grouped = SOURCE.replace(
      '<audio id="music"',
      '<audio id="music" data-audio-group="hf-group"',
    );
    setFile(grouped);
    iframe.contentDocument!.body.innerHTML = grouped;
    expect(await commit(curve(0.5))).toEqual({ status: "saved" });
    // The timeline's parse warms the group cache on every render.
    expect(groupInfoFor(iframe.contentDocument, "hf-group").automation).toBe(
      serializeAutomation(curve(0.5)),
    );
    await undo(grouped);
    expect(
      iframe.contentDocument!.getElementById("hf-group")?.hasAttribute("data-automation"),
    ).toBe(false);
    expect(usePlayerStore.getState().elements[0]?.audioGroupAutomation).toBeUndefined();
  });

  it.each(
    BOTH_LANES.flatMap((lane) => (["write", "read"] as const).map((held) => ({ ...lane, held }))),
  )(
    "leaves another composition alone when a $lane save made before switching to it lands after (held: $held)",
    async ({ target, field, held }) => {
      const h = mountLanes(target);
      const doc = new DOMParser().parseFromString(SOURCE, "text/html");
      const old = serializeAutomation(curve(0.2));
      for (const id of ["music", "hf-group"])
        doc.getElementById(id)!.setAttribute("data-automation", old);
      const other = doc.body.innerHTML;
      let land = () => {};
      if (held === "write") {
        h.writeProjectFile.mockImplementationOnce(
          (path, content) =>
            new Promise<void>((resolve) => {
              land = () => {
                h.put(path, content);
                resolve();
              };
            }),
        );
      } else {
        land = h.holdRead(1);
      }
      h.preview(curve(0.5));
      const saving = h.startCommit(curve(0.5));
      await act(() =>
        vi.waitFor(() =>
          held === "write"
            ? expect(h.writeProjectFile).toHaveBeenCalledTimes(1)
            : expect(h.reads()).toBe(1),
        ),
      );
      h.switchComposition("other.html", other, {
        ...music,
        key: "other.html#music",
        sourceFile: "other.html",
        audioGroup: "hf-group",
        automation: old,
        audioGroupAutomation: old,
      });
      land();
      await act(async () => {
        await saving;
      });
      const inA = new DOMParser().parseFromString(h.fileAt("index.html") ?? "", "text/html");
      expect(inA.getElementById(target.id)?.getAttribute("data-automation")).toBe(
        serializeAutomation(curve(0.5)),
      );
      expect(h.file()).toBe(other);
      expect(
        h.iframe.contentDocument!.getElementById(target.id)?.getAttribute("data-automation"),
      ).toBe(old);
      expect(usePlayerStore.getState().elements[0]?.[field]).toBe(old);
    },
  );

  const lastFailing = (
    h: ReturnType<typeof mountLanes>,
    release: "is refused" | "goes offline",
  ) => {
    if (release === "is refused") h.setRecording(true);
    else h.failRead(h.reads() + 2);
    h.failRead(h.reads() + 1);
  };
  const expectEverywhere = (
    h: ReturnType<typeof mountLanes>,
    target: TimelineElement,
    field: "automation" | "audioGroupAutomation",
    want: string,
  ) => {
    const saved = new DOMParser().parseFromString(h.file(), "text/html");
    expect(saved.getElementById(target.id)?.getAttribute("data-automation")).toBe(want);
    expect(
      h.iframe.contentDocument!.getElementById(target.id)?.getAttribute("data-automation"),
    ).toBe(want);
    expect(usePlayerStore.getState().elements[0]?.[field]).toBe(want);
  };
  const withEachRelease = BOTH_LANES.flatMap((lane) =>
    (["is refused", "goes offline"] as const).map((release) => ({ ...lane, release })),
  );

  it.each(withEachRelease)(
    "keeps a $lane value undone from another composition when the next save back in it $release with no read-back",
    async ({ target, field, release }) => {
      const h = mountLanes(target);
      expect(await h.commit(curve(0.2))).toEqual({ status: "saved" });
      const base = h.file();
      expect(await h.commit(curve(0.5))).toEqual({ status: "saved" });
      h.preview(curve(0.9));
      h.preview(curve(0.5));
      h.switchComposition("other.html", SOURCE, {
        ...music,
        key: "other.html#music",
        sourceFile: "other.html",
        audioGroup: "hf-group",
      });
      await h.undo(base, "index.html");
      const undone = serializeAutomation(curve(0.2));
      h.switchComposition("index.html", SOURCE, {
        ...music,
        audioGroup: "hf-group",
        automation: undone,
        audioGroupAutomation: undone,
      });
      lastFailing(h, release);
      await act(async () => {
        await h.startCommit(curve(0.9));
      });
      expectEverywhere(h, target, field, undone);
    },
  );

  it.each(withEachRelease)(
    "keeps the undone $lane value when a drag is released during the undo's round trip and its save $release with no read-back",
    async ({ target, field, release }) => {
      const h = mountLanes(target);
      expect(await h.commit(curve(0.2))).toEqual({ status: "saved" });
      const base = h.file();
      expect(await h.commit(curve(0.5))).toEqual({ status: "saved" });
      h.preview(curve(0.9));
      const undo = h.startUndo(base);
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      lastFailing(h, release);
      const releasing = h.startCommit(curve(0.9));
      undo.release();
      await act(async () => {
        await Promise.all([undo.done, releasing]);
      });
      expectEverywhere(h, target, field, serializeAutomation(curve(0.2)));
    },
  );

  it.each(BOTH_LANES)(
    "ends a cancelled $lane gesture, so a later outside write is what a failed save settles on",
    async ({ target, field }) => {
      const h = mountLanes(target);
      expect(await h.commit(curve(0.5))).toEqual({ status: "saved" });
      h.preview(curve(0.9));
      h.cancel(curve(0.5));
      // The property panel writes the lane's attribute without going through the lanes.
      const panel = serializeAutomation(curve(0.3));
      const doc = new DOMParser().parseFromString(h.file(), "text/html");
      doc.getElementById(target.id)!.setAttribute("data-automation", panel);
      h.setFile(doc.body.innerHTML);
      h.iframe.contentDocument!.getElementById(target.id)!.setAttribute("data-automation", panel);
      const [clip] = usePlayerStore.getState().elements;
      usePlayerStore.getState().setElements([{ ...clip!, [field]: panel }]);
      lastFailing(h, "is refused");
      await act(async () => {
        await h.startCommit(curve(0.9));
      });
      expectEverywhere(h, target, field, panel);
    },
  );

  it("reads a failed group save back from the file it started in after a trip to another composition", async () => {
    const h = mountLanes(group);
    expect(await h.commit(curve(0.2))).toEqual({ status: "saved" });
    const kept = serializeAutomation(curve(0.2));
    const stray = serializeAutomation(curve(0.9));
    // B declares the same group inside a sub-composition file, which holds 0.9.
    h.put("sub.html", `<hf-audio-group id="hf-group" data-automation='${stray}'></hf-audio-group>`);
    const other = `<div data-composition-id="sub" data-composition-file="sub.html">${SOURCE}</div>`;
    let failWrite = () => {};
    h.writeProjectFile.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          failWrite = () => reject(new Error("offline"));
        }),
    );
    const saving = h.startCommit(curve(0.5));
    await act(() => vi.waitFor(() => expect(h.writeProjectFile).toHaveBeenCalledTimes(2)));
    h.switchComposition("other.html", other, {
      ...music,
      key: "other.html#music",
      audioGroup: "hf-group",
    });
    const releaseReadBack = h.holdRead(h.reads() + 1);
    failWrite();
    await act(() => vi.waitFor(() => expect(h.reads()).toBe(3)));
    h.switchComposition("index.html", SOURCE, {
      ...music,
      audioGroup: "hf-group",
      audioGroupAutomation: kept,
    });
    releaseReadBack();
    await act(async () => {
      await saving;
    });
    expectEverywhere(h, group, "audioGroupAutomation", kept);
  });
});
