// Feature-local hook for the "Copy share link" menu item: drives the
// transient copied/failed feedback pill and its auto-clear timeout.
import { useState } from 'react';
import { shareLinkClipboardPort as realShareLinkClipboardPort } from '../dependencies';
import { shareLinkCopyLabel } from '../formatters';
import type { ShareLinkClipboardPort } from '../ports';
import type { TranslateFn } from '../types';

export type ShareLinkCopyFeedback = 'copied' | 'failed' | null;

export interface ShareLinkCopyDeps {
  t: TranslateFn;
  /** Surfaces a copy-failed toast; the failure itself stays in the caller. */
  onCopyFailed: () => void;
}

export interface ShareLinkCopyController {
  shareLinkFeedback: ShareLinkCopyFeedback;
  copyShareLinkLabel: string;
  copyShareLink: (url: string) => Promise<boolean>;
}

export function useShareLinkCopy(
  port: ShareLinkClipboardPort,
  deps: ShareLinkCopyDeps,
): ShareLinkCopyController {
  const { t, onCopyFailed } = deps;
  const [shareLinkFeedback, setShareLinkFeedback] = useState<ShareLinkCopyFeedback>(null);

  const copyShareLink = async (url: string): Promise<boolean> => {
    const safeUrl = url.trim();
    if (!safeUrl) {
      setShareLinkFeedback('failed');
      onCopyFailed();
      return false;
    }
    const ok = await port.copyToClipboard(safeUrl);
    const feedback: ShareLinkCopyFeedback = ok ? 'copied' : 'failed';
    setShareLinkFeedback(feedback);
    if (!ok) onCopyFailed();
    setTimeout(() => {
      setShareLinkFeedback((current) => (current === feedback ? null : current));
    }, 1800);
    return ok;
  };

  return {
    shareLinkFeedback,
    copyShareLinkLabel: shareLinkCopyLabel(shareLinkFeedback, t),
    copyShareLink,
  };
}

export function useWiredShareLinkCopy(deps: ShareLinkCopyDeps): ShareLinkCopyController {
  return useShareLinkCopy(realShareLinkClipboardPort, deps);
}
