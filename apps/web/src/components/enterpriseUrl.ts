// Shared helper for the marketing "Workspace for Teams" landing page URL.
// Used by both the Home toolbar chip (EntryShell) and the compact settings
// menu (EntrySettingsMenu) so the narrow-screen entry stays in sync with the
// wide one. Opens in the external browser. The marketing site lives
// outside this repo, so both development and production use the
// deployed origin.
const ENTERPRISE_BASE = 'https://open-design.ai';

// Map the client's active locale to an active marketing-site locale segment so
// the enterprise page opens in the same language the user is already reading.
// Retired or unsupported marketing locales intentionally fall back to default
// English. Web cannot import the marketing site source (app-boundary rule).
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
