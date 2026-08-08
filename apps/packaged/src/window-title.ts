// xDesign fork: the packaged window title is always the fork product name.
// Upstream derives "Open Design <Channel>" from the release channel; this fork
// ships one identity, so the channel-derived name must not leak through the OS
// window title. Signature kept for callers; the config is intentionally unused.
const WINDOW_TITLE = "xDesign";

export function resolvePackagedWindowTitle(_config: { appVersion: string | null; namespace: string }): string {
  return WINDOW_TITLE;
}
