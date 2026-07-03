// Shared helper for the marketing "Workspace for Teams" landing page URL.
// Used by both the Home toolbar chip (EntryShell) and the compact settings
// menu (EntrySettingsMenu) so the narrow-screen entry stays in sync with the
// wide one. Opens in the external browser. In local dev we point at the
// landing-page dev server (astro dev, port 17574) so the full button → form
// flow is walkable before the page ships to prod.
const ENTERPRISE_BASE =
  process.env.NODE_ENV === 'development'
    ? 'http://127.0.0.1:17574'
    : 'https://open-design.ai';

// Map the client's active locale to an active landing-page locale segment so
// the enterprise page opens in the same language the user is already reading.
// Retired or unsupported landing locales intentionally fall back to default
// English. Keep in sync with apps/landing-page LANDING_LOCALES — web cannot
// import landing source directly (app-boundary rule).
const ENTERPRISE_LOCALE_SEGMENT: Record<string, string> = {
  'zh-CN': 'zh',
  ja: 'ja',
  ko: 'ko',
  de: 'de',
  fr: 'fr',
  ru: 'ru',
  'es-ES': 'es',
  'pt-BR': 'pt-br',
  it: 'it',
  tr: 'tr',
};

export function enterpriseUrl(locale: string): string {
  const segment = ENTERPRISE_LOCALE_SEGMENT[locale];
  return segment
    ? `${ENTERPRISE_BASE}/${segment}/enterprise/`
    : `${ENTERPRISE_BASE}/enterprise/`;
}
