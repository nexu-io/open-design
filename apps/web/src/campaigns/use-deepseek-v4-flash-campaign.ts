import { useEffect, useState } from 'react';
import {
  deepSeekV4FlashCampaignNextBoundary,
  isDeepSeekV4FlashCampaignVisible,
} from './deepseek-v4-flash';

/**
 * Keeps campaign surfaces in sync with the fixed launch window while the app
 * stays open. The real time window is the only visibility input.
 */
export function useDeepSeekV4FlashCampaignVisibility(): {
  now: number;
  visible: boolean;
} {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const boundary = deepSeekV4FlashCampaignNextBoundary(Date.now());
    if (boundary === null) return;
    const delay = Math.max(0, boundary - Date.now()) + 50;
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [now]);

  return {
    now,
    visible: isDeepSeekV4FlashCampaignVisible(now),
  };
}
