// @ts-nocheck
/** @module cli/system/amr
 * Implements `od amr status` CLI command for AMR (Agent Model Runtime) wallet/account probing.
 * Reports login status, plan, and balance (with optional cache bypass via --refresh).
 */
import { cliDaemonBaseUrl, parseFlags, structuredHttpFailure } from '../core/index.js';

/** Whitelist of string flags for `od amr` commands. */
const AMR_STRING_FLAGS = new Set(['daemon-url']);

/** Whitelist of boolean flags for `od amr` commands (includes --refresh cache bypass). */
const AMR_BOOLEAN_FLAGS = new Set(['help', 'h', 'json', 'refresh']);

/**
 * Entry point for `od amr` subcommands (currently: status only).
 * Routes to wallet/account status endpoint with optional cache refresh.
 */
export async function runAmr(args) {
  const sub = args[0];
  if (!sub || sub === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od amr status [--refresh] [--json]

Options:
  --daemon-url <url>   Open Design daemon HTTP base.
  --refresh            Bypass the daemon's short wallet display cache.
  --json               Emit raw JSON.`);
    process.exit(sub === 'help' || args.includes('--help') || args.includes('-h') ? 0 : 2);
  }
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: AMR_STRING_FLAGS, boolean: AMR_BOOLEAN_FLAGS });
  const base = await cliDaemonBaseUrl(flags);
  switch (sub) {
    case 'status': {
      const query = flags.refresh ? '?refresh=1' : '';
      const statusResp = await fetch(`${base}/api/integrations/vela/status`);
      if (!statusResp.ok) return structuredHttpFailure(statusResp);
      const status = await statusResp.json();
      let wallet = null;
      if (status?.loggedIn && (!status?.account?.balanceUsd || flags.refresh)) {
        const walletResp = await fetch(`${base}/api/integrations/vela/wallet${query}`);
        if (walletResp.ok) wallet = await walletResp.json();
        else if (flags.refresh && !status?.account?.balanceUsd) return structuredHttpFailure(walletResp);
      }
      const merged = {
        ...status,
        user: status?.user ?? wallet?.user ?? null,
        account:
          status?.loggedIn && wallet?.status === 'available'
            ? {
                ...(status?.account ?? {}),
                balanceUsd: status?.account?.balanceUsd ?? wallet.balanceUsd,
              }
            : status?.account,
        wallet,
      };
      if (flags.json) return process.stdout.write(JSON.stringify(merged, null, 2) + '\n');
      const account = merged?.user?.email ?? merged?.user?.id ?? '-';
      console.log(`AMR account\t${account}`);
      console.log(`Profile\t${merged?.profile ?? '-'}`);
      if (merged?.account?.plan) console.log(`Plan\t${merged.account.plan}`);
      if (merged?.account?.balanceUsd) {
        console.log(`Wallet balance\t$${merged.account.balanceUsd}`);
        if (wallet?.updatedAt || wallet?.fetchedAt) {
          console.log(`Updated\t${wallet.updatedAt ?? wallet.fetchedAt}`);
        }
        console.log(`Source\t${wallet?.source ?? 'status_account'}`);
        return;
      }
      console.log(`Wallet balance\tunavailable`);
      console.log(`Status\t${wallet?.status ?? (merged?.loggedIn ? 'logged_in' : 'signed_out')}`);
      if (wallet?.error?.message) console.log(`Reason\t${wallet.error.message}`);
      return;
    }
    default:
      console.error(`unknown subcommand: od amr ${sub}`);
      process.exit(2);
  }
}
