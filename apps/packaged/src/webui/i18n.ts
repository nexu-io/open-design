// Lightweight i18n for the WebUI terminal launcher. The product web UI ships
// 18 locales (apps/web/src/i18n) but this CLI emits only a handful of strings
// and must not import the web app, so it carries its own small catalog. English
// is the fallback; Chinese is fully translated. Add a locale by extending
// WebuiLocale + MESSAGES and mapping it in resolveWebuiLocale.

export type WebuiLocale = "en" | "zh-CN";

export type WebuiMessages = {
  configCreated: (path: string) => string;
  configCreateFailed: (error: string) => string;
  started: string;
  accessAt: string;
  apiSameAddress: string;
  daemonDirect: (url: string) => string;
  daemonInternal: (url: string) => string;
  tokenLine: (token: string) => string;
  tokenPersisted: (path: string) => string;
  tokenPersistFailed: (error: string) => string;
  pressCtrlC: string;
  runningInBackground: string;
  hintStop: (cmd: string) => string;
  hintForeground: (cmd: string) => string;
  shuttingDown: string;
  stopped: string;
  notRunning: (namespace: string) => string;
  startFailedLog: (logPath: string) => string;
  alreadyRunning: (url: string) => string;
};

const EN: WebuiMessages = {
  configCreated: (path) => `Created config file: ${path}`,
  configCreateFailed: (error) => `Could not create config file (${error}); continuing with defaults`,
  started: "Open Design is running",
  accessAt: "Open in your browser:",
  apiSameAddress:
    "UI and /api share one address: the web server reverse-proxies /api to the internal daemon, so the browser uses the address above and needs no token",
  daemonDirect: (url) =>
    `Direct daemon API (only for programmatic clients): ${url}/api — send header Authorization: Bearer <token>`,
  daemonInternal: (url) => `Daemon internal address: ${url} (no token needed for local access)`,
  tokenLine: (token) => `token: ${token}`,
  tokenPersisted: (path) => `Auto-generated a remote-access token and saved it to ${path} (reused on restart)`,
  tokenPersistFailed: (error) =>
    `Auto-generated a remote-access token (failed to write config: ${error}; valid for this run only)`,
  pressCtrlC: "Press Ctrl+C to stop",
  runningInBackground: "Running in the background — closing this terminal won't stop it.",
  hintStop: (cmd) => `Stop:        ${cmd} stop`,
  hintForeground: (cmd) => `Foreground:  ${cmd} start --foreground   (runs attached; Ctrl+C stops it)`,
  shuttingDown: "Shutting down Open Design...",
  stopped: "Open Design stopped",
  notRunning: (namespace) => `No running Open Design found (namespace=${namespace})`,
  startFailedLog: (logPath) => `Open Design failed to start; see ${logPath} for details`,
  alreadyRunning: (url) => `Open Design is already running at ${url}`,
};

const ZH_CN: WebuiMessages = {
  configCreated: (path) => `已创建配置文件：${path}`,
  configCreateFailed: (error) => `无法创建配置文件（${error}），继续使用默认配置`,
  started: "Open Design 已启动",
  accessAt: "浏览器访问：",
  apiSameAddress: "UI 与 /api 同一地址：web 反代到内部 daemon，浏览器用上面的地址即可，无需 token",
  daemonDirect: (url) => `直连 daemon API（仅程序化调用需要）：${url}/api，需带请求头 Authorization: Bearer <token>`,
  daemonInternal: (url) => `daemon 内部地址：${url}（本机访问无需 token）`,
  tokenLine: (token) => `token：${token}`,
  tokenPersisted: (path) => `已自动生成远程访问 token 并写入 ${path}（重启复用）`,
  tokenPersistFailed: (error) => `已自动生成远程访问 token（写入配置失败：${error}，仅本次有效）`,
  pressCtrlC: "按 Ctrl+C 停止",
  runningInBackground: "已在后台运行 —— 关闭此终端不会停止服务。",
  hintStop: (cmd) => `停止：    ${cmd} stop`,
  hintForeground: (cmd) => `前台运行：${cmd} start --foreground   （前台运行，Ctrl+C 即停）`,
  shuttingDown: "正在关闭 Open Design...",
  stopped: "Open Design 已停止",
  notRunning: (namespace) => `未发现运行中的 Open Design（namespace=${namespace}）`,
  startFailedLog: (logPath) => `Open Design 启动失败，详情见 ${logPath}`,
  alreadyRunning: (url) => `Open Design 已在运行：${url}`,
};

const MESSAGES: Record<WebuiLocale, WebuiMessages> = { en: EN, "zh-CN": ZH_CN };

// Resolves the launcher locale: explicit --lang / config.lang wins, else the
// POSIX LC_ALL > LC_MESSAGES > LANG > OD_LANG env chain. Anything starting with
// "zh" maps to Simplified Chinese; everything else falls back to English.
export function resolveWebuiLocale(input: {
  flagLang?: string;
  configLang?: string;
  env: NodeJS.ProcessEnv;
}): WebuiLocale {
  const fromEnv =
    input.env.OD_LANG ?? input.env.LC_ALL ?? input.env.LC_MESSAGES ?? input.env.LANG ?? "";
  const raw = (input.flagLang ?? input.configLang ?? fromEnv).trim().toLowerCase();
  if (raw.startsWith("zh")) return "zh-CN";
  return "en";
}

export function webuiMessages(locale: WebuiLocale): WebuiMessages {
  return MESSAGES[locale];
}
