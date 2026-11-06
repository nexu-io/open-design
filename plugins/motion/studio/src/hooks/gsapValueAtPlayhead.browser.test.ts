// @vitest-environment happy-dom
// Real Chrome with the built runtime: its seek, not a plain GSAP seek, decides what a saved edit shows.
import { gsap } from "gsap";
import { parseGsapScriptAcorn } from "@hyperframes/parsers/gsap-parser-acorn";
import { replaceTweenWithKeyframesInScript } from "@hyperframes/parsers/gsap-writer-acorn";
import { expect, it, vi } from "vitest";
import { closeTestChrome, launchTestChrome, showWithRuntime } from "../../tests/chromeTestUtils";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player/store/playerStore";
import { planValueEdit } from "./gsapValueAtPlayhead";

vi.setConfig({ testTimeout: 60_000 });

const SRC = `var tl = gsap.timeline({ paused: true });
tl.from("#target", { x: -60, duration: 2, ease: "none" }, 0);
tl.fromTo("#target", { x: 0 }, { x: 60, duration: 1, ease: "none" }, 2);
window.__timelines["main"] = tl;`;

/** Plans and writes a drag of `#target` to `x` at `at`, as the move gesture saves it. */
function writeDrag(x: number, at: number): string {
  const box = Object.assign(document.body.appendChild(document.createElement("div")), {
    id: "target",
  });
  const win = { __timelines: {} as Record<string, gsap.core.Timeline> };
  new Function("gsap", "window", SRC)(gsap, win);
  const timeline = win.__timelines.main!;
  timeline.progress(0.0001, true).seek(at);
  usePlayerStore.setState({ currentTime: at, activeKeyframePct: null });
  const iframe = { contentWindow: { ...win, gsap } } as unknown as HTMLIFrameElement;
  const anim = parseGsapScriptAcorn(SRC).animations[1]!;
  const selection = { id: "target", selector: "#target", element: box } as DomEditSelection;
  const plan = planValueEdit(selection, anim, { x }, iframe);
  timeline.kill();
  if (!plan.ok) throw new Error(`the drag was refused: ${JSON.stringify(plan)}`);
  return replaceTweenWithKeyframesInScript(SRC, anim.id, plan.mutation)!;
}

const page = (script: string) => `<!doctype html><html><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="4" data-width="1920" data-height="1080">
  <div id="target" class="clip" data-start="0" data-duration="4" data-track-index="1"></div>
</div>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script>window.__timelines = window.__timelines || {};\n${script}</script>
</body></html>`;

it("a drag on a fromTo's start shows the dropped x there once the runtime seeks", async () => {
  const written = writeDrag(90, 2);
  const browser = await launchTestChrome();
  try {
    const tab = await browser.newPage();
    await showWithRuntime(tab, page(written));
    const shown = await tab.evaluate(() => {
      const w = window as unknown as {
        __player: { seek(t: number): void };
        gsap: { getProperty(target: string, prop: string): number };
      };
      w.__player.seek(2);
      return w.gsap.getProperty("#target", "x");
    });
    expect(shown).toBeCloseTo(90, 1);
  } finally {
    await closeTestChrome(browser);
  }
});
