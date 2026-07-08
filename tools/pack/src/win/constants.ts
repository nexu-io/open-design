export const PRODUCT_NAME = "M-AX";
export const DESKTOP_LOG_ECHO_ENV = "MAX_DESKTOP_LOG_ECHO";
export const WEB_STANDALONE_HOOK_CONFIG_ENV = "MAX_TOOLS_PACK_WEB_STANDALONE_HOOK_CONFIG";
export const WEB_STANDALONE_RESOURCE_NAME = "open-design-web-standalone";
export const ELECTRON_BUILDER_ASAR = false;
export const ELECTRON_BUILDER_BUILD_DEPENDENCIES_FROM_SOURCE = false;
export const ELECTRON_BUILDER_NODE_GYP_REBUILD = false;
export const ELECTRON_BUILDER_NPM_REBUILD = false;
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
export const NSIS_INSTALLER_LANGUAGE_BY_WEB_LOCALE = {
  en: "en_US",
  fa: "fa_IR",
  "pt-BR": "pt_BR",
  ru: "ru_RU",
  "zh-CN": "zh_CN",
  "zh-TW": "zh_TW",
} as const;
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
