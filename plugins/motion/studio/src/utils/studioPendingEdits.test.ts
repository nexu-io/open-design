// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  addStudioPendingEditFlushListener,
  adoptingStudioPendingEdit,
  beginStudioPendingEdit,
  flushStudioPendingEdits,
  afterStudioPendingEdits,
  hasStudioPendingEdits,
  isStudioEditSaving,
  paintBackNewestStudioPendingEdit,
  setStudioWaitingPressCancel,
  trackStudioPendingEdit,
  trackedStudioEdit,
} from "./studioPendingEdits";
import { StudioFileConflictError } from "./studioSaveDiagnostics";
import { revertNewestStudioPendingEdit as hostRevert } from "../index";

describe("a canvas press still waiting to run", () => {
  it("is not what a host's revert takes back, since the host steps history after it", () => {
    const cancel = vi.fn(() => true);
    setStudioWaitingPressCancel(cancel);
    try {
      expect(hostRevert()).toBeNull();
      expect(cancel).not.toHaveBeenCalled();
    } finally {
      setStudioWaitingPressCancel(null);
    }
  });

  it("is never a pending edit, since a reload waits for those and the press waits for the reload", () => {
    setStudioWaitingPressCancel(() => true);
    const reload = vi.fn();
    try {
      afterStudioPendingEdits(reload);
      expect(reload).toHaveBeenCalledOnce();
      expect(hasStudioPendingEdits()).toBe(false);
    } finally {
      setStudioWaitingPressCancel(null);
    }
  });
});

describe("studio pending edit flush", () => {
  it("waits for mounted panels to persist pending local edits", async () => {
    const persist = vi.fn(async () => undefined);
    const remove = addStudioPendingEditFlushListener(persist);

    try {
      await expect(flushStudioPendingEdits()).resolves.toEqual({ status: "clean" });
      expect(persist).toHaveBeenCalledTimes(1);
    } finally {
      remove();
    }
  });

  it("commits the focused debounced field before draining pending work", async () => {
    const input = document.createElement("textarea");
    document.body.append(input);
    const persist = vi.fn(async () => undefined);
    input.addEventListener("blur", () => {
      trackStudioPendingEdit(persist());
    });
    input.focus();

    await expect(flushStudioPendingEdits()).resolves.toEqual({ status: "clean" });

    expect(document.activeElement).not.toBe(input);
    expect(persist).toHaveBeenCalledOnce();
    input.remove();
  });

  it.each([
    ["contenteditable", "plaintext-only"],
    ["role", "combobox"],
    ["role", "searchbox"],
    ["role", "switch"],
  ])("counts a focused [%s=%s] as a pending edit", (attribute, value) => {
    const field = document.createElement("div");
    field.setAttribute(attribute, value);
    field.tabIndex = 0;
    document.body.append(field);
    field.focus();

    expect(hasStudioPendingEdits()).toBe(true);
    field.remove();
  });

  it("waits for a post-blur effect to register its pending edit listener", async () => {
    const input = document.createElement("textarea");
    document.body.append(input);
    const persist = vi.fn(async () => undefined);
    let removeListener: (() => void) | undefined;
    let registrationDone: Promise<void> | undefined;
    input.addEventListener("blur", () => {
      registrationDone = new Promise<void>((resolve) => {
        setTimeout(() => {
          removeListener = addStudioPendingEditFlushListener(persist);
          resolve();
        }, 0);
      });
    });
    input.focus();

    try {
      await expect(flushStudioPendingEdits()).resolves.toEqual({ status: "clean" });

      expect(persist).toHaveBeenCalledOnce();
    } finally {
      await registrationDone;
      removeListener?.();
      input.remove();
    }
  });

  it("preserves a pending edit failure instead of reporting a clean drain", async () => {
    const failure = new Error("field save failed");
    const remove = addStudioPendingEditFlushListener(async () => {
      throw failure;
    });

    try {
      await expect(flushStudioPendingEdits()).resolves.toEqual({
        status: "failed",
        error: failure,
      });
    } finally {
      remove();
    }
  });

  it("keeps the full typed conflict payload for the external-change decision", async () => {
    const conflict = new StudioFileConflictError({
      filePath: "index.html",
      currentVersion: "v2",
      currentContent: "external",
      attemptedContent: "studio",
    });
    const remove = addStudioPendingEditFlushListener(async () => {
      throw conflict;
    });

    try {
      await expect(flushStudioPendingEdits()).resolves.toEqual({
        status: "conflict",
        error: conflict,
      });
    } finally {
      remove();
    }
  });

  it("prioritizes a conflict when pending edits fail with mixed errors", async () => {
    const failure = new Error("field save failed");
    const conflict = new StudioFileConflictError({
      filePath: "index.html",
      currentVersion: "v2",
      currentContent: "external",
      attemptedContent: "studio",
    });
    const removeFailure = addStudioPendingEditFlushListener(async () => {
      throw failure;
    });
    const removeConflict = addStudioPendingEditFlushListener(async () => {
      throw conflict;
    });

    try {
      await expect(flushStudioPendingEdits()).resolves.toEqual({
        status: "conflict",
        error: conflict,
      });
    } finally {
      removeFailure();
      removeConflict();
    }
  });

  it("waits for edits already started by unmounted panels", async () => {
    const steps: string[] = [];
    let resolvePersist!: () => void;
    trackStudioPendingEdit(
      new Promise<void>((resolve) => {
        resolvePersist = resolve;
      }).then(() => {
        steps.push("persisted");
      }),
    );

    const flushed = flushStudioPendingEdits().then(() => {
      steps.push("flushed");
    });
    await Promise.resolve();
    expect(steps).toEqual([]);

    resolvePersist();
    await flushed;
    expect(steps).toEqual(["persisted", "flushed"]);
  });
});

