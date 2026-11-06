// @vitest-environment happy-dom
/** Menu, ContextMenu and Popover: key/aria behaviour, dismissal, and that emitted classes resolve. */
import { readFileSync } from "node:fs";
import path from "node:path";
import React, { act, useState } from "react";
import { compile } from "tailwindcss";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadStylesheet, STYLES_DIR } from "../../styles/styleSources";
import { ContextMenu, Menu, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator } from "./Menu";
import { Popover } from "./Popover";
import { isTypingTarget } from "../../utils/typingTarget";
import { shouldIgnorePlaybackShortcutTarget } from "../../player/lib/playbackShortcuts";
import { cleanupMounted, mountHost as render } from "./mountHost.testHelpers";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanupMounted);

/** Base UI moves focus into the popup one task after open, not synchronously. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function press(target: Element): void {
  // `composed` is what a real browser sets: without it the event never crosses
  // a shadow boundary and Base UI's document listener never sees it.
  const init = { bubbles: true, cancelable: true, composed: true };
  act(() => {
    target.dispatchEvent(new PointerEvent("pointerdown", init));
    target.dispatchEvent(new MouseEvent("mousedown", init));
  });
}

/**
 * A mouse click, spelled out: bare `.click()` reads as keyboard activation to Base UI,
 * which pre-highlights the first item and shifts every arrow-key assertion by one.
 */
function clickWithMouse(target: Element): void {
  const init = { bubbles: true, cancelable: true, composed: true, detail: 1 };
  act(() => {
    target.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerType: "mouse" }));
    target.dispatchEvent(new MouseEvent("mousedown", init));
    target.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerType: "mouse" }));
    target.dispatchEvent(new MouseEvent("mouseup", init));
    target.dispatchEvent(new MouseEvent("click", init));
  });
}

function rightClick(target: Element): void {
  const init = { bubbles: true, cancelable: true, composed: true };
  act(() => {
    target.dispatchEvent(new MouseEvent("contextmenu", init));
  });
}

function key(k: string, target: Element | null = document.activeElement): void {
  const init = { key: k, bubbles: true, cancelable: true, composed: true };
  act(() => {
    (target ?? document.body).dispatchEvent(new KeyboardEvent("keydown", init));
    (target ?? document.body).dispatchEvent(new KeyboardEvent("keyup", init));
  });
}

function one<T extends Element>(selector: string, what: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`${what} not rendered`);
  return el;
}

const trigger = () => one<HTMLElement>('[data-testid="trigger"]', "trigger");
const popup = () => document.querySelector<HTMLElement>('[role="menu"]');
const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];

/** A Studio element menu: actions, a hairline, a destructive item; `disabled` marks the passed label. */
function ActionMenu({
  activated,
  disable,
}: {
  activated: string[];
  disable?: string;
}): React.JSX.Element {
  return (
    <Menu trigger={<button data-testid="trigger">Actions</button>} aria-label="Element actions">
      <MenuItem shortcut="⌘]" onClick={() => activated.push("front")}>
        Bring to front
      </MenuItem>
      <MenuItem disabled={disable === "group"} onClick={() => activated.push("group")}>
        Group
      </MenuItem>
      <MenuSeparator />
      <MenuItem tone="danger" shortcut="⌫" onClick={() => activated.push("delete")}>
        Delete
      </MenuItem>
    </Menu>
  );
}

async function openActionMenu(activated: string[] = [], disable?: string): Promise<void> {
  render(<ActionMenu activated={activated} disable={disable} />);
  clickWithMouse(trigger());
  await settle();
  expect(popup()).not.toBeNull();
}

