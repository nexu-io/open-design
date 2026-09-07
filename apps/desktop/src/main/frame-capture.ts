import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { BrowserWindow } from "electron";
import type {
  DesktopRenderFramesInput,
  DesktopRenderFramesResult,
} from "@open-design/sidecar-proto";
import {
  findRealTagEnd,
  HTML_TAG_PATTERNS,
} from "@open-design/contracts/runtime/html-injection-points";

import { loadArtifactDocument } from "./deck-capture.js";
import { waitForPrintableContent } from "./pdf-export.js";

const DEFAULT_FRAME_RATE = 30;
const MAX_FRAME_COUNT = 1_000_000;
export const FRAME_CAPTURE_TIMEOUT_MS = 5 * 60 * 1_000;
export const FRAME_CAPTURE_STAGE_TIMEOUT_MS = 30 * 1_000;
const FRAME_CAPTURE_SETUP_TIMEOUT_MS = 60 * 1_000;

type FrameCaptureStage =
  | "create-output-directory"
  | "write-document"
  | "load-document"
  | "wait-for-printable-content"
  | "wait-for-frame-renderer"
  | "attach-debugger"
  | "configure-viewport"
  | "seek"
  | "settle-paint"
  | "capture-screenshot"
  | "write-frame";

type FrameCaptureWaitContext = {
  frameCount?: number;
  frameIndex?: number;
  stage: FrameCaptureStage;
  timeoutMs?: number;
};

class FrameCaptureTimeoutError extends Error {
  constructor(timeoutMs: number, context: FrameCaptureWaitContext, scope: "stage" | "total") {
    const frameSuffix =
      context.frameIndex == null || context.frameCount == null
        ? ""
        : ` at frame ${context.frameIndex + 1}/${context.frameCount}`;
    super(
      `Electron frame capture timed out during ${context.stage}${frameSuffix} after ` +
        `${Math.round(timeoutMs / 1_000)} seconds (${scope} deadline)`,
    );
    this.name = "FrameCaptureTimeoutError";
  }
}

type FrameCaptureDeadline = {
  clear(): void;
  wait<T>(operation: Promise<T>, context: FrameCaptureWaitContext): Promise<T>;
};

function createFrameCaptureDeadline(timeoutMs: number): FrameCaptureDeadline {
  let totalTimer: ReturnType<typeof setTimeout> | undefined;
  let activeContext: FrameCaptureWaitContext = { stage: "create-output-directory" };
  const totalTimeout = new Promise<never>((_resolve, reject) => {
    totalTimer = setTimeout(
      () => reject(new FrameCaptureTimeoutError(timeoutMs, activeContext, "total")),
      timeoutMs,
    );
  });
  return {
    clear() {
      if (totalTimer !== undefined) clearTimeout(totalTimer);
    },
    async wait<T>(operation: Promise<T>, context: FrameCaptureWaitContext) {
      activeContext = context;
      const stageTimeoutMs = context.timeoutMs ?? FRAME_CAPTURE_STAGE_TIMEOUT_MS;
      let stageTimer: ReturnType<typeof setTimeout> | undefined;
      const stageTimeout = new Promise<never>((_resolve, reject) => {
        stageTimer = setTimeout(
          () => reject(new FrameCaptureTimeoutError(stageTimeoutMs, context, "stage")),
          stageTimeoutMs,
        );
      });
      try {
        return await Promise.race([operation, totalTimeout, stageTimeout]);
      } finally {
        if (stageTimer !== undefined) clearTimeout(stageTimer);
      }
    },
  };
}

type FrameRendererMetadata = {
  duration?: unknown;
  fps?: unknown;
  hasAudio?: unknown;
};

/**
 * Capture a deterministic authored timeline with the Electron Chromium that is
 * already part of the desktop app. The page bridge owns timeline semantics;
 * this module only owns the hidden render surface and fresh CDP screenshots.
 */
