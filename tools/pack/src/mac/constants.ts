export const PRODUCT_NAME = "Open Design";

export const INTERNAL_PACKAGES = [
  { directory: "packages/components", name: "@marketing-ax/components" },
  { directory: "packages/contracts", name: "@marketing-ax/contracts" },
  { directory: "packages/registry-protocol", name: "@marketing-ax/registry-protocol" },
  { directory: "packages/sidecar-proto", name: "@marketing-ax/sidecar-proto" },
  { directory: "packages/launcher-proto", name: "@marketing-ax/launcher-proto" },
  { directory: "packages/sidecar", name: "@marketing-ax/sidecar" },
  { directory: "packages/platform", name: "@marketing-ax/platform" },
  { directory: "packages/download", name: "@marketing-ax/download" },
  { directory: "packages/host", name: "@marketing-ax/host" },
  { directory: "packages/agui-adapter", name: "@marketing-ax/agui-adapter" },
  { directory: "packages/plugin-runtime", name: "@marketing-ax/plugin-runtime" },
  { directory: "packages/diagnostics", name: "@marketing-ax/diagnostics" },
  { directory: "apps/daemon", name: "@marketing-ax/daemon" },
  { directory: "apps/web", name: "@marketing-ax/web" },
  { directory: "apps/desktop", name: "@marketing-ax/desktop" },
  { directory: "apps/packaged", name: "@marketing-ax/packaged" },
] as const;

export const DESKTOP_LOG_ECHO_ENV = "OD_DESKTOP_LOG_ECHO";
export const WEB_STANDALONE_HOOK_CONFIG_ENV = "OD_TOOLS_PACK_WEB_STANDALONE_HOOK_CONFIG";
export const WEB_STANDALONE_RESOURCE_NAME = "open-design-web-standalone";
export const ELECTRON_BUILDER_ASAR = false;
export const ELECTRON_BUILDER_BUILD_DEPENDENCIES_FROM_SOURCE = false;
export const ELECTRON_REBUILD_MODE = "sequential" as const;
export const ELECTRON_REBUILD_NATIVE_MODULES = ["better-sqlite3"] as const;
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
