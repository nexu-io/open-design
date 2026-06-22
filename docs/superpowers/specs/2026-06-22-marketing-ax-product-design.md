# Marketing AX — 제품 스펙 (Product Design Spec)

> **상태**: 승인됨 (제품 방향) — 2026-06-22
> **제품명**: Marketing AX
> **베이스**: nexu-io/open-design 포크 (Apache-2.0)
> **관련 문서**: `ARCHITECTURE.md`(전체구조) · `FORK-GUIDE.md`(재사용·리브랜딩) · `ENGINE-BRAIN-SEAM.md`(데몬 분리 실행계획)
>
> 이 문서는 **제품 비전·범위·성공기준**을 정의한다. 단계별 상세 구현 플랜은 별도(`docs/superpowers/plans/`).

---

## 1. 제품 개요

**Marketing AX**는 로컬 코딩 에이전트 기반 **브랜드 마케팅 크리에이티브 데스크톱 앱**이다. 사용자가 자신의 브랜드를 등록하면, 로컬에 설치된 코딩 에이전트 CLI(Claude Code / Codex 등)가 그 브랜드의 보이스·가이드·디자인 토큰을 준수하여 마케팅 산출물을 생성한다.

OD(Open Design)를 포크한 **독자 제품**이다. OD의 "에이전트 네이티브 디자인 워크스페이스" 인프라를 토대로, 도메인을 디자인 → **브랜드 마케팅 크리에이티브**로 교체·확장한다.

### 1.1 타깃 사용자
- 브랜드/마케팅 담당자, 콘텐츠 제작자, 에이전시 — 자신의 브랜드 자산을 일관되게 유지하며 다양한 마케팅 산출물을 빠르게 만들고 싶은 사람.

### 1.2 핵심 산출물 5종
1. **크리에이티브 기획** — 캠페인/콘텐츠 아이디어, 메시징 방향
2. **블로그 게시물** — 본문 카피 + 스타일드 HTML
3. **SNS 콘텐츠** — 채널별 카피 + 비주얼 카드(HTML)
4. **랜딩페이지** — HTML/CSS 프로토타입
5. **Braze HTML In-app message** — Braze 제약을 만족하는 HTML

### 1.3 핵심 차별점
메인 에이전트 단독 생성이 아니라, **사용자가 커스터마이징하는 리뷰/검수 서브에이전트 파이프라인**. 사용자가 "어떤 검수자를(브랜드 적합성·톤·법무·사실성 등) 어떤 순서로" 파이프라인에 조립하고, 메인 에이전트의 산출물을 별도 서브에이전트가 검수·반려·재작업 루프를 돌린다.

---

## 2. 아키텍처 (확정)

> 상세 근거: `ARCHITECTURE.md`, `ENGINE-BRAIN-SEAM.md`.

- **3-프로세스 유지**: Electron 셸(`apps/desktop`) + Express 데몬(`apps/daemon`) + Next.js 16 웹 SPA(`apps/web`).
- **데몬 내부 엔진/두뇌 심**: `engine/`(도메인 무관) + `brain/`(도메인) 디렉터리 분리 + `BrainProvider` 의존 역전(`ctx.brain`). 패키지 물리 추출은 **두 번째 두뇌 등장 시까지 보류**(단일 두뇌, YAGNI).
- **"브랜드" = design-system 메커니즘 확장**: 기존 DESIGN.md 9섹션에 **Voice & Tone / Target Audience / Messaging Pillars** 섹션 추가. 프롬프트 주입 경로(`composeSystemPrompt`)는 엔진이라 두뇌만 교체.
- **검수 = 진짜 멀티에이전트**: `review-agent` atom + 2번째 `spawn`. OD의 critique-theater(단일 에이전트 5역할 롤플레이)와 달리 **실제 별도 reviewer 프로세스**. 단 devloop 루프 / `until` 게이팅 / SSE 이벤트 / Theater UI는 **재사용**.

### 2.1 설계 원칙
1. `engine/`은 도메인 용어(brand/marketing/design-system/critique-prompt)를 **import하지 않는다.**
2. `brain/`이 `BrainProvider`를 구현해 엔진에 주입한다.
3. **reviewer는 두뇌의 선언**(`listReviewers()`) — 사용자 커스터마이징 검수는 이 카탈로그를 파이프라인에 조립하는 형태로 풀린다.

---

## 3. 작업 분해 (4단계)

각 단계는 독립적으로 spec → plan → 구현 사이클을 갖는다. 본 제품 스펙은 전체를 정의하고, **P0~P1만 상세 플랜을 우선 작성**한다.

