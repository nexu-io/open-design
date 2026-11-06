// @vitest-environment happy-dom
// fallow-ignore-file code-duplication
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  createStudioApi,
  fileContentVersion,
  identifyFileWrite,
  openProjectHistory,
  type StudioApiAdapter,
} from "@hyperframes/studio-server";
import { consumeStudioWriteToken } from "../utils/studioFileVersion";
import {
  beginStudioPendingEdit,
  paintBackNewestStudioPendingEdit,
} from "../utils/studioPendingEdits";
import { usePersistentEditHistory } from "./usePersistentEditHistory";

const cleanup: Array<() => unknown> = [];

afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
  vi.unstubAllGlobals();
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** The hook over the real history routes and engine, on a project whose index.html reads "A". */
async function studio({ withHistory = true } = {}) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const dir = tempDir("hf-studio-history-");
  writeFileSync(join(dir, "index.html"), "A");
  const history = await openProjectHistory({
    projectDir: dir,
    historyRoot: tempDir("hf-studio-history-root-"),
  });
  cleanup.push(() => history.close());
  const api = createStudioApi({
    listProjects: () => [],
    resolveProject: (id: string) => (id === "demo" ? { id, dir } : null),
    ...(withHistory && { history: () => history }),
  } as unknown as StudioApiAdapter);
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    api.request(url.replace(/^\/api/, ""), init),
  );
  let hook!: ReturnType<typeof usePersistentEditHistory>;
  function Harness() {
    hook = usePersistentEditHistory({ projectId: "demo" });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Harness)));
  cleanup.push(() => act(() => root.unmount()));
  const file = () => readFileSync(join(dir, "index.html"), "utf8");
  const save = (content: string) => writeFileSync(join(dir, "index.html"), content);
  const readFile = async (path: string) => readFileSync(join(dir, path), "utf8");
  return { dir, history, hook: () => hook, file, save, readFile };
}

it("an edit Studio saved is undone and redone by the project's history, with the preview's before and after", async () => {
  const { hook, file, save, readFile } = await studio();
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Moved Title",
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );
  await vi.waitFor(() => expect(hook().undoLabel).toBe("Moved Title"));

  const undone = await act(() => hook().undo({ readFile }));
  expect(undone).toEqual({
    ok: true,
    label: "Undid: Moved Title",
    undoes: expect.any(String),
    paths: ["index.html"],
    files: { "index.html": { previous: "B", restored: "A" } },
  });
  expect(file()).toBe("A");

  await vi.waitFor(() => expect(hook().canRedo).toBe(true));
  const redone = await act(() => hook().redo({ readFile }));
  expect(redone).toMatchObject({ ok: true, label: "Redid: Moved Title" });
  expect(file()).toBe("B");
});

it("gives an edit that begins the history's claim count, so undo can tell its claims from older ones", async () => {
  const { hook, save } = await studio();
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Moved Title",
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );
  const saving = beginStudioPendingEdit(() => () => {});

  expect(paintBackNewestStudioPendingEdit()?.claimsAtBegin).toBe(hook().claims());
  expect(hook().claims()).toBe(1);
  saving.settle();
});

it("undoes the edit claimed since the key, not a later edit the server took in first", async () => {
  const { dir, hook, file, save, readFile } = await studio();
  const atKey = hook().claims();
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Moved Title",
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );
  writeFileSync(join(dir, "card.html"), "Y");
  const later = hook().recordEdit({
    label: "Added Card",
    files: { "card.html": { before: "", after: "Y" } },
  });
  const afterLater = async <T>(_paths: readonly string[], task: () => Promise<T>) => {
    await later;
    return task();
  };

  const undone = await act(() =>
    hook().undo({ readFile, serialize: afterLater, claimedAfter: atKey }),
  );
  expect(undone).toMatchObject({ ok: true, label: "Undid: Moved Title" });
  expect(file()).toBe("A");
  expect(readFileSync(join(dir, "card.html"), "utf8")).toBe("Y");
});

