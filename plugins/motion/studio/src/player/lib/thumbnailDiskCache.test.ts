// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readStoredFrame,
  readStoredInfo,
  rememberVersion,
  resetStoredThumbnailsForTests,
  STORED_THUMBNAIL_BYTES,
  storedVersion,
  storeFrame,
  storeInfo,
} from "./thumbnailDiskCache";

/** Cache Storage as a Map of Maps: what a browser keeps across sessions. */
function fakeCacheStorage() {
  const stores = new Map<string, Map<string, Response>>();
  const storage = {
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        match: async (url: string) => store.get(String(url))?.clone(),
        put: async (url: string, response: Response) => void store.set(String(url), response),
      };
    },
    has: async (name: string) => stores.has(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  return { storage, stores };
}

const v1 = { source: "/media/take.mp4", etag: '"one"' };
const v2 = { source: "/media/take.mp4", etag: '"two"' };
// a picture that reports `bytes` without holding them, so the budget test needs no real 128 MB
function jpeg(bytes = 5): Blob {
  const blob = new Blob([new Uint8Array(Math.min(bytes, 5))], { type: "image/jpeg" });
  return Object.defineProperty(blob, "size", { value: bytes });
}

let stores: Map<string, Map<string, Response>>;

beforeEach(() => {
  resetStoredThumbnailsForTests();
  localStorage.clear();
  const fake = fakeCacheStorage();
  stores = fake.stores;
  vi.stubGlobal("caches", fake.storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("stored thumbnails", () => {
  it("keep a source's facts and each frame with the time it was decoded at", async () => {
    await storeInfo(v1, { aspect: 16 / 9, metadataDuration: 30 });
    await storeFrame(v1, "cover 320x180 2.5", 2.4, jpeg());

    expect(await readStoredInfo(v1)).toEqual({ aspect: 16 / 9, metadataDuration: 30 });
    const frame = await readStoredFrame(v1, "cover 320x180 2.5");
    expect(frame?.decodedAt).toBe(2.4);
    expect(frame?.blob.size).toBe(5);
    expect(await readStoredFrame(v1, "cover 320x180 5")).toBeUndefined();
    expect(await readStoredFrame(v2, "cover 320x180 2.5")).toBeUndefined();
  });

  it("are trusted in a new session only when the server answers the stored ETag with a 304", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetch);
    expect(await storedVersion(v1.source)).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();

    await rememberVersion(v1);
    expect(await storedVersion(v1.source)).toEqual(v1);
    expect(fetch).toHaveBeenCalledWith(v1.source, {
      headers: { Range: "bytes=0-0", "If-None-Match": '"one"' },
    });
    fetch.mockResolvedValueOnce(new Response("x", { status: 206 }));
    expect(await storedVersion(v1.source)).toBeUndefined();
  });

  it("drop what was stored for a file's earlier version once a new one is read", async () => {
    await rememberVersion(v1);
    await storeFrame(v1, "cover 320x180 1", 1, jpeg());
    await rememberVersion(v2);

    expect(await readStoredFrame(v1, "cover 320x180 1")).toBeUndefined();
    expect(stores.size).toBe(0);
  });

  it("drop the least recently used sources once they pass the budget", async () => {
    const big = Math.floor(STORED_THUMBNAIL_BYTES / 2) + 1;
    const others = ["/a.mp4", "/b.mp4", "/c.mp4"].map((source) => ({ source, etag: '"1"' }));
    for (const version of others) {
      await storeFrame(version, "cover 1x1 0", 0, jpeg(big));
      vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000);
    }

    expect(await readStoredFrame(others[0]!, "cover 1x1 0")).toBeUndefined();
    expect(await readStoredFrame(others[2]!, "cover 1x1 0")).toBeDefined();
  });

  it("never fail a thumbnail: a broken store warns once and reads as empty", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("caches", {
      open: async () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    });

    expect(await readStoredInfo(v1)).toBeUndefined();
    expect(await storeFrame(v1, "cover 1x1 0", 0, jpeg())).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("are skipped where the browser offers no Cache Storage", async () => {
    vi.stubGlobal("caches", undefined);
    expect(await readStoredInfo(v1)).toBeUndefined();
    expect(await storeInfo(v1, { aspect: 1, metadataDuration: 1 })).toBeUndefined();
  });

  it("count a frame stored again under its name once, so the budget holds", async () => {
    await storeFrame(v1, "cover 1x1 0", 0, jpeg(100));
    await storeFrame(v1, "cover 1x1 0", 0, jpeg(100));

    await vi.waitFor(() => expect(localStorage.getItem("hf-thumbnails-index")).toContain("bytes"), {
      timeout: 3000,
    });
    const saved = JSON.parse(localStorage.getItem("hf-thumbnails-index")!);
    expect(Object.values(saved.caches)).toMatchObject([{ bytes: 100 }]);
  });

  it("keep what another tab stored when saving, but not what this tab dropped", async () => {
    await rememberVersion(v1);
    await storeFrame(v1, "cover 1x1 0", 0, jpeg());
    await vi.waitFor(() => expect(localStorage.getItem("hf-thumbnails-index")).toContain("bytes"), {
      timeout: 3000,
    });
    // another tab saves its snapshot: a source of its own, and v1 as it was before this tab moved on
    const other = JSON.parse(localStorage.getItem("hf-thumbnails-index")!);
    other.caches["hf-thumbnails:other:tab"] = { usedAt: Date.now(), bytes: 7 };
    localStorage.setItem("hf-thumbnails-index", JSON.stringify(other));
    const v1Cache = Object.keys(other.caches).find((name) => name !== "hf-thumbnails:other:tab")!;
    await rememberVersion(v2);
    await storeFrame(v2, "cover 1x1 0", 0, jpeg());

    await vi.waitFor(
      () => expect(localStorage.getItem("hf-thumbnails-index")).not.toContain(v1Cache),
      { timeout: 3000 },
    );
    const saved = JSON.parse(localStorage.getItem("hf-thumbnails-index")!);
    expect(Object.keys(saved.caches)).toContain("hf-thumbnails:other:tab");
    expect(Object.keys(saved.caches)).toHaveLength(2);
    expect(Object.values(saved.etags)).toEqual(['"two"']);
  });

  it("keep a newer version another tab saw of a source this tab only read at start", async () => {
    await rememberVersion(v1);
    await storeFrame(v1, "cover 1x1 0", 0, jpeg());
    await vi.waitFor(() => expect(localStorage.getItem("hf-thumbnails-index")).toContain("bytes"), {
      timeout: 3000,
    });
    resetStoredThumbnailsForTests();
    // a new session reads the index, then another tab moves the source on to v2
    await storeFrame({ source: "/other.mp4", etag: '"1"' }, "cover 1x1 0", 0, jpeg());
    const other = JSON.parse(localStorage.getItem("hf-thumbnails-index")!);
    const key = Object.keys(other.etags).find((k) => other.etags[k] === '"one"')!;
    other.etags[key] = '"two"';
    localStorage.setItem("hf-thumbnails-index", JSON.stringify(other));
    await storeFrame({ source: "/other.mp4", etag: '"1"' }, "cover 1x1 1", 1, jpeg());

    // this tab's save is the one that adds /other.mp4's cache to the index
    await vi.waitFor(
      () =>
        expect(
          Object.keys(JSON.parse(localStorage.getItem("hf-thumbnails-index")!).caches),
        ).toHaveLength(2),
      { timeout: 3000 },
    );
    expect(JSON.parse(localStorage.getItem("hf-thumbnails-index")!).etags[key]).toBe('"two"');
  });
});
