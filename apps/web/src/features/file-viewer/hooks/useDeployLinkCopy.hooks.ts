// Feature-local hook for the deploy modal's per-link "Copy" buttons: drives
// the transient copied-link pill (keyed by the exact url, since a modal can
// show several deploy links at once) and its auto-clear timeout.
import { useState } from 'react';
import { clipboardPort as realClipboardPort } from '../dependencies';
import type { ClipboardPort } from '../ports';
import type { TranslateFn } from '../types';

export interface DeployLinkCopyController {
  copiedDeployLink: string | null;
  copyDeployLink: (url: string) => Promise<void>;
  copyDeployLabel: (url: string) => string;
  /** Clears the pill: the deploy modal resets it on open and on a new deploy. */
  resetCopiedDeployLink: () => void;
}

export function useDeployLinkCopy(port: ClipboardPort, t: TranslateFn): DeployLinkCopyController {
  const [copiedDeployLink, setCopiedDeployLink] = useState<string | null>(null);

  const copyDeployLink = async (url: string) => {
    const safeUrl = url.trim();
    if (!safeUrl) return;
    await port.copyTextToClipboard(safeUrl);
    setCopiedDeployLink(safeUrl);
    setTimeout(() => {
      setCopiedDeployLink((current) => (current === safeUrl ? null : current));
    }, 1800);
  };

  const copyDeployLabel = (url: string) =>
    copiedDeployLink === url.trim() ? t('fileViewer.copied') : t('fileViewer.copyDeployLink');

  return {
    copiedDeployLink,
    copyDeployLink,
    copyDeployLabel,
    resetCopiedDeployLink: () => setCopiedDeployLink(null),
  };
}

export function useWiredDeployLinkCopy(t: TranslateFn): DeployLinkCopyController {
  return useDeployLinkCopy(realClipboardPort, t);
}
