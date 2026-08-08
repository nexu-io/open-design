import {
  DESKTOP_UPDATE_ACTIONS,
  SIDECAR_MESSAGES,
  type DesktopUpdateAction,
  type DesktopUpdateResult,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import { requestJsonIpc } from "@open-design/sidecar";

const UPDATE_ACTION_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Compose the trusted tools-pack update control flow. Product UI performs the
 * same two phases separately so it can run restart preflight between them;
 * release QA has already established that boundary and needs `install` to
 * complete the deferred launcher handoff without depending on a web route.
 */
export async function requestDesktopUpdateAction(
  stamp: SidecarStamp,
  action: DesktopUpdateAction,
): Promise<DesktopUpdateResult> {
  const result = await requestJsonIpc<DesktopUpdateResult>(
    stamp.ipc,
    { input: { action }, type: SIDECAR_MESSAGES.UPDATE },
    { timeoutMs: UPDATE_ACTION_TIMEOUT_MS },
  );

  if (
    action === DESKTOP_UPDATE_ACTIONS.INSTALL
    && result.installResult != null
    && result.installResult.dryRun !== true
  ) {
    await requestJsonIpc(
      stamp.ipc,
      { type: SIDECAR_MESSAGES.SHUTDOWN },
      { timeoutMs: 2000 },
    );
  }

  return result;
}
