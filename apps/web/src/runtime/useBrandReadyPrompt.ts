// `useBrandReadyPrompt` — surface a one-shot "your design system is ready"
// prompt when a brand-extraction project finishes.
//
// Brand extraction runs as an agent inside a backing `brand-extraction` project
// (see apps/daemon/src/brands/index.ts). When the agent calls `od brand
// finalize`, the brand's `meta.status` flips to `ready` and a `user:<id>` design
// system is registered — but that happens out of band and there is no SSE
// channel for brand status. Without a nudge the user is left in the project view
// with no idea the extracted design system is now waiting in the Design systems
// tab. This hook watches for that completion and hands ProjectView a prompt to
// guide the user there.
//
// We poll `/api/brands` while the backing project is a brand-extraction project
// and stop the moment it reaches a terminal state. The prompt stays visible
// until the user dismisses or acts on it; that manual action sets a
// sessionStorage flag so a later visit does not nag again.

import { useCallback, useEffect, useState } from 'react';
import type { ProjectMetadata } from '@open-design/contracts';
import { fetchBrands } from './brands';

const POLL_INTERVAL_MS = 5000;
// Ceiling so a stuck / abandoned extraction stops polling after ~25 minutes.
const MAX_POLLS = 300;
// When programmatic extraction is still running this long with no result, offer
// the browser-assisted fallback (alongside the immediate offer when an anti-bot
// wall is detected). ~60s per the product decision.
const ASSIST_TIMEOUT_MS = 60_000;

function shownStorageKey(brandId: string): string {
  return `od:brand-ready-prompt:${brandId}`;
}

function assistStorageKey(brandId: string): string {
  return `od:brand-browser-assist:${brandId}`;
}

function readFlag(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    window.sessionStorage.setItem(key, '1');
  } catch {
    // sessionStorage unavailable — the prompt may re-show on a later visit,
    // which is a far smaller problem than never showing it at all.
  }
}

function alreadyShown(brandId: string): boolean {
  return readFlag(shownStorageKey(brandId));
}

function markShown(brandId: string): void {
  writeFlag(shownStorageKey(brandId));
}

function assistAlreadyShown(brandId: string): boolean {
  return readFlag(assistStorageKey(brandId));
}

function markAssistShown(brandId: string): void {
  writeFlag(assistStorageKey(brandId));
}

export interface BrandReadyPromptState {
  /** The registered `user:<id>` design system to preview. */
  designSystemId: string;
  /** Display name for the prompt copy; null falls back to a generic title. */
  brandName: string | null;
}

/** A one-shot signal that ProjectView should post the "solve the wall in the
 *  browser, then Confirm" assist card into the conversation. */
export interface BrandBrowserAssistState {
  brandId: string;
  /** The page the browser tab is open to, used as the extraction base URL. */
  sourceUrl: string;
  /** Wall label ("Cloudflare") when blocked; "timeout" when it just stalled. */
  reason: string;
}

export interface UseBrandReadyPrompt {
  /** Current ready state for the brand, even if the user dismissed the prompt. */
  ready: BrandReadyPromptState | null;
  prompt: BrandReadyPromptState | null;
  dismiss: () => void;
  /** Set once when extraction is blocked by an anti-bot wall OR has stalled past
   *  the timeout; null otherwise. ProjectView injects the assist card on it. */
  browserAssist: BrandBrowserAssistState | null;
  dismissBrowserAssist: () => void;
}

/**
 * Watch a project's metadata; when it is a brand-extraction project whose brand
 * has reached `ready`, expose a one-shot ready prompt. While it is still
 * extracting, also expose a one-shot browser-assist signal when an anti-bot wall
 * is detected or extraction stalls past ~60s. No-op for every other project.
 */
export function useBrandReadyPrompt(
  metadata: ProjectMetadata | null | undefined,
): UseBrandReadyPrompt {
  const brandId =
    metadata?.importedFrom === 'brand-extraction' ? metadata?.brandId ?? null : null;
  const [ready, setReady] = useState<BrandReadyPromptState | null>(null);
  const [prompt, setPrompt] = useState<BrandReadyPromptState | null>(null);
  const [browserAssist, setBrowserAssist] = useState<BrandBrowserAssistState | null>(null);

  useEffect(() => {
    setReady(null);
    setPrompt(null);
    setBrowserAssist(null);
    if (!brandId) return undefined;
    const suppressPrompt = alreadyShown(brandId);

    let cancelled = false;
    let timer: number | undefined;
    let polls = 0;
    const startedAt = Date.now();

    const check = async (): Promise<void> => {
      polls += 1;
      const brands = await fetchBrands();
      if (cancelled) return;
      const summary = brands.find((b) => b.meta.id === brandId);
      const status = summary?.meta.status;
      const designSystemId = summary?.meta.designSystemId;
      if (status === 'ready' && designSystemId) {
        const next = { designSystemId, brandName: summary?.brand?.name ?? null };
        setReady(next);
        if (!suppressPrompt) setPrompt(next);
        return; // terminal — stop polling
      }
      if (status === 'failed') return; // terminal — no prompt

      // Offer the browser-assisted fallback once, when an anti-bot wall is hit
      // or extraction stalls past the timeout. Keep polling afterwards so a
      // later `ready` (the user solved it) still fires the success prompt.
      const blocked = summary?.meta.blocked === true;
      const stalled = status === 'extracting' && Date.now() - startedAt >= ASSIST_TIMEOUT_MS;
      if ((blocked || stalled) && !assistAlreadyShown(brandId)) {
        markAssistShown(brandId);
        setBrowserAssist({
          brandId,
          sourceUrl: summary?.meta.sourceUrl ?? '',
          reason: summary?.meta.blockedReason ?? (blocked ? 'Cloudflare' : 'timeout'),
        });
      }

      if (polls >= MAX_POLLS) return;
      timer = window.setTimeout(() => void check(), POLL_INTERVAL_MS);
    };

    void check();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [brandId]);

  const dismiss = useCallback(() => {
    if (brandId) markShown(brandId);
    setPrompt(null);
  }, [brandId]);
  const dismissBrowserAssist = useCallback(() => setBrowserAssist(null), []);

  return {
    ready,
    prompt,
    dismiss,
    browserAssist,
    dismissBrowserAssist,
  };
}
