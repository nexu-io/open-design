import { BrowserWindow } from "electron";
import type { ElectronShellAppearance, ElectronStartupPresentation, ElectronStartupProgress } from "@open-design/electron-kit/contracts";
import { electronSplashHtml } from "./splash.js";

/** Updatable loading presentation. The carrier decides whether presentation is
 * allowed; this factory is never invoked during a headless startup. */
export async function createElectronStartupPresentation(input: Readonly<{
  productName: string;
  appearance: ElectronShellAppearance;
  media?: Readonly<{ mimeType: "video/webm"; base64: string }>;
}>): Promise<ElectronStartupPresentation> {
  const policy = input.appearance.splash;
  const url = electronSplashHtml({ productName: input.productName, splash: policy }, input.media);
  const window = new BrowserWindow({ width: policy.width, height: policy.height, frame: false, resizable: false,
    show: true, backgroundColor: policy.backgroundColor, webPreferences: { sandbox: true } });
  try {
    await window.loadURL(url);
    let latest: ElectronStartupProgress = { label: policy.initialLabel };
    let mode: ElectronStartupProgress["mode"] = "startup";
    const downloads = new Map<string, ElectronStartupProgress>();
    const render = () => {
      if (window.isDestroyed()) return;
      const prefix = mode === "first-install" ? "First-time installation · "
        : mode === "update" ? "Updating · " : mode === "recovery" ? "Recovering · " : "";
      const active = [...downloads.values()];
      const bytes = active.length ? active.reduce((sum, item) => sum + (item.receivedBytes ?? 0), 0) : latest.receivedBytes;
      const total = active.length ? (active.every(item => (item.totalBytes ?? 0) > 0)
        ? active.reduce((sum, item) => sum + item.totalBytes!, 0) : undefined) : latest.totalBytes;
      const known = typeof total === "number" && total > 0 && typeof bytes === "number" && bytes >= 0;
      const size = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MB`;
      const transfer = bytes == null ? "" : known ? `${size(bytes)} / ${size(total!)} downloaded` : `${size(bytes)} downloaded`;
      const view = {
        label: prefix + [active.length > 1 ? `Downloading ${active.length} components` : active[0]?.label ?? latest.label,
          transfer, latest.state === "failed" ? latest.detail : undefined].filter(Boolean).join(" · "),
        ratio: known ? Math.min(1, bytes! / total!) : null,
      };
      void window.webContents.executeJavaScript(`(() => { const v=${JSON.stringify(view)};
        document.getElementById("stage").textContent=v.label;
        const bar=document.getElementById("progress");
        if(v.ratio===null) bar.removeAttribute("value"); else bar.value=v.ratio;
      })()`).catch(() => undefined);
    };
    return Object.freeze({
      window,
      setProgress(progress: ElectronStartupProgress) {
        if (window.isDestroyed()) return;
        latest = progress;
        mode = progress.mode ?? mode;
        if (progress.state === "failed") downloads.clear();
        else if (progress.resourceId != null) {
          if (progress.receivedBytes != null) downloads.set(progress.resourceId, progress);
          else downloads.delete(progress.resourceId);
        }
        render();
      },
    });
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    throw error;
  }
}
