export function formatSourceInstallCliHints(args: {
  daemonUrl: string | null;
  odBinPath: string;
}): string[] {
  if (args.daemonUrl == null) return [];

  return [
    "",
    "  Source install CLI",
    "",
    "  ➜  Run:    pnpm exec od skills list",
    `  ➜  URL:    export OD_DAEMON_URL=${args.daemonUrl}`,
    `  ➜  Note:   system 'od' is not Open Design — use pnpm exec od or ${args.odBinPath}`,
    "",
  ];
}
