// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "../components/ThemeToggle";
import { cleanupMounted, mountHost } from "../components/ui/mountHost.testHelpers";
import { savedStudioTheme, shownStudioTheme } from "./studioTheme";

const KEY = "hf-studio-ui-preferences";
const page = new DOMParser().parseFromString(
  readFileSync(path.join(__dirname, "../../index.html"), "utf8"),
  "text/html",
);
const scripts = [...page.querySelectorAll("script")];
const boot = scripts.find((script) => !script.type)?.textContent ?? "";

function store(theme: unknown) {
  localStorage.setItem(KEY, JSON.stringify({ theme }));
}

function boots(): "light" | "dark" {
  new Function(boot)();
  return shownStudioTheme();
}

afterEach(() => {
  cleanupMounted();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("Studio's theme", () => {
  it.each([["light"], ["dark"], [undefined], ["neon"]])(
    "boots to the theme the owner picks (saved %s)",
    (saved) => {
      store(saved);
      expect(boots()).toBe(savedStudioTheme());
    },
  );

  it.each([["null"], ["{not json"], ['"dark"']])("boots to the owner's pick from %s", (raw) => {
    localStorage.setItem(KEY, raw);
    expect(boots()).toBe(savedStudioTheme());
  });

  it("opens light the first time", () => {
    expect(boots()).toBe("light");
    expect(savedStudioTheme()).toBe("light");
  });

  it("runs the boot script before the app's module", () => {
    expect(boot).toContain(`"${KEY}"`);
    expect(scripts.findIndex((script) => !script.type)).toBeLessThan(
      scripts.findIndex((script) => script.type === "module"),
    );
  });

  it("flips the document between light and dark and keeps the choice", async () => {
    store("dark");
    const host = mountHost(<ThemeToggle />);
    const button = () => host.querySelector("button")!;
    expect(button().getAttribute("aria-label")).toBe("Switch to light theme");

    await act(async () => button().click());
    expect(document.documentElement.dataset.theme).toBe("paper");
    expect(JSON.parse(localStorage.getItem(KEY)!).theme).toBe("light");
    expect(button().getAttribute("aria-label")).toBe("Switch to dark theme");

    await act(async () => button().click());
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(KEY)!).theme).toBe("dark");
  });

  it("follows the theme on screen, not only its own clicks", async () => {
    store("light");
    const host = mountHost(<ThemeToggle />);
    expect(host.querySelector("button")!.getAttribute("aria-label")).toBe("Switch to light theme");
    await act(async () => {
      document.documentElement.dataset.theme = "paper";
    });
    expect(host.querySelector("button")!.getAttribute("aria-label")).toBe("Switch to dark theme");
  });
});

describe("the reveal", () => {
  function stubTransition() {
    const animate = vi.fn();
    Object.assign(document.documentElement, { animate });
    const markers: (string | undefined)[] = [];
    const finish: (() => void)[] = [];
    const start = vi.fn((update: () => void) => {
      markers.push(document.documentElement.dataset.themeReveal);
      update();
      return { ready: Promise.resolve(), finished: new Promise<void>((done) => finish.push(done)) };
    });
    Object.assign(document, { startViewTransition: start });
    return { animate, start, markers, finish };
  }

  afterEach(() => {
    Reflect.deleteProperty(document, "startViewTransition");
    Reflect.deleteProperty(document.documentElement, "animate");
    vi.unstubAllGlobals();
  });

  it("grows from the button's centre when the keyboard presses it, marked while it runs", async () => {
    const { animate, markers, finish } = stubTransition();
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 500);
    const button = mountHost(<ThemeToggle />).querySelector("button")!;
    button.getBoundingClientRect = () => ({ left: 890, top: 10, width: 20, height: 20 }) as DOMRect;
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    });
    expect(markers).toEqual([""]);
    expect(animate.mock.calls[0]![0].clipPath[1]).toMatch(/^circle\(129\.0\d*% at 90% 4%\)$/);
    await act(async () => finish[0]!());
    expect(document.documentElement.dataset.themeReveal).toBeUndefined();
  });

  it("keeps the marker for a second reveal that starts before the first ends", async () => {
    const { finish } = stubTransition();
    const button = mountHost(<ThemeToggle />).querySelector("button")!;
    await act(async () => button.click());
    await act(async () => button.click());
    await act(async () => finish[0]!());
    expect(document.documentElement.dataset.themeReveal).toBe("");
    await act(async () => finish[1]!());
    expect(document.documentElement.dataset.themeReveal).toBeUndefined();
  });

  it("switches without the reveal under reduced motion", async () => {
    const { start } = stubTransition();
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    const button = mountHost(<ThemeToggle />).querySelector("button")!;
    await act(async () => button.click());
    expect(start).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe("paper");
  });
});
