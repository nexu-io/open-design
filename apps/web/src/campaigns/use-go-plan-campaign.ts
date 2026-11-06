import { useEffect, useState } from 'react';
import {
  goPlanCampaignNextBoundary,
  isGoPlanCampaignWindowOpen,
} from './go-plan';

export function useGoPlanCampaignVisibility(): { now: number; visible: boolean } {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const boundary = goPlanCampaignNextBoundary(Date.now());
    if (boundary === null) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, boundary - Date.now()) + 50,
    );
    return () => window.clearTimeout(timer);
  }, [now]);

  return { now, visible: isGoPlanCampaignWindowOpen(now) };
}
