export function electronDisplayCommand(
  executable: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  if (platform === 'linux') {
    return {
      command: 'xvfb-run',
      args: ['--auto-servernum', '--server-args=-screen 0 1280x720x24', executable, ...args],
    };
  }
  return { command: executable, args: [...args] };
}
