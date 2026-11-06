// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import {
  createStudioApi,
  openProjectHistory,
  type StudioApiAdapter,
} from "@hyperframes/studio-server";
import { useDomEditNudge } from "../components/editor/useDomEditNudge";
import { DomEditProvider, useDomEditActionsContext } from "../contexts/DomEditContext";
import { __resetForTests as resetNudgeKeys } from "../utils/canvasNudgeGate";
import { trackedStudioEdit } from "../utils/studioPendingEdits";
import { makeSelection } from "./domSelectionTestHarness";
import { useEditHistoryActions } from "./useEditHistoryActions";
import { usePersistentEditHistory } from "./usePersistentEditHistory";
import { usePreviewPersistence } from "./usePreviewPersistence";

const page = (left: string, top = "0px") =>
  `<!doctype html><html><head></head><body><div id="root" data-composition-id="main"><div id="box" style="position: absolute; left: ${left}"></div><div id="other" style="position: absolute; top: ${top}"></div></div></body></html>`;
const BEFORE = page("10px");
const AFTER = page("50px");
const OUTSIDE = page("50px", "99px");
const NUDGED = page("51px");

const cleanup: Array<() => unknown> = [];
let scratch = "";
beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "hf-undo-paint-"));
});
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
  rmSync(scratch, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

/** Studio's undo wired as App.tsx wires it, over the real history engine, with a live preview document. */
async function studio() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const dir = join(scratch, "project");
  mkdirSync(dir);
  const path = join(dir, "index.html");
  writeFileSync(path, BEFORE);
  const engine = await openProjectHistory({
    projectDir: dir,
    historyRoot: join(scratch, "history"),
  });
  cleanup.push(() => engine.close());
  const api = createStudioApi({
    listProjects: () => [],
    resolveProject: (id: string) => (id === "demo" ? { id, dir } : null),
    history: () => engine,
  } as unknown as StudioApiAdapter);
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    api.request(url.replace(/^\/api/, ""), init),
  );
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  cleanup.push(() => iframe.remove());
  const reloads = vi.fn();
  const readFile = async (p: string) => readFileSync(join(dir, p), "utf8");
  let history!: ReturnType<typeof usePersistentEditHistory>;
  let persistence!: ReturnType<typeof usePreviewPersistence>;
  let actions!: ReturnType<typeof useEditHistoryActions>;
  function Harness() {
    history = usePersistentEditHistory({ projectId: "demo" });
    persistence = usePreviewPersistence({
      showToast: () => {},
      readOptionalProjectFile: async () => "",
      writeProjectFile: async () => {},
      recordEdit: async () => {},
      previewIframeRef: { current: iframe },
      activeCompPathRef: { current: "index.html" },
      reloadPreview: reloads,
    });
    actions = useEditHistoryActions({
      editHistory: history,
      readOptionalProjectFile: async () => "",
      readProjectFile: readFile,
      writeProjectFile: async (p, content) => writeFileSync(join(dir, p), content),
      showToast: () => {},
      syncHistoryPreviewAfterApply: persistence.syncHistoryPreviewAfterApply,
      showHistoryRestoreNow: persistence.showHistoryRestoreNow,
      waitForPendingDomEditSaves: persistence.settlePendingEdits,
    });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Harness)));
  cleanup.push(() => act(() => root.unmount()));
  const element = (id: string) => iframe.contentDocument!.getElementById(id)!;
  const box = () => element("box").style.left;
  const other = () => iframe.contentDocument!.getElementById("other")!.style.top;
  const show = (html: string) => {
    iframe.contentDocument!.documentElement.innerHTML = new DOMParser().parseFromString(
      html,
      "text/html",
    ).documentElement.innerHTML;
  };
  /** A move Studio saved: the live preview already shows it, then the file and the history claim land. */
  const edit = async () => {
    show(AFTER);
    writeFileSync(path, AFTER);
    await act(() =>
      history.recordEdit({
        label: "Move layer",
        files: { "index.html": { before: BEFORE, after: AFTER } },
      }),
    );
    await vi.waitFor(() => expect(history.undoLabel).toBe("Move layer"));
  };
  /** Mounts `ui` beside Studio, as the canvas is, for the rest of the test. */
  const mount = (ui: ReactElement) => {
    const canvas = createRoot(document.createElement("div"));
    act(() => canvas.render(ui));
    cleanup.push(() => act(() => canvas.unmount()));
  };
  return {
    history: () => history,
    element,
    mount,
    persistence: () => persistence,
    actions: () => actions,
    box,
    other,
    show,
    path,
    edit,
    file: () => readFileSync(path, "utf8"),
    reloads,
  };
}

