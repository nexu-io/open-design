export function isDesktopApp(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as unknown as Record<string, unknown>).__odDesktop !== undefined &&
    ((window as unknown as Record<string, { isDesktop?: boolean }>).__odDesktop?.isDesktop === true)
  );
}

export function isPackagedDesktop(): boolean {
  if (!isDesktopApp()) return false;
  return (
    (window as unknown as Record<string, { isPackaged?: boolean }>).__odDesktop?.isPackaged === true
  );
}

/** Read the current auto-launch preference from the desktop bridge. */
export function getAutoLaunchEnabled(): Promise<boolean> {
  return (window as unknown as { electronAPI?: { autoLaunch?: { get?: () => Promise<boolean> } } })
    .electronAPI?.autoLaunch?.get?.() ?? Promise.resolve(false);
}

/** Set the auto-launch preference through the desktop bridge. */
export function setAutoLaunch(enabled: boolean): Promise<boolean> {
  return (window as unknown as { electronAPI?: { autoLaunch?: { set?: (v: boolean) => Promise<boolean> } } })
    .electronAPI?.autoLaunch?.set?.(enabled) ?? Promise.resolve(false);
}
