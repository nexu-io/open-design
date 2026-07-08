<!--
Role: Marketing AX 포크 전체 로드맵 + 진행상태 단일 진실원(tracked).
Key Features: 4단계(P0~P3) 상태표, 핵심 산출물 5종 상태표, 다음 작업 가이드
Dependencies: docs/superpowers/specs/2026-06-22-marketing-ax-product-design.md (제품 비전 스펙, gitignored)
Notes: 상태 컬럼은 작업 진행 시 갱신 — 메이저 트랙 완료/착수마다 이 표 먼저 업데이트
-->

# Marketing AX — 로드맵 & 진행상태

> **단일 진실원**(tracked). 제품 비전 상세 = `docs/superpowers/specs/2026-06-22-marketing-ax-product-design.md`(gitignored).
> **마지막 갱신**: 2026-06-26

**Marketing AX** = `nexu-io/open-design` 포크(Apache-2.0). 로컬 코딩 에이전트(Claude Code / Codex) 기반 **브랜드 마케팅 크리에이티브 데스크톱 앱**. 사용자가 브랜드를 등록하면 에이전트가 그 브랜드의 보이스·가이드·디자인 토큰을 준수해 마케팅 산출물을 생성한다.

3-프로세스 유지: Electron 셸(`apps/desktop`) + Express 데몬(`apps/daemon`) + Next.js 16 웹 SPA(`apps/web`). 단일 마케팅 두뇌 — 브랜드 N개·산출물 5종은 그 안의 데이터.

---

## 4단계 로드맵

| 단계 | 제목 | 내용 | 상태 | 산출물 |
|------|------|------|------|--------|
| **P0** | 리브랜딩 | OD 식별자 전역 정리(`OD_*`/`od://`/`.od`/`__od__`/appId/제품명/URL/npm 스코프) + 빌드·기동 검증 | ✅ **완료** (v5, main 머지·푸시) | `plans/2026-06-24-p0-rebranding-v5.md` |
| **P1** | startChatRun 정리 | god-function + lockstep 3곳 → `shouldRunReview()` 단일 수렴 리팩터. BrainProvider/engine 추출은 YAGNI 폐기. 동작 100% 보존 | ✅ **완료** (정찰: 구조 ~90% 상류 충족 / 잔여 = 명명 헬퍼 추출) | `plans/2026-06-26-p1-shouldrunreview.md` |
| **P2** | 마케팅 도메인 | 브랜드 **다중화**(design-system 확장) + **산출물 5종**(skill+DS+plugin 튜플) + 산출물 선택기 + discovery 분기 | 🟡 **착수** (네이버 블로그 슬라이스 스펙 작성·리뷰 대기) | `specs/2026-06-26-naver-blog-deliverable-design.md` |
| **P3** | 커스텀 검수 | 파이프라인 엔진 위 **사용자 검수단계 편집 UI**. 디자인 배심원/Theater 제거. = **핵심 차별점** | ❌ **미설계** (spec/plan 0건) | — |

---

## 핵심 산출물 5종 (P2 범위)

| # | 산출물 | 상태 | 비고 |
|---|--------|------|------|
| 1 | 크리에이티브 기획 (캠페인/메시징 방향) | ❌ 미설계 | |
| 2 | 블로그 게시물 (본문 카피 + 스타일드 HTML) | 🟡 설계 스펙 작성(리뷰 대기) | **네이버 블로그** Path A 경량 슬라이스. 이미지 X·글만. `specs/2026-06-26-naver-blog-deliverable-design.md` |
| 3 | SNS 콘텐츠 (채널별 카피 + 비주얼 카드 HTML) | ❌ 미설계 | **인스타 카드뉴스** 등 — 한국 채널 스킬 없음 |
| 4 | 랜딩페이지 (HTML/CSS 프로토타입) | ❌ 미설계 | |
| 5 | **Braze HTML In-app message** | ✅ **완료** | P2 전체설계 없이 단발 구현 |

> ⚠️ 현재 `skills/`·`design-templates/`의 `blog-post`·`card-xiaohongshu`·`social-x-post-card` 등은 **상류 OD 템플릿**(샤오홍슈=중국). 네이버/인스타 한국 채널 스킬은 **없음**.

### Braze IAM 검증된 패턴 (복제 기준)
칩 진입 → 도메인 인터뷰 폼 → produce(LLM 런) → brief.md 저장(디자인 파일) → 카드 배지. 2번째 산출물 슬라이스 시 이 체인 복제.

---

## 완료 부수 트랙

- **bodoc 디자인시스템 포팅** (`brands/bodoc/`, 스킨 DS는 `design-systems/bodoc-iam/`) — brand-blind IAM 수정. DESIGN.md prose-only. (Braze IAM 종속)

---

## 다음 작업

**다음 메이저 = P2 마케팅 도메인.** 제품 스펙이 "2번째 버티컬 등장 시" 추상화 결정을 미뤄둠(YAGNI) → 2번째 산출물(네이버 블로그 / 인스타 카드뉴스) 슬라이스가 그 트리거.

착수 옵션:
- **A** — P2 전체 spec 작성 (브랜드 다중화 + 5종 아키텍처 + 산출물 선택기). 큰 설계 선행.
- **B** (권장) — 산출물 1종 슬라이스 (인스타 카드뉴스 or 네이버 블로그). Braze IAM 패턴 복제로 빠르게 2번째 버티컬 세우고, 그 시점에 P2 추상화 결정.
- ~~**C** — P1 리팩터 먼저~~ (✅ 2026-06-26 완료 — `shouldRunReview()` 명명 헬퍼 추출).

---

## 미완 백로그 (저우선·별도 결정)

- **Braze 후속**: ProjectTag 컴포넌트 dedup · kanban 뷰 배지 미적용 · 기존 Braze 2건 stale("Prototype")
- **리브랜드 후속**: landing 패키지명(`@open-design/landing-page`)·`OD_LANDING_*` env 리네임 · blog/tutorial 본문 브랜드(~1987 mention) · RUNTIME_DATA_DIR escape 리팩터(아키텍처 부채) · 데스크톱 패키지 아이콘 실빌드 검증
