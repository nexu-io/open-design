// @vitest-environment happy-dom
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, type ReactNode } from "react";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import { createHappyDomRootHarness } from "./testRootHarness";
import { AudibleVideoClipContent } from "./AudibleVideoClipContent";

const harness = createHappyDomRootHarness();
const STYLES_DIR = path.resolve(__dirname, "../../styles");
const TAILWIND_DIR = path.dirname(
  createRequire(import.meta.url).resolve("tailwindcss/package.json"),
);

async function studioCss() {
  const load = async (id: string, base: string) => {
    const file =
      id === "tailwindcss" ? path.join(TAILWIND_DIR, "index.css") : path.resolve(base, id);
    return { path: file, base: path.dirname(file), content: readFileSync(file, "utf8") };
  };
  const compiled = await compile(readFileSync(path.join(STYLES_DIR, "studio.css"), "utf8"), {
    base: STYLES_DIR,
    loadStylesheet: load,
  });
  return compiled.build([]);
}

async function renderStrip(wave: ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    harness
      .mount(host)
      .render(<AudibleVideoClipContent thumbnail={<span>frames</span>} waveform={wave} />);
  });
  return host;
}

describe("AudibleVideoClipContent", () => {
  it("draws the sound on the audio clip's own surface, under half the clip", async () => {
    const host = await renderStrip(<span>wave</span>);
    const strip = host.querySelector<HTMLElement>('[data-testid="audible-video-wave"]');
    expect(strip?.textContent).toBe("wave");
    expect(strip?.style.backgroundColor).toBe("var(--timeline-clip-audio-bg)");
    expect(strip?.style.height).toBe("50%");
    expect(strip?.previousElementSibling?.getAttribute("style")).toContain("bottom: 50%");
  });

  it("keeps only the peak mark in the strip, above the waveform canvas layer", async () => {
    const style = document.createElement("style");
    style.textContent = await studioCss();
    document.head.appendChild(style);
    const host = await renderStrip(
      <span data-peak-badge>
        ▲<span data-peak-text> peaks +0.7 dBFS</span>
      </span>,
    );
    const badge = host.querySelector<HTMLElement>("[data-peak-badge]")!;
    const text = host.querySelector<HTMLElement>("[data-peak-text]")!;
    expect(getComputedStyle(text).display).toBe("none");
    // The waveform canvas sits in a z-index 10 layer (AudioWaveform).
    expect(Number(getComputedStyle(badge).zIndex)).toBeGreaterThan(10);
    style.remove();
  });
});