describe("a drain that meets a conflict", () => {
  it("still waits for the edits that started while it ran before it reports the conflict", async () => {
    const conflict = new StudioFileConflictError({
      filePath: "index.html",
      currentVersion: "v2",
      currentContent: "external",
      attemptedContent: "studio",
    });
    let finish!: () => void;
    let laterSaved = false;
    trackStudioPendingEdit(
      Promise.resolve().then(() => {
        trackStudioPendingEdit(
          new Promise<void>((resolve) => (finish = resolve)).then(() => (laterSaved = true)),
        );
        throw conflict;
      }),
    );
    let drained = false;
    const drain = flushStudioPendingEdits().then((result) => ((drained = true), result));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(drained).toBe(false);
    finish();
    await expect(drain).resolves.toEqual({ status: "conflict", error: conflict });
    expect(laterSaved).toBe(true);
  });
});

describe("a new edit after a debounced one", () => {
  it("commits the debounced edit first, so history records them in the order they were made", () => {
    const order: string[] = [];
    const remove = addStudioPendingEditFlushListener(() => void order.push("nudge"));
    trackedStudioEdit(() => void order.push("panel"))();
    const drag = beginStudioPendingEdit(null);
    drag.adopt(() => void order.push("drag"));
    drag.settle();
    remove();
    expect(order).toEqual(["nudge", "panel", "nudge", "drag"]);
  });
  it("starts a new edit only after a flushed save that was still waiting has written", async () => {
    const order: string[] = [];
    let fetched!: () => void;
    // A nudge on an animated layer: its save waits on the animation fetch before it writes.
    const remove = addStudioPendingEditFlushListener(async () => {
      await new Promise<void>((resolve) => (fetched = resolve));
      order.push("nudge write");
    });
    const panelEdit = trackedStudioEdit(async () => void order.push("width write"), {
      afterOlderSaves: true,
    })();
    fetched();
    await panelEdit;
    remove();
    expect(order).toEqual(["nudge write", "width write"]);
  });

  it("keeps every later edit behind one that waits on a flushed save, so the newest value lands last", async () => {
    const order: string[] = [];
    let fetched!: () => void;
    let saving = false;
    const remove = addStudioPendingEditFlushListener(() => {
      if (saving) return undefined;
      saving = true;
      return new Promise<void>((resolve) => (fetched = resolve)).then(
        () => void order.push("nudge"),
      );
    });
    const userEdit = (body: () => unknown) => trackedStudioEdit(body, { afterOlderSaves: true });
    const first = userEdit(async () => void order.push("W 200"))();
    const second = userEdit(async () => void order.push("W 300"))();
    const drag = beginStudioPendingEdit(null);
    const dragged = drag.adopt(() => Promise.resolve().then(() => void order.push("resize")));
    fetched();
    await Promise.all([first, second, dragged]);
    drag.settle();
    remove();
    expect(order).toEqual(["nudge", "W 200", "W 300", "resize"]);
  });

  it("never waits on itself: a deferred edit or a flushed save may call a wrapped edit", async () => {
    let fetched!: () => void;
    let saving = false;
    const internal = trackedStudioEdit(async () => undefined);
    // The flushed save calls an internal wrapped commit after its fetch, as an animated nudge does.
    const remove = addStudioPendingEditFlushListener(() => {
      if (saving) return undefined;
      saving = true;
      return new Promise<void>((resolve) => (fetched = resolve)).then(() => internal());
    });
    const userEdit = (body: () => unknown) => trackedStudioEdit(body, { afterOlderSaves: true });
    const panel = userEdit(() => internal())();
    const drag = beginStudioPendingEdit(null);
    const dragged = drag.adopt(() => internal());
    fetched();
    await Promise.all([panel, dragged]);
    drag.settle();
    await userEdit(async () => undefined)();
    remove();
    expect(isStudioEditSaving()).toBe(false);
  });

  it("lets a second burst flushed behind the first one save, though its commit is a panel action", async () => {
    const order: string[] = [];
    let fetched!: () => void;
    const commitNudge = trackedStudioEdit(
      async (name: string) => {
        if (name === "nudge A") await new Promise<void>((resolve) => (fetched = resolve));
        else await Promise.resolve();
        order.push(name);
      },
      { afterOlderSaves: true },
    );
    let burst: { name: string; edit: ReturnType<typeof beginStudioPendingEdit> } | null = null;
    const startBurst = (name: string) => {
      const edit = beginStudioPendingEdit(null);
      burst = { name, edit };
    };
    const remove = addStudioPendingEditFlushListener(() => {
      if (!burst) return undefined;
      const { name, edit } = burst;
      burst = null;
      const saved = edit.adopt(() => commitNudge(name));
      edit.settle(saved);
      return saved;
    });
    const panelEdit = trackedStudioEdit(async (name: string) => void order.push(name), {
      afterOlderSaves: true,
    });
    startBurst("nudge A");
    const first = panelEdit("W 200");
    startBurst("nudge B");
    const second = panelEdit("W 300");
    fetched();
    await Promise.all([first, second]);
    remove();
    expect(order).toEqual(["nudge A", "W 200", "nudge B", "W 300"]);
    expect(isStudioEditSaving()).toBe(false);
  });

  it("never flushes from inside an edit's own save, where a flushed save would go untracked", () => {
    let flushes = 0;
    const remove = addStudioPendingEditFlushListener(() => void (flushes += 1));
    const drag = beginStudioPendingEdit(null);
    drag.adopt(() => trackedStudioEdit(() => undefined)());
    drag.settle();
    remove();
    expect(flushes).toBe(1);
  });
});

