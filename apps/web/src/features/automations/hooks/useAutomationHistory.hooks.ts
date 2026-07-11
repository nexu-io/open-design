// Feature-local hook for a single routine row's expanded run history list.
import { useEffect, useState } from 'react';
import type { RoutineRun } from '@open-design/contracts';

import type { RoutineHistoryPort } from '../ports';
import { routineHistoryPort } from '../dependencies';

const HISTORY_LIMIT = 10;

export interface AutomationHistoryController {
  runs: RoutineRun[] | null;
}

export function useAutomationHistory(
  port: RoutineHistoryPort,
  routineId: string,
  refreshKey: number,
): AutomationHistoryController {
  const [runs, setRuns] = useState<RoutineRun[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRuns(null);
    void (async () => {
      try {
        const fetched = await port.fetchRoutineRuns(routineId, HISTORY_LIMIT);
        if (!cancelled) setRuns(fetched);
      } catch {
        if (!cancelled) setRuns([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [port, refreshKey, routineId]);

  return { runs };
}

export function useWiredAutomationHistory(
  routineId: string,
  refreshKey: number,
): AutomationHistoryController {
  return useAutomationHistory(routineHistoryPort, routineId, refreshKey);
}
