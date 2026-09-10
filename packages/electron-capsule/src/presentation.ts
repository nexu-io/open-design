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
    const started = Date.now();
    let latest: ElectronStartupProgress = { label: policy.initialLabel };
    let mode: ElectronStartupProgress["mode"] = "startup";
    const history: string[] = [];
    const render = () => {
      if (window.isDestroyed()) return;
      const heading = mode === "first-install" ? "Completing first-time installation"
        : mode === "update" ? "Preparing your update" : mode === "recovery" ? "Recovering your installation" : "Starting your workspace";
      const bytes = latest.receivedBytes;
      const total = latest.totalBytes;
      const known = typeof total === "number" && total > 0 && typeof bytes === "number" && bytes >= 0;
      const size = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MB`;
      const transfer = bytes == null ? "" : known ? `${size(bytes)} / ${size(total!)} downloaded` : `${size(bytes)} downloaded`;
      const view = { heading, label: latest.label, detail: [latest.detail, transfer].filter(Boolean).join(" · "),
        elapsed: `${Math.floor((Date.now() - started) / 1000)}s elapsed`,
        note: mode === "first-install" ? "Required components are prepared once. Later starts reuse them." : "Your local components are reused whenever possible.",
        ratio: known ? Math.min(1, bytes! / total!) : null, history: history.join("\n") };
      void window.webContents.executeJavaScript(`(() => { const v=${JSON.stringify(view)};
        for (const id of ["heading","detail","elapsed","note","history"]) document.getElementById(id).textContent=v[id];
        document.getElementById("stage").textContent=v.label;
        const bar=document.getElementById("progress");
        if(v.ratio===null) bar.removeAttribute("value"); else bar.value=v.ratio;
      })()`).catch(() => undefined);
    };
    const timer = setInterval(render, 1000);
    window.once("closed", () => clearInterval(timer));
    return Object.freeze({
      window,
      setProgress(progress: ElectronStartupProgress) {
        if (window.isDestroyed()) return;
        latest = progress;
        mode = progress.mode ?? mode;
        if (progress.state !== "progress") {
          const line = [progress.label, progress.detail, progress.state].filter(Boolean).join(" · ");
          if (history.at(-1) !== line) history.push(line);
          if (history.length > 12) history.shift();
        }
        render();
      },
    });
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    throw error;
  }
}