describe("trackedStudioEdit", () => {
  it("counts each call as a pending edit until it settles, and reports a failure to the drain", async () => {
    let fail!: () => void;
    const failure = new Error("The save failed.");
    const edit = trackedStudioEdit(
      () => new Promise<void>((_, reject) => (fail = () => reject(failure))),
    );
    const saved = edit();
    expect(hasStudioPendingEdits()).toBe(true);
    const drain = flushStudioPendingEdits();
    fail();
    await expect(saved).rejects.toThrow("The save failed.");
    await expect(drain).resolves.toEqual({ status: "failed", error: failure });
    expect(hasStudioPendingEdits()).toBe(false);
  });
});

describe("a pending edit undo can paint back", () => {
  const shown: string[] = [];
  const edit = (name: string) =>
    beginStudioPendingEdit(() => {
      shown.push(`${name} undone`);
      return () => shown.push(`${name} again`);
    });

  it("paints back only the newest edit, once, and shows it again on request", () => {
    shown.length = 0;
    const first = edit("first");
    const second = edit("second");
    const again = paintBackNewestStudioPendingEdit();
    expect(shown).toEqual(["second undone"]);
    expect(second.reverted()).toBe(true);
    expect(first.reverted()).toBe(false);
    expect(paintBackNewestStudioPendingEdit()).toBeNull();
    again!.showAgain();
    expect(shown).toEqual(["second undone", "second again"]);
    first.settle();
    second.settle();
  });

  it("paints nothing when the newest edit has no revert", async () => {
    shown.length = 0;
    const move = edit("move");
    let saved!: () => void;
    trackStudioPendingEdit(new Promise<void>((resolve) => (saved = resolve)));
    expect(paintBackNewestStudioPendingEdit()).toBeNull();
    expect(shown).toEqual([]);
    saved();
    move.settle();
    await flushStudioPendingEdits();
  });

  it("counts what the edit starts inside adopt as that edit, not a newer one", async () => {
    shown.length = 0;
    const move = edit("move");
    let saved!: () => void;
    const save = move.adopt(() =>
      trackStudioPendingEdit(new Promise<void>((resolve) => (saved = resolve))),
    );
    move.settle(save);
    paintBackNewestStudioPendingEdit();
    expect(shown).toEqual(["move undone"]);
    saved();
    await expect(flushStudioPendingEdits()).resolves.toEqual({ status: "clean" });
    expect(hasStudioPendingEdits()).toBe(false);
  });
});

