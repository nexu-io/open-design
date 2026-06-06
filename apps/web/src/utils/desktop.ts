import { detectOpenDesignHostClientType, getOpenDesignHost } from '@open-design/host';

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined'
    && detectOpenDesignHostClientType() === 'desktop';
}

export function isPackagedDesktop(): boolean {
  if (!isDesktopApp()) return false;
  return (
    (window as unknown as Record<string, { isPackaged?: boolean }>).openDesignDesktop?.isPackaged === true
  );
}

/** Read the current auto-launch preference from the desktop bridge. */
export function getAutoLaunchEnabled(): Promise<boolean> {
  return getOpenDesignHost()?.shell?.autoLaunch?.get?.() ?? Promise.resolve(false);
}

/** Set the auto-launch preference through the desktop bridge. */
export function setAutoLaunch(enabled: boolean): Promise<boolean> {
  return getOpenDesignHost()?.shell?.autoLaunch?.set?.(enabled) ?? Promise.resolve(false);
}
