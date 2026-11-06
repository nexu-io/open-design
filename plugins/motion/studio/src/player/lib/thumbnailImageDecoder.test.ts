// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeImageThumbnail } from "./thumbnailImageDecoder";

class TestImage {
  static instances: TestImage[] = [];
  naturalWidth = 180;
  naturalHeight = 135;
  src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    TestImage.instances.push(this);
  }
}
beforeEach(() => {
  TestImage.instances = [];
  vi.stubGlobal("Image", TestImage);
});
afterEach(() => vi.unstubAllGlobals());
function latest() {
  const image = TestImage.instances.at(-1);
  if (!image) throw new Error("missing image");
  return image;
}

describe("timeline image thumbnails", () => {
  it("requests a bounded local JPEG and accounts for its actual decoded dimensions", async () => {
    const result = decodeImageThumbnail(
      "/api/projects/p/preview/photo.jpg?v=2",
      new AbortController().signal,
    );
    expect(latest().src).toBe(
      new URL("/api/projects/p/image-thumbnail/photo.jpg?v=2", location.href).href,
    );
    latest().onload?.();
    expect(await result).toEqual({
      value: {
        kind: "image",
        url: new URL("/api/projects/p/image-thumbnail/photo.jpg?v=2", location.href).href,
        aspect: 4 / 3,
      },
      weight: 180 * 135 * 4,
    });
    expect(latest().src).toBe("");
  });
  it.each([
    "https://remote.test/photo.jpg",
    "/api/projects/p/preview/image.png",
    "/api/projects/p/preview/image.gif",
    "/api/projects/p/preview/image.webp",
    "/api/projects/p/preview/image.svg",
    "/other/photo.jpg",
  ])("preserves %s", async (source) => {
    const result = decodeImageThumbnail(source, new AbortController().signal);
    expect(latest().src).toBe(source);
    latest().onload?.();
    expect((await result).value).toMatchObject({ url: source });
  });
  it("falls back for an older server and accounts for original dimensions", async () => {
    const result = decodeImageThumbnail(
      "/api/projects/p/preview/photo.jpg",
      new AbortController().signal,
    );
    latest().onerror?.();
    await Promise.resolve();
    expect(latest().src).toBe("/api/projects/p/preview/photo.jpg");
    latest().naturalWidth = 2560;
    latest().naturalHeight = 1920;
    latest().onload?.();
    expect((await result).weight).toBe(2560 * 1920 * 4);
  });
  it("does not retry a cancelled request", async () => {
    const controller = new AbortController();
    const result = decodeImageThumbnail("/api/projects/p/preview/photo.jpg", controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(TestImage.instances).toHaveLength(1);
    expect(latest().src).toBe("");
    expect(latest().onload).toBeNull();
  });
});
