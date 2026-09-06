import { createHmac, randomBytes } from "node:crypto";
import { isAbsolute } from "node:path";
import { realpath, stat, writeFile } from "node:fs/promises";

import { BrowserWindow, dialog, ipcMain, nativeTheme, session, shell } from "electron";
import {
  OPEN_DESIGN_ELECTRON_AUTH_REGISTER_COMMAND,
} from "@open-design/electron-contract/runtime-auth";
import type {
  OpenDesignElectronActionResult,
  OpenDesignElectronBrowserClearDataOptions,
  OpenDesignElectronCaptureOptions,
  OpenDesignElectronCaptureResult,
  OpenDesignElectronDiagnosticsExportResult,
  OpenDesignElectronProjectImportInit,
  OpenDesignElectronUpdaterLineSnapshot,
  OpenDesignElectronUpdaterStatusSnapshot,
  OpenDesignElectronUpdaterTarget,
} from "@open-design/electron-contract";
import { DIAGNOSTICS_EXPORT_PATH, DIAGNOSTICS_FILENAME_PREFIX, diagnosticsFileName } from "@open-design/diagnostics";
import type { ElectronStandaloneContentUpdaterPort, ElectronStandaloneRuntimeAccess } from "@open-design/electron-kit/runtime";

import { ELECTRON_DESIGN_BROWSER_PARTITION, isHttpUrl } from "./security.js";
import { ELECTRON_RENDERER_IPC } from "../../contracts/renderer-ipc.js";

const IMPORT_TOKEN_HEADER = "x-od-desktop-import-token";
const IMPORT_TOKEN_TTL_MS = 60_000;
const PROJECT_ID = /^[A-Za-z0-9._-]{1,128}$/u;

type ShellUpdaterSnapshot = Readonly<{
  actions: readonly Readonly<{ id: "check" | "download" | "install" | "later" | "force-stop-and-install" | "abandon" }>[];
  blockedBy: readonly Readonly<{ attachmentId: string; generationId: string }>[];
  error?: Readonly<{ code: string; message: string }>;
  handoff?: Readonly<{
    artifact: Readonly<{ path: string }>;
    releaseVersion: string;
  }>;
  progress?: Readonly<{ completed: number; total: number }>;
  revision: number;
  state: "idle" | "checking" | "available" | "downloading" | "ready" | "applying" | "handed-off" | "installed" | "failed";
}>;

type ShellUpdaterPort = Readonly<{
  invoke(action: ShellUpdaterSnapshot["actions"][number]["id"]): Promise<Readonly<{ snapshot: ShellUpdaterSnapshot }>>;
  readSnapshot(): Promise<ShellUpdaterSnapshot>;
}>;

type HandlerContext = Readonly<{
  contentUpdater: ElectronStandaloneContentUpdaterPort;
  daemonUrl: string;
  runtime: ElectronStandaloneRuntimeAccess;
  shellUpdater: ShellUpdaterPort;
  window: BrowserWindow;
}>;

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ownSender(context: HandlerContext, event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): void {
  if (event.sender !== context.window.webContents) throw new Error("Electron product IPC sender is not the mounted renderer");
}

function token(secret: Buffer, baseDir: string): string {
  const nonce = randomBytes(16).toString("base64url");
  const expiresAt = new Date(Date.now() + IMPORT_TOKEN_TTL_MS).toISOString();
  const signature = createHmac("sha256", secret)
    .update(`${baseDir}\n${nonce}\n${expiresAt}`)
    .digest("base64url");
  return `${nonce}~${expiresAt}~${signature}`;
}

async function armDaemonAuth(context: HandlerContext, secret: Buffer): Promise<void> {
  const result = await context.runtime.handle.invoke({
    requestId: `${context.runtime.attachment.id}.electron-auth`,
    attachmentId: context.runtime.attachment.id,
    bindingDigest: context.runtime.binding.digest,
    command: OPEN_DESIGN_ELECTRON_AUTH_REGISTER_COMMAND,
    input: { schemaVersion: 1, operation: "register", secret: secret.toString("base64") },
  });
  if (result.outcome !== "accepted") throw new Error("OpenDesign daemon rejected Electron folder-access registration");
}

