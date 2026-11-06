// Studio's own app opens on the toggle's saved choice, else light. Light is `data-theme="paper"`
// on the document element, the hook theme.css keys on; dark is no attribute. index.html applies
// `savedStudioTheme` before the first paint; studioTheme.test.tsx holds the two together.
import { useSyncExternalStore } from "react";
import {
  readStudioUiPreferences,
  writeStudioUiPreferences,
  type StudioTheme,
} from "./studioUiPreferences";

export function savedStudioTheme(): StudioTheme {
  return readStudioUiPreferences().theme ?? "light";
}

export function shownStudioTheme(): StudioTheme {
  return document.documentElement.dataset.theme === "paper" ? "light" : "dark";
}

export function setStudioTheme(theme: StudioTheme): void {
  writeStudioUiPreferences({ theme });
  const root = document.documentElement;
  if (theme === "light") root.dataset.theme = "paper";
  else delete root.dataset.theme;
}

function subscribe(listener: () => void): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function useShownStudioTheme(): StudioTheme {
  return useSyncExternalStore(subscribe, shownStudioTheme);
}
