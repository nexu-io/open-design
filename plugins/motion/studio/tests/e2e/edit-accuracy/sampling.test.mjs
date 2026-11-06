// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { sample, measure, shooter } from "./case.mjs";

const quad = (x, width = 20, height = 10) => [x, 0, x + width, 0, x + width, height, x, height];
function handle(element, read) {
  Object.defineProperties(element, { offsetWidth: { value: 20 }, offsetHeight: { value: 10 } });
  return {
    client: { send: async () => ({ quads: [read()] }) },
    remoteObject: () => ({ objectId: "element" }),
    evaluate: async (fn) => fn(element),
    dispose: async () => {},
  };
}
const root = () => handle(document.createElement("div"), () => quad(0, 1920, 1080));

describe("sampling the displayed gesture", () => {
  it("re-reads when a waiting press replays between geometry and marker reads", async () => {
    let waiting = true;
    let x = 0;
    const marker = document.createElement("div");
    marker.setAttribute("data-dom-edit-press-waiting", "true");
    const target = handle(document.createElement("div"), () => {
      const before = quad(x);
      // The queued press starts after CDP captured the old element position.
      x = 8;
      waiting = false;
      marker.removeAttribute("data-dom-edit-press-waiting");
      return before;
    });
    const outline = handle(marker, () => quad(8));
    const ctx = {
      page: { $: async () => (waiting ? outline : null) },
      handles: { target, root: root() },
    };
    const result = await sample(ctx, "move", (m) => m.quad[0], [8, 0]);
    expect(result.p).toEqual([8, 0]);
    expect(result.actual[0]).toEqual([8, 0]);
  });

  it("finds the promoted preview even while the hidden old handle still answers CDP", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    iframe.checkVisibility = () => false;
    Object.defineProperty(iframe.contentWindow, "frameElement", { value: iframe });
    const oldTarget = handle(iframe.contentDocument.createElement("div"), () => quad(0));
    const target = handle(document.createElement("div"), () => quad(8));
    const liveRoot = root();
    const host = {
      evaluate: async () => true,
      boundingBox: async () => ({ width: 1920, height: 1080 }),
    };
    const frame = {
      url: () => "/preview?new",
      frameElement: async () => host,
      $: async (selector) => (selector === '[data-composition-id="main"]' ? liveRoot : target),
    };
    try {
      const result = await measure({
        page: { frames: () => [frame] },
        handles: { root: root(), target: oldTarget },
      });
      expect(result.quad[0]).toEqual([8, 0]);
    } finally {
      iframe.remove();
    }
  });
});

describe("evidence screenshots", () => {
  const fakePage = () => {
    const calls = [];
    return { calls, screenshot: async (options) => (calls.push(options), "jpeg") };
  };

  it("skips a first run's screenshots but keeps its error screen", async () => {
    const page = fakePage();
    const evidence = {};
    const shoot = shooter(page, evidence, false);
    await shoot("committed");
    await shoot("error");
    expect(Object.keys(evidence.shots)).toEqual(["error"]);
  });

  it("takes a confirmation run's screenshots, of the viewport only", async () => {
    const page = fakePage();
    const evidence = {};
    await shooter(page, evidence, true)("committed");
    expect(evidence.shots).toEqual({ committed: "jpeg" });
    expect(page.calls[0]).toMatchObject({ captureBeyondViewport: false });
  });
});
