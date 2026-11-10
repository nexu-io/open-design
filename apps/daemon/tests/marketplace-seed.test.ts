import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createMarketplaceSeedHelpers } from '../src/plugins/marketplace-seed.js';

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
                ],
            }),
        );
    });

    afterAll(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    it('preserves bundled translations for existing marketplace entries', async () => {
        const helpers = createMarketplaceSeedHelpers({
            bundledPluginsDir: path.join(tempDir, 'bundled'),
            projectRoot: tempDir,
            pluginRegistryDir: registryDir,
            marketplaceManifestUrlForRegistry: (id) => `https://example.test/${id}`,
            marketplaceRegistryIdFromUrl: () => null,
        });

        const manifestText = await helpers.marketplaceSeedManifestText('official', [
            {
                name: 'open-design/design-system-agentic',
                title: 'Agentic',
                title_i18n: { 'zh-CN': '\u667a\u80fd\u4f53' },
                description_i18n: {
                    'zh-CN': '\u667a\u80fd\u4f53\u8bbe\u8ba1\u7cfb\u7edf',
                },
            },
        ]);

        expect(manifestText).not.toBeNull();

        const manifest = JSON.parse(manifestText!);
        const plugin = manifest.plugins.find(
            (entry: { name: string }) =>
                entry.name === 'open-design/design-system-agentic',
        );

        expect(plugin.title_i18n).toEqual({
            'zh-CN': '\u667a\u80fd\u4f53',
        });

        expect(plugin.description_i18n).toEqual({
            'zh-CN': '\u667a\u80fd\u4f53\u8bbe\u8ba1\u7cfb\u7edf',
        });
        expect(plugin.title).toBe('Agentic');
        expect(plugin.description).toBe('Original description');
    });
});