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
