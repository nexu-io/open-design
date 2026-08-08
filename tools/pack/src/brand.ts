/**
 * Brand overlay for fork/custom builds.
 *
 * Forks (e.g. the xDesign enterprise fork) need to ship under a different
 * product name, app id, and icon than upstream Open Design, without editing
 * upstream source. This is the env-driven seam: when `OD_PRODUCT_NAME` is set
 * at packaging time, the brand fields below override the upstream identity at
 * every mac/win/linux install-identity resolution point and the icon selection
 * in the electron-builder config. When it is unset, upstream behavior is
 * completely unchanged — same convention the existing `OD_UPDATE_METADATA_URL`
 * / `POSTHOG_KEY` / `OD_VELA_WEB_URL` injection already follows ("fork builds
 * simply omit it").
 *
 * The actual brand data (name, appId) and brand resources (icons) live in a
 * fork-private overlay directory and reach the build only through these env
 * vars, so no brand identity is checked into upstream source. The only
 * upstream touch is this generic, additive seam — the "brand injection point"
 * the fork ADR lists as private-patch surface to reconcile at each upstream
 * sync window.
 */
export type ToolPackBrand = {
  /** Display product name, e.g. "xDesign". Drives productName, bundle name, DMG title. */
  productName: string;
  /**
   * Reverse-DNS app id, e.g. "io.xdesign.desktop". Required at identity-resolution
   * time when productName is set — a branded build must not reuse the upstream
   * Open Design appId (install collision); {@link requireBrandAppId} throws if it
   * is absent.
   */
  appId?: string;
  /** Absolute or cwd-relative path to a macOS `.icns` icon. When omitted, the upstream mac icon is used. */
  macIcon?: string;
  /** Absolute or cwd-relative path to a Windows `.ico` icon. When omitted, the upstream win icon is used. */
  winIcon?: string;
  /** Absolute or cwd-relative path to a Linux `.png` icon. When omitted, the upstream linux icon is used. */
  linuxIcon?: string;
};

/**
 * Fail-closed guard shared by every platform's install-identity resolver: a
 * branded build (OD_PRODUCT_NAME set) MUST declare its own reverse-DNS app id,
 * otherwise it would collide with an upstream Open Design install on the same
 * machine (macOS LaunchServices overwrite / Windows registry + $APPDATA).
 * Throws one canonical message so the mac/win/linux resolvers cannot drift,
 * and returns the appId for the caller to use directly.
 */
export function requireBrandAppId(brand: ToolPackBrand): string {
  if (brand.appId == null) {
    throw new Error(
      "tools-pack: OD_PRODUCT_NAME is set but OD_APP_ID is missing. A branded "
        + "build must declare its own reverse-DNS app id (e.g. io.xdesign.desktop) "
        + "so it cannot collide with the upstream Open Design identity.",
    );
  }
  return brand.appId;
}

/**
 * Resolve a brand overlay from packaging-time env. `OD_PRODUCT_NAME` is the
 * activation key: when it is present and non-empty the build is branded, and
 * `OD_APP_ID` / `OD_MAC_ICON` / `OD_WIN_ICON` / `OD_LINUX_ICON` optionally
 * refine the app id and the per-platform icon. Returns `undefined` for
 * unbranded (upstream) builds.
 */
export function resolveBrandFromEnv(env: NodeJS.ProcessEnv): ToolPackBrand | undefined {
  const productName = env.OD_PRODUCT_NAME?.trim();
  if (!productName) return undefined;
  const appId = env.OD_APP_ID?.trim();
  const macIcon = env.OD_MAC_ICON?.trim();
  const winIcon = env.OD_WIN_ICON?.trim();
  const linuxIcon = env.OD_LINUX_ICON?.trim();
  return {
    productName,
    ...(appId ? { appId } : {}),
    ...(macIcon ? { macIcon } : {}),
    ...(winIcon ? { winIcon } : {}),
    ...(linuxIcon ? { linuxIcon } : {}),
  };
}
