// Moved to packages/contracts (Option B, issue #4359) so the web preview can
// compute design signatures in-browser without crossing the app boundary.
// This shim keeps the daemon import path stable for existing consumers
// (design-system-import.ts, plugins/atoms/design-extract.ts, design-signature.ts).
export * from '@open-design/contracts/design-tokens';