describe("a pending edit whose start throws", () => {
  it("ends, so undo and export never wait on it", async () => {
    const edit = beginStudioPendingEdit(null);
    expect(() =>
      edit.adopt(() => {
        throw new Error("The commit threw.");
      }),
    ).toThrow("The commit threw.");
    await expect(flushStudioPendingEdits()).resolves.toEqual({ status: "clean" });
    expect(hasStudioPendingEdits()).toBe(false);
  });
});

describe("the package's public revert", () => {
  it("lets a host's own undo key paint a still-saving move back at once", async () => {
    let left = "120px";
    const edit = beginStudioPendingEdit(() => ((left = "0px"), () => void (left = "120px")));
    try {
      const putBack = hostRevert();
      expect(left).toBe("0px");
      expect(hostRevert()).toBeNull();
      putBack?.();
      expect(left).toBe("120px");
    } finally {
      edit.settle();
      await flushStudioPendingEdits();
    }
  });
});

describe("a drain of only the current edits", () => {
  it("ends once the edits pending at its start land, without waiting for one started after", async () => {
    let landFirst!: () => void;
    let landLater!: () => void;
    trackStudioPendingEdit(new Promise<void>((resolve) => (landFirst = resolve)));
    let drained = false;
    const drain = flushStudioPendingEdits({ onlyCurrent: true }).then(() => (drained = true));
    await Promise.resolve();
    trackStudioPendingEdit(new Promise<void>((resolve) => (landLater = resolve)));
    landFirst();
    await drain;
    expect(drained).toBe(true);
    expect(hasStudioPendingEdits()).toBe(true);
    landLater();
  });
});

describe("an edit undo painted back while it saves", () => {
  function paintedBackEdit() {
    const box = { look: "edited" };
    const edit = beginStudioPendingEdit(() => {
      const shown = box.look;
      box.look = "start";
      return () => (box.look = shown);
    });
    let landSave!: () => void;
    const inFlight = edit.adopt(() => adoptingStudioPendingEdit())!;
    edit.settle(new Promise<void>((resolve) => (landSave = resolve)));
    const shown = paintBackNewestStudioPendingEdit()!;
    return { box, inFlight, shown, landSave };
  }

  it("draws on the edit as shown, then shows it undone again in the same task", () => {
    const { box, inFlight, shown, landSave } = paintedBackEdit();
    let drawnOver = "";
    inFlight.drawKeepingUndone(() => {
      drawnOver = box.look;
      box.look += "+size";
    });
    expect(drawnOver).toBe("edited");
    expect(box.look).toBe("start");
    shown.showAgain();
    expect(box.look).toBe("edited+size");
    landSave();
  });

  it("keeps a redraw until the edit is shown again", () => {
    const { inFlight, shown, landSave } = paintedBackEdit();
    const redraw = vi.fn();
    inFlight.drawUnlessUndone(redraw);
    expect(redraw).not.toHaveBeenCalled();
    shown.showAgain();
    expect(redraw).toHaveBeenCalledTimes(1);
    landSave();
  });
});

it("counts an edit whose later write failed as saved once an earlier write landed, so undo still steps it", async () => {
  const edit = beginStudioPendingEdit(() => () => undefined);
  const committed = edit.adopt(async () => {
    adoptingStudioPendingEdit()!.markSaved();
    throw new Error("the crop save failed");
  });
  edit.settle(committed.catch(() => undefined));
  const shown = paintBackNewestStudioPendingEdit()!;
  await expect(shown.landed()).resolves.toBe(true);
});
