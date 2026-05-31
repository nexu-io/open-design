export type LogDiagnostic = {
  message: string;
  recommendation: string;
};

export type StartupLogDiagnostics = {
  diagnostics: LogDiagnostic[];
  logPath: string;
  lines: string[];
};

export type NodeRuntimeDiagnosticInput = {
  nodeModuleVersion: string;
  nodeVersion: string;
};

const SUPPORTED_NODE_MAJOR = 24;
const SUPPORTED_NODE_RANGE = "Node ~24";
const NATIVE_ADDON_ABI_MISMATCH_PATTERN = /was compiled against a different Node\.js version[\s\S]*?NODE_MODULE_VERSION\s+\d+[\s\S]*?requires\s+NODE_MODULE_VERSION\s+\d+/i;
const NODE_MODULE_VERSION_PATTERN = /NODE_MODULE_VERSION\s+\d+[\s\S]*?NODE_MODULE_VERSION\s+\d+/i;
const NEXT_PACKAGE_RESOLUTION_PATTERN = /couldn't find the Next\.js package.*from the project directory:/i;

function currentNodeRuntime(): NodeRuntimeDiagnosticInput {
  return {
    nodeModuleVersion: process.versions.modules,
    nodeVersion: process.version,
  };
}

function parseNodeMajor(nodeVersion: string): number | null {
  const match = /^v?(\d+)\./.exec(nodeVersion);
  if (match == null) return null;
  return Number(match[1]);
}

export function isSupportedNodeRuntime(nodeVersion = process.version): boolean {
  return parseNodeMajor(nodeVersion) === SUPPORTED_NODE_MAJOR;
}

export function formatUnsupportedNodeRuntimeMessage(runtime: NodeRuntimeDiagnosticInput = currentNodeRuntime()): string {
  return [
    `tools-dev must run with ${SUPPORTED_NODE_RANGE} before starting Open Design.`,
    `Current runtime: Node ${runtime.nodeVersion} (NODE_MODULE_VERSION ${runtime.nodeModuleVersion}).`,
    "Switch to Node 24 first, then refresh native dependencies if this worktree was installed under another Node:",
    "  nvm use 24",
    "  corepack pnpm install --frozen-lockfile",
    "  corepack pnpm --filter @open-design/daemon rebuild better-sqlite3 --pending",
  ].join("\n");
}

export function createUnsupportedNodeRuntimeError(runtime?: NodeRuntimeDiagnosticInput): Error {
  return new Error(formatUnsupportedNodeRuntimeMessage(runtime));
}

function formatNativeAddonAbiMismatchRecommendation(runtime: NodeRuntimeDiagnosticInput): string {
  const base = [
    "Open Design's dev stack must run with Node ~24.",
    `Current tools-dev runtime: Node ${runtime.nodeVersion} (NODE_MODULE_VERSION ${runtime.nodeModuleVersion}).`,
  ];

  if (!isSupportedNodeRuntime(runtime.nodeVersion)) {
    return [
      ...base,
      "Switch to Node 24 first, then refresh native daemon dependencies:",
      "  nvm use 24",
      "  corepack pnpm install --frozen-lockfile",
      "  corepack pnpm --filter @open-design/daemon rebuild better-sqlite3 --pending",
    ].join("\n");
  }

  return [
    ...base,
    "Refresh native daemon dependencies for the active Node 24 runtime:",
    "  corepack pnpm --filter @open-design/daemon rebuild better-sqlite3 --pending",
    "or refresh the workspace install:",
    "  corepack pnpm install --frozen-lockfile",
  ].join("\n");
}

export function detectLogDiagnostics(
  lines: readonly string[],
  runtime: NodeRuntimeDiagnosticInput = currentNodeRuntime(),
): LogDiagnostic[] {
  const logText = lines.join("\n");
  const diagnostics: LogDiagnostic[] = [];

  if (NATIVE_ADDON_ABI_MISMATCH_PATTERN.test(logText) || NODE_MODULE_VERSION_PATTERN.test(logText)) {
    diagnostics.push({
      message: "Detected a native Node addon ABI mismatch in the daemon log.",
      recommendation: formatNativeAddonAbiMismatchRecommendation(runtime),
    });
  }

  if (NEXT_PACKAGE_RESOLUTION_PATTERN.test(logText)) {
    diagnostics.push({
      message: "Detected that the Next.js package is not resolvable during web startup.",
      recommendation: [
        "Refresh the workspace install so apps/web/node_modules/next points at the pnpm-managed Next.js package:",
        "  pnpm install --frozen-lockfile",
        "If it still fails, inspect the package link:",
        "  ls -la apps/web/node_modules/next",
        "  node -p \"require.resolve('next/package.json', { paths: [process.cwd() + '/apps/web/app'] })\"",
      ].join("\n"),
    });
  }

  return diagnostics;
}

export function formatLogDiagnostics(diagnostics: readonly LogDiagnostic[]): string | null {
  if (diagnostics.length === 0) return null;
  return diagnostics
    .map((diagnostic) => `${diagnostic.message}\n${diagnostic.recommendation}`)
    .join("\n\n");
}

export function createStartupLogDiagnostics(logPath: string, lines: readonly string[]): StartupLogDiagnostics {
  return {
    diagnostics: detectLogDiagnostics(lines),
    lines: [...lines],
    logPath,
  };
}

export function appendStartupLogDiagnostics(error: unknown, appName: string, details: StartupLogDiagnostics): Error {
  const baseMessage = error instanceof Error ? error.message : String(error);
  const sections = [baseMessage, `${appName} log tail (${details.logPath}):`];
  sections.push(details.lines.length > 0 ? details.lines.join("\n") : "(no log lines)");

  const formattedDiagnostics = formatLogDiagnostics(details.diagnostics);
  if (formattedDiagnostics != null) sections.push(formattedDiagnostics);

  return new Error(sections.join("\n\n"), error instanceof Error ? { cause: error } : undefined);
}
