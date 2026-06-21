import { useEffect, useState } from 'react';
import { Button } from '@open-design/components';

import { Icon } from './Icon';

// Per-project dismissal of the "Missing brand fonts" banner (issue #2814).
// Stored in localStorage keyed by project id, mirroring the per-project
// preference pattern already used in ProjectView. This is acknowledge-only:
// it hides the banner for users who are fine with the fallback and does NOT
// change how typography renders (previews keep using the substitute web
// fonts). A future enhancement could actually switch previews to the OS
// system font stack.

function fontBannerDismissKey(projectId: string): string {
  return `od:font-banner-dismissed:${projectId}`;
}

/** True when the user has dismissed the banner for this project. */
export function isFontBannerDismissed(projectId: string): boolean {
  if (!projectId || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(fontBannerDismissKey(projectId)) === '1';
  } catch {
    return false;
  }
}

interface MissingBrandFontsBannerProps {
  projectId: string;
  /** Wrapper class so callers can match their surrounding card styling. */
  className?: string;
  /** When provided, renders an "Upload fonts" action that invokes it. */
  onUploadAssets?: () => void;
}

export function MissingBrandFontsBanner({
  projectId,
  className = 'ds-project-warning-card',
  onUploadAssets,
}: MissingBrandFontsBannerProps) {
  const [dismissed, setDismissed] = useState(() => isFontBannerDismissed(projectId));
  // FileWorkspace renders this banner without a per-project key, so the same
  // instance is reused across projects. useState only reads projectId once, so
  // re-read the dismissal whenever projectId changes. Without this, dismissing
  // project A would keep the banner hidden for project B even though only A was
  // written to localStorage.
  useEffect(() => {
    setDismissed(isFontBannerDismissed(projectId));
  }, [projectId]);
  if (dismissed) return null;

  function useSystemFonts(): void {
    if (projectId && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(fontBannerDismissKey(projectId), '1');
      } catch {
        // Storage unavailable (private mode, quota). Still hide for this
        // session so the click does something useful.
      }
    }
    setDismissed(true);
  }

  return (
    <div className={className}>
      <Icon name="help-circle" size={16} />
      <span>
        <strong>Missing brand fonts</strong>
        <small>Open Design is rendering typography with substitute web fonts.</small>
      </span>
      <div className="ds-warning-card-actions">
        {onUploadAssets ? (
          <Button variant="ghost" className="compact" onClick={onUploadAssets}>
            <Icon name="upload" size={13} />
            Upload fonts
          </Button>
        ) : null}
        <Button variant="ghost" className="compact" onClick={useSystemFonts}>
          Use system fonts
        </Button>
      </div>
    </div>
  );
}
