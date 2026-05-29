/// <reference path="../.astro/types.d.ts" />

// Compile-time constant injected by `vite.define` in astro.config.ts. True on
// staging / PR-preview builds (OD_LANDING_NOINDEX=1), false in production.
declare const __OD_LANDING_NOINDEX__: boolean;