describe("Menu behaviour", () => {
  // AE5.
  it("activates the second item with ArrowDown twice then Enter, and closes", async () => {
    const activated: string[] = [];
    await openActionMenu(activated);

    key("ArrowDown");
    key("ArrowDown");
    key("Enter");
    await settle();

    expect(activated).toEqual(["group"]);
    expect(popup()).toBeNull();
  });

  it("does not activate a disabled item, and the arrow keys reach past it", async () => {
    const activated: string[] = [];
    await openActionMenu(activated, "group");

    const [, disabled, last] = items();
    expect(disabled.getAttribute("data-disabled")).not.toBeNull();
    expect(disabled.getAttribute("aria-disabled")).toBe("true");

    // Base UI keeps a disabled item in the roving sequence (the ARIA menu
    // pattern: a disabled command stays discoverable). So the guarantee is not
    // that the highlight skips it, it is that nothing runs when it is aimed at
    // directly, by key or by pointer.
    key("ArrowDown");
    key("ArrowDown");
    expect(disabled.getAttribute("data-highlighted")).not.toBeNull();
    key("Enter", disabled);
    act(() => disabled.click());
    await settle();

    expect(activated).toEqual([]);
    expect(popup()).not.toBeNull();

    // And the item after it is still reachable, so a disabled row is not a wall.
    key("ArrowDown");
    key("Enter");
    await settle();

    expect(activated).toEqual(["delete"]);
    expect(last.isConnected).toBe(false);
  });

  it("renders a shortcut hint that assistive tech does not read as a label", async () => {
    await openActionMenu();

    const hint = one<HTMLElement>('[role="menuitem"] span[aria-hidden="true"]', "shortcut hint");

    expect(hint.textContent).toBe("⌘]");
    expect(items()[0].textContent).toContain("Bring to front");
  });

  it("closes on an outside press that a parent stops in the bubble phase", async () => {
    // U3's finding, on the shipped component: the canvas overlay swallows
    // bubble-phase pointer events, and Base UI's dismissal listens in capture.
    const swallow = (event: React.SyntheticEvent) => event.stopPropagation();
    render(
      <div onPointerDown={swallow} onMouseDown={swallow}>
        <div data-testid="overlay" aria-label="Composition canvas">
          overlay
        </div>
        <Menu trigger={<button data-testid="trigger">Actions</button>} aria-label="Actions">
          <MenuItem>Bring to front</MenuItem>
        </Menu>
      </div>,
    );
    act(() => trigger().click());
    await settle();
    expect(popup()).not.toBeNull();

    // Witness: a bubble-phase document listener is the thing the overlay
    // starves. If it starts firing, the press stopped being swallowed and this
    // test would pass for a reason that says nothing about capture-phase
    // dismissal.
    let sawBubblePress = false;
    const witness = () => {
      sawBubblePress = true;
    };
    document.addEventListener("pointerdown", witness);
    press(one('[data-testid="overlay"]', "overlay"));
    document.removeEventListener("pointerdown", witness);

    expect(sawBubblePress).toBe(false);
    await vi.waitFor(() => expect(popup()).toBeNull());
  });
});

