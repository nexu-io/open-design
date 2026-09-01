import type { Frame, FrameLocator, Locator, Page } from '@playwright/test';

export const ACTIVE_ARTIFACT_PREVIEW_SELECTOR =
  '[data-testid="artifact-preview-frame"]:not([data-od-handoff-pending]):visible, '
  + '[data-testid="live-artifact-preview-frame"]:visible';

export function activeArtifactPreview(page: Page): Locator {
  return page.locator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR).first();
}

export function activeArtifactPreviewFrame(page: Page): FrameLocator {
  return page.frameLocator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR);
}

export async function settledActiveArtifactPreview(
  page: Page,
  timeoutMs: number,
): Promise<{ locator: Locator; frame: Frame }> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const locator = activeArtifactPreview(page);
      const remaining = Math.max(250, timeoutMs - (Date.now() - startedAt));
      await locator.waitFor({ state: 'visible', timeout: remaining });
      const handle = await locator.elementHandle();
      const frame = await handle?.contentFrame();
      if (frame == null) throw new Error('Active preview iframe has no browsing context');
      await settleArtifactPreviewFrame(frame, remaining);
      const currentHandle = await locator.elementHandle();
      const currentFrame = await currentHandle?.contentFrame();
      if (
        currentFrame === frame
        && await locator.getAttribute('data-od-handoff-pending') == null
      ) {
        return { locator, frame };
      }
    } catch (error) {
      lastError = error;
      if (!/detached|browsing context|Execution context was destroyed/i.test(formatError(error))) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Active preview did not settle: ${formatError(lastError)}`);
}

async function settleArtifactPreviewFrame(frame: Frame, timeoutMs: number): Promise<void> {
  await frame.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => {});
  await frame.evaluate(async () => {
    if (document.fonts?.ready != null) await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
