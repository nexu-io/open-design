// @vitest-environment happy-dom

/**
 * Button/IconButton: renders every variant and size, then compiles Studio's
 * real stylesheet against the emitted classes so an unstyled class fails.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { compile } from "tailwindcss";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Button, type ButtonSize, type ButtonVariant } from "./Button";
import { IconButton } from "./IconButton";
import { Tab, Tabs, TabsList } from "./Tabs";
import { cleanupMounted, mountHost } from "./mountHost.testHelpers";
import { isTypingTarget } from "../../utils/typingTarget";
import { shouldIgnorePlaybackShortcutTarget } from "../../player/lib/playbackShortcuts";

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "danger", "ghost"];
const SIZES: ButtonSize[] = ["sm", "md", "lg"];

afterEach(cleanupMounted);

function classesOf(host: HTMLElement, selector = "button"): string[] {
  const el = host.querySelector(selector);
  if (!el) throw new Error(`nothing matched ${selector}`);
  return [...el.classList];
}

// -- the compiled stylesheet, built once for the whole file --

const STYLES_DIR = path.resolve(__dirname, "../../styles");
const require = createRequire(import.meta.url);
const TAILWIND_DIR = path.dirname(require.resolve("tailwindcss/package.json"));

async function loadStylesheet(id: string, base: string) {
  const file = id === "tailwindcss" ? path.join(TAILWIND_DIR, "index.css") : path.resolve(base, id);
  return { path: file, base: path.dirname(file), content: readFileSync(file, "utf8") };
}

let compileStudioCss: (candidates: string[]) => string;

beforeAll(async () => {
  const compiled = await compile(readFileSync(path.join(STYLES_DIR, "studio.css"), "utf8"), {
    base: STYLES_DIR,
    loadStylesheet,
  });
  compileStudioCss = (candidates) => compiled.build(candidates);
});

function unresolved(candidates: string[]): string[] {
  const css = compileStudioCss(candidates);
  return candidates.filter((candidate) => !css.includes(CSS.escape(candidate)));
}

describe("Button classes", () => {
  it("emits only classes Studio's stylesheet defines", () => {
    const emitted = new Set<string>();
    for (const variant of VARIANTS) {
      for (const size of SIZES) {
        const host = mountHost(
          <>
            <Button variant={variant} size={size}>
              Export
            </Button>
            <IconButton variant={variant} size={size} icon={null} aria-label="Zoom out" />
          </>,
        );
        for (const el of host.querySelectorAll("button")) {
          for (const cls of el.classList) emitted.add(cls);
        }
        cleanupMounted();
      }
    }

    expect(emitted.size).toBeGreaterThan(20);
    expect(unresolved([...emitted])).toEqual([]);
  });

  it("fails an undefined class, so the check above is not vacuous", () => {
    // Names in a real namespace with no token behind them; the theme file now defines the
    // `rounded-button` pair this used to name.
    expect(unresolved(["bg-not-a-token", "text-step-999"])).toEqual([
      "bg-not-a-token",
      "text-step-999",
    ]);
  });

  it("lets a caller's type size beat the size's own", () => {
    // The Renders Export case: `size="md"` brings `text-step-12`, the caller
    // wants 11px, and with plain concatenation both survived into the class
    // list and the stylesheet's order decided the winner.
    const classes = classesOf(mountHost(<Button size="md" className="text-step-11" />));

    expect(classes).toContain("text-step-11");
    expect(classes).not.toContain("text-step-12");
  });

  it("keeps every interactive look reachable without a pointer", () => {
    // `data-preview-state` exists so a gallery can show the hover, active and
    // focus looks. It is worth nothing if it drifts from the real state, so
    // each pair is matched here in both directions.
    const realPrefix = {
      hover: ["enabled:hover:", "hover:"],
      active: ["enabled:active:", "active:"],
      focus: ["focus-visible:"],
    };

    for (const variant of VARIANTS) {
      const classes = classesOf(mountHost(<Button variant={variant}>Export</Button>));
      cleanupMounted();

      for (const [state, prefixes] of Object.entries(realPrefix)) {
        const previewPrefix = `data-[preview-state=${state}]:`;
        const preview = classes
          .filter((cls) => cls.startsWith(previewPrefix))
          .map((cls) => cls.slice(previewPrefix.length));
        const real = classes
          .filter((cls) => prefixes.some((prefix) => cls.startsWith(prefix)))
          .map((cls) => cls.slice(cls.lastIndexOf(":") + 1));

        expect([...preview].sort(), `${variant} ${state}`).toEqual([...real].sort());
        expect(preview.length, `${variant} ${state}`).toBeGreaterThan(0);
      }
    }
  });

  it("uses a motion token that zeroes itself under reduced motion", () => {
    // AE4. The zero-duration case lives in the `duration-press` utility itself
    // (theme.css), not in a `motion-reduce:` class beside it, so a caller
    // cannot use the token and forget the reduced-motion half. The button's
    // job is to name the token; the stylesheet's job is the media query.
    expect(classesOf(mountHost(<Button>Export</Button>))).toContain("duration-press");

    expect(compileStudioCss(["duration-press"])).toMatch(
      /\.duration-press \{[\s\S]*?prefers-reduced-motion: reduce[\s\S]*?transition-duration: 0ms/,
    );
  });
});

describe("Button behaviour", () => {
  it("does not fire a disabled click, and says it is disabled", () => {
    let clicks = 0;
    const host = mountHost(
      <Button disabled onClick={() => (clicks += 1)}>
        Export
      </Button>,
    );
    const button = host.querySelector("button")!;

    act(() => button.click());

    expect(clicks).toBe(0);
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });

  it("still fires a click while a preview state is forced", () => {
    let clicks = 0;
    const host = mountHost(
      <Button data-preview-state="hover" onClick={() => (clicks += 1)}>
        Export
      </Button>,
    );
    const button = host.querySelector("button")!;

    act(() => button.click());

    expect(clicks).toBe(1);
    expect(button.getAttribute("data-preview-state")).toBe("hover");
  });

  it("is classified by the hotkey selectors the way a plain button is", () => {
    // KTD13. Both selector lists gate on roles and element names. A primitive
    // that landed on a different role would leak or swallow global hotkeys with
    // nothing to notice it.
    const host = mountHost(
      <>
        <button type="button" data-testid="plain">
          Export
        </button>
        <Button data-testid="primitive">Export</Button>
        <Tabs defaultValue="code">
          <TabsList aria-label="Sidebar panels">
            <Tab value="code">Code</Tab>
          </TabsList>
        </Tabs>
      </>,
    );
    const plain = host.querySelector('[data-testid="plain"]')!;
    const button = host.querySelector('[data-testid="primitive"]')!;
    const tab = host.querySelector('[role="tab"]')!;

    for (const el of [plain, button, tab]) {
      expect(isTypingTarget(el)).toBe(false);
      expect(shouldIgnorePlaybackShortcutTarget(el)).toBe(true);
    }
  });
});

describe("disabled states", () => {
  it("disables a loading Button", () => {
    const host = mountHost(<Button loading>Save</Button>);
    const button = host.querySelector("button");

    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute("aria-disabled")).toBe("true");
  });

  it("marks a disabled IconButton for assistive tech", () => {
    const host = mountHost(<IconButton aria-label="Undo" icon={<svg />} disabled />);
    const button = host.querySelector("button");

    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("children layout", () => {
  it("keeps label and shortcut direct flex items of the gap-bearing button without an icon", () => {
    const host = mountHost(
      <Button size="md">
        <span>Export</span>
        <kbd>⌘E</kbd>
      </Button>,
    );
    const button = host.querySelector("button");

    expect(button?.classList.contains("inline-flex")).toBe(true);
    expect(button?.classList.contains("gap-1.5")).toBe(true);
    expect(Array.from(button?.children ?? []).map((child) => child.tagName)).toEqual([
      "SPAN",
      "KBD",
    ]);
  });

  it("makes label and shortcut direct flex items so the button gap applies between them", () => {
    const host = mountHost(
      <Button icon={<svg />}>
        <span>Export</span>
        <kbd>⌘E</kbd>
      </Button>,
    );
    const button = host.querySelector("button");

    expect(Array.from(button?.children ?? []).map((child) => child.tagName)).toEqual([
      "SPAN",
      "SPAN",
      "KBD",
    ]);
  });
});
