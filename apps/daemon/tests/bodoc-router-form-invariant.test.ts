import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PluginManifestSchema, matchPluginByTriggers } from '@marketing-ax/contracts';

// 스펙 §8 불변식: 라우터 폼의 라우팅 옵션(라벨·value)이 대상 버티컬 트리거에 유일 매칭돼야
// 폼 답변 재매칭이 성립한다. 옵션 value는 안정 슬러그 — formatFormAnswers가
// "라벨 [value: 슬러그]"로 렌더하므로 로케일과 무관하게 매칭된다.
function loadTriggers(rel: string, pluginId: string) {
  const url = new URL(`../../../plugins/_official/examples/${rel}/open-design.json`, import.meta.url);
  const manifest = PluginManifestSchema.parse(JSON.parse(fs.readFileSync(url, 'utf8')));
  return { pluginId, triggers: manifest.od?.routing?.triggers ?? [] };
}

describe('bodoc-router form ↔ trigger invariant', () => {
  const skillUrl = new URL('../../../plugins/_official/examples/bodoc-router/SKILL.md', import.meta.url);
  const skillMd = fs.readFileSync(skillUrl, 'utf8');
  const formBody = skillMd.match(/<question-form[^>]*>\s*([\s\S]*?)\s*<\/question-form>/)?.[1];
  const form = JSON.parse(formBody ?? 'null') as {
    questions: Array<{ id: string; options?: Array<{ label: string; value: string }> }>;
  } | null;

  const candidates = [
    loadTriggers('naver-blog', 'example-naver-blog'),
    loadTriggers('braze-iam', 'example-braze-iam'),
  ];
  // 라우팅 대상 옵션 value → 기대 플러그인. general-design은 fallbackRoute 대상이라 제외.
  const EXPECTED: Record<string, string> = {
    'naver-blog': 'example-naver-blog',
    'braze-iam': 'example-braze-iam',
  };

  it('has a parseable route question with labeled+valued options', () => {
    expect(form).not.toBeNull();
    const route = form!.questions.find((q) => q.id === 'route');
    expect(route?.options?.length).toBeGreaterThanOrEqual(3);
  });

  it('every routed option resolves to exactly its target vertical via the rendered answer line', () => {
    const route = form!.questions.find((q) => q.id === 'route')!;
    for (const option of route.options ?? []) {
      const expected = EXPECTED[option.value];
      if (!expected) continue; // general-design 등 fallbackRoute 대상
      // formatFormAnswers 렌더 형태 재현: "- <label>: <label> [value: <value>]"
      const answerLine = `[form answers — bodoc-route]\n- 무엇을 만들까요?: ${option.label} [value: ${option.value}]`;
      expect(matchPluginByTriggers(answerLine, candidates)).toEqual({ kind: 'match', pluginId: expected });
    }
  });
});
