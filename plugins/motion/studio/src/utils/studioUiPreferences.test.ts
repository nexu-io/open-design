import { describe, expect, it } from "vitest";
import { readStudioUiPreferences, writeStudioUiPreferences } from "./studioUiPreferences";

function createStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key) => entries.delete(key),
    setItem: (key, value) => entries.set(key, value),
  };
}

describe("studio UI preferences", () => {
  it("merges preference patches into one localStorage entry", () => {
    const storage = createStorage();

    writeStudioUiPreferences({ timelineVisible: false }, storage);
    writeStudioUiPreferences({ playbackRate: 1.5 }, storage);
    writeStudioUiPreferences({ audioMuted: true }, storage);
    writeStudioUiPreferences({ audioVolume: 0.4 }, storage);

    expect(readStudioUiPreferences(storage)).toEqual({
      timelineVisible: false,
      playbackRate: 1.5,
      audioMuted: true,
      audioVolume: 0.4,
    });
  });

  it("remembers the preview quality, and drops a level that is not one of the four", () => {
    const storage = createStorage();
    writeStudioUiPreferences({ previewQuality: 0.25 }, storage);
    expect(readStudioUiPreferences(storage)).toEqual({ previewQuality: 0.25 });

    storage.setItem("hf-studio-ui-preferences", JSON.stringify({ previewQuality: 0.75 }));
    expect(readStudioUiPreferences(storage).previewQuality).toBeUndefined();
  });

  it("remembers the ruler and safe-margin toggles and drops non-boolean values", () => {
    const storage = createStorage();
    writeStudioUiPreferences({ rulerVisible: true, safeMarginsVisible: false }, storage);
    expect(readStudioUiPreferences(storage)).toEqual({
      rulerVisible: true,
      safeMarginsVisible: false,
    });

    storage.setItem(
      "hf-studio-ui-preferences",
      JSON.stringify({ rulerVisible: "yes", safeMarginsVisible: 1 }),
    );
    expect(readStudioUiPreferences(storage)).toEqual({});
  });

  it("keeps no preview zoom, so every project opens at Fit", () => {
    const storage = createStorage();
    storage.setItem(
      "hf-studio-ui-preferences",
      JSON.stringify({ previewZoom: { zoomPercent: 245, panX: 0, panY: 0 } }),
    );
    expect(readStudioUiPreferences(storage)).toEqual({});
  });

  it("ignores malformed stored values", () => {
    const storage = createStorage();
    storage.setItem(
      "hf-studio-ui-preferences",
      JSON.stringify({
        timelineVisible: true,
        playbackRate: Number.NaN,
        audioMuted: "false",
        audioVolume: 2,
      }),
    );

    expect(readStudioUiPreferences(storage)).toEqual({
      timelineVisible: true,
    });
  });
});

describe("timelineSnapEnabled preference", () => {
  it("round-trips through storage", () => {
    const storage = createStorage();
    writeStudioUiPreferences({ timelineSnapEnabled: false }, storage);
    expect(readStudioUiPreferences(storage).timelineSnapEnabled).toBe(false);
  });

  it("ignores non-boolean values", () => {
    const storage = createStorage();
    storage.setItem("hf-studio-ui-preferences", JSON.stringify({ timelineSnapEnabled: "yes" }));
    expect(readStudioUiPreferences(storage).timelineSnapEnabled).toBeUndefined();
  });
});

describe("rippleEditEnabled preference", () => {
  it("round-trips through storage", () => {
    const storage = createStorage();
    writeStudioUiPreferences({ rippleEditEnabled: false }, storage);
    expect(readStudioUiPreferences(storage).rippleEditEnabled).toBe(false);
  });

  it("ignores non-boolean values", () => {
    const storage = createStorage();
    storage.setItem("hf-studio-ui-preferences", JSON.stringify({ rippleEditEnabled: "yes" }));
    expect(readStudioUiPreferences(storage).rippleEditEnabled).toBeUndefined();
  });
});

describe("thumbnailMode preference", () => {
  it("round-trips the adaptive mode", () => {
    const storage = createStorage();
    writeStudioUiPreferences({ thumbnailMode: "adaptive" }, storage);
    expect(readStudioUiPreferences(storage).thumbnailMode).toBe("adaptive");
  });

  it("migrates the legacy boolean without retaining two owners", () => {
    const storage = createStorage();
    storage.setItem("hf-studio-ui-preferences", JSON.stringify({ thumbnailsEnabled: false }));
    expect(readStudioUiPreferences(storage).thumbnailMode).toBe("hidden");
  });
});

describe("per-project scoping", () => {
  it("keeps two projects' preferences independent", () => {
    const storage = createStorage();
    writeStudioUiPreferences({ playbackRate: 1.25 }, storage, "alpha");
    writeStudioUiPreferences({ playbackRate: 2 }, storage, "beta");

    expect(readStudioUiPreferences(storage, "alpha").playbackRate).toBe(1.25);
    expect(readStudioUiPreferences(storage, "beta").playbackRate).toBe(2);
  });

  it("a project with nothing saved yet inherits the pre-scoping global entry once", () => {
    const storage = createStorage();
    storage.setItem("hf-studio-ui-preferences", JSON.stringify({ playbackRate: 0.5 }));

    expect(readStudioUiPreferences(storage, "gamma").playbackRate).toBe(0.5);
  });

  it("stops inheriting the global entry once the project has its own write", () => {
    const storage = createStorage();
    storage.setItem("hf-studio-ui-preferences", JSON.stringify({ playbackRate: 0.5 }));

    writeStudioUiPreferences({ playbackRate: 1.75 }, storage, "gamma");

    expect(readStudioUiPreferences(storage, "gamma").playbackRate).toBe(1.75);
    expect(readStudioUiPreferences(storage, null).playbackRate).toBe(0.5);
  });
});

describe("timeline zoom pin persistence", () => {
  it("round-trips a pinned manual zoom (survives the post-edit reload)", () => {
    const storage = createStorage();
    writeStudioUiPreferences(
      { timelineZoomMode: "manual", timelineManualZoomPercent: 250 },
      storage,
    );
    const prefs = readStudioUiPreferences(storage);
    expect(prefs.timelineZoomMode).toBe("manual");
    expect(prefs.timelineManualZoomPercent).toBe(250);
  });

  it("ignores an invalid zoom mode and a non-finite percent", () => {
    const storage = createStorage();
    storage.setItem(
      "hf-studio-ui-preferences",
      JSON.stringify({ timelineZoomMode: "zoomy", timelineManualZoomPercent: "big" }),
    );
    const prefs = readStudioUiPreferences(storage);
    expect(prefs.timelineZoomMode).toBeUndefined();
    expect(prefs.timelineManualZoomPercent).toBeUndefined();
  });
});

describe("audioMetersVisible preference", () => {
  it("round-trips and ignores a non-boolean", () => {
    const storage = createStorage();
    writeStudioUiPreferences({ audioMetersVisible: false }, storage);
    expect(readStudioUiPreferences(storage).audioMetersVisible).toBe(false);
    storage.setItem("hf-studio-ui-preferences", JSON.stringify({ audioMetersVisible: "no" }));
    expect(readStudioUiPreferences(storage).audioMetersVisible).toBeUndefined();
  });
});
