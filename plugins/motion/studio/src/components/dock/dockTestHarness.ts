import { createDockview, type DockviewApi } from "dockview-react";

/** A real dockview mounted on a fresh host element, with empty panel bodies. */
export function mountBareDockview(): { host: HTMLElement; api: DockviewApi } {
  const host = document.createElement("div");
  document.body.append(host);
  const api = createDockview(host, {
    createComponent: () => ({ element: document.createElement("div"), init() {}, dispose() {} }),
  });
  return { host, api };
}
