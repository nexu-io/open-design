import type { Weekday } from '@open-design/contracts';

import type { Dict } from '../../i18n/types';
import type { ScheduleKind } from './types';

export const SCHEDULE_KINDS: { kind: ScheduleKind; labelKey: keyof Dict }[] = [
  { kind: 'hourly', labelKey: 'routines.kind.hourly' },
  { kind: 'daily', labelKey: 'routines.kind.daily' },
  { kind: 'weekdays', labelKey: 'routines.kind.weekdays' },
  { kind: 'weekly', labelKey: 'routines.kind.weekly' },
];

export const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

// Fallback timezone list when `Intl.supportedValuesOf` is unavailable.
export const FALLBACK_TIMEZONES = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
];
