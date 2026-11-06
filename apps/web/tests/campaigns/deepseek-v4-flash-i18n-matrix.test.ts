import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the DeepSeek campaign copy matrix: non-English locales must not
 * silently ship the English fallback for campaign strings. A narrow allowlist
 * covers values that are intentionally shared (e.g. day-unit countdown form
 * `{days}d {hms}` used by several Latin-script locales).
 */

const LOCALES_DIR = resolve(process.cwd(), 'src/i18n/locales');
const KEY_PREFIX = 'campaign.deepseekV4Flash.';

/** Keys allowed to equal English when the locale intentionally reuses them. */
const INTENTIONAL_EN_MATCH_ALLOWLIST = new Set([
  // Several locales keep the compact Latin day unit "d" (es/pl/pt-BR, …).
  'campaign.deepseekV4Flash.countdownRemaining',
]);

function extractCampaignMap(source: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /['"](campaign\.deepseekV4Flash\.[^'"]+)['"]\s*:\s*['"]((?:\\.|[^'"])*)['"]/g;
  for (const match of source.matchAll(re)) {
    const key = match[1]!;
    const raw = match[2]!.replace(/\\'/g, "'").replace(/\\"/g, '"');
    map.set(key, raw);
  }
  return map;
}

describe('DeepSeek V4 Flash campaign i18n matrix', () => {
  const localeFiles = readdirSync(LOCALES_DIR).filter((name) => name.endsWith('.ts'));
  const enSource = readFileSync(resolve(LOCALES_DIR, 'en.ts'), 'utf8');
  const enMap = extractCampaignMap(enSource);

  it('defines the full campaign key set in English', () => {
    expect(enMap.size).toBeGreaterThanOrEqual(28);
    for (const key of enMap.keys()) {
      expect(key.startsWith(KEY_PREFIX)).toBe(true);
    }
  });

  it('ships every campaign key in every locale', () => {
    for (const file of localeFiles) {
      const map = extractCampaignMap(readFileSync(resolve(LOCALES_DIR, file), 'utf8'));
      for (const key of enMap.keys()) {
        expect(map.has(key), `${file} missing ${key}`).toBe(true);
        expect(map.get(key)?.length ?? 0, `${file} empty ${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('does not silently equal the English fallback outside the allowlist', () => {
    for (const file of localeFiles) {
      if (file === 'en.ts') continue;
      const map = extractCampaignMap(readFileSync(resolve(LOCALES_DIR, file), 'utf8'));
      const silent = [...enMap.entries()]
        .filter(([key, enValue]) => {
          if (INTENTIONAL_EN_MATCH_ALLOWLIST.has(key)) return false;
          return map.get(key) === enValue;
        })
        .map(([key]) => key);
      expect(silent, `${file} still copies English for: ${silent.join(', ')}`).toEqual([]);
    }
  });

  it('preserves countdown placeholders in every locale', () => {
    for (const file of localeFiles) {
      const map = extractCampaignMap(readFileSync(resolve(LOCALES_DIR, file), 'utf8'));
      const remaining = map.get('campaign.deepseekV4Flash.countdownRemaining') ?? '';
      expect(remaining, `${file} countdownRemaining`).toContain('{days}');
      expect(remaining, `${file} countdownRemaining`).toContain('{hms}');
    }
  });
});
