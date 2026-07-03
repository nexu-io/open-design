import { describe, expect, it } from 'vitest';
import {
  FORM_ANSWERS_MARKER,
  matchPluginByTriggers,
  normalizeTriggerText,
} from '../src/plugins/prompt-routing.js';

const CANDIDATES = [
  { pluginId: 'example-naver-blog', triggers: ['네이버 블로그', 'naver blog', '블로그 글'] },
  { pluginId: 'example-braze-iam', triggers: ['braze', '인앱 메시지'] },
  { pluginId: 'no-triggers', triggers: [] },
];

describe('matchPluginByTriggers', () => {
  it('matches a single plugin by substring (case/whitespace-insensitive)', () => {
    expect(matchPluginByTriggers('네이버   블로그 게시물 작성하자', CANDIDATES))
      .toEqual({ kind: 'match', pluginId: 'example-naver-blog' });
    expect(matchPluginByTriggers('Write a NAVER Blog post', CANDIDATES))
      .toEqual({ kind: 'match', pluginId: 'example-naver-blog' });
  });

  it('treats multiple triggers of the SAME plugin as a single match', () => {
    expect(matchPluginByTriggers('네이버 블로그에 블로그 글 올리자', CANDIDATES))
      .toEqual({ kind: 'match', pluginId: 'example-naver-blog' });
  });

  it('returns ambiguous when two distinct plugins match', () => {
    const r = matchPluginByTriggers('네이버 블로그 글을 braze 인앱 메시지로도', CANDIDATES);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') {
      expect(r.pluginIds.sort()).toEqual(['example-braze-iam', 'example-naver-blog']);
    }
  });

  it('returns none for empty prompt, no-trigger candidates, or no hit', () => {
    expect(matchPluginByTriggers('', CANDIDATES)).toEqual({ kind: 'none' });
    expect(matchPluginByTriggers(null, CANDIDATES)).toEqual({ kind: 'none' });
    expect(matchPluginByTriggers('랜딩페이지 만들어줘', CANDIDATES)).toEqual({ kind: 'none' });
  });

  it('normalizes lowercase + whitespace collapse', () => {
    expect(normalizeTriggerText('  Naver \t BLOG  ')).toBe('naver blog');
  });

  it('exports the form-answers marker matching the web format', () => {
    expect(FORM_ANSWERS_MARKER).toBe('[form answers — ');
  });
});