it("a second undo pressed while the same edit saves undoes the edit before it", async () => {
  const { hook, file, save, readFile } = await studio();
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Moved Title",
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );
  await vi.waitFor(() => expect(hook().undoLabel).toBe("Moved Title"));
  const atKey = hook().claims();
  save("C");
  await act(() =>
    hook().recordEdit({
      label: "Moved Card",
      files: { "index.html": { before: "B", after: "C" } },
    }),
  );

  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(_paths: readonly string[], task: () => Promise<T>) => {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };
  const press = () => hook().undo({ readFile, claimedAfter: atKey, serialize });

  const [first, second] = await act(() => Promise.all([press(), press()]));

  expect([first, second]).toMatchObject([
    { ok: true, label: "Undid: Moved Card" },
    { ok: true, label: "Undid: Moved Title" },
  ]);
  expect(file()).toBe("A");
});

it("keeps the claim when its undo fails, so the next press targets that edit again", async () => {
  const { hook, save, readFile } = await studio();
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Moved Title",
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );
  await vi.waitFor(() => expect(hook().undoLabel).toBe("Moved Title"));
  const atKey = hook().claims();
  save("C");
  await act(() =>
    hook().recordEdit({
      label: "Moved Card",
      files: { "index.html": { before: "B", after: "C" } },
    }),
  );
  const posted: string[] = [];
  const fetch = globalThis.fetch;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (init?.method === "POST") posted.push(url.slice(url.lastIndexOf("/") + 1));
    return fetch(url, init);
  });

  save("edited elsewhere");
  const failed = await act(() => hook().undo({ readFile, claimedAfter: atKey }));
  save("C");
  const retried = await act(() => hook().undo({ readFile, claimedAfter: atKey }));

  expect(failed.ok).toBe(false);
  expect(retried).toMatchObject({ ok: true, label: "Undid: Moved Card" });
  expect(posted.filter((p) => p === "undo" || p === "step")).toEqual(["undo", "undo"]);
});

it("does not undo again an edit another press already undid", async () => {
  const { hook, file, save, readFile } = await studio();
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Moved Title",
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );
  await vi.waitFor(() => expect(hook().undoLabel).toBe("Moved Title"));
  const atKey = hook().claims();
  save("C");
  await act(() =>
    hook().recordEdit({
      label: "Moved Card",
      files: { "index.html": { before: "B", after: "C" } },
    }),
  );
  let calls = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(_paths: readonly string[], task: () => Promise<T>) => {
    calls += 1;
    if (calls === 1) return Promise.reject(new Error("save failed"));
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };
  const press = () => hook().undo({ readFile, claimedAfter: atKey, serialize });

  const [first, second] = await act(() => Promise.allSettled([press(), press()]));
  const third = await act(() => press());

  expect(first.status).toBe("rejected");
  expect(second).toMatchObject({
    status: "fulfilled",
    value: { ok: true, label: "Undid: Moved Card" },
  });
  expect(third).toMatchObject({ ok: true, label: "Undid: Moved Title" });
  expect(file()).toBe("A");
});

it("does not undo again an edit a later press undid first", async () => {
  const { hook, file, save, readFile } = await studio();
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Moved Title",
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );
  await vi.waitFor(() => expect(hook().undoLabel).toBe("Moved Title"));
  const atKey = hook().claims();
  save("C");
  await act(() =>
    hook().recordEdit({
      label: "Moved Card",
      files: { "index.html": { before: "B", after: "C" } },
    }),
  );
  let fail!: (error: Error) => void;
  const held = <T>(_paths: readonly string[], _task: () => Promise<T>) =>
    new Promise<T>((_resolve, reject) => {
      fail = reject;
    });
  const failed = hook()
    .undo({ readFile, claimedAfter: atKey, serialize: held })
    .catch(() => undefined);

  const second = await act(() => hook().undo({ readFile, claimedAfter: atKey }));
  fail(new Error("save failed"));
  await failed;
  const third = await act(() => hook().undo({ readFile, claimedAfter: atKey }));

  expect(second).toMatchObject({ ok: true, label: "Undid: Moved Card" });
  expect(third).toMatchObject({ ok: true, label: "Undid: Moved Title" });
  expect(file()).toBe("A");
});

