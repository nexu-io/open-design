import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, vi } from "vitest";
import { thumbnailScheduler } from "../../player/lib/thumbnailScheduler";
import { usePlayerStore } from "../../player/store/playerStore";
import { CompositionsTab } from "./CompositionsTab";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(
  window as unknown as { happyDOM: { settings: { disableIframePageLoading: boolean } } }
).happyDOM.settings.disableIframePageLoading = true;

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  thumbnailScheduler.invalidateProject("demo");
  document.body.innerHTML = "";
  usePlayerStore.setState({ thumbnailRevisions: {} });
});

export function mountCompositionsTab(props: Partial<ComponentProps<typeof CompositionsTab>> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <CompositionsTab
        projectId="demo"
        compositions={["compositions/headline.html"]}
        activeComposition={null}
        onSelect={vi.fn()}
        {...props}
      />,
    );
  });
  return host;
}
