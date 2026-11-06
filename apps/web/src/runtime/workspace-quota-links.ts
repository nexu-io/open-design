import { AMR_CONSOLE_RECHARGE_INTENT, AMR_CONSOLE_UPGRADE_INTENT, amrConsoleUrlForProfile, amrWorkspaceUrl } from './amr-guidance';

/** Balance is a view link; owner actions preserve their workspace billing intent. */
export function quotaPopoverConsoleUrl(
  profile: string | null | undefined,
  workspaceId: string | null | undefined,
  intent: 'console' | 'plans' | 'recharge' = 'console',
  consoleOrigin?: string | null,
): string | null {
  return amrWorkspaceUrl(
    amrConsoleUrlForProfile(profile, consoleOrigin),
    workspaceId,
    intent === 'plans' ? AMR_CONSOLE_UPGRADE_INTENT : intent === 'recharge' ? AMR_CONSOLE_RECHARGE_INTENT : undefined,
  );
}
