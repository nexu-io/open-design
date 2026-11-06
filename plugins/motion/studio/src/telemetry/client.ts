type EventProperties = Record<string, string | number | boolean | undefined>;

// Motion does not send upstream usage analytics. Keep callers source-compatible.
export function shouldTrack(): boolean { return false; }
export function trackEvent(_event: string, _properties: EventProperties = {}): void {}
