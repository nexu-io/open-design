export function shouldStopWebForDaemonRestart(input: {
  shouldRefreshWebOrigin: boolean;
  daemonTrustedWebOriginPort: number | null;
  webPort: number | null;
}): boolean {
  return input.shouldRefreshWebOrigin && input.daemonTrustedWebOriginPort !== input.webPort;
}
