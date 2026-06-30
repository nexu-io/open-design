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
// and stop when it reaches `ready` or the bounded polling window expires. A
// failed extraction may be retried against the same brand id, so `failed` keeps
// watching for a later ready transition. The ready prompt stays visible until
// the user dismisses or acts on it; that manual action sets a sessionStorage
// flag so a later visit does not nag again. Browser assist is deliberately not
// session-latched: when anti-bot extraction remains blocked, the recovery entry
// needs to stay discoverable.

import { useCallback, useEffect, useState } from 'react';
import type { BrandMeta, BrandStatus, ProjectMetadata } from '@open-design/contracts';
import { fetchBrands } from './brands';

const POLL_INTERVAL_MS = 5000;
// Ceiling so a stuck / abandoned extraction stops polling after ~25 minutes.
const MAX_POLLS = 300;
// When programmatic extraction is still running this long with no result, offer
// the browser-assisted fallback (alongside the immediate offer when an anti-bot
// wall is detected). 30s: past that, the deterministic harvest is almost
// certainly stuck (unreachable origin / anti-bot wall / a tab that never
// loaded), so surface the next step instead of leaving the user waiting. Mirrors
// the daemon-side stall checkpoint that posts the "needs a hand" transcript card.
const ASSIST_TIMEOUT_MS = 30_000;

function shownStorageKey(brandId: string): string {
  return `od:brand-ready-prompt:${brandId}`;
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

function finiteTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function extractionAttemptStallBaseline(meta: BrandMeta): { key: string; startedAt: number | null } {
  const startedAt = finiteTimestamp(meta.extractionStartedAt);
  return {
    key: `${meta.extractionAttemptId ?? ''}:${startedAt ?? ''}`,
    startedAt,
  };
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
  /** Current lifecycle for the backing brand. Null while the first poll is pending. */
  status: BrandStatus | null;
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
 * is detected or extraction stalls past the timeout. No-op for every other project.
 */
export function useBrandReadyPrompt(
  metadata: ProjectMetadata | null | undefined,
): UseBrandReadyPrompt {
  const brandId =
    metadata?.importedFrom === 'brand-extraction' ? metadata?.brandId ?? null : null;
  const [ready, setReady] = useState<BrandReadyPromptState | null>(null);
  const [prompt, setPrompt] = useState<BrandReadyPromptState | null>(null);
  const [status, setStatus] = useState<BrandStatus | null>(null);
  const [browserAssist, setBrowserAssist] = useState<BrandBrowserAssistState | null>(null);

  useEffect(() => {
    setReady(null);
    setPrompt(null);
    setStatus(null);
    setBrowserAssist(null);
    if (!brandId) return undefined;
    const suppressPrompt = alreadyShown(brandId);

    let cancelled = false;
    let timer: number | undefined;
    let polls = 0;
    let assistBaselineAt = Date.now();
    let lastExtractionKey: string | null = null;
    let lastStatus: BrandStatus | null = null;

    const check = async (): Promise<void> => {
      polls += 1;
      const brands = await fetchBrands();
      if (cancelled) return;
      const summary = brands.find((b) => b.meta.id === brandId);
      const status = summary?.meta.status;
      setStatus(status ?? null);
      if (status === 'extracting' && summary) {
        const baseline = extractionAttemptStallBaseline(summary.meta);
        if (lastStatus !== 'extracting' || baseline.key !== lastExtractionKey) {
          assistBaselineAt = baseline.startedAt ?? Date.now();
          lastExtractionKey = baseline.key;
        }
      } else {
        lastExtractionKey = null;
      }
      lastStatus = status ?? null;
      const designSystemId = summary?.meta.designSystemId;
      if (status === 'ready' && designSystemId) {
        const next = { designSystemId, brandName: summary?.brand?.name ?? null };
        setReady(next);
        if (!suppressPrompt) setPrompt(next);
        return; // terminal — stop polling
      }

      // Offer the browser-assisted fallback once for real browser-only cases:
      // explicit anti-bot metadata, recognisable challenge/captcha failures, or
      // a still-running extraction that has crossed the stall timeout. Do not
      // treat every failed source URL as browser-assist recoverable; ordinary
      // thin/offline failures should keep the regular retry/agent next steps.
      const blocked = summary?.meta.blocked === true;
      const stoppedByUser = /stopped by the user|you stopped/i.test(summary?.meta.error ?? '');
      const antiBotFailureText = [
        summary?.meta.blockedReason,
        summary?.meta.error,
      ].filter(Boolean).join(' ');
      const failedWithAntiBotSignal =
        status === 'failed' &&
        !stoppedByUser &&
        /cloudflare|captcha|challenge|turnstile|anti[- ]?bot|bot check|access denied|verify/i.test(
          antiBotFailureText,
        );
      const stalled = status === 'extracting' && Date.now() - assistBaselineAt >= ASSIST_TIMEOUT_MS;
      if (blocked || failedWithAntiBotSignal || stalled) {
        setBrowserAssist({
          brandId,
          sourceUrl: summary?.meta.sourceUrl ?? '',
          reason:
            summary?.meta.blockedReason ??
            (blocked || failedWithAntiBotSignal ? 'Cloudflare' : 'timeout'),
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
    status,
    ready,
    prompt,
    dismiss,
    browserAssist,
    dismissBrowserAssist,
  };
}