it("undo and redo of a style edit paint in the key's own task, before the server answers", async () => {
  const s = await studio();
  await s.edit();

  const undone = s.actions().undo();
  expect(s.box()).toBe("10px");
  await act(() => undone);
  expect(s.file()).toBe(BEFORE);
  expect(s.box()).toBe("10px");

  await vi.waitFor(() => expect(s.history().redoLabel).toBeTruthy());
  const redone = s.actions().redo();
  expect(s.box()).toBe("50px");
  await act(() => redone);
  expect(s.file()).toBe(AFTER);
  expect(s.box()).toBe("50px");
  expect(s.reloads).not.toHaveBeenCalled();
});

it("an undo pressed while a save is still running waits for the server instead of guessing", async () => {
  const s = await studio();
  await s.edit();
  let finish!: () => void;
  const saving = new Promise<void>((resolve) => (finish = resolve));
  void s.persistence().queueDomEditSave(() => saving);

  const undone = s.actions().undo();
  expect(s.box()).toBe("50px");
  finish();
  await act(() => undone);
  expect(s.file()).toBe(BEFORE);
  expect(s.box()).toBe("10px");
});

it("an undo waits for a save queued before its key, not one queued after", async () => {
  const s = await studio();
  await s.edit();
  let land!: () => void;
  void s.persistence().queueDomEditSave(() => new Promise<void>((resolve) => (land = resolve)));
  await vi.waitFor(() => expect(land).toBeTypeOf("function"));

  const undone = s.actions().undo();
  void s.persistence().queueDomEditSave(() => new Promise<void>(() => {}));
  land();
  await act(() => undone);
  expect(s.file()).toBe(BEFORE);
});

it("an undo after an outside write ends with the preview showing the file the server restored", async () => {
  const s = await studio();
  await s.edit();
  writeFileSync(s.path, OUTSIDE);
  s.show(OUTSIDE);

  await act(() => s.actions().undo());
  expect(s.file()).toBe(AFTER);
  expect(s.other()).toBe("0px");
  expect(s.box()).toBe("50px");
});

/** The canvas's arrow-key nudge on the box; `save` stands in for the burst's save once the keys stop. */
function Nudge({ target, save }: { target: HTMLElement; save: () => Promise<void> }) {
  const selection = makeSelection("Box", target);
  const ref = <T,>(current: T) => ({ current });
  useDomEditNudge({
    selection,
    groupSelections: [],
    allowCanvasMovement: true,
    selectionRef: ref(selection),
    overlayRectRef: ref({ left: 0, top: 0, width: 100, height: 40, editScaleX: 1, editScaleY: 1 }),
    groupOverlayItemsRef: ref([]),
    gestureRef: ref(null),
    groupGestureRef: ref(null),
    blockedMoveRef: ref(null),
    onManualDragStartRef: ref(() => {}),
    onBlockedMoveRef: ref(() => {}),
    onPathOffsetCommitRef: ref(save),
    onGroupPathOffsetCommitRef: ref(async () => {}),
  });
  return null;
}

/** A nudge save that waits for `finish()`, then writes and records the nudge as the real save does. */
function queuedNudgeSave(s: Awaited<ReturnType<typeof studio>>) {
  let finish!: () => void;
  const save = vi.fn(async () => {
    await new Promise<void>((resolve) => (finish = resolve));
    writeFileSync(s.path, NUDGED);
    await s.history().recordEdit({
      label: "Move layer",
      files: { "index.html": { before: AFTER, after: NUDGED } },
    });
  });
  return { save, finish: () => finish() };
}

/** Mounts the nudge, presses ArrowRight once and waits for its save; returns the nudge's translate reader. */
async function pressNudge(s: Awaited<ReturnType<typeof studio>>, save: Mock<() => Promise<void>>) {
  s.mount(createElement(Nudge, { target: s.element("box"), save }));
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));
  });
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  return () => s.element("box").style.getPropertyValue("translate");
}

