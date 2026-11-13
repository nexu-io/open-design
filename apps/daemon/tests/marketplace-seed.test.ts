import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
    createMarketplaceSeedHelpers,
    type MarketplaceSeedEntry,
} from '../src/plugins/marketplace-seed.js';

// Real catalog + bundled values for the two reviewer examples, taken from
// plugins/registry/official/open-design-marketplace.json and
// plugins/_official/examples/{html-ppt,article-magazine}/open-design.json.
const HTML_PPT_DESCRIPTION =
    'HTML PPT Studio — author professional static HTML presentations in many styles, layouts, and animations, all driven by templates. Use when the user asks for a presentation, PPT, slides, keynote, deck, slideshow, "幻灯片", "演讲稿", "做一份 PPT", "做一份 slides", a reveal-style HTML deck, a 小红书 图文, or any kind of multi-slide pitch/report/sharing document that should look tasteful and be usable with keyboard navigation. Triggers include keywords like "presentation", "ppt", "slides", "deck", "keynote", "reveal", "slideshow", "幻灯片", "演讲稿", "分享稿", "小红书图文", "talk slides", "pitch deck", "tech sharing", "technical presentation".';
const HTML_PPT_BUNDLED_TITLE_EN =
    'Brief AI in Your Industry like a Tier-1 Consulting AI Vertical Lead';
const HTML_PPT_BUNDLED_DESCRIPTION_EN =
    'For consulting delivery work: turn diagnosis, frameworks, and project work into a client-adoptable action plan. Built around the core query "consulting-final-deck", with engagement manager judgment, buyer-ready proof, and this outcome: accept the recommendation and commit owners to the roadmap.';
const ARTICLE_MAGAZINE_DESCRIPTION =
    'Huashu / huashu-md-html-inspired magazine article layout for turning Markdown or notes into a polished long-form HTML essay.';
const ARTICLE_MAGAZINE_DESCRIPTION_ZH =
    'Huashu / huashu-md-html 风格杂志文章版式, 将 Markdown 或笔记转成精排长文 HTML。';

