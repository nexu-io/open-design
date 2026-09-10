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
video{background:${policy.backgroundColor};max-height:58%;max-width:100%;height:auto;width:auto;position:absolute;top:0}
h2{font-size:20px;font-weight:600}
#status{position:absolute;top:55%;left:12%;right:12%;text-align:center;font-size:14px}
#heading{font-size:20px;margin:0 0 12px} #stage{margin:8px 0}
#detail,#elapsed,#note{color:${policy.mutedColor};font-size:12px;margin:8px 0}
progress{width:100%;max-width:420px;height:5px;accent-color:${policy.foregroundColor}}
details{margin:12px auto;text-align:left;max-width:540px;font-size:12px;color:${policy.mutedColor}}
summary{cursor:pointer} pre{white-space:pre-wrap;max-height:95px;overflow:auto;user-select:text}
</style></head><body>${content}<section id="status"><h2 id="heading">Starting your workspace</h2><p id="stage" aria-live="polite">${escapeHtml(policy.initialLabel)}</p><progress id="progress" max="1" aria-label="Current download progress"></progress><p id="detail"></p><p id="elapsed">0s elapsed</p><p id="note"></p><details><summary>Installation details</summary><pre id="history"></pre></details></section></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
