/**
 * OPEND-3108 · 侧栏项目入口与项目列表页标题叫「全部项目」，英文 "All projects"，19 语齐。
 *
 * 撤回 OPEND-3142 的「项目」命名（G4 #8153）：Demo 877980fb17 的 `entry.navDrafts`
 * 即「全部项目」，页面内再分 最近浏览过 / 个人项目 / 团队项目 三个 tab。只改值，
 * 不改键：`entry.navDrafts`（入口 aria-label 与 `/drafts` 页标题）和
 * `workspaceSwitcher.draftsTooltip`（入口可见文案）。
 *
 * 反向对照钉住旧值：光断言新值，一个把词典塞回「项目」或「个人项目」的回归也能过。
 */
import { describe, expect, it } from 'vitest';

import { LOCALES, type Dict, type Locale } from '../../src/i18n/types';

async function loadDict(locale: Locale): Promise<Dict> {
  const module = await import(`../../src/i18n/locales/${locale}.ts`);
  const dict = Object.values(module).find((value): value is Dict => {
    return Boolean(value) && typeof value === 'object';
  });
  if (!dict) throw new Error(`No dictionary export found for locale ${locale}`);
  return dict;
}

const RENAMED_KEYS = ['entry.navDrafts', 'workspaceSwitcher.draftsTooltip'] as const;

/** 「全部项目」在每个语言里的写法。 */
const ALL_PROJECTS: Record<Locale, string> = {
  ar: 'جميع المشاريع',
  de: 'Alle Projekte',
  en: 'All projects',
  'es-ES': 'Todos los proyectos',
  fa: 'همه پروژه‌ها',
  fr: 'Tous les projets',
  hu: 'Összes projekt',
  id: 'Semua proyek',
  it: 'Tutti i progetti',
  ja: 'すべてのプロジェクト',
  ko: '모든 프로젝트',
  pl: 'Wszystkie projekty',
  'pt-BR': 'Todos os projetos',
  ru: 'Все проекты',
  th: 'โปรเจกต์ทั้งหมด',
  tr: 'Tüm projeler',
  uk: 'Усі проєкти',
  'zh-CN': '全部项目',
  'zh-TW': '全部專案',
};

describe('OPEND-3108 · 「项目」→「全部项目」', () => {
  it('English reads "All projects" and Simplified Chinese reads 「全部项目」', async () => {
    const en = await loadDict('en');
    const zh = await loadDict('zh-CN');
    for (const key of RENAMED_KEYS) {
      expect(en[key]).toBe('All projects');
      expect(zh[key]).toBe('全部项目');
    }
  }, 30_000);

  it.each(LOCALES)('%s: the entry and the page title read "All projects" in that locale', async (locale) => {
    const dict = await loadDict(locale);
    for (const key of RENAMED_KEYS) {
      expect(dict[key], `${locale} ${key}`).toBe(ALL_PROJECTS[locale]);
      // Neither the G4 「项目」 noun nor the older 「个人项目」 may come back.
      expect(dict[key], `${locale} ${key} still says "Projects"`).not.toBe(dict['entry.navProjects']);
    }
  }, 30_000);

  it.each(LOCALES)('%s: the three collection tabs are translated, and 团队项目 matches the team noun', async (locale) => {
    const dict = await loadDict(locale);
    expect(dict['recentProjects.collectionRecent'], `${locale} recent`).toBeTruthy();
    expect(dict['recentProjects.collectionPersonalProjects'], `${locale} personal`).toBeTruthy();
    // 团队项目 reuses the locale's existing noun for the (former) team entry.
    expect(dict['recentProjects.collectionTeamProjects'], `${locale} team`).toBe(dict['entry.navAllProjects']);
  }, 30_000);
});