describe('marketplace seed localization', () => {
    let tempDir: string;
    let registryDir: string;

    beforeAll(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), 'marketplace-seed-test-'));
        registryDir = path.join(tempDir, 'registry');

        await mkdir(path.join(registryDir, 'official'), { recursive: true });

        await writeFile(
            path.join(registryDir, 'official', 'open-design-marketplace.json'),
            JSON.stringify({
                metadata: { name: 'Official marketplace' },
                plugins: [
                    {
                        name: 'open-design/design-system-agentic',
                        title: 'Agentic',
                        description: 'Original description',
                    },
                    {
                        name: 'open-design/example-article-magazine',
                        title: 'Magazine Article',
                        description: ARTICLE_MAGAZINE_DESCRIPTION,
                        title_i18n: { en: 'Magazine Article', 'zh-CN': '杂志文章' },
                        description_i18n: {
                            en: ARTICLE_MAGAZINE_DESCRIPTION,
                            'zh-CN': ARTICLE_MAGAZINE_DESCRIPTION_ZH,
                        },
                    },
                    {
                        name: 'open-design/example-html-ppt',
                        title: 'Html Ppt',
                        description: HTML_PPT_DESCRIPTION,
                    },
                ],
            }),
        );
    });

    afterAll(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    async function seedManifest(entries: MarketplaceSeedEntry[]) {
        const helpers = createMarketplaceSeedHelpers({
            bundledPluginsDir: path.join(tempDir, 'bundled'),
            projectRoot: tempDir,
            pluginRegistryDir: registryDir,
            marketplaceManifestUrlForRegistry: (id) => `https://example.test/${id}`,
            marketplaceRegistryIdFromUrl: () => null,
        });

        const manifestText = await helpers.marketplaceSeedManifestText(
            'official',
            entries,
        );

        expect(manifestText).not.toBeNull();

        return JSON.parse(manifestText!);
    }

    it('preserves bundled translations for existing marketplace entries', async () => {
        const manifest = await seedManifest([
            {
                name: 'open-design/design-system-agentic',
                title: 'Agentic',
                title_i18n: { 'zh-CN': '智能体' },
                description_i18n: {
                    'zh-CN': '智能体设计系统',
                },
            },
        ]);

        const plugin = manifest.plugins.find(
            (entry: { name: string }) =>
                entry.name === 'open-design/design-system-agentic',
        );

        // A bundled map without English must not leave the English UI
        // falling back to another locale: 'en' is anchored to the catalog's
        // plain title and description.
        expect(plugin.title_i18n).toEqual({
            en: 'Agentic',
            'zh-CN': '智能体',
        });

        expect(plugin.description_i18n).toEqual({
            en: 'Original description',
            'zh-CN': '智能体设计系统',
        });
        expect(plugin.title).toBe('Agentic');
        expect(plugin.description).toBe('Original description');
    });

    it('keeps the catalog English text when the bundled map carries different English copy', async () => {
        const manifest = await seedManifest([
            {
                name: 'open-design/example-html-ppt',
                title_i18n: {
                    en: HTML_PPT_BUNDLED_TITLE_EN,
                    'zh-CN': '像一线咨询 AI 行业负责人一样讲清行业 AI',
                    'zh-TW': '像一线咨询 AI 行业负责人一样讲清行业 AI',
                },
                description_i18n: {
                    en: HTML_PPT_BUNDLED_DESCRIPTION_EN,
                    'zh-CN':
                        '咨询/客户交付场景：围绕 core query「consulting-final-deck」把粗糙材料整理成“像一线咨询 AI 行业负责人一样讲清行业 AI”这类可购买、可复用的专业 Deck；突出受众、决策目标、证据链、风险取舍和评审标准。',
                    'zh-TW':
                        '咨询/客户交付场景：围绕 core query「consulting-final-deck」把粗糙材料整理成“像一线咨询 AI 行业负责人一样讲清行业 AI”这类可购买、可复用的专业 Deck；突出受众、决策目标、证据链、风险取舍和评审标准。',
                },
            },
        ]);

        const plugin = manifest.plugins.find(
            (entry: { name: string }) =>
                entry.name === 'open-design/example-html-ppt',
        );

        expect(plugin.title).toBe('Html Ppt');
        expect(plugin.description).toBe(HTML_PPT_DESCRIPTION);
        expect(plugin.title_i18n).toEqual({
            en: 'Html Ppt',
            'zh-CN': '像一线咨询 AI 行业负责人一样讲清行业 AI',
            'zh-TW': '像一线咨询 AI 行业负责人一样讲清行业 AI',
        });
        expect(plugin.description_i18n).toEqual({
            en: HTML_PPT_DESCRIPTION,
            'zh-CN':
                '咨询/客户交付场景：围绕 core query「consulting-final-deck」把粗糙材料整理成“像一线咨询 AI 行业负责人一样讲清行业 AI”这类可购买、可复用的专业 Deck；突出受众、决策目标、证据链、风险取舍和评审标准。',
            'zh-TW':
                '咨询/客户交付场景：围绕 core query「consulting-final-deck」把粗糙材料整理成“像一线咨询 AI 行业负责人一样讲清行业 AI”这类可购买、可复用的专业 Deck；突出受众、决策目标、证据链、风险取舍和评审标准。',
        });
        expect(Object.values(plugin.title_i18n)).not.toContain(
            HTML_PPT_BUNDLED_TITLE_EN,
        );
        expect(Object.values(plugin.description_i18n)).not.toContain(
            HTML_PPT_BUNDLED_DESCRIPTION_EN,
        );
    });

    it('merges bundled locales into an existing catalog map without overwriting it', async () => {
        const manifest = await seedManifest([
            {
                name: 'open-design/example-article-magazine',
                title_i18n: {
                    en: 'Magazine Article',
                    'zh-CN': '杂志文章',
                    'zh-TW': '雜誌文章',
                    ja: 'マガジン記事',
                    ko: '매거진 기사',
                },
                description_i18n: {
                    en: ARTICLE_MAGAZINE_DESCRIPTION,
                    'zh-CN': ARTICLE_MAGAZINE_DESCRIPTION_ZH,
                    'zh-TW':
                        'Huashu / huashu-md-html 風格的雜誌文章版面，可將 Markdown 或筆記轉換為精緻的長篇 HTML 文章。',
                    ja: 'Huashu / huashu-md-html にインスパイアされたマガジン記事レイアウト。Markdown やメモを洗練された長文 HTML エッセイに変換します。',
                    ko: 'Huashu / huashu-md-html 스타일의 매거진 기사 레이아웃으로 Markdown 또는 노트를 세련된 장문의 HTML 에세이로 변환합니다.',
                },
            },
        ]);

        const plugin = manifest.plugins.find(
            (entry: { name: string }) =>
                entry.name === 'open-design/example-article-magazine',
        );

        expect(plugin.title).toBe('Magazine Article');
        expect(plugin.title_i18n).toEqual({
            en: 'Magazine Article',
            'zh-CN': '杂志文章',
            'zh-TW': '雜誌文章',
            ja: 'マガジン記事',
            ko: '매거진 기사',
        });
        expect(plugin.description_i18n).toEqual({
            en: ARTICLE_MAGAZINE_DESCRIPTION,
            'zh-CN': ARTICLE_MAGAZINE_DESCRIPTION_ZH,
            'zh-TW':
                'Huashu / huashu-md-html 風格的雜誌文章版面，可將 Markdown 或筆記轉換為精緻的長篇 HTML 文章。',
            ja: 'Huashu / huashu-md-html にインスパイアされたマガジン記事レイアウト。Markdown やメモを洗練された長文 HTML エッセイに変換します。',
            ko: 'Huashu / huashu-md-html 스타일의 매거진 기사 레이아웃으로 Markdown 또는 노트를 세련된 장문의 HTML 에세이로 변환합니다.',
        });
    });

    it('lets existing catalog translations win over bundled values for the same locale', async () => {
        // Synthetic bundled values that differ from the catalog's, to prove
        // existing translations win per locale (the real bundled en/zh-CN
        // happen to match the catalog's, so they cannot prove precedence).
        const manifest = await seedManifest([
            {
                name: 'open-design/example-article-magazine',
                title_i18n: {
                    en: 'Bundled English',
                    'zh-CN': 'bundled zh',
                    ja: 'マガジン記事',
                },
                description_i18n: {
                    en: 'Bundled description',
                    'zh-CN': 'bundled zh desc',
                    ja: 'Huashu / huashu-md-html にインスパイアされたマガジン記事レイアウト。Markdown やメモを洗練された長文 HTML エッセイに変換します。',
                },
            },
        ]);

        const plugin = manifest.plugins.find(
            (entry: { name: string }) =>
                entry.name === 'open-design/example-article-magazine',
        );

        expect(plugin.title_i18n).toEqual({
            en: 'Magazine Article',
            'zh-CN': '杂志文章',
            ja: 'マガジン記事',
        });
        expect(plugin.description_i18n).toEqual({
            en: ARTICLE_MAGAZINE_DESCRIPTION,
            'zh-CN': ARTICLE_MAGAZINE_DESCRIPTION_ZH,
            ja: 'Huashu / huashu-md-html にインスパイアされたマガジン記事レイアウト。Markdown やメモを洗練された長文 HTML エッセイに変換します。',
        });
    });

    it('merges title and description maps independently', async () => {
        const manifest = await seedManifest([
            {
                name: 'open-design/example-html-ppt',
                title_i18n: {
                    'zh-CN': '像一线咨询 AI 行业负责人一样讲清行业 AI',
                },
            },
            {
                name: 'open-design/example-article-magazine',
                description_i18n: {
                    ja: 'Huashu / huashu-md-html にインスパイアされたマガジン記事レイアウト。Markdown やメモを洗練された長文 HTML エッセイに変換します。',
                },
            },
        ]);

        const htmlPpt = manifest.plugins.find(
            (entry: { name: string }) =>
                entry.name === 'open-design/example-html-ppt',
        );
        expect(htmlPpt.title_i18n).toEqual({
            en: 'Html Ppt',
            'zh-CN': '像一线咨询 AI 行业负责人一样讲清行业 AI',
        });
        expect(htmlPpt.description_i18n).toBeUndefined();

        const magazine = manifest.plugins.find(
            (entry: { name: string }) =>
                entry.name === 'open-design/example-article-magazine',
        );
        expect(magazine.title_i18n).toEqual({
            en: 'Magazine Article',
            'zh-CN': '杂志文章',
        });
        expect(magazine.description_i18n).toEqual({
            en: ARTICLE_MAGAZINE_DESCRIPTION,
            'zh-CN': ARTICLE_MAGAZINE_DESCRIPTION_ZH,
            ja: 'Huashu / huashu-md-html にインスパイアされたマガジン記事レイアウト。Markdown やメモを洗練された長文 HTML エッセイに変換します。',
        });
    });

    it('still inserts bundled plugins that are not already registered', async () => {
        const manifest = await seedManifest([
            {
                name: 'open-design/example-new-plugin',
                title: 'New Plugin',
                description: 'A bundled plugin that is not in the catalog yet.',
                title_i18n: { 'zh-CN': '新插件' },
            },
        ]);

        expect(manifest.plugins).toHaveLength(4);
        expect(manifest.metadata.bundledPreinstallCount).toBe(1);

        const plugin = manifest.plugins.find(
            (entry: { name: string }) =>
                entry.name === 'open-design/example-new-plugin',
        );
        expect(plugin).toBeDefined();
        expect(plugin.title).toBe('New Plugin');
        expect(plugin.title_i18n).toEqual({ 'zh-CN': '新插件' });

        const agentic = manifest.plugins.find(
            (entry: { name: string }) =>
                entry.name === 'open-design/design-system-agentic',
        );
        expect(agentic.title).toBe('Agentic');
        expect(agentic.title_i18n).toBeUndefined();
    });
});
