import type { PanelEvent } from '../critique';
import type { SseTransportEvent } from './common';

type PayloadOf<T extends PanelEvent['type']> = Omit<Extract<PanelEvent, { type: T }>, 'type'>;

export type CritiqueSseEvent =
  | SseTransportEvent<'critique.run_started',       PayloadOf<'run_started'>>
  | SseTransportEvent<'critique.panelist_open',     PayloadOf<'panelist_open'>>
  | SseTransportEvent<'critique.panelist_dim',      PayloadOf<'panelist_dim'>>
  | SseTransportEvent<'critique.panelist_must_fix', PayloadOf<'panelist_must_fix'>>
  | SseTransportEvent<'critique.panelist_close',    PayloadOf<'panelist_close'>>
  | SseTransportEvent<'critique.round_end',         PayloadOf<'round_end'>>
  | SseTransportEvent<'critique.ship',              PayloadOf<'ship'>>
  | SseTransportEvent<'critique.degraded',          PayloadOf<'degraded'>>
  | SseTransportEvent<'critique.interrupted',       PayloadOf<'interrupted'>>
  | SseTransportEvent<'critique.failed',            PayloadOf<'failed'>>
  | SseTransportEvent<'critique.parser_warning',    PayloadOf<'parser_warning'>>;

export const CRITIQUE_SSE_EVENT_NAMES = [
  'critique.run_started',
  'critique.panelist_open',
  'critique.panelist_dim',
  'critique.panelist_must_fix',
  'critique.panelist_close',
  'critique.round_end',
  'critique.ship',
  'critique.degraded',
  'critique.interrupted',
  'critique.failed',
  'critique.parser_warning',
] as const satisfies readonly CritiqueSseEvent['event'][];

export type CritiqueSseEventName = typeof CRITIQUE_SSE_EVENT_NAMES[number];

export function panelEventToSse(e: PanelEvent): CritiqueSseEvent {
  const { type, ...payload } = e;
  // The cast is safe: each PanelEvent variant maps 1:1 to a CritiqueSseEvent variant
  // by prefixing the type with 'critique.' and moving every other field into data.
  return { event: `critique.${type}`, data: payload } as CritiqueSseEvent;
}
