// The app version's placeholder identity, split out of ./provider so surfaces
// that must not RENDER a placeholder can test for it without importing the
// analytics client.
//
// `useAppVersion()` reads the daemon-pinned version from /api/version at
// runtime, so it necessarily starts on a placeholder and resolves one round-trip
// later. Analytics tolerates that by awaiting the shared fetch before capture
// (see `resolveAppVersionForCapture`); UI cannot await, so any surface that
// prints the version must ask whether it has resolved yet.

export const APP_VERSION_PLACEHOLDER = '0.0.0';

/**
 * Whether an app version is safe to show a user as fact.
 *
 * False for the pre-resolution placeholder and for anything blank, so a caller
 * can pick another real source (or wait) instead of stating a version nobody
 * reported.
 */
export function isResolvedAppVersion(version: string | null | undefined): boolean {
  if (version == null) return false;
  const trimmed = version.trim();
  return trimmed.length > 0 && trimmed !== APP_VERSION_PLACEHOLDER;
}
