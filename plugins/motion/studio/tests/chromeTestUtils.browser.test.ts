import { expect, it, vi } from "vitest";
import { closeTestChrome, launchTestChrome, showWithRuntime } from "./chromeTestUtils";

vi.setConfig({ testTimeout: 60_000 });

it("shows a page that names the GSAP CDN script without the page making a request", async () => {
  const browser = await launchTestChrome();
  try {
    const tab = await browser.newPage();
    const requests: string[] = [];
    tab.on("request", (request) => requests.push(request.url()));
    await showWithRuntime(
      tab,
      `<!doctype html><html><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="1" data-width="640" data-height="360"></div>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script>window.__timelines = window.__timelines || {}; window.__timelines["main"] = gsap.timeline({ paused: true });</script>
</body></html>`,
    );
    expect(await tab.evaluate(() => typeof (window as unknown as { gsap?: object }).gsap)).toBe(
      "object",
    );
    expect(requests).toEqual([]);
  } finally {
    await closeTestChrome(browser);
  }
});