async function pickDirectory(context: HandlerContext): Promise<string | null> {
  const result = await dialog.showOpenDialog(context.window, {
    properties: ["openDirectory", "createDirectory"],
  });
  const selected = result.filePaths[0]?.trim();
  return result.canceled || selected == null || selected.length === 0 ? null : selected;
}

async function responseBody(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { return null; }
}

function workspaceHeaders(init: OpenDesignElectronProjectImportInit | undefined): Record<string, string> {
  const workspace = init?.workspaceContext;
  if (workspace == null) return {};
  return {
    "x-od-workspace-id": workspace.workspaceId,
    "x-od-workspace-type": workspace.workspaceType,
    "x-od-workspace-member-id": workspace.workspaceMemberId,
    "x-od-workspace-role": workspace.role,
    "x-od-workspace-lifecycle-state": workspace.lifecycleState,
    "x-od-workspace-member-status": workspace.memberStatus,
    "x-od-workspace-can-share-projects": String(workspace.permissions.canShareProjects),
    "x-od-workspace-can-write-synced-files": String(workspace.permissions.canWriteSyncedFiles),
  };
}

async function postFolder(context: HandlerContext, secret: Buffer, path: string, body: unknown) {
  const response = await fetch(new URL(path, context.daemonUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [IMPORT_TOKEN_HEADER]: token(secret, (body as { baseDir: string }).baseDir),
    },
    body: JSON.stringify(body),
  });
  const parsed = await responseBody(response);
  return response.ok
    ? { ok: true as const, response: parsed }
    : { ok: false as const, reason: `daemon returned HTTP ${response.status}`, ...(parsed == null ? {} : { details: parsed }) };
}

async function canonicalProjectDirectory(daemonUrl: string, projectId: string): Promise<string> {
  if (!PROJECT_ID.test(projectId)) throw new Error("project id contains disallowed characters");
  const response = await fetch(new URL(`/api/projects/${encodeURIComponent(projectId)}`, daemonUrl));
  if (!response.ok) throw new Error(`daemon returned HTTP ${response.status}`);
  const body = await responseBody(response);
  if (body == null || typeof body !== "object") throw new Error("daemon response was not an object");
  const resolvedDir = (body as { resolvedDir?: unknown }).resolvedDir;
  if (typeof resolvedDir !== "string" || !isAbsolute(resolvedDir)) throw new Error("daemon response did not include an absolute resolvedDir");
  const metadata = (body as { project?: { metadata?: unknown } }).project?.metadata;
  const values = metadata != null && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  if (typeof values.baseDir === "string" && values.baseDir.length > 0 && values.fromTrustedPicker !== true) {
    throw new Error("project did not come from the trusted picker flow");
  }
  const resolved = await realpath(resolvedDir);
  if (!(await stat(resolved)).isDirectory() || resolved.toLowerCase().endsWith(".app")) {
    throw new Error("project path is not an openable directory");
  }
  return resolved;
}

type ContentProjection = Awaited<ReturnType<HandlerContext["contentUpdater"]["prepareLatest"]>> | null;