it("an undo pressed while a nudge waits for more keys never shows the move before it undone", async () => {
  const s = await studio();
  await s.edit();
  resetNudgeKeys();
  const { save, finish } = queuedNudgeSave(s);
  s.mount(createElement(Nudge, { target: s.element("box"), save }));
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }));
  });

  const nudge = () => s.element("box").style.getPropertyValue("translate");
  expect(nudge()).not.toBe("");

  const undone = s.actions().undo();
  expect(s.box()).toBe("50px");
  expect(nudge()).toBe("");
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(nudge()).toBe("");
  finish();
  await act(() => undone);
  expect(save).toHaveBeenCalledTimes(1);
  expect(s.file()).toBe(AFTER);
  expect(s.box()).toBe("50px");
  expect(nudge()).toBe("");
});

it("an undo pressed while a nudge's save is queued shows the nudge undone in the key's own task", async () => {
  const s = await studio();
  await s.edit();
  resetNudgeKeys();
  const { save, finish } = queuedNudgeSave(s);
  const nudge = await pressNudge(s, save);
  expect(nudge()).not.toBe("");

  const undone = s.actions().undo();
  expect(nudge()).toBe("");
  expect(s.box()).toBe("50px");
  finish();
  await act(() => undone);
  expect(s.file()).toBe(AFTER);
  expect(nudge()).toBe("");
  expect(s.box()).toBe("50px");
});

/** A nudge whose save is queued and then rejects, and the history requests the undo sends. */
async function failingNudge(s: Awaited<ReturnType<typeof studio>>) {
  resetNudgeKeys();
  let fail!: () => void;
  const save = vi.fn(
    () => new Promise<void>((_, reject) => (fail = () => reject(new Error("The save failed.")))),
  );
  const nudge = await pressNudge(s, save);
  const steps: string[] = [];
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (/\/history\/(step|undo)$/.test(url)) steps.push(url);
    return real(url, init);
  });
  return { fail: () => fail(), steps, nudge };
}

it("an undo pressed while a nudge's save fails keeps the nudge undone and steps no older edit", async () => {
  const s = await studio();
  await s.edit();
  const n = await failingNudge(s);
  expect(n.nudge()).not.toBe("");

  const undone = s.actions().undo();
  expect(n.nudge()).toBe("");
  n.fail();
  await act(() => undone);
  expect(n.steps).toEqual([]);
  expect(s.file()).toBe(AFTER);
  expect(s.box()).toBe("50px");
  expect(n.nudge()).toBe("");
});

it("an undo pressed while the only edit's save fails leaves the screen as the file, nothing put back", async () => {
  const s = await studio();
  s.show(BEFORE);
  const n = await failingNudge(s);

  const undone = s.actions().undo();
  n.fail();
  await act(() => undone);
  expect(s.file()).toBe(BEFORE);
  expect(n.nudge()).toBe("");
});

it("an undo pressed while a queued save fails undoes the edit before it, file and box alike", async () => {
  const s = await studio();
  await s.edit();
  const box = s.element("box");
  let fail!: () => void;
  const handleDomStyleCommit = vi.fn(async () => {
    box.style.left = "70px";
    try {
      await s.persistence().queueDomEditSave(async () => {
        await new Promise<void>((resolve) => (fail = resolve));
        throw new Error("The save failed.");
      });
    } catch (error) {
      box.style.left = "50px";
      throw error;
    }
  });
  let actions!: ReturnType<typeof useDomEditActionsContext>;
  function Canvas() {
    actions = useDomEditActionsContext();
    return null;
  }
  const value = { handleDomStyleCommit } as unknown as Parameters<
    typeof DomEditProvider
  >[0]["value"];
  s.mount(
    <DomEditProvider value={value}>
      <Canvas />
    </DomEditProvider>,
  );
  const failed = actions.handleDomStyleCommit("left", "70px");

  const undone = s.actions().undo();
  await vi.waitFor(() => expect(fail).toBeTypeOf("function"));
  fail();
  await expect(failed).rejects.toThrow("The save failed.");
  await act(() => undone);
  expect(s.file()).toBe(BEFORE);
  expect(s.box()).toBe("10px");
});

it("an undo pressed while a tracked timeline edit fails still undoes the edit before it", async () => {
  const s = await studio();
  await s.edit();
  let fail!: () => void;
  const timelineEdit = trackedStudioEdit(
    () => new Promise<void>((_, reject) => (fail = () => reject(new Error("The save failed.")))),
  );
  const failed = timelineEdit();

  const undone = s.actions().undo();
  fail();
  await expect(failed).rejects.toThrow("The save failed.");
  await act(() => undone);
  expect(s.file()).toBe(BEFORE);
  expect(s.box()).toBe("10px");
});