describe("MenuRadioGroup", () => {
  it("selects one item and unselects the rest, and reports aria-checked", async () => {
    function SpeedMenu(): React.JSX.Element {
      const [rate, setRate] = useState(1);
      return (
        <Menu trigger={<button data-testid="trigger">{rate}x</button>} aria-label="Playback speed">
          <MenuRadioGroup value={rate} onValueChange={(next) => setRate(next as number)}>
            {[0.5, 1, 2].map((speed) => (
              <MenuRadioItem key={speed} value={speed}>
                {speed}x
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </Menu>
      );
    }
    render(<SpeedMenu />);
    act(() => trigger().click());
    await settle();

    const radios = () => [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    const checked = () => radios().filter((el) => el.getAttribute("aria-checked") === "true");

    expect(radios()).toHaveLength(3);
    expect(checked().map((el) => el.textContent)).toEqual(["1x"]);

    act(() => radios()[2].click());
    await settle();

    expect(checked().map((el) => el.textContent)).toEqual(["2x"]);
    expect(trigger().textContent).toBe("2x");
  });
});

describe("ContextMenu", () => {
  it("opens on a right click over its area and closes when an item runs", async () => {
    const activated: string[] = [];
    render(
      <ContextMenu
        aria-label="Clip actions"
        trigger={
          <div data-testid="trigger">
            <span>clip</span>
          </div>
        }
      >
        <MenuItem onClick={() => activated.push("split")}>Split</MenuItem>
      </ContextMenu>,
    );

    // The trigger renders the caller's element and keeps its children.
    expect(trigger().textContent).toBe("clip");
    expect(popup()).toBeNull();

    rightClick(trigger());
    await settle();
    expect(popup()).not.toBeNull();

    act(() => items()[0].click());
    await settle();

    expect(activated).toEqual(["split"]);
    expect(popup()).toBeNull();
  });
});

describe("container={null}", () => {
  /** Rendered inline means inside the trigger's own parent, not a portal on the body. */
  function expectInlineBeside(menu: HTMLElement | null): void {
    expect(menu).not.toBeNull();
    expect(trigger().parentElement?.contains(menu)).toBe(true);
  }

  it("opens a Menu inline, next to its trigger, and closes on Escape", async () => {
    render(
      <div>
        <Menu container={null} trigger={<button data-testid="trigger">Actions</button>}>
          <MenuItem>Bring to front</MenuItem>
        </Menu>
      </div>,
    );
    clickWithMouse(trigger());
    await settle();
    expectInlineBeside(popup());

    key("Escape");
    await settle();
    expect(popup()).toBeNull();
  });

  it("opens a ContextMenu inline, next to its area", async () => {
    render(
      <div>
        <ContextMenu container={null} trigger={<div data-testid="trigger">clip</div>}>
          <MenuItem>Split</MenuItem>
        </ContextMenu>
      </div>,
    );
    rightClick(trigger());
    await settle();
    expectInlineBeside(popup());
  });

  it("opens a Popover inline on its first render", async () => {
    render(
      <div>
        <Popover
          container={null}
          defaultOpen
          trigger={<button data-testid="trigger">Speed</button>}
        >
          <span>1x</span>
        </Popover>
      </div>,
    );
    await settle();
    expectInlineBeside(document.querySelector<HTMLElement>("[role=dialog]"));
  });

  it("still portals to the body when no container is passed", async () => {
    await openActionMenu();
    expect(trigger().parentElement?.contains(popup())).toBe(false);
  });
});

describe("Popover", () => {
  it("leaves the keys of a text field inside it alone", async () => {
    // The Menu owns ArrowDown and typeahead; a Popover must not, or the rename
    // field in AssetContextMenu would lose its own caret keys.
    render(
      <Popover trigger={<button data-testid="trigger">Rename</button>} aria-label="Rename asset">
        <input data-testid="rename" defaultValue="scene1" />
      </Popover>,
    );
    act(() => trigger().click());
    await settle();

    const input = one<HTMLInputElement>('[data-testid="rename"]', "rename field");
    act(() => input.focus());
    expect(document.activeElement).toBe(input);

    key("ArrowDown");
    key("ArrowUp");
    key("s");
    await settle();

    expect(document.activeElement).toBe(input);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("points at its trigger only when asked", async () => {
    const renderOpen = (arrow: boolean) => {
      render(
        <Popover trigger={<button data-testid="trigger">Speed</button>} arrow={arrow} defaultOpen>
          <span>1x</span>
        </Popover>,
      );
    };
    renderOpen(false);
    await settle();
    expect(one("[role=dialog]", "popup").querySelector("svg")).toBeNull();
    cleanupMounted();

    renderOpen(true);
    await settle();
    const arrow = one("[role=dialog] svg", "arrow").parentElement!;
    expect(arrow.getAttribute("data-side")).toBe("bottom");
  });
});

describe("hotkey classification", () => {
  it("classifies menu rows and popover contents the way the menus they replace were", async () => {
    // `typingTarget` and `playbackShortcuts` match exact role strings; Base UI renders
    // a `<div>` with those roles, so the roles alone must carry the classification.
    render(
      <>
        <Menu trigger={<button data-testid="trigger">Actions</button>} aria-label="Actions">
          <MenuItem>Split</MenuItem>
          <MenuRadioGroup value={1}>
            <MenuRadioItem value={1}>1x</MenuRadioItem>
          </MenuRadioGroup>
        </Menu>
      </>,
    );
    act(() => trigger().click());
    await settle();

    const row = one('[role="menuitem"]', "menu item");
    const radio = one('[role="menuitemradio"]', "radio item");

    for (const el of [row, radio]) {
      expect(isTypingTarget(el)).toBe(false);
      expect(shouldIgnorePlaybackShortcutTarget(el)).toBe(true);
    }
  });

  it("treats a field inside a Popover as somewhere the user is typing", async () => {
    render(
      <Popover trigger={<button data-testid="trigger">Rename</button>} aria-label="Rename asset">
        <input data-testid="rename" defaultValue="scene1" />
      </Popover>,
    );
    act(() => trigger().click());
    await settle();

    const input = one('[data-testid="rename"]', "rename field");

    expect(isTypingTarget(input)).toBe(true);
    expect(shouldIgnorePlaybackShortcutTarget(input)).toBe(true);
  });
});

/**
 * Class resolution is covered by `styles/tokenGate.test.ts`; this checks what the compiled rule
 * does (AE4).
 */
describe("open motion", () => {
  let compileStudioCss: (candidates: string[]) => string;

  beforeAll(async () => {
    const compiled = await compile(readFileSync(path.join(STYLES_DIR, "studio.css"), "utf8"), {
      base: STYLES_DIR,
      // Tailwind's signature wants a promise; the shared resolver is sync.
      loadStylesheet: async (id, base) => loadStylesheet(id, base),
    });
    compileStudioCss = (candidates) => compiled.build(candidates);
  });

  // AE4.
  it("names a motion token that zeroes itself under reduced motion", async () => {
    // Reduced motion lives in the `duration-open` utility itself (theme.css),
    // not in a `motion-reduce:` class beside it, so a caller cannot use the
    // token and forget that half. The menu's job is to name the token.
    await openActionMenu();

    expect([...popup()!.classList]).toContain("duration-open");
    expect(compileStudioCss(["duration-open"])).toMatch(
      /\.duration-open \{[\s\S]*?prefers-reduced-motion: reduce[\s\S]*?transition-duration: 0ms/,
    );
  });
});
