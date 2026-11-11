/**
 * The single value of Chromium's `disable-features` switch. `appendSwitch`
 * replaces the previous value for a key, so every caller (this module and the
 * packaged entry) must pass this whole list rather than its own subset.
 *
 * `SkiaGraphite` (macOS only): reporters keep seeing the window's web content
 * drawn soft — rasterized at 1x and stretched over a 2x display — while the
 * traffic lights and the window edge stay sharp, and the display/wake refresh
 * in display-refresh.ts did not clear it for a reporter who hits it reliably
 * (OPEND-4712). Graphite is Chromium's default raster backend on macOS
 * (`skia_graphite: enabled_on` on Electron 41.3), and other Electron apps
 * cleared pixelated macOS rendering by turning it off (FreeShow #3949;
 * VS Code #288141 disables it for broken rendering after idle). Like the
 * overscroll pair (see applyLoopbackConnectionLimitSwitch) this is a mitigation with no established causal
 * chain: if the blur is still reported on a build that carries it, take it
 * back out and look elsewhere. With it off Chromium rasters through Ganesh,
 * the backend it used before Graphite became the default.
 */
export function chromiumDisabledFeatures(platform: NodeJS.Platform): string {
  const features = ["OverscrollEffectOnNonRootScrollers", "OverscrollBehaviorRespectedOnAllScrollContainers"];
  if (platform === "darwin") features.push("SkiaGraphite");
  return features.join(",");
}
