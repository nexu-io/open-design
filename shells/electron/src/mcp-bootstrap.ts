export interface PackagedMcpBootstrapLaunch {
  args: string[];
  command: string;
}

export function resolvePackagedMcpBootstrapLaunch(options: {
  currentExecutablePath?: string;
  installedLaunchPath: string | null;
  platform?: NodeJS.Platform;
}): PackagedMcpBootstrapLaunch {
  const platform = options.platform ?? process.platform;
  const currentExecutablePath = options.currentExecutablePath ?? process.execPath;
  if (platform === "darwin" && options.installedLaunchPath?.endsWith(".app")) {
    return {
      args: [
        "-g",
        "-j",
        options.installedLaunchPath,
        "--args",
        "--standalone",
      ],
      command: "/usr/bin/open",
    };
  }
  return {
    args: ["--standalone"],
    command: options.installedLaunchPath ?? currentExecutablePath,
  };
}
