export type DesktopExternalShowOptions = {
  onError?: (error: unknown) => void;
};

/**
 * Notify an optional host after the desktop has accepted an external SHOW.
 * The callback starts immediately after focus so a packaged host can minimize
 * the interval in which an obsolete caller remains alive. Its asynchronous
 * completion does not delay the SHOW acknowledgement.
 */
export function notifyDesktopExternalShow(
  callback: (() => void | Promise<void>) | undefined,
  options: DesktopExternalShowOptions = {},
): void {
  if (callback == null) return;
  const onError = options.onError ?? ((error: unknown) => {
    console.error("desktop external SHOW callback failed", error);
  });
  try {
    void Promise.resolve(callback()).catch(onError);
  } catch (error) {
    onError(error);
  }
}
