export type LogDiagnostic = {
  message: string;
  recommendation: string;
};

export type StartupLogDiagnostics = {
  diagnostics: LogDiagnostic[];
  logPath: string;
  lines: string[];
};

const NATIVE_ADDON_ABI_MISMATCH_PATTERN = /was compiled against a different Node\.js version[\s\S]*?NODE_MODULE_VERSION\s+\d+[\s\S]*?requires\s+NODE_MODULE_VERSION\s+\d+/i;
const NODE_MODULE_VERSION_PATTERN = /NODE_MODULE_VERSION\s+\d+[\s\S]*?NODE_MODULE_VERSION\s+\d+/i;

export function detectLogDiagnostics(lines: readonly string[]): LogDiagnostic[] {
  const logText = lines.join("\n");
  if (!NATIVE_ADDON_ABI_MISMATCH_PATTERN.test(logText) && !NODE_MODULE_VERSION_PATTERN.test(logText)) return [];

  return [
    {
      message: "Detected a native Node addon ABI mismatch in the daemon log.",
      recommendation: [
        "Rebuild native daemon dependencies for the active Node version:",
        "  pnpm --filter @open-design/daemon rebuild better-sqlite3 --pending",
        "or refresh the workspace install:",
        "  pnpm install",
      ].join("\n"),
    },
  ];
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