| 단계 | 제목 | 내용 | 성격 | 의존 |
|------|------|------|------|------|
| **P0** | 리브랜딩 | OD 식별자 정리(`OD_*`/`od://`/`.od`/`__od__`/appId/제품명/URL), npm 스코프, 빌드·기동 검증 | 토대, 도메인 무관 | — |
| **P1** | 엔진/두뇌 심 | `BrainProvider` 인터페이스 + `ctx.brain` 배선, `startChatRun` 수술, 기본 두뇌로 **기존 동작 100% 보존** | 리팩터, 핵심 매듭 | P0 |
| **P2** | 마케팅 두뇌 | 브랜드 모델(design-system 확장) + 5종 산출물(블로그/SNS/랜딩/Braze HTML + 텍스트 카피 모드) | 신규 도메인 | P1 |
| **P3** | 멀티에이전트 검수 | `review-agent` atom + 2번째 spawn + 사용자 커스터마이징 파이프라인 편집 UI | 핵심 차별점, 신규 | P1, P2 |

### 3.1 P0 리브랜딩 (요약)
- 식별자 find-and-replace (`FORK-GUIDE §3` 인벤토리): 제품명, npm 스코프 `@open-design/*`, 도메인/URL, appId, `od://` 스킴, `.od` 데이터 디렉터리, 세션 파티션, `__od__` 글로벌, `OD_*` env(~130, const 테이블 통해).
- 검증: `pnpm guard` + `pnpm typecheck` 그린, `pnpm tools-dev run web`로 리브랜딩된 앱 정상 기동.

### 3.2 P1 엔진/두뇌 심 (요약)
- `engine/brain/provider.ts` 인터페이스(§ENGINE-BRAIN-SEAM §3): `resolveSystemPrompt`, `shouldRunReview`, `getReviewConfig`, `registerAtoms`, `listReviewers`, `listOutputModes`.
- `server-context.ts`에 `brain` 추가, `route-context-contract.ts` 확장.
- `brain/default-design-brain.ts`로 기존 design-system 동작 그대로 래핑(동작 보존 검증).
- **핵심 수술**: `startChatRun`(server.ts:8123~)의 prompt-builder closure → `ctx.brain.resolveSystemPrompt()` 추출, lockstep 3곳(7925/7984/9995) → `shouldRunReview()` 단일 수렴, 상단 static 도메인 import 제거.
- 디렉터리 이동: `prompts/*`, `panel.ts`, `design-systems*.ts`, `plugins/atoms.ts`, 도메인 라우트 → `brain/`.
- 검증: `pnpm typecheck` + `guard`(특히 `checkWebImportIsolation`) + e2e(`real-daemon-run`, `critique-theater`) 그린, 동작 회귀 없음.

---

## 4. 성공 기준 (제품 레벨)

- [ ] 사용자가 브랜드 1개 등록(보이스·팔레트·가이드 포함) → 5종 산출물 각각 1개 이상 생성 가능
- [ ] 브랜드 컨텍스트가 모든 산출물 생성 시 에이전트 프롬프트에 주입됨
- [ ] 검수 서브에이전트를 사용자가 파이프라인에 **추가/제거/재정렬** 가능, 실제 별도 프로세스로 실행되어 점수·반려가 생성 루프에 반영됨
- [ ] OD 상표·식별자 완전 제거(`FORK-GUIDE §3` 전 항목)
- [ ] `pnpm guard` + `pnpm typecheck` + 핵심 e2e 그린
- [ ] 데스크톱 빌드(`pnpm tools-pack`) 산출물이 새 브랜드 식별자로 생성

---

## 5. 범위 밖 (YAGNI / 명시적 제외)

- **멀티 두뇌 플랫폼화** (`packages/engine` 물리 추출) — 두 번째 두뇌 등장 시까지 보류
- **클라우드 협업 / 멀티유저 / 실시간 동기화** — 로컬 우선 유지
- **OD 업스트림 병합** — 독자 제품, 추적 안 함
- **OD 마케팅/배포 인프라**(releases.open-design.ai, 마켓플레이스 등) 운영 — 자체 채널 재지정 또는 단순화(별도 단계)
- **새 에이전트 CLI 어댑터 추가** — 기존 22종+ 탐지 재사용으로 충분

---

## 6. 주요 리스크

| 리스크 | 영향 | 완화 |
|--------|------|------|
| `startChatRun` god-function 수술(P1) | 회귀 위험 높음 | 기본 두뇌로 동작 100% 보존 단계를 먼저 통과 후 진행, e2e 게이트 |
| lockstep 3곳 동기화 깨짐 | critique 라우팅 오류 | `shouldRunReview()` 단일 수렴으로 구조적 제거 |
| `OD_*` env ~130개 리네임 누락 | 런타임 기동 실패 | const 테이블 중심 리네임 + 전역 sweep + 기동 검증 |
| 멀티에이전트 spawn 리소스/안정성(P3) | 성능·중단 | critique orchestrator 흐름 모방, abort/타임아웃 재사용 |

---

## 7. 다음 단계

1. (현재) 본 제품 스펙 사용자 검토
2. `writing-plans` 스킬로 **P0~P1 상세 구현 플랜** 작성 → `docs/superpowers/plans/`
3. P0부터 단계별 구현 (검증 게이트 통과 후 다음 단계)
