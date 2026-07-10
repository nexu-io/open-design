// Starter id → localized copy keys, shared by the Home recommendation strip
// and Studio's empty-conversation starter templates. Keys are literal
// `keyof Dict`, so a missing translation is a typecheck error rather than a
// runtime blank. Keyed by the stable starter id from the recommendation
// mapping (`apps/web/src/onboarding/recommendation.ts`).

import type { Dict } from '../i18n/types';

export interface StarterCopy {
  title: keyof Dict;
  desc: keyof Dict;
  firstPrompt: keyof Dict;
}

const STARTER_COPY = {
  product_ui_prototype: {
    title: 'home.starter.product_ui_prototype.title',
    desc: 'home.starter.product_ui_prototype.desc',
    firstPrompt: 'home.starter.product_ui_prototype.firstPrompt',
  },
  product_ui_component: {
    title: 'home.starter.product_ui_component.title',
    desc: 'home.starter.product_ui_component.desc',
    firstPrompt: 'home.starter.product_ui_component.firstPrompt',
  },
  product_ui_lowfi: {
    title: 'home.starter.product_ui_lowfi.title',
    desc: 'home.starter.product_ui_lowfi.desc',
    firstPrompt: 'home.starter.product_ui_lowfi.firstPrompt',
  },
  marketing_landing: {
    title: 'home.starter.marketing_landing.title',
    desc: 'home.starter.marketing_landing.desc',
    firstPrompt: 'home.starter.marketing_landing.firstPrompt',
  },
  marketing_multivariant: {
    title: 'home.starter.marketing_multivariant.title',
    desc: 'home.starter.marketing_multivariant.desc',
    firstPrompt: 'home.starter.marketing_multivariant.firstPrompt',
  },
  internal_dashboard: {
    title: 'home.starter.internal_dashboard.title',
    desc: 'home.starter.internal_dashboard.desc',
    firstPrompt: 'home.starter.internal_dashboard.firstPrompt',
  },
  internal_report: {
    title: 'home.starter.internal_report.title',
    desc: 'home.starter.internal_report.desc',
    firstPrompt: 'home.starter.internal_report.firstPrompt',
  },
  general_menu: {
    title: 'home.starter.general_menu.title',
    desc: 'home.starter.general_menu.desc',
    firstPrompt: 'home.starter.general_menu.firstPrompt',
  },
} satisfies Record<string, StarterCopy>;

// Unknown ids resolve to the general fallback so a future starter id shipped
// ahead of its copy can never render blank.
export function starterCopyFor(id: string): StarterCopy {
  return STARTER_COPY[id as keyof typeof STARTER_COPY] ?? STARTER_COPY.general_menu;
}
