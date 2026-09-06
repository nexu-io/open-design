import { describe, expect, it } from "vitest";
import { electronSplashHtml } from "@/runtime/window/splash.js";

const manifest = {
  productName: "Example <Product>",
  splash: { width: 1280, height: 900, minimumVisibleMs: 2000, backgroundColor: "#f2f4f5", foregroundColor: "#1f2529", mutedColor: "#7a838a", initialLabel: "Starting…", readyLabel: "Ready" },
};
const html = (url: string) => decodeURIComponent(url.slice(url.indexOf(",") + 1));

describe("offline startup presentation", () => {
  it("uses declared inline media without network, script, looping, or runtime authority", () => {
    const document = html(electronSplashHtml(manifest, { mimeType: "video/webm", base64: "YWJjZA==" }));
    expect(document).toContain('src="data:video/webm;base64,YWJjZA=="');
    expect(document).toContain("autoplay muted playsinline");
    expect(document).toContain("media-src data:");
    expect(document).toContain('id="stage" aria-live="polite"');
    expect(document).not.toMatch(/<script| loop|https?:|__od/u);
  });

  it("escapes the fallback label and rejects remote or malformed media", () => {
    expect(html(electronSplashHtml(manifest))).toContain("Example &lt;Product&gt;");
    for (const base64 of ["", "http://example.test/video.webm", '\"><script>', "abc"]) {
      expect(() => electronSplashHtml(manifest, { mimeType: "video/webm", base64 })).toThrow("invalid Electron splash media");
    }
  });
});
