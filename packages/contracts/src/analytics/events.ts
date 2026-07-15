// Typed catalog for the v2 analytics schema. The wire format collapses to
// four core event names (`page_view`, `ui_click`, `surface_view`, plus the
// `*_result` family) and identifies the surface through the
// `page_name` + `area` + `element` triplet rather than the v1 per-page event
// names. Configure-state triplet (`has_available_configure_cli` /
// `configure_type` / `configure_availability`) is supplied via the global
// register in `apps/web/src/analytics/client.ts`; it does NOT appear in the
// per-event prop types below.
//
// This file is a barrel. The typed catalog is split by concern under `./events/`.

export * from './events/event-names.js';
export * from './events/shared-enums.js';
export * from './events/onboarding.js';
export * from './events/design-systems.js';
export * from './events/page-view.js';
export * from './events/ui-click.js';
export * from './events/surface-view.js';
export * from './events/result-events.js';
export * from './events/event-payload.js';
export * from './events/mappers.js';
export * from './events/design-system-helpers.js';