it("refuses a second press whose edit is undone once an edit was made after the press", async () => {
  const { dir, hook, file, save, readFile } = await studio();
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Moved Title",
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );
  await vi.waitFor(() => expect(hook().undoLabel).toBe("Moved Title"));
  const atKey = hook().claims();
  save("C");
  await act(() =>
    hook().recordEdit({
      label: "Moved Card",
      files: { "index.html": { before: "B", after: "C" } },
    }),
  );
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  let queue: Promise<unknown> = Promise.resolve();
  let queued = 0;
  const serialize = <T>(_paths: readonly string[], task: () => Promise<T>) => {
    queued += 1;
    const wait = queued === 2 ? opened : Promise.resolve();
    const run = queue.then(() => wait).then(task);
    queue = run.catch(() => undefined);
    return run;
  };
  const press = () => hook().undo({ readFile, claimedAfter: atKey, serialize });
  const firstPress = press();
  const secondPress = press();
  // The first press must be over, not only its file written: the undo's closing sweep would take card.html
  // into the undo, and the claim below would then hold nothing.
  const first = await act(() => firstPress);
  expect(file()).toBe("B");
  writeFileSync(join(dir, "card.html"), "Y");
  await act(() =>
    hook().recordEdit({
      label: "Added Card",
      files: { "card.html": { before: "", after: "Y" } },
    }),
  );

  open();
  const second = await act(() => secondPress);

  expect(first).toMatchObject({ ok: true, label: "Undid: Moved Card" });
  expect(second).toMatchObject({ ok: false, reason: "content-mismatch" });
  expect(readFileSync(join(dir, "card.html"), "utf8")).toBe("Y");
  expect(file()).toBe("B");
});

it("a file the edit made (a freeze's still) is deleted by its Undo and put back by its Redo", async () => {
  const { dir, hook, save, readFile } = await studio();
  const still = join(dir, "assets", "freeze", "talk.png");
  mkdirSync(dirname(still), { recursive: true });
  writeFileSync(still, "png");
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Freeze frame",
      files: { "index.html": { before: "A", after: "B" } },
      created: ["assets/freeze/talk.png"],
    }),
  );
  await vi.waitFor(() => expect(hook().undoLabel).toBe("Freeze frame"));

  await act(() => hook().undo({ readFile }));
  expect(existsSync(still)).toBe(false);

  await vi.waitFor(() => expect(hook().canRedo).toBe(true));
  await act(() => hook().redo({ readFile }));
  expect(readFileSync(still, "utf8")).toBe("png");
});

it("a drag's edits under one key undo as one step, even before the drag goes idle", async () => {
  const { hook, file, save, readFile } = await studio();
  const writes: Array<[before: string, after: string]> = [
    ["A", "B"],
    ["B", "C"],
  ];
  for (const [before, after] of writes) {
    save(after);
    await act(() =>
      hook().recordEdit({
        label: "Dragged Title",
        coalesceKey: "drag",
        coalesceMs: 60_000,
        files: { "index.html": { before, after } },
      }),
    );
  }
  await vi.waitFor(() => expect(hook().undoLabel).toBe("Dragged Title"));
  const undone = await act(() => hook().undo({ readFile }));
  expect(undone).toMatchObject({
    ok: true,
    label: "Undid: Dragged Title",
    files: { "index.html": { previous: "C", restored: "A" } },
  });
  expect(file()).toBe("A");
});

it("a key one page holds does not join another page's edit under the same key", async () => {
  const { hook, file, save, readFile } = await studio();
  let reloaded!: ReturnType<typeof usePersistentEditHistory>;
  function Reloaded() {
    reloaded = usePersistentEditHistory({ projectId: "demo" });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Reloaded)));
  cleanup.push(() => act(() => root.unmount()));
  const held = { label: "Moved Title", coalesceKey: "timeline-move:1", coalesceMs: Infinity };
  save("B");
  await act(() =>
    hook().recordEdit({ ...held, files: { "index.html": { before: "A", after: "B" } } }),
  );
  save("C");
  await act(() =>
    reloaded.recordEdit({ ...held, files: { "index.html": { before: "B", after: "C" } } }),
  );

  await act(() => reloaded.undo({ readFile }));

  expect(file()).toBe("B");
});

it("a host's write claimed under claimKey joins Studio's save under the same key: one undo takes back both", async () => {
  const { dir, history, hook, file, save, readFile } = await studio();
  const key = "drop:1";
  writeFileSync(join(dir, "clip.mp4"), "media");
  await history.claim({ kind: "person", name: "You" }, "Dropped on timeline", ["clip.mp4"], {
    coalesceKey: hook().claimKey(key),
    idleMs: Infinity,
  });
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Dropped on timeline",
      coalesceKey: key,
      coalesceMs: Infinity,
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );

  await act(() => hook().undo({ readFile }));

  expect(file()).toBe("A");
  expect(existsSync(join(dir, "clip.mp4"))).toBe(false);
});

