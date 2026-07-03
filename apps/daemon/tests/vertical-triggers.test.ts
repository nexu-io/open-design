import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PluginManifestSchema, matchPluginByTriggers } from '@marketing-ax/contracts';

function loadManifest(rel: string) {
  const url = new URL(`../../../plugins/_official/examples/${rel}/open-design.json`, import.meta.url);
  return PluginManifestSchema.parse(JSON.parse(fs.readFileSync(url, 'utf8')));
}

describe('bodoc vertical trigger vocab', () => {
  it('naver-blog declares triggers that match a natural free-form prompt', () => {
    const manifest = loadManifest('naver-blog');
    const triggers = manifest.od?.routing?.triggers ?? [];
    expect(triggers.length).toBeGreaterThan(0);
    const result = matchPluginByTriggers('네이버 블로그 게시물 작성하자', [
      { pluginId: 'example-naver-blog', triggers },
    ]);
    expect(result).toEqual({ kind: 'match', pluginId: 'example-naver-blog' });
  });

  it('braze-iam declares triggers and no ultra-generic single tokens', () => {
    const naver = loadManifest('naver-blog').od?.routing?.triggers ?? [];
    const braze = loadManifest('braze-iam').od?.routing?.triggers ?? [];
    expect(braze.length).toBeGreaterThan(0);
    // 초범용 단일 토큰 금지 규칙 (스펙 §5): "블로그"/"메시지" 단독 금지.
    for (const t of [...naver, ...braze]) {
      expect(['블로그', '메시지', 'blog', 'message']).not.toContain(t.trim().toLowerCase());
    }
    const result = matchPluginByTriggers('braze 인앱 메시지 캠페인 하나 만들자', [
      { pluginId: 'example-naver-blog', triggers: naver },
      { pluginId: 'example-braze-iam', triggers: braze },
    ]);
    expect(result).toEqual({ kind: 'match', pluginId: 'example-braze-iam' });
  });
});
