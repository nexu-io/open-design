interface EventProperties {
  [key: string]: string | number | boolean | null | undefined;
}

// Retained for upstream editor integrations; Motion has no analytics transport.
export function trackStudioEvent(_event: string, _properties: EventProperties = {}): void {}
export function flushViaBeacon(): void {}
