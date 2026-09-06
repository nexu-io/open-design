import type {
  OpenDesignElectronActionResult,
  OpenDesignElectronBrowserClearDataOptions,
  OpenDesignElectronCaptureOptions,
  OpenDesignElectronCaptureResult,
  OpenDesignElectronFailure,
  OpenDesignElectronDiagnosticsExportResult,
  OpenDesignElectronGlobalScope,
  OpenDesignElectronPdfPrintOptions,
  OpenDesignElectronPreviewNavigationFailure,
  OpenDesignElectronPreviewNavigationFailureListener,
  OpenDesignElectronPickWorkingDirResult,
  OpenDesignElectronProjectImportInit,
  OpenDesignElectronProjectImportResult,
  OpenDesignElectronProjectReplaceWorkingDirResult,
  OpenDesignElectronUpdaterApplyOptions,
  OpenDesignElectronUpdaterMenuLabels,
  OpenDesignElectronUpdaterOpenDialogListener,
  OpenDesignElectronUpdaterResult,
  OpenDesignElectronUpdaterStatusSnapshot,
  OpenDesignElectronUpdaterStatusListener,
  OpenDesignElectronUpdaterTarget,
} from "./protocol.js";
import { getOpenDesignElectron } from "./detection.js";

/**
 * @module actions
 *
 * Renderer-facing wrappers over the host bridge. Each resolves the bridge from
 * scope, invokes the capability, and returns a host-owned result (or a uniform
 * "host is not available" failure). Covers shell, browser, capture, project,
 * pdf, pet, and the full updater action surface.
 */

/** @internal Build a normalized host failure result. */
function failure(reason: string, details?: unknown): OpenDesignElectronFailure {
  return {
    ...(details === undefined ? {} : { details }),
    ok: false,
    reason,
  };
}

/** @internal Uniform failure for when the host bridge is absent. */
function unavailable(reason: string): OpenDesignElectronFailure {
  return failure(reason);
}

/** Signal that the first stable OpenDesign business surface is mounted. */
export function signalElectronReady(scope: OpenDesignElectronGlobalScope = globalThis): boolean {
  const electron = getOpenDesignElectron(scope);
  if (electron == null) return false;
  electron.lifecycle.ready();
  return true;
}

