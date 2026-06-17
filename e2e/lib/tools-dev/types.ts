export type ToolsDevAppStatus = {
  pid?: number;
  state?: string;
  title?: string | null;
  updatedAt?: string;
  url?: string | null;
  windowVisible?: boolean;
};

export type ToolsDevStartResult = {
  daemon?: {
    app: 'daemon';
    created: boolean;
    logPath: string;
    pid?: number;
    status: ToolsDevAppStatus;
  };
  web?: {
    app: 'web';
    created: boolean;
    logPath: string;
    pid?: number;
    status: ToolsDevAppStatus;
  };
};

export type ToolsDevStatusResult = {
  apps?: Record<string, ToolsDevAppStatus | null>;
  namespace?: string;
  status?: string;
};

export type ToolsDevLogResult = {
  lines: string[];
  logPath: string;
};

export type ToolsDevCheckResult = {
  apps?: Record<string, ToolsDevAppStatus | null>;
  diagnostics?: unknown;
  logs?: Record<string, ToolsDevLogResult>;
  namespace?: string;
};

export type ToolsDevPortAllocation = {
  daemonPort: number;
  release: () => Promise<void>;
  webPort: number;
};

export type ToolsDevSuiteSpec = {
  codexHomeDir: string;
  dataDir: string;
  namespace: string;
  root: string;
  toolsDevRoot: string;
};

export type ToolsDevUrlBuilder = {
  api: (path?: string) => string;
  daemon: (path?: string) => string;
  web: (path?: string) => string;
};

export type ToolsDevSuite = ToolsDevSuiteSpec & {
  readonly daemonPort: number | null;
  readonly daemonUrl: string | null;
  readonly portAllocation: ToolsDevPortAllocation | null;
  readonly url: ToolsDevUrlBuilder;
  readonly webPort: number | null;
  readonly webUrl: string | null;
  check: (env?: Record<string, string | undefined>) => Promise<ToolsDevCheckResult>;
  logs: (env?: Record<string, string | undefined>) => Promise<Record<string, ToolsDevLogResult>>;
  startWeb: (env?: Record<string, string | undefined>) => Promise<ToolsDevStartResult>;
  status: (env?: Record<string, string | undefined>) => Promise<ToolsDevStatusResult>;
  stopWeb: (env?: Record<string, string | undefined>) => Promise<unknown>;
};
