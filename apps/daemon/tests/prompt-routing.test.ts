import { describe, expect, it } from 'vitest';
import {
  resolveRoutedPluginId,
  resolveRouterRematchPluginId,
} from '../src/plugins/prompt-routing.js';

const INSTALLED = [
  { id: 'example-naver-blog', manifest: { od: { routing: { triggers: ['네이버 블로그', '블로그 글'] } } } },
  { id: 'example-braze-iam', manifest: { od: { routing: { triggers: ['braze', '인앱 메시지'] } } } },
  { id: 'example-bodoc-router', manifest: { od: { routing: { router: true, fallbackRoute: 'od-default' } } } },
  { id: 'od-default', manifest: { od: {} } },
  { id: 'od-new-generation', manifest: { od: {} } },
  { id: 'example-simple-deck', manifest: { od: {} } },
];

const FREEFORM = { sessionMode: 'design', metadata: { kind: 'other' } } as const;

describe('resolveRoutedPluginId — 우선순위 ②③④ + 게이트', () => {
  it('② single trigger match routes straight to the vertical', () => {
    expect(resolveRoutedPluginId({
      ...FREEFORM, prompt: '네이버 블로그 게시물 작성하자',
      installed: INSTALLED, defaultRouterPluginId: null,
    })).toBe('example-naver-blog');
  });

  it('③ ambiguous → configured default router', () => {
    expect(resolveRoutedPluginId({
      ...FREEFORM, prompt: '네이버 블로그 글을 braze로도',
      installed: INSTALLED, defaultRouterPluginId: 'example-bodoc-router',
    })).toBe('example-bodoc-router');
  });

  it('③ none + unset router → od-default', () => {
    expect(resolveRoutedPluginId({
      ...FREEFORM, prompt: '랜딩페이지 하나',
      installed: INSTALLED, defaultRouterPluginId: null,
    })).toBe('od-default');
  });

  it('③ configured router not installed → warn path falls back to od-default', () => {
    expect(resolveRoutedPluginId({
      ...FREEFORM, prompt: '랜딩페이지 하나',
      installed: INSTALLED, defaultRouterPluginId: 'ghost-router',
    })).toBe('od-default');
  });

  it('③ configured router가 non-router 플러그인이면 무시하고 od-default (misconfig guard)', () => {
    // od config set defaultRouterPluginId는 무검증 generic setter — 버티컬을 잘못 지정해도
    // 모든 모호/무매칭 프롬프트가 그 버티컬로 새면 안 된다 (스펙 §9: invalid config 무시).
    expect(resolveRoutedPluginId({
      ...FREEFORM, prompt: '랜딩페이지 하나',
      installed: INSTALLED, defaultRouterPluginId: 'example-naver-blog',
    })).toBe('od-default');
  });

  it('③ 라우터 미설정 + od-default 미설치 → ④ kind 폴백 (triple-fallback 완주)', () => {
    const withoutDefault = INSTALLED.filter((record) => record.id !== 'od-default');
    expect(resolveRoutedPluginId({
      ...FREEFORM, prompt: '랜딩페이지 하나',
      installed: withoutDefault, defaultRouterPluginId: null,
    })).toBe('od-new-generation');
  });

  it('게이트: kind가 other가 아니면 트리거 무시하고 ④ kind 폴백', () => {
    expect(resolveRoutedPluginId({
      sessionMode: 'design', metadata: { kind: 'deck' },
      prompt: '네이버 블로그 얘기가 나오는 deck',
      installed: INSTALLED, defaultRouterPluginId: 'example-bodoc-router',
    })).toBe('example-simple-deck');
  });

  it('게이트: live-artifact intent / 비design 모드는 ④로', () => {
    expect(resolveRoutedPluginId({
      sessionMode: 'design', metadata: { kind: 'other', intent: 'live-artifact' },
      prompt: '네이버 블로그', installed: INSTALLED, defaultRouterPluginId: null,
    })).toBe('example-live-artifact');
    expect(resolveRoutedPluginId({
      sessionMode: 'agent', metadata: { kind: 'other' },
      prompt: '네이버 블로그', installed: INSTALLED, defaultRouterPluginId: null,
    })).toBe('od-new-generation');
  });

  it('빈 프롬프트(첨부만)의 자유입력은 라우터 폴백으로 — od-default 현행 UX 보존', () => {
    expect(resolveRoutedPluginId({
      ...FREEFORM, prompt: '', installed: INSTALLED, defaultRouterPluginId: null,
    })).toBe('od-default');
    expect(resolveRoutedPluginId({
      ...FREEFORM, prompt: null, installed: INSTALLED, defaultRouterPluginId: 'example-bodoc-router',
    })).toBe('example-bodoc-router');
  });
});

describe('resolveRouterRematchPluginId — 스펙 4.2', () => {
  const FORM_ANSWER = '[form answers — bodoc-route]\n- 무엇을 만들까요?: 네이버 블로그 글 [value: naver-blog]';

  it('router pin + form answer matching one vertical → that vertical', () => {
    expect(resolveRouterRematchPluginId({
      currentPrompt: FORM_ANSWER, pinnedPluginId: 'example-bodoc-router', installed: INSTALLED,
    })).toBe('example-naver-blog');
  });

  it('non-router pin → never re-matches', () => {
    expect(resolveRouterRematchPluginId({
      currentPrompt: FORM_ANSWER, pinnedPluginId: 'example-naver-blog', installed: INSTALLED,
    })).toBeNull();
  });

  it('typed (non-form) message: match switches, none keeps the router', () => {
    expect(resolveRouterRematchPluginId({
      currentPrompt: '네이버 블로그로 부탁해', pinnedPluginId: 'example-bodoc-router', installed: INSTALLED,
    })).toBe('example-naver-blog');
    // 원래의 모호/무매칭 프롬프트 재도착 — 라우터 유지 (fallbackRoute로 새면 폼이 안 뜸)
    expect(resolveRouterRematchPluginId({
      currentPrompt: '랜딩페이지 하나', pinnedPluginId: 'example-bodoc-router', installed: INSTALLED,
    })).toBeNull();
  });

  it('form answer with no trigger hit → fallbackRoute (never re-pin the router)', () => {
    expect(resolveRouterRematchPluginId({
      currentPrompt: '[form answers — bodoc-route]\n- 무엇을 만들까요?: 일반 디자인 작업 [value: general-design]',
      pinnedPluginId: 'example-bodoc-router', installed: INSTALLED,
    })).toBe('od-default');
  });

  it('form answer ambiguous → fallbackRoute (스펙 M2)', () => {
    expect(resolveRouterRematchPluginId({
      currentPrompt: '[form answers — bodoc-route]\n- 무엇을 만들까요?: 네이버 블로그 글과 braze 인앱 메시지',
      pinnedPluginId: 'example-bodoc-router', installed: INSTALLED,
    })).toBe('od-default');
  });

  it('fallbackRoute pointing at a router or missing plugin → null (loop guard)', () => {
    const loopy = [
      { id: 'router-a', manifest: { od: { routing: { router: true, fallbackRoute: 'router-b' } } } },
      { id: 'router-b', manifest: { od: { routing: { router: true } } } },
    ];
    expect(resolveRouterRematchPluginId({
      currentPrompt: '[form answers — x]\n- r: 아무거나', pinnedPluginId: 'router-a', installed: loopy,
    })).toBeNull();
  });
});
