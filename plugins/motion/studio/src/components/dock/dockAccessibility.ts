import type { DockviewApi } from "dockview-react";

const SASH_STEP = 16;
const SASH_STEP_SHIFT = 64;

type Axis = "horizontal" | "vertical";

/** A horizontal split lays views left to right, so its sashes are vertical bars. */
function splitAxis(sash: HTMLElement): Axis {
  return sash.closest(".dv-split-view-container")?.classList.contains("dv-horizontal")
    ? "horizontal"
    : "vertical";
}

/** Dockview draws sashes as bare divs; make each one a focusable separator. */
function decorateSashes(root: HTMLElement) {
  for (const sash of root.querySelectorAll<HTMLElement>(".dv-sash")) {
    const axis = splitAxis(sash);
    sash.tabIndex = 0;
    sash.setAttribute("role", "separator");
    sash.setAttribute("aria-orientation", axis === "horizontal" ? "vertical" : "horizontal");
    sash.setAttribute("aria-label", axis === "horizontal" ? "Resize columns" : "Resize rows");
  }
}

/** Replays a pointer drag on the sash so dockview's own clamping to minimum sizes applies. */
function nudgeSash(sash: HTMLElement, axis: Axis, delta: number) {
  const at = (value: number) =>
    axis === "horizontal" ? { clientX: value, clientY: 0 } : { clientX: 0, clientY: value };
  const doc = sash.ownerDocument;
  const fire = (target: EventTarget, type: string, value: number) =>
    target.dispatchEvent(new MouseEvent(type, { ...at(value), bubbles: true, cancelable: true }));
  fire(sash, "pointerdown", 0);
  fire(doc, "pointermove", delta);
  fire(doc, "pointerup", delta);
}

/** Browser and OS shortcuts (Alt+Left is Back) keep their meaning. */
function hasShortcutModifier(event: KeyboardEvent) {
  return event.altKey || event.ctrlKey || event.metaKey;
}

function onSashKeyDown(event: KeyboardEvent, sash: HTMLElement) {
  if (hasShortcutModifier(event)) return;
  const axis = splitAxis(sash);
  const [less, more] =
    axis === "horizontal" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
  if (event.key !== less && event.key !== more) return;
  event.preventDefault();
  const step = event.shiftKey ? SASH_STEP_SHIFT : SASH_STEP;
  nudgeSash(sash, axis, event.key === more ? step : -step);
}

/** Wraps around and activates the tab it lands on, unlike dockview's focus-only arrows. */
function onTabKeyDown(event: KeyboardEvent, tab: HTMLElement, api: DockviewApi) {
  if (hasShortcutModifier(event)) return;
  const tabs = [
    ...(tab.closest('[role="tablist"]')?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []),
  ];
  const index = tabs.indexOf(tab);
  const last = tabs.length - 1;
  const targets: Record<string, number> = {
    ArrowRight: index === last ? 0 : index + 1,
    ArrowLeft: index === 0 ? last : index - 1,
    Home: 0,
    End: last,
  };
  const target = tabs[targets[event.key] ?? -1];
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  const panelId = target.dataset.tabPanelId;
  if (panelId) api.getPanel(panelId)?.api.setActive();
  target.focus();
}

/** Keyboard and ARIA support dockview 8.3 lacks for sashes and tab arrows. Returns a disposer. */
export function installDockAccessibility(api: DockviewApi, root: HTMLElement): () => void {
  const decorate = () => decorateSashes(root);
  decorate();
  const subscriptions = [
    api.onDidLayoutChange(decorate),
    api.onDidLayoutFromJSON(decorate),
    api.onDidAddPanel(decorate),
    api.onDidRemovePanel(decorate),
  ];
  // Capture phase so the tab handler runs before dockview's own focus-only arrows.
  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.classList.contains("dv-sash")) onSashKeyDown(event, event.target);
    else if (event.target.getAttribute("role") === "tab") onTabKeyDown(event, event.target, api);
  };
  root.addEventListener("keydown", onKeyDown, true);
  return () => {
    root.removeEventListener("keydown", onKeyDown, true);
    for (const subscription of subscriptions) subscription.dispose();
  };
}