export async function renderDeterministicFrames(
  input: DesktopRenderFramesInput,
): Promise<DesktopRenderFramesResult> {
  const window = new BrowserWindow({
    width: Math.round(input.width),
    height: Math.round(input.height),
    useContentSize: true,
    show: false,
    enableLargerThanScreen: true,
    webPreferences: {
      // HyperFrames' own Chrome launcher disables background and occlusion
      // throttling. Keep the throwaway Electron renderer on the same contract:
      // shader/page-compositor seeks rely on paint callbacks while this window
      // is invisible and fully transparent.
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());

  const framePattern = path.join(input.outputDir, "frame-%08d.png");
  const documentPath = path.join(input.outputDir, "composition.html");
  const deadline = createFrameCaptureDeadline(FRAME_CAPTURE_TIMEOUT_MS);
  let debuggerAttached = false;

  try {
    await deadline.wait(mkdir(input.outputDir, { recursive: true }), {
      stage: "create-output-directory",
    });
    await deadline.wait(
      writeFile(documentPath, injectBaseHref(input.html, input.baseHref), "utf8"),
      { stage: "write-document" },
    );
    await deadline.wait(loadArtifactDocument(window, pathToFileURL(documentPath).href), {
      stage: "load-document",
      timeoutMs: FRAME_CAPTURE_SETUP_TIMEOUT_MS,
    });
    await deadline.wait(waitForPrintableContent(window), {
      stage: "wait-for-printable-content",
      timeoutMs: FRAME_CAPTURE_SETUP_TIMEOUT_MS,
    });

    window.setContentSize(Math.round(input.width), Math.round(input.height));
    window.setOpacity(0);
    window.showInactive();

    const metadata = (await deadline.wait(
      window.webContents.executeJavaScript(
        `(() => {
          const bridge = globalThis.__odFrameRenderer;
          if (!bridge || typeof bridge.ready !== "function" || typeof bridge.seek !== "function") {
            throw new Error("document did not register window.__odFrameRenderer");
          }
          return Promise.resolve(bridge.ready()).then((metadata) => ({
            ...metadata,
            hasAudio: document.querySelector("audio") != null,
          }));
        })()`,
        true,
      ),
      {
        stage: "wait-for-frame-renderer",
        timeoutMs: FRAME_CAPTURE_SETUP_TIMEOUT_MS,
      },
    )) as FrameRendererMetadata;
    if (metadata?.hasAudio === true) {
      return {
        ok: false,
        error: "the bundled Electron frame renderer does not yet support HyperFrames audio mixing",
        errorCode: "AUDIO_UNSUPPORTED",
      };
    }
    const duration = positiveFinite(metadata?.duration);
    const fps = input.fps ?? positiveFinite(metadata?.fps) ?? DEFAULT_FRAME_RATE;
    if (duration == null || fps <= 0 || fps > 240) {
      return {
        ok: false,
        error: `invalid frame metadata: duration=${String(metadata?.duration)}, fps=${String(input.fps ?? metadata?.fps)}`,
        errorCode: "INVALID_FRAME_METADATA",
      };
    }
    const frameCount = Math.max(1, Math.ceil(duration * fps));
    if (frameCount > MAX_FRAME_COUNT) {
      return {
        ok: false,
        error: `frame count ${frameCount} exceeds the ${MAX_FRAME_COUNT} frame safety limit`,
        errorCode: "INVALID_FRAME_METADATA",
      };
    }

    const dbg = window.webContents.debugger;
    dbg.attach("1.3");
    debuggerAttached = true;
    await deadline.wait(dbg.sendCommand("Page.enable"), { stage: "attach-debugger" });
    await deadline.wait(
      dbg.sendCommand("Emulation.setDeviceMetricsOverride", {
        width: Math.round(input.width),
        height: Math.round(input.height),
        deviceScaleFactor: 1,
        mobile: false,
      }),
      { stage: "configure-viewport" },
    );

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const timeSeconds = frameIndex / fps;
      const frameContext = { frameCount, frameIndex };
      await deadline.wait(
        window.webContents.executeJavaScript(
          `globalThis.__odFrameRenderer.seek(${JSON.stringify(timeSeconds)}, ${frameIndex})`,
          true,
        ),
        { ...frameContext, stage: "seek" },
      );
      await deadline.wait(settleFramePaint(window), {
        ...frameContext,
        stage: "settle-paint",
      });
      const shot = (await deadline.wait(
        dbg.sendCommand("Page.captureScreenshot", {
          clip: {
            x: 0,
            y: 0,
            width: Math.round(input.width),
            height: Math.round(input.height),
            scale: 1,
          },
          format: "png",
          fromSurface: true,
        }),
        { ...frameContext, stage: "capture-screenshot" },
      )) as { data: string };
      await deadline.wait(
        writeFile(frameFilePath(input.outputDir, frameIndex), Buffer.from(shot.data, "base64")),
        { ...frameContext, stage: "write-frame" },
      );
    }

    return {
      duration,
      fps,
      frameCount,
      framePattern,
      height: Math.round(input.height),
      ok: true,
      width: Math.round(input.width),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    let errorCode: DesktopRenderFramesResult["errorCode"] = "RENDER_FAILED";
    if (error instanceof FrameCaptureTimeoutError) {
      errorCode = "RENDER_TIMEOUT";
    } else if (message.includes("__odFrameRenderer")) {
      errorCode = "FRAME_RENDERER_NOT_READY";
    }
    return {
      ok: false,
      error: message,
      errorCode,
    };
  } finally {
    deadline.clear();
    if (debuggerAttached) {
      try {
        window.webContents.debugger.detach();
      } catch {
        // The throwaway render window may already have gone away.
      }
    }
    if (!window.isDestroyed()) window.destroy();
  }
}

export function frameFilePath(outputDir: string, frameIndex: number): string {
  return path.join(outputDir, `frame-${String(frameIndex).padStart(8, "0")}.png`);
}

function positiveFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

async function settleFramePaint(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(
    `new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      setTimeout(finish, 100);
      requestAnimationFrame(() => requestAnimationFrame(finish));
    })`,
    true,
  );
}

function injectBaseHref(doc: string, baseHref: string | undefined): string {
  if (!baseHref) return doc;
  const tag = `<base href="${escapeHtmlAttribute(baseHref)}">`;
  const headEnd = findRealTagEnd(doc, HTML_TAG_PATTERNS.headOpen);
  if (headEnd >= 0) return doc.slice(0, headEnd) + tag + doc.slice(headEnd);
  const htmlEnd = findRealTagEnd(doc, HTML_TAG_PATTERNS.htmlOpen);
  if (htmlEnd >= 0) return `${doc.slice(0, htmlEnd)}<head>${tag}</head>${doc.slice(htmlEnd)}`;
  return `<!doctype html><html><head>${tag}</head><body>${doc}</body></html>`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
