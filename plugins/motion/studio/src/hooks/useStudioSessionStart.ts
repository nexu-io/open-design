import { useEffect } from "react";
import { hasFiredSessionStart, markSessionStartFired } from "../telemetry/config";
import { trackStudioSessionStart } from "../telemetry/events";

export function useStudioSessionStart(
  projectId: string | null,
  resolving: boolean,
  waitingForServer: boolean,
): void {
  useEffect(() => {
    if (resolving || waitingForServer || hasFiredSessionStart()) return;
    markSessionStartFired();
    trackStudioSessionStart({ has_project: projectId != null });
  }, [projectId, resolving, waitingForServer]);
}
