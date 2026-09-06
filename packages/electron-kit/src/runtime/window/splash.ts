import type { ElectronShellDefinition, ElectronShellManifest } from "../../contracts/index.js";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Offline, sandboxed startup presentation; media is a Shell-owned asset. */
export function electronSplashHtml(manifest: Pick<ElectronShellManifest, "productName" | "splash">, media?: ElectronShellDefinition["splashMedia"]): string {
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
#stage{position:fixed;bottom:56px;left:0;right:0;text-align:center;color:${policy.mutedColor};font-size:13px;letter-spacing:.02em;user-select:none}
.progress{position:fixed;bottom:84px;left:50%;transform:translateX(-50%);height:3px;width:200px;border-radius:999px;overflow:hidden;background:${policy.mutedColor}2e}
.progress::after{content:"";position:absolute;height:100%;width:38%;background:${policy.mutedColor};border-radius:999px;animation:slide 1.15s cubic-bezier(.65,0,.35,1) infinite}
@keyframes slide{from{transform:translateX(-110%)}to{transform:translateX(290%)}}
</style></head><body>${content}<div class="progress" aria-hidden="true"></div><p id="stage" aria-live="polite">${escapeHtml(policy.initialLabel)}</p></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
