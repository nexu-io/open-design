// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { openComposition } from "@hyperframes/sdk";
import { createMemoryAdapter } from "@hyperframes/sdk/adapters/memory";
import { parseGsapScriptAcorn } from "@hyperframes/core/gsap-parser-acorn";
import { mergeTweenProperties } from "./useGsapPropertyDebounce";
import { extractGsapScriptText } from "../utils/gsapSoftReload";

const HTML = `<!DOCTYPE html><html><head></head><body>
<div id="box" data-hf-id="hf-box" style="opacity:1"></div>
<script data-hf-gsap>
const tl = gsap.timeline({ paused: true });
window.__timelines = { main: tl };
tl.to('#box', { duration: 1, x: 100, y: 50, opacity: 1 });
</script>
</body></html>`;

const FROMTO_HTML = `<!DOCTYPE html><html><head></head><body>
<div id="box" data-hf-id="hf-box" style="opacity:1"></div>
<script data-hf-gsap>
const tl = gsap.timeline({ paused: true });
window.__timelines = { main: tl };
tl.fromTo('#box', { x: 0, y: 0 }, { duration: 1, x: 100, y: 50 });
</script>
</body></html>`;

function tweenProps(comp: { serialize(): string }) {
  const parsed = parseGsapScriptAcorn(extractGsapScriptText(comp.serialize()) ?? "");
  const anim = parsed.animations[0];
  return { id: anim?.id, properties: anim?.properties, fromProperties: anim?.fromProperties };
}

describe("setGsapTween replace semantics (finding #1)", () => {
  it("REGRESSION: a single-key set drops the tween's other animated props", async () => {
    // This documents the bug the merge fixes: setGsapTween REPLACES the property
    // set, so sending only the edited key loses the siblings.
    const comp = await openComposition(HTML, { persist: createMemoryAdapter() });
    const id = tweenProps(comp).id ?? "";
    comp.setGsapTween(id, { properties: { x: 200 } });
    const after = tweenProps(comp);
    expect(after.properties).toEqual({ x: 200 });
    expect(after.properties).not.toHaveProperty("y");
    expect(after.properties).not.toHaveProperty("opacity");
  });
});

describe("mergeTweenProperties (finding #1)", () => {
  it("editing x preserves y and opacity through a real SDK write", async () => {
    const comp = await openComposition(HTML, { persist: createMemoryAdapter() });
    const id = tweenProps(comp).id ?? "";
    // Mirror the send site: merge the single edited prop into the existing set.
    const merged = mergeTweenProperties(comp, id, { x: 200 }, "to");
    expect(merged).toEqual({ x: 200, y: 50, opacity: 1 });
    comp.setGsapTween(id, { properties: merged });
    const after = tweenProps(comp);
    expect(after.properties).toMatchObject({ x: 200, y: 50, opacity: 1 });
  });

  it("editing a from-property preserves the other from-properties", async () => {
    const comp = await openComposition(FROMTO_HTML, { persist: createMemoryAdapter() });
    const id = tweenProps(comp).id ?? "";
    const merged = mergeTweenProperties(comp, id, { x: 25 }, "from");
    expect(merged).toEqual({ x: 25, y: 0 });
  });

  it("returns the single edit unchanged when the tween id is unknown", async () => {
    const comp = await openComposition(HTML, { persist: createMemoryAdapter() });
    expect(mergeTweenProperties(comp, "no-such-id", { x: 5 }, "to")).toEqual({ x: 5 });
  });
});
