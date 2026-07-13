import type { RoutineRun } from '@open-design/contracts';

import { statusLabel } from '../rules';
import type { TranslateFn } from '../types';

export function StatusPill({ status, t }: { status: RoutineRun['status']; t: TranslateFn }) {
  return <span className={`automation-status is-${status}`}>{statusLabel(status, t)}</span>;
}
