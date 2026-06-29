---
name: naver-blog
description: |
  Naver SmartEditor blog post (HTML) producer — brand-agnostic 7-step
  workflow. Interviews the user, gathers primary sources, drafts a post
  plan, gates confirmation, produces one paste-ready SmartEditor HTML
  article, and self-reviews against channel + brand rules. Works for any
  brand whose DESIGN.md is loaded as the active design system. Use when the
  brief asks for a "네이버 블로그", "naver blog", "블로그 포스팅", "블로그 글",
  or "blog post".
triggers:
  - "네이버 블로그"
  - "naver blog"
  - "블로그 포스팅"
  - "블로그 글"
  - "blog post"
od:
  mode: prototype
  platform: desktop
  scenario: marketing
  craft:
    requires: [naver-blog-html]
  design_system:
    requires: true
    sections: [voice, anti-patterns]
  example_prompt: "정형외과 실비 청구 범위 블로그 글 써줘 — 도수치료 받는 직장인 대상."
---

# naver-blog — 네이버 SmartEditor 블로그 글 제작

브랜드-범용 채널 워크플로. 채널 기술(HTML 13룰·SEO)은 `craft/naver-blog-html.md`,
보험 등 브랜드 사실은 활성 `design-systems/<brand>/DESIGN.md`에서 로드한다.
**브랜드 사실 하드코딩 금지** — 이 스킬은 채널 규약만 안다.

## 7단계

1. **Intake** — 활성 `design-systems/<brand>/DESIGN.md` Read. 보이스·금지어·카테고리·CTA·면책 내부 확인. 요청 원문 기록.
2. **Interview** — `<question-form>` 아티팩트로만 (AskUserQuestion·인라인폼 금지). 축: 주제(필수)·타겟 독자·카테고리(브랜드 DESIGN.md가 정의하면 그 목록)·타겟 키워드(롱테일, 선택)·톤. ※ 썸네일/이미지 질문 없음.
3. **Research(경량)** — WebSearch로 사실·1차 출처 수집. 브랜드 출처 정책 준수(예: 네이버 블로그/카페/지식iN 금지). 라이브 SERP 도구 없음.
4. **Plan/brief + 컨펌 게이트** — 기획(제목+롱테일 키워드 첫15자 배치, 섹션 heading+요지, 타겟 키워드, sources, CTA 매핑, 카테고리)을 마크다운 카드로 제시 → `<question-form>` 컨펌/반려 → 컨펌 시 `brief.md`를 **프로젝트 cwd에 Write**(기본정보/인터뷰결정/기획/출처/SEO).
5. **Produce** — `craft/naver-blog-html.md` + 활성 DESIGN.md Read 후 `<slug>.html`을 **cwd에 Write**. 슬러그 정규식 `[^a-z0-9가-힣]+`(가-힣 보존). 네이버 SmartEditor 페이스트용 HTML.
6. **Self-review** — craft 13 HTML룰 + SEO 5항목 자가채점 + 브랜드 anti-pattern + 팩트체크(본문 수치·기관을 sources와 대조; 1차 매핑 실패 시 정성 완화). 점수 게이트 ≥80 발행 / 60~79 수정 / <60 재기획. P0 발견 시 수정 후 재확인.
7. **Handoff** — 파일 경로 보고 + "네이버 에디터 붙여넣기 후 수동 30초"(Ctrl+A → 나눔고딕 13pt → 헤딩 인용구2) 안내. 발행 후 순위확인은 수동.

> 인터뷰·컨펌은 전부 제네릭 `<question-form>` → Questions 탭 → 다음 user 메시지로 답 회수. 신규 폼 배선 없음.
