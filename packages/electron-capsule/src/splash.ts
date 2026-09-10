import type { ElectronShellAppearance } from "@open-design/electron-kit/contracts";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Offline, sandboxed startup presentation; media is a Shell-owned asset. */
export function electronSplashHtml(manifest: Readonly<{ productName: string; splash: ElectronShellAppearance["splash"] }>, media?: Readonly<{ mimeType: "video/webm"; base64: string }>): string {
  if (media != null && (media.mimeType !== "video/webm" || media.base64.length > 8_000_000
    || !/^[A-Za-z0-9+/]+={0,2}$/u.test(media.base64) || media.base64.length % 4 !== 0)) {
    throw new Error("invalid Electron splash media");
  }
  const policy = manifest.splash;
  const content = media == null ? `<h2>${escapeHtml(manifest.productName)}</h2>`
    : `<video autoplay muted playsinline disablepictureinpicture src="data:${media.mimeType};base64,${media.base64}"></video>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; media-src data:"><title>${escapeHtml(manifest.productName)}</title><style>
html,body{background:${policy.backgroundColor};color:${policy.foregroundColor};height:100%;margin:0;overflow:hidden}
body{display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui}
video{background:${policy.backgroundColor};max-height:100%;max-width:100%;height:auto;width:auto}
h2{font-size:20px;font-weight:600}
#status{position:fixed;bottom:48px;left:5%;right:5%;text-align:center;color:${policy.mutedColor};font-size:13px}
#stage{margin:12px 0 0;font-variant-numeric:tabular-nums}
progress{width:200px;height:3px;accent-color:${policy.mutedColor}}
</style></head><body>${content}<section id="status"><progress id="progress" max="1" aria-label="Current download progress"></progress><p id="stage" aria-live="polite">${escapeHtml(policy.initialLabel)}</p></section></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
