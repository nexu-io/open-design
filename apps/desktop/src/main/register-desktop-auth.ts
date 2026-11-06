import type { SidecarConnection } from '@open-design/sidecar';
import {
  APP_KEYS,
  SIDECAR_MESSAGES,
  type RegisterDesktopAuthResult,
} from '@open-design/sidecar-proto';

// The native Windows picker can leave its follow-up IPC response delayed.
// Keep the wait bounded without mistaking a slow acknowledgement for rejection.
const REGISTER_DESKTOP_AUTH_TIMEOUT_MS = 5_000;

/** Require a positive daemon acknowledgement before permitting folder import. */
export async function registerDesktopAuthWithDaemon(
  client: Pick<SidecarConnection, 'invoke'>,
  secret: Buffer,
): Promise<boolean> {
  try {
    const result = await client.invoke<RegisterDesktopAuthResult>(
      APP_KEYS.DAEMON,
      SIDECAR_MESSAGES.REGISTER_DESKTOP_AUTH,
      { secret: secret.toString('base64') },
      { timeoutMs: REGISTER_DESKTOP_AUTH_TIMEOUT_MS },
    );
    return result.accepted === true;
  } catch {
    return false;
  }
}
