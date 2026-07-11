// Browser-side bridge exposing the document body as a React portal target.
// Lives in providers/ because it touches `document`; slice components reach
// it through an injected port so they stay DOM-free and unit-testable.
export function documentBodyPortalRoot(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.body;
}
