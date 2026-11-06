import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement } | null = null;
const tracked: Root[] = [];

export function trackedRoot(host: HTMLElement): Root {
  const root = createRoot(host);
  tracked.push(root);
  return root;
}

/** Renders into a fresh host attached to the body; `cleanupMounted` tears it down. */
export function mountHost(element: ReactElement): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted = { root, host };
  act(() => root.render(element));
  return host;
}

export function cleanupMounted(): void {
  act(() => tracked.splice(0).forEach((root) => root.unmount()));
  if (!mounted) return;
  const { root, host } = mounted;
  mounted = null;
  act(() => root.unmount());
  host.remove();
}
