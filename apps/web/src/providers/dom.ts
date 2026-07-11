// Generic browser-confirm bridge. Lives in providers/ because it touches
// `window`; a slice reaches it through an injected port so its hooks stay
// DOM-free and unit-testable with a fake (see Phase 8 escape hatch #2 in
// dev-skills/fixing-open-design-web/SKILL.md).
export function confirmDialog(message: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.confirm(message);
}
