import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach } from "vitest";

export function createHappyDomRootHarness() {
  const roots: Root[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = "";
  });
  return {
    mount(host: HTMLElement) {
      const root = createRoot(host);
      roots.push(root);
      return root;
    },
  };
}
