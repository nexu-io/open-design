export const PRODUCT_NAME = "Open Design";

export const INTERNAL_PACKAGES = [
  { directory: "packages/contracts", name: "@open-design/contracts" },
  { directory: "packages/registry-protocol", name: "@open-design/registry-protocol" },
  { directory: "packages/sidecar-proto", name: "@open-design/sidecar-proto" },
  { directory: "packages/sidecar", name: "@open-design/sidecar" },
  { directory: "packages/platform", name: "@open-design/platform" },
  { directory: "packages/agui-adapter", name: "@open-design/agui-adapter" },
  { directory: "packages/plugin-runtime", name: "@open-design/plugin-runtime" },
  { directory: "apps/daemon", name: "@open-design/daemon" },
  { directory: "apps/web", name: "@open-design/web" },
  { directory: "apps/desktop", name: "@open-design/desktop" },
  { directory: "apps/packaged", name: "@open-design/packaged" },
] as const;

export const DESKTOP_LOG_ECHO_ENV = "OD_DESKTOP_LOG_ECHO";
export const WEB_STANDALONE_HOOK_CONFIG_ENV = "OD_TOOLS_PACK_WEB_STANDALONE_HOOK_CONFIG";
export const WEB_STANDALONE_RESOURCE_NAME = "open-design-web-standalone";
export const ELECTRON_BUILDER_ASAR = false;
export const ELECTRON_BUILDER_FILE_PATTERNS = [
  "**/*",
  "!**/node_modules/.bin",
  "!**/node_modules/electron{,/**/*}",
  "!**/*.map",
  "!**/*.tsbuildinfo",
  "!**/.next/cache",
  "!**/.next/cache/**",
  "!**/node_modules/better-sqlite3/build/Release/obj",
  "!**/node_modules/better-sqlite3/build/Release/obj/**",
  "!**/node_modules/better-sqlite3/deps",
  "!**/node_modules/better-sqlite3/deps/**",
] as const;
// Keep Electron native UI resources aligned with the Web UI locale set.
// Electron uses underscore-separated locale ids; its base "es" resource
// covers the app's es-ES dictionary.
export const MAC_ELECTRON_LANGUAGES = [
  "en",
  "de",
  "zh_CN",
  "zh_TW",
  "pt_BR",
  "es",
  "ru",
  "fa",
  "ar",
  "ja",
  "ko",
  "pl",
  "hu",
  "fr",
  "uk",
  "tr",
] as const;
