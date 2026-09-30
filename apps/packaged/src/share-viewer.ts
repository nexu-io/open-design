const SHARE_VIEWER_URL_ENV = "OD_SHARE_VIEWER_URL";
const SHARE_VIEWER_URLS_ENV = "OD_SHARE_VIEWER_URLS";

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Env the packaged launcher adds to the daemon spawn for the share Viewer
 * origin. There is no per-channel default: the share address comes from AMR,
 * which reports it for every publication from its own share-shell origin.
 *
 * `OD_SHARE_VIEWER_URL` / `OD_SHARE_VIEWER_URLS` are a local debug override
 * only. When an operator sets either in the launch environment it is forwarded
 * unchanged and then wins over the AMR address. The launcher never validates:
 * the daemon's resolver is the single HTTPS-only, root-only gate.
 */
export function resolvePackagedShareViewerEnv(launchEnv: NodeJS.ProcessEnv): Record<string, string> {
  const url = nonBlank(launchEnv[SHARE_VIEWER_URL_ENV]);
  const urls = nonBlank(launchEnv[SHARE_VIEWER_URLS_ENV]);
  return {
    ...(url == null ? {} : { [SHARE_VIEWER_URL_ENV]: url }),
    ...(urls == null ? {} : { [SHARE_VIEWER_URLS_ENV]: urls }),
  };
}
