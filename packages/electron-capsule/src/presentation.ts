import { BrowserWindow } from "electron";
import type { ElectronShellAppearance, ElectronStartupPresentation } from "@open-design/electron-kit/contracts";
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
    return Object.freeze({
      window,
      setStage(stage: string) {
        if (window.isDestroyed()) return;
        void window.webContents.executeJavaScript(`document.getElementById("stage").textContent=${JSON.stringify(stage)}`).catch(() => undefined);
      },
    });
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    throw error;
  }
}
