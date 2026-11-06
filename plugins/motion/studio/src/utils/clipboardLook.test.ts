// @vitest-environment jsdom
import gsap from "gsap";
import { afterEach, describe, expect, it } from "vitest";
import { pasteTimelineClips } from "../hooks/useClipboard";

const GOODBYE =
  '<h2 id="goodbye" class="clip" data-start="1" data-duration="3" data-track-index="3">Goodbye</h2>';
const FILM = `<!doctype html>
<html>
  <head>
    <style>
      #goodbye {
        color: #f97316;
        font-size: 96px;
      }
      #title { font-size: 72px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="10">
      <h1 id="title" class="clip" data-start="0" data-duration="10" data-track-index="0">Title</h1>
      ${GOODBYE}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.from("#goodbye", { opacity: 0, y: 40, duration: 0.5 }, 1);
      tl.to("#title", { opacity: 0.5, duration: 2 });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>`;

const goodbye = { html: GOODBYE, start: 1, duration: 3, track: 3 };

/** Runs the film's own script with real GSAP and says when each tween starts, by its target's id. */
function tweenStarts(html: string): Array<[string, number]> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  document.body.innerHTML = doc.body.innerHTML;
  const win = window as unknown as { __timelines: Record<string, gsap.core.Timeline> };
  win.__timelines = {};
  new Function("gsap", doc.querySelector("script")?.textContent ?? "")(gsap);
  return win.__timelines
    .main!.getChildren()
    .map((tween) => [(tween.targets()[0] as Element).id, tween.startTime()] as [string, number])
    .sort(([a], [b]) => a.localeCompare(b));
}

/** The declarations the film's styles give the rules for `selector`. */
function rulesFor(html: string, selector: string): string[] {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(
    new DOMParser().parseFromString(html, "text/html").querySelector("style")!.textContent!,
  );
  return Array.from(sheet.cssRules)
    .filter(
      (rule): rule is CSSStyleRule =>
        rule instanceof CSSStyleRule && rule.selectorText === selector,
    )
    .map((rule) => rule.style.cssText);
}

describe("a pasted clip takes its original's look and motion", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("copies the id's rules and tweens for the renamed copy, moved to where it lands", () => {
    const { content } = pasteTimelineClips(FILM, [goodbye], 4, [], true);

    expect(content).toContain('id="goodbye-2"');
    expect(rulesFor(content, "#goodbye-2")).toEqual(rulesFor(FILM, "#goodbye"));
    expect(tweenStarts(content)).toEqual([
      ["goodbye", 1],
      ["goodbye-2", 4],
      ["title", 1.5],
    ]);
    // The original's own motion is untouched: the copy's tween does not push the title's.
    expect(tweenStarts(FILM)).toEqual([
      ["goodbye", 1],
      ["title", 1.5],
    ]);
  });

  it("never moves the film's own tweens, whatever their timing, and runs a timeline declared in a block", () => {
    const film = FILM.replace(
      /    <script>[\s\S]*<\/script>/,
      `    <script>
      if (gsap) {
        const tl = gsap.timeline({ paused: true });
        const title = "#title";
        tl.from("#goodbye", { opacity: 0, duration: 0.5, stagger: 0.1, delay: 0.2 }, 1);
        tl.to(title, { opacity: 0.5, duration: 1 });
        tl.addLabel("late", "+=0.5");
        tl.to("#goodbye", { y: 10, duration: 0.5 }, "late");
        for (const id of ["#title"]) tl.to(id, { x: 5, duration: 0.5 });
        tl.to("#goodbye", { scale: 1.1, duration: 0.5 });
        tl.to(title, { y: 5, duration: 0.5 });
        window.__timelines["main"] = tl;
      }
    </script>`,
    );
    const { content } = pasteTimelineClips(film, [goodbye], 4, [], true);
    const own = (html: string) => tweenStarts(html).filter(([id]) => id !== "goodbye-2");
    expect(own(content)).toEqual(own(film));
    // Only the tween at a number is copied: its copy starts 3 s after it (1.2 s with its delay), like the clip.
    expect(tweenStarts(content).filter(([id]) => id === "goodbye-2")).toEqual([["goodbye-2", 4.2]]);
  });

  it("copies only the selectors naming the original, and leaves a style inside a script alone", () => {
    const styleInScript = `document.head.insertAdjacentHTML("beforeend", "<style>#goodbye{color:red}</style>");`;
    const film = FILM.replace(
      "      #title { font-size: 72px; }",
      "      #title, #goodbye { letter-spacing: 2px; }\n      #title { letter-spacing: 9px; }",
    ).replace("      window.__timelines", `      ${styleInScript}\n      window.__timelines`);
    const { content } = pasteTimelineClips(film, [goodbye], 4, [], true);

    expect(rulesFor(content, "#goodbye-2")).toEqual([
      ...rulesFor(film, "#goodbye"),
      "letter-spacing: 2px;",
    ]);
    expect(content.match(/#title/g)?.length).toBe(film.match(/#title/g)?.length);
    expect(content).toContain(styleInScript);
  });

  it("copies nothing for a clip from another file, whose id means something else here", () => {
    const { content } = pasteTimelineClips(FILM, [goodbye], 4, []);
    expect(rulesFor(content, "#goodbye-2")).toEqual([]);
    expect(tweenStarts(content).map(([id]) => id)).toEqual(["goodbye", "title"]);
  });
});