it("an undo before the history view shows a drag's held claim still waits on the files it wrote", async () => {
  const { hook, save, readFile } = await studio();
  const server = globalThis.fetch;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? server(url, init)
      : Promise.resolve(new Response(null, { status: 503 })),
  );
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Dragged Title",
      coalesceKey: "drag",
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );
  let waitedOn: readonly string[] = [];
  const serialize = <T>(paths: readonly string[], task: () => Promise<T>) => {
    waitedOn = paths;
    return task();
  };

  await act(() => hook().undo({ readFile, serialize }));
  expect(waitedOn).toEqual(["index.html"]);
});

it("an agent's edit made seconds before Studio's stays the agent's: Cmd+Z undoes only Studio's", async () => {
  const { hook, file, save, readFile } = await studio();
  save("B");
  await act(() => hook().recordEdit({ label: "sweep", files: {} }));
  save("C");
  await act(() =>
    hook().recordEdit({
      label: "Moved Title",
      files: { "index.html": { before: "B", after: "C" } },
    }),
  );
  expect(await act(() => hook().undo({ readFile }))).toMatchObject({ label: "Undid: Moved Title" });
  expect(file()).toBe("B");
});

it("an undo's writes carry the write token Studio marked, so their echo is not read as an outside edit", async () => {
  const { dir, hook, save, readFile } = await studio();
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Moved Title",
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );
  await act(() => hook().undo({ readFile }));
  const receipt = identifyFileWrite(join(dir, "index.html"), fileContentVersion("A"));
  expect(consumeStudioWriteToken(receipt?.writeToken ?? null)).toBe(true);
});

it("without a history on the server an edit still saves, and there is nothing to undo", async () => {
  const { hook, file, save, readFile } = await studio({ withHistory: false });
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Moved Title",
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );
  expect(hook().canUndo).toBe(false);
  expect(await act(() => hook().undo({ readFile }))).toEqual({ ok: false, reason: "empty" });
  expect(file()).toBe("B");
});

/** Answers requests to `route` with `reply` instead of the engine, every other request as before; returns the undo. */
function answer(
  route: "/history" | "/history/step" | "/history/claim",
  status: number,
  reply: object | string,
) {
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    url.endsWith(route)
      ? Promise.resolve(
          new Response(typeof reply === "string" ? reply : JSON.stringify(reply), { status }),
        )
      : real(url, init),
  );
  return () => vi.stubGlobal("fetch", real);
}

it("a step the server could not take says why, instead of reading as nothing to undo", async () => {
  const { hook, readFile } = await studio();
  answer("/history/step", 500, { error: "disk full" });
  expect(await act(() => hook().undo({ readFile }))).toEqual({
    ok: false,
    reason: "failed",
    message: "disk full",
  });
});

it("a refused step names the files that changed since its edit", async () => {
  const { hook, save, readFile } = await studio();
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Moved Title",
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );
  await vi.waitFor(() => expect(hook().undoLabel).toBe("Moved Title"));
  answer("/history/step", 200, { ok: false, conflict: { files: ["index.html"], newer: [] } });
  expect(await act(() => hook().undo({ readFile }))).toEqual({
    ok: false,
    reason: "content-mismatch",
    paths: ["index.html"],
  });
});

it("a claim the server refused is logged, and the write stays undoable as a change made outside", async () => {
  const { hook, file, save, readFile } = await studio();
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  cleanup.push(() => logged.mockRestore());
  const restoreFetch = answer("/history/claim", 500, { error: "disk full" });
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Moved Title",
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );
  expect(logged).toHaveBeenCalledWith(
    '[history] 500: "Moved Title" was not recorded as your edit: disk full',
  );
  restoreFetch();
  expect(await act(() => hook().undo({ readFile }))).toMatchObject({
    ok: true,
    label: "Undid: Changed outside the app",
  });
  expect(file()).toBe("A");
});

