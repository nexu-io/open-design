export type WindowsInstallerRuntimeProbe = Readonly<{
  managedProcessPids?: readonly number[];
  status?: Readonly<{
    pid?: number;
    state?: string;
  }> | null;
}>;

export type WindowsInstallerRuntimeContinuity<
  TProbe extends WindowsInstallerRuntimeProbe,
  TStart,
> = Readonly<{
  probe: TProbe;
  start: TStart | null;
}>;

/**
 * Preserve a desktop that survived an updater-owned NSIS replacement.
 * Starting again while that process owns the launch-context is a conflicting
 * transaction; only create a new process when neither IPC nor the stamped
 * process inventory can see an existing desktop.
 */
export async function ensureWindowsRuntimeAfterInstaller<
  TProbe extends WindowsInstallerRuntimeProbe,
  TStart,
>(input: Readonly<{
  inspect: () => Promise<TProbe>;
  start: () => Promise<TStart>;
}>): Promise<WindowsInstallerRuntimeContinuity<TProbe, TStart>> {
  const probe = await input.inspect();
  const running = probe.status?.state === 'running'
    || (probe.managedProcessPids?.length ?? 0) > 0;
  return {
    probe,
    start: running ? null : await input.start(),
  };
}