/** Export a native diagnostics bundle, or return null outside Electron. */
export async function exportElectronDiagnostics(
  scope: OpenDesignElectronGlobalScope = globalThis,
): Promise<OpenDesignElectronDiagnosticsExportResult | null> {
  const electron = getOpenDesignElectron(scope);
  if (electron == null) return null;
  try {
    return await electron.diagnostics.exportToFile();
  } catch (error) {
    return {
      ok: false,
      cancelled: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Open an external URL through the host shell. */
export async function openElectronExternalUrl(url: string, scope: OpenDesignElectronGlobalScope = globalThis): Promise<OpenDesignElectronActionResult> {
  const host = getOpenDesignElectron(scope);
  if (host == null) return unavailable("OpenDesign host is not available");
  try {
    return await host.shell.openExternal(url);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Reveal a project's path through the host shell. */
export async function openElectronProjectPath(projectId: string, scope: OpenDesignElectronGlobalScope = globalThis): Promise<OpenDesignElectronActionResult> {
  const host = getOpenDesignElectron(scope);
  if (host == null) return unavailable("OpenDesign host is not available");
  try {
    return await host.shell.openPath(projectId);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Clear host browser data (cookies and/or storage). */
export async function clearElectronBrowserData(
  options?: OpenDesignElectronBrowserClearDataOptions,
  scope: OpenDesignElectronGlobalScope = globalThis,
): Promise<OpenDesignElectronActionResult> {
  const host = getOpenDesignElectron(scope);
  if (host == null) return unavailable("OpenDesign host is not available");
  try {
    return await host.browser.clearData(options);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Capture the host page (optionally clipped) as a data URL. */
export async function captureElectronPage(
  options?: OpenDesignElectronCaptureOptions,
  scope: OpenDesignElectronGlobalScope = globalThis,
): Promise<OpenDesignElectronCaptureResult> {
  const host = getOpenDesignElectron(scope);
  if (host == null) return unavailable("OpenDesign host is not available");
  try {
    return await host.capture.page(options);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Pick and import a project through the host's native dialog. */
export async function pickAndImportElectronProject(
  init?: OpenDesignElectronProjectImportInit,
  scope: OpenDesignElectronGlobalScope = globalThis,
): Promise<OpenDesignElectronProjectImportResult> {
  const host = getOpenDesignElectron(scope);
  if (host == null) return unavailable("OpenDesign host is not available");
  try {
    return await host.project.pickAndImport(init);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Pick and replace a project's working directory through the host. */
export async function pickAndReplaceElectronProjectWorkingDir(
  projectId: string,
  scope: OpenDesignElectronGlobalScope = globalThis,
): Promise<OpenDesignElectronProjectReplaceWorkingDirResult> {
  const host = getOpenDesignElectron(scope);
  if (host == null) return unavailable("OpenDesign host is not available");
  try {
    return await host.project.pickAndReplaceWorkingDir(projectId);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

// Picks a folder via the host's native dialog and returns the chosen path
// plus a single-use token, WITHOUT touching any project. The Home flow uses
// this to let the user choose a working directory before the project exists;
// the token is later spent on POST /api/projects/:id/working-dir.
export async function pickElectronWorkingDir(
  scope: OpenDesignElectronGlobalScope = globalThis,
): Promise<OpenDesignElectronPickWorkingDirResult> {
  const host = getOpenDesignElectron(scope);
  if (host == null) return unavailable("OpenDesign host is not available");
  if (typeof host.project.pickWorkingDir !== "function") {
    return unavailable("host build does not support pickWorkingDir");
  }
  try {
    return await host.project.pickWorkingDir();
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Print HTML to PDF through the host. */
export async function printElectronPdf(
  html: string,
  nonce?: string,
  options?: OpenDesignElectronPdfPrintOptions,
  scope: OpenDesignElectronGlobalScope = globalThis,
): Promise<OpenDesignElectronActionResult> {
  const host = getOpenDesignElectron(scope);
  if (host == null) return unavailable("OpenDesign host is not available");
  try {
    return await host.pdf.print(html, nonce, options);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Toggle host pet visibility. */
export function setElectronPetVisible(visible: boolean, scope: OpenDesignElectronGlobalScope = globalThis): OpenDesignElectronActionResult {
  const host = getOpenDesignElectron(scope);
  if (host == null) return unavailable("OpenDesign host is not available");
  try {
    host.pet.setVisible(visible);
    return { ok: true };
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Read the latest Electron-observed preview subframe navigation failure. */
export function getLatestElectronPreviewNavigationFailure(
  scope: OpenDesignElectronGlobalScope = globalThis,
): OpenDesignElectronPreviewNavigationFailure | null {
  const host = getOpenDesignElectron(scope);
  if (typeof host?.preview?.getLatestNavigationFailure !== "function") return null;
  try {
    return host.preview.getLatestNavigationFailure();
  } catch {
    return null;
  }
}

/** Subscribe to Electron-observed preview subframe navigation failures. */
export function subscribeElectronPreviewNavigationFailure(
  listener: OpenDesignElectronPreviewNavigationFailureListener,
  scope: OpenDesignElectronGlobalScope = globalThis,
): () => void {
  const host = getOpenDesignElectron(scope);
  if (typeof host?.preview?.subscribeNavigationFailure !== "function") return () => undefined;
  try {
    return host.preview.subscribeNavigationFailure(listener);
  } catch {
    return () => undefined;
  }
}

/** @internal Run a status-returning updater operation and wrap the result. */
async function runElectronUpdaterOperation(
  operation: (host: NonNullable<ReturnType<typeof getOpenDesignElectron>>) => Promise<OpenDesignElectronUpdaterStatusSnapshot>,
  scope: OpenDesignElectronGlobalScope = globalThis,
): Promise<OpenDesignElectronUpdaterResult> {
  const electron = getOpenDesignElectron(scope);
  if (electron == null) return unavailable("OpenDesign Electron is not available");
  try {
    return { ok: true, status: await operation(electron) };
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

/** Get the host updater status. */
export async function getElectronUpdaterStatus(
  scope: OpenDesignElectronGlobalScope = globalThis,
): Promise<OpenDesignElectronUpdaterResult> {
  return await runElectronUpdaterOperation(async (electron) => await electron.updater.status(), scope);
}

/** Trigger a host updater check. */
export async function checkElectronUpdater(
  target?: OpenDesignElectronUpdaterTarget,
  scope: OpenDesignElectronGlobalScope = globalThis,
): Promise<OpenDesignElectronUpdaterResult> {
  return await runElectronUpdaterOperation(async (electron) => await electron.updater.check(target), scope);
}

/** Trigger a host updater download. */
export async function downloadElectronUpdater(
  target: OpenDesignElectronUpdaterTarget,
  scope: OpenDesignElectronGlobalScope = globalThis,
): Promise<OpenDesignElectronUpdaterResult> {
  return await runElectronUpdaterOperation(async (electron) => await electron.updater.download(target), scope);
}

/** Defer the selected update line. */
export async function deferElectronUpdater(
  target: OpenDesignElectronUpdaterTarget,
  scope: OpenDesignElectronGlobalScope = globalThis,
): Promise<OpenDesignElectronUpdaterResult> {
  return await runElectronUpdaterOperation(async (electron) => await electron.updater.later(target), scope);
}

/** Apply the selected update line. */
export async function applyElectronUpdater(
  target: OpenDesignElectronUpdaterTarget,
  options?: OpenDesignElectronUpdaterApplyOptions,
  scope: OpenDesignElectronGlobalScope = globalThis,
): Promise<OpenDesignElectronUpdaterResult> {
  return await runElectronUpdaterOperation(async (electron) => await electron.updater.apply(target, options), scope);
}

/** Subscribe to host updater status changes; returns an unsubscribe fn. */
export function subscribeElectronUpdater(
  listener: OpenDesignElectronUpdaterStatusListener,
  scope: OpenDesignElectronGlobalScope = globalThis,
): () => void {
  const host = getOpenDesignElectron(scope);
  if (host == null) return () => undefined;
  try {
    return host.updater.subscribe(listener);
  } catch {
    return () => undefined;
  }
}

/** Subscribe to native host requests to open the updater dialog. */
export function subscribeElectronUpdaterOpenDialog(
  listener: OpenDesignElectronUpdaterOpenDialogListener,
  scope: OpenDesignElectronGlobalScope = globalThis,
): () => void {
  const host = getOpenDesignElectron(scope);
  if (host == null) return () => undefined;
  try {
    return host.updater.subscribeOpenDialog(listener);
  } catch {
    return () => undefined;
  }
}

/** Synchronize renderer-localized updater menu labels to the native host. */
export async function setElectronUpdaterMenuLabels(
  labels: OpenDesignElectronUpdaterMenuLabels,
  scope: OpenDesignElectronGlobalScope = globalThis,
): Promise<OpenDesignElectronActionResult> {
  const host = getOpenDesignElectron(scope);
  if (host == null) return unavailable("OpenDesign host is not available");
  try {
    return await host.updater.setMenuLabels(labels);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}