it.each([
  [
    "the server refused",
    409,
    () => answer("/history/claim", 409, { error: "newer edit" }),
    "newer edit",
  ],
  [
    "could not reach the server",
    0,
    () => {
      const real = globalThis.fetch;
      vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
        url.endsWith("/history/claim")
          ? Promise.reject(new TypeError("fetch failed"))
          : real(url, init),
      );
    },
    "Studio could not reach its server.",
  ],
] as const)(
  "a claim that %s logs under [history] with its status",
  async (_, status, stub, reason) => {
    const { hook, save } = await studio();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    cleanup.push(() => logged.mockRestore());
    stub();
    save("B");
    await act(() =>
      hook().recordEdit({
        label: "Moved Title",
        files: { "index.html": { before: "A", after: "B" } },
      }),
    );
    expect(logged).toHaveBeenCalledWith(
      `[history] ${status}: "Moved Title" was not recorded as your edit: ${reason}`,
    );
  },
);

it("a step whose reply cannot be read says so, instead of throwing", async () => {
  const { hook, readFile } = await studio();
  answer("/history/step", 200, "<html>");
  expect(await act(() => hook().undo({ readFile }))).toEqual({
    ok: false,
    reason: "failed",
    message: "The history's reply was unreadable.",
  });
});

it("an edit whose history reply cannot be read is still saved, and the reply is its own error", async () => {
  const { hook, file, save } = await studio();
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  cleanup.push(() => logged.mockRestore());
  answer("/history", 200, "<html>");
  save("B");
  await act(() =>
    hook().recordEdit({
      label: "Moved Title",
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );
  await vi.waitFor(() =>
    expect(logged).toHaveBeenCalledWith("The history's reply was unreadable."),
  );
  expect(file()).toBe("B");
});

it("a step that cannot reach the server says so", async () => {
  const { hook, readFile } = await studio();
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    url.endsWith("/history/step") ? Promise.reject(new TypeError("fetch failed")) : real(url, init),
  );
  expect(await act(() => hook().undo({ readFile }))).toEqual({
    ok: false,
    reason: "failed",
    message: "Studio could not reach its server.",
  });
});

it("predicts a step from what this tab wrote as soon as its save ends, and not while a claim or step may have moved the history", async () => {
  const { hook, save, readFile } = await studio();
  const real = globalThis.fetch;
  const slowView = (url: string, init?: RequestInit) =>
    url.endsWith("/history")
      ? new Promise((r) => setTimeout(r, 50)).then(() => real(url, init))
      : real(url, init);
  vi.stubGlobal("fetch", slowView);
  save("B");
  const claim = hook().recordEdit({
    label: "Moved Title",
    files: { "index.html": { before: "A", after: "B" } },
  });
  expect(hook().predict("undo")).toBeNull();
  await act(() => claim);
  const predicted = hook().predict("undo")!;
  expect(predicted?.files).toEqual({ "index.html": { previous: "B", restored: "A" } });

  hook().noteOutsideChange();
  expect(hook().predict("undo")).toBeNull();
  await vi.waitFor(() => expect(hook().predict("undo")?.id).toBe(predicted.id));

  const undone = hook().undo({ readFile });
  expect(hook().predict("undo")).toBeNull();
  expect((await act(() => undone)).undoes).toBe(predicted.id);
  await vi.waitFor(() =>
    expect(hook().predict("redo")?.files).toEqual({
      "index.html": { previous: "A", restored: "B" },
    }),
  );
});

it("an undo taken before the view caught up with the edit still reports the preview's before and after", async () => {
  const { hook, save, readFile } = await studio();
  save("B");
  const record = hook().recordEdit({
    label: "Moved Title",
    files: { "index.html": { before: "A", after: "B" } },
  });
  const undo = hook().undo;
  await act(() => record);
  const undone = await act(() => undo({ readFile }));
  expect(undone).toMatchObject({
    ok: true,
    files: { "index.html": { previous: "B", restored: "A" } },
  });
});

it("stores DOM targets in existing history and retains them through undo and redo", async () => {
  const { hook, save, readFile, history } = await studio();
  save("B");
  const targets = [{ file: "index.html", id: "title", selector: ".title", selectorIndex: 1 }];
  await act(() =>
    hook().recordEdit({
      label: "Title",
      targets,
      files: { "index.html": { before: "A", after: "B" } },
    }),
  );
  expect(history.list().at(-1)?.targets).toEqual(targets);
  await vi.waitFor(() => expect(hook().canUndo).toBe(true));
  await act(() => hook().undo({ readFile }));
  expect(history.list().at(-1)?.targets).toEqual(targets);
  await vi.waitFor(() => expect(hook().canRedo).toBe(true));
  await act(() => hook().redo({ readFile }));
  expect(history.list().at(-1)?.targets).toEqual(targets);
});
