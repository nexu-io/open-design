// Preview full-reload diagnostics — grep [hf-reload]. Off by default; opt in per
// session with `localStorage.setItem("hf-reload-debug", "1")` (then reload).
//
// A full reload no longer blanks the stage (see useShadowPreviewReload.ts). These lines answer
// who asked for a reload and why the write was not recognised as Studio's own.
import { makeStudioDebugLogger } from "./studioDebug";

export const logReload = makeStudioDebugLogger("reload");
