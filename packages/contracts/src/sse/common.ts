export interface SseTransportEvent<Name extends string, Payload> {
  id?: string;
  event: Name;
  data: Payload;
}

export type SseEventName<Event> = Event extends SseTransportEvent<infer Name, unknown> ? Name : never;

export type SseEventPayload<Event, Name extends string> = Event extends SseTransportEvent<Name, infer Payload>
  ? Payload
  : never;