function updaterStatus(
  context: HandlerContext,
  shellSnapshot: ShellUpdaterSnapshot,
  content: ContentProjection,
  closureRevision: number,
  closureError?: OpenDesignElectronUpdaterLineSnapshot["error"],
): OpenDesignElectronUpdaterStatusSnapshot {
  const shellState: OpenDesignElectronUpdaterLineSnapshot["state"] = shellSnapshot.state === "ready" ? "ready"
    : shellSnapshot.state === "applying" || shellSnapshot.state === "handed-off" ? "applying"
    : shellSnapshot.state === "installed" ? "current"
    : shellSnapshot.state === "failed" ? "error"
    : shellSnapshot.state;
  const shellActions = shellSnapshot.actions.flatMap(({ id }) =>
    id === "install" || id === "force-stop-and-install" ? ["apply" as const]
      : id === "abandon" ? []
      : [id]);
  const closureState = closureError != null ? "blocked"
    : content?.status === "prepared" ? "ready"
    : content?.status === "current" ? "current"
    : "idle";
  return {
    schemaVersion: 1,
    channel: context.runtime.binding.scope.channel,
    lines: {
      shell: {
        target: "shell",
        revision: shellSnapshot.revision ?? 0,
        state: shellState,
        actions: shellActions,
        blockedBy: shellSnapshot.blockedBy.length,
        currentVersion: context.runtime.attachment.shell.version,
        ...(shellSnapshot.handoff == null ? {} : { candidateVersion: shellSnapshot.handoff.releaseVersion }),
        ...(shellSnapshot.progress == null ? {} : { progress: { receivedBytes: shellSnapshot.progress.completed, totalBytes: shellSnapshot.progress.total } }),
        ...(shellSnapshot.error == null ? {} : { error: shellSnapshot.error }),
      },
      closure: {
        target: "closure",
        revision: closureRevision,
        state: closureState,
        actions: content?.status === "prepared" ? ["apply", "later"] : ["check"],
        blockedBy: closureError == null ? 0 : Number((closureError.details as { activeRunCount?: unknown } | undefined)?.activeRunCount ?? 0),
        ...(content?.status !== "prepared" ? {} : { candidateVersion: content.generation.releaseVersion }),
        ...(closureError == null ? {} : { error: closureError }),
      },
    },
  };
}

function pdfFilename(html: string): string {
  const raw = /<title[^>]*>([\s\S]*?)<\/title>/iu.exec(html)?.[1] ?? "artifact";
  const stem = raw.replace(/<[^>]+>/gu, "").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 60);
  return `${stem || "artifact"}.pdf`;
}

async function printPdf(html: unknown, nonce: unknown, rawOptions: unknown): Promise<void> {
  if (typeof html !== "string" || html.length === 0 || html.length > 50_000_000) throw new Error("PDF payload is invalid");
  if (typeof nonce !== "string" || nonce.length > 128) throw new Error("PDF readiness nonce is invalid");
  const deck = rawOptions != null && typeof rawOptions === "object" && (rawOptions as { deck?: unknown }).deck === true;
  const save = await dialog.showSaveDialog({
    defaultPath: pdfFilename(html),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    properties: ["dontAddToRecent"],
  });
  if (save.canceled || save.filePath == null) return;
  const printWindow = new BrowserWindow({
    width: deck ? 1920 : 1440,
    height: deck ? 1080 : 900,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  printWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const safeNonce = JSON.stringify(nonce);
    let readinessTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        printWindow.webContents.executeJavaScript(`(function(){if(window.__odPrintReady)return true;return new Promise(function(resolve){window.addEventListener('message',function ready(event){if(event.data&&event.data.type==='OD_PRINT_READY'&&event.data.nonce===${safeNonce}){window.removeEventListener('message',ready);resolve(true)}},{once:false})})})()`, true),
        new Promise<never>((_resolve, reject) => { readinessTimer = setTimeout(() => reject(new Error("PDF readiness timed out")), 30_000); }),
      ]);
    } finally {
      if (readinessTimer != null) clearTimeout(readinessTimer);
    }
    if (deck) {
      await printWindow.webContents.executeJavaScript("document.querySelectorAll('.slide,[data-screen-label],.deck-slide,.ppt-slide').forEach(function(element){element.classList.add('active','visible','is-active','current')})", true);
    }
    const measured = deck ? { width: 13.333333, height: 7.5 } : await printWindow.webContents.executeJavaScript("(function(){var reported=window.__odPrintSize;var de=document.documentElement;var body=document.body||de;var width=reported&&Number.isFinite(reported.width)?reported.width:Math.max(de.scrollWidth,body.scrollWidth,de.clientWidth,1440);var height=reported&&Number.isFinite(reported.height)?reported.height:Math.max(de.scrollHeight,body.scrollHeight,de.clientHeight,900);return {width:Math.min(200,Math.max(1,width/96)),height:Math.min(200,Math.max(1,height/96))}})()", true) as { width: number; height: number };
    const bytes = await printWindow.webContents.printToPDF({
      margins: { bottom: 0, left: 0, right: 0, top: 0 },
      pageSize: measured,
      preferCSSPageSize: true,
      printBackground: true,
    });
    await writeFile(save.filePath, bytes);
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
  }
}

