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
3. **Research(서브에이전트)** — dispatch 도구 있으면 **반드시** 분리: `references/research-subagent.md` Read 후 그 지시대로 리서치 서브에이전트에 위임(입력: 주제·키워드·독자·DESIGN.md 경로·cwd). 서브에이전트가 WebSearch로 1차 출처 수집 → `research.md`를 cwd에 Write → 핵심 사실 ≤10줄만 반환(SERP 덤프는 research.md에 격리). dispatch 불가 런타임은 같은 절차 인라인(산출물 계약 동일). 브랜드 출처 정책 준수(예: 네이버 블로그/카페/지식iN 금지). 라이브 SERP 도구 없음.
4. **Plan/brief + 컨펌 게이트** — 기획(제목+롱테일 키워드 첫15자 배치, 섹션 heading+요지, 타겟 키워드, sources(research.md 참조), CTA 매핑, 카테고리)을 폼 발행 **전에** `plan-v1.md`로 **프로젝트 cwd에 Write**(첫 기획=plan-v1.md, 버전 넘버링) + 같은 내용을 마크다운 카드로 제시 + `<question-form>` 컨펌/반려 폼 발행 → **즉시 턴 종료**(컨펌 답변은 다음 user 메시지로 도착). `plan-v*.md` Write만 컨펌 전 허용 예외 — 컨펌 user 메시지 도착 전에는 `brief.md`·`<slug>.html` Write 및 5단계 진행 **절대 금지**, 리서치 직후 같은 턴에서 관성으로 직행하는 것이 대표 위반. 컨펌 시 `brief.md`를 **프로젝트 cwd에 Write**(기본정보/인터뷰결정/기획/출처/SEO), 반려 시 기획 수정 → 다음 번호로 `plan-v2.md` Write(이전 `plan-v*.md`는 히스토리 — 덮어쓰기·삭제 절대 금지) → 재컨펌 폼 발행 + 즉시 턴 종료(같은 게이트 적용). 컨펌 여부와 무관하게 기획은 항상 `plan-v*.md` 파일로 남는다.
5. **Produce** — `craft/naver-blog-html.md` + 활성 DESIGN.md Read 후 `<slug>.html`을 **cwd에 Write**. 슬러그 정규식 `[^a-z0-9가-힣]+`(가-힣 보존). 네이버 SmartEditor 페이스트용 HTML.
6. **Review(서브에이전트 검수)** — dispatch 도구 있으면 **반드시** 신선한 컨텍스트 검수자에게 위임: `references/review-subagent.md` Read 후 지시대로(검수자가 craft·DESIGN.md·brief.md·research.md·`<slug>.html` 직접 Read). 검수자는 **report-only** — craft 13 HTML룰 + SEO 5항목 + 브랜드 anti-pattern + 팩트체크(research.md 대조) 채점표와 P0/P1 목록만 반환. 수정은 메인이 반영 후 재검수 1회. 게이트 ≥80 발행 / 60~79 수정 / <60 재기획 — 재검수 후에도 <80이면 사용자 보고·판단 위임. dispatch 불가 시 인라인 자가검수(같은 채점표).
7. **Handoff** — 파일 경로 보고 + 안내. 미리보기 툴바 **"네이버용 서식 복사"** 버튼이 나눔고딕 13px·인용구2 제목바·표 서식을 블록별 인라인으로 박아 클립보드에 담으므로 네이버 에디터에 **그대로 붙여넣기만** 하면 된다(수동 Ctrl+A→나눔고딕 13pt 불필요). 리치 복사 미지원 환경 폴백: "붙여넣기 후 수동 30초"(Ctrl+A → 나눔고딕 13pt → 헤딩 인용구2). 발행 후 순위확인은 수동.

> 인터뷰·컨펌은 전부 제네릭 `<question-form>` → Questions 탭 → 다음 user 메시지로 답 회수. 신규 폼 배선 없음.