/** Register product handlers only for the current mounted renderer and binding. */
export async function installElectronProductHandlers(context: HandlerContext): Promise<Readonly<{ dispose(): void }>> {
  const secret = randomBytes(32);
  let content: ContentProjection = null;
  let closureRevision = 0;
  let closureError: OpenDesignElectronUpdaterLineSnapshot["error"] | undefined;
  await armDaemonAuth(context, secret);
  const handled = [
    ELECTRON_RENDERER_IPC.browserClearData,
    ELECTRON_RENDERER_IPC.capturePage,
    ELECTRON_RENDERER_IPC.diagnosticsExport,
    ELECTRON_RENDERER_IPC.pdfPrint,
    ELECTRON_RENDERER_IPC.projectPickAndImport,
    ELECTRON_RENDERER_IPC.projectPickAndReplaceWorkingDir,
    ELECTRON_RENDERER_IPC.projectPickWorkingDir,
    ELECTRON_RENDERER_IPC.shellOpenExternal,
    ELECTRON_RENDERER_IPC.shellOpenProjectPath,
    ELECTRON_RENDERER_IPC.updaterApply,
    ELECTRON_RENDERER_IPC.updaterCheck,
    ELECTRON_RENDERER_IPC.updaterDownload,
    ELECTRON_RENDERER_IPC.updaterLater,
    ELECTRON_RENDERER_IPC.updaterSetMenuLabels,
    ELECTRON_RENDERER_IPC.updaterStatus,
  ];
  for (const channel of handled) ipcMain.removeHandler(channel);

  ipcMain.handle(ELECTRON_RENDERER_IPC.shellOpenExternal, async (event, url: unknown) => {
    ownSender(context, event);
    if (typeof url !== "string" || !isHttpUrl(url)) return false;
    try { await shell.openExternal(url); return true; }
    catch { return false; }
  });
  ipcMain.handle(ELECTRON_RENDERER_IPC.browserClearData, async (event, input: OpenDesignElectronBrowserClearDataOptions | null): Promise<OpenDesignElectronActionResult> => {
    ownSender(context, event);
    const storages: Electron.ClearStorageDataOptions["storages"] = [];
    if (input?.cookies !== false) storages.push("cookies");
    if (input?.storage !== false) storages.push("cachestorage", "filesystem", "indexdb", "localstorage", "shadercache", "websql", "serviceworkers");
    try { await session.fromPartition(ELECTRON_DESIGN_BROWSER_PARTITION).clearStorageData({ storages }); return { ok: true }; }
    catch (error) { return { ok: false, reason: reason(error) }; }
  });
  ipcMain.handle(ELECTRON_RENDERER_IPC.capturePage, async (event, input: OpenDesignElectronCaptureOptions | null): Promise<OpenDesignElectronCaptureResult> => {
    ownSender(context, event);
    try {
      const clip = input?.clip;
      const image = clip == null ? await context.window.webContents.capturePage() : await context.window.webContents.capturePage(clip);
      const size = image.getSize();
      return { ok: true, dataUrl: image.toDataURL(), w: size.width, h: size.height };
    } catch (error) { return { ok: false, reason: reason(error) }; }
  });
  ipcMain.handle(ELECTRON_RENDERER_IPC.projectPickAndImport, async (event, init: OpenDesignElectronProjectImportInit | null) => {
    ownSender(context, event);
    const baseDir = await pickDirectory(context);
    if (baseDir == null) return { ok: false, canceled: true };
    const response = await fetch(new URL("/api/import/folder", context.daemonUrl), {
      method: "POST",
      headers: { "content-type": "application/json", [IMPORT_TOKEN_HEADER]: token(secret, baseDir), ...workspaceHeaders(init ?? undefined) },
      body: JSON.stringify({ baseDir, ...(init?.name == null ? {} : { name: init.name }), ...(init?.skillId === undefined ? {} : { skillId: init.skillId }), ...(init?.designSystemId === undefined ? {} : { designSystemId: init.designSystemId }) }),
    });
    const parsed = await responseBody(response);
    return response.ok ? { ok: true, response: parsed } : { ok: false, reason: `daemon returned HTTP ${response.status}`, details: parsed };
  });
  ipcMain.handle(ELECTRON_RENDERER_IPC.projectPickAndReplaceWorkingDir, async (event, input: unknown) => {
    ownSender(context, event);
    const projectId = input != null && typeof input === "object" ? (input as { projectId?: unknown }).projectId : null;
    if (typeof projectId !== "string" || !PROJECT_ID.test(projectId)) return { ok: false, reason: "project id is invalid" };
    const baseDir = await pickDirectory(context);
    if (baseDir == null) return { ok: false, canceled: true };
    return await postFolder(context, secret, `/api/projects/${encodeURIComponent(projectId)}/working-dir`, { baseDir });
  });
  ipcMain.handle(ELECTRON_RENDERER_IPC.projectPickWorkingDir, async (event) => {
    ownSender(context, event);
    const baseDir = await pickDirectory(context);
    return baseDir == null ? { ok: false, canceled: true } : { ok: true, baseDir, token: token(secret, baseDir) };
  });
  ipcMain.handle(ELECTRON_RENDERER_IPC.shellOpenProjectPath, async (event, projectId: unknown) => {
    ownSender(context, event);
    try { return await shell.openPath(await canonicalProjectDirectory(context.daemonUrl, String(projectId))); }
    catch (error) { return `open-path: ${reason(error)}`; }
  });
  ipcMain.handle(ELECTRON_RENDERER_IPC.diagnosticsExport, async (event): Promise<OpenDesignElectronDiagnosticsExportResult> => {
    ownSender(context, event);
    const save = await dialog.showSaveDialog(context.window, { defaultPath: diagnosticsFileName(DIAGNOSTICS_FILENAME_PREFIX), filters: [{ name: "Zip archive", extensions: ["zip"] }], properties: ["dontAddToRecent"] });
    if (save.canceled || save.filePath == null) return { ok: false, cancelled: true };
    try {
      const response = await fetch(new URL(DIAGNOSTICS_EXPORT_PATH, context.daemonUrl));
      if (!response.ok) throw new Error(`diagnostics export returned HTTP ${response.status}`);
      await writeFile(save.filePath, Buffer.from(await response.arrayBuffer()));
      shell.showItemInFolder(save.filePath);
      return { ok: true, path: save.filePath };
    } catch (error) { return { ok: false, cancelled: false, message: reason(error) }; }
  });
  ipcMain.handle(ELECTRON_RENDERER_IPC.pdfPrint, async (event, html: unknown, nonce: unknown, options: unknown) => {
    ownSender(context, event);
    await printPdf(html, nonce, options);
  });
  const publishUpdater = async () => {
    const status = updaterStatus(context, await context.shellUpdater.readSnapshot(), content, closureRevision, closureError);
    if (!context.window.isDestroyed()) context.window.webContents.send(ELECTRON_RENDERER_IPC.updaterStatusChanged, status);
    return status;
  };
  ipcMain.handle(ELECTRON_RENDERER_IPC.updaterStatus, async (event) => { ownSender(context, event); return await publishUpdater(); });
  ipcMain.handle(ELECTRON_RENDERER_IPC.updaterCheck, async (event, target: OpenDesignElectronUpdaterTarget | null) => {
    ownSender(context, event);
    if (target == null || target === "shell") {
      const snapshot = await context.shellUpdater.readSnapshot();
      if (snapshot.actions.some(({ id }) => id === "check")) await context.shellUpdater.invoke("check");
    }
    if (target == null || target === "closure") {
      content = await context.contentUpdater.prepareLatest("observe");
      closureRevision += 1;
      closureError = undefined;
    }
    return await publishUpdater();
  });
  ipcMain.handle(ELECTRON_RENDERER_IPC.updaterDownload, async (event, target: OpenDesignElectronUpdaterTarget) => {
    ownSender(context, event);
    if (target !== "shell") throw new Error("Closure updates do not have a download phase");
    const snapshot = await context.shellUpdater.readSnapshot();
    if (snapshot.actions.some(({ id }) => id === "download")) await context.shellUpdater.invoke("download");
    return await publishUpdater();
  });
  ipcMain.handle(ELECTRON_RENDERER_IPC.updaterApply, async (event, target: OpenDesignElectronUpdaterTarget, options: unknown) => {
    ownSender(context, event);
    const force = options != null && typeof options === "object"
      && (options as { force?: unknown }).force === true;
    if (target === "shell") {
      const snapshot = await context.shellUpdater.readSnapshot();
      if (snapshot.state !== "ready") return await publishUpdater();
      await context.shellUpdater.invoke(force ? "force-stop-and-install" : "install");
    } else if (target === "closure" && content?.status === "prepared") {
      const applied = await context.contentUpdater.applyNow({ force });
      if (applied.status === "blocked") {
        closureRevision += 1;
        closureError = { code: "active-runs-blocked", message: "Another Shell is using the active generation", details: { activeRunCount: applied.occupants.length } };
        return await publishUpdater();
      }
      content = { status: "current", generationId: applied.generation.id };
      closureRevision += 1;
      closureError = undefined;
    } else if (target !== "closure") {
      throw new Error("Updater target is invalid");
    }
    return await publishUpdater();
  });
  ipcMain.handle(ELECTRON_RENDERER_IPC.updaterLater, async (event, target: OpenDesignElectronUpdaterTarget) => {
    ownSender(context, event);
    if (target === "shell") {
      const snapshot = await context.shellUpdater.readSnapshot();
      if (snapshot.actions.some(({ id }) => id === "later")) await context.shellUpdater.invoke("later");
    } else if (target === "closure") {
      content = null;
      closureRevision += 1;
      closureError = undefined;
    } else throw new Error("Updater target is invalid");
    return await publishUpdater();
  });
  ipcMain.handle(ELECTRON_RENDERER_IPC.updaterSetMenuLabels, async (event) => { ownSender(context, event); return { ok: true }; });

  const appearance = (event: Electron.IpcMainEvent, theme: unknown) => {
    try { ownSender(context, event); }
    catch { return; }
    if (theme === "light" || theme === "dark" || theme === "system") nativeTheme.themeSource = theme;
  };
  const pet = (event: Electron.IpcMainEvent) => { try { ownSender(context, event); } catch { /* fenced */ } };
  ipcMain.on(ELECTRON_RENDERER_IPC.appearanceSetTheme, appearance);
  ipcMain.on(ELECTRON_RENDERER_IPC.petSetVisible, pet);

  return Object.freeze({
    dispose() {
      for (const channel of handled) ipcMain.removeHandler(channel);
      ipcMain.removeListener(ELECTRON_RENDERER_IPC.appearanceSetTheme, appearance);
      ipcMain.removeListener(ELECTRON_RENDERER_IPC.petSetVisible, pet);
      secret.fill(0);
    },
  });
}
