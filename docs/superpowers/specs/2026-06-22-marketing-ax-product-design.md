# Marketing AX — 제품 스펙 (Product Design Spec)

> **상태**: 승인됨 (제품 방향) — 2026-06-22 / **방향 재확정 2026-06-23** (bodoc 정찰 후, 헤비 추상화 폐기 — `DECISIONS.md` 2026-06-23 참조)
> **제품명**: Marketing AX
> **베이스**: nexu-io/open-design 포크 (Apache-2.0)
> **관련 문서**: `ARCHITECTURE.md`(전체구조) · `FORK-GUIDE.md`(재사용·리브랜딩) · `ENGINE-BRAIN-SEAM.md`(데몬 분리 실행계획)
>
> 이 문서는 **제품 비전·범위·성공기준**을 정의한다. 단계별 상세 구현 플랜은 별도(`docs/superpowers/plans/`).

---

## 1. 제품 개요

**Marketing AX**는 로컬 코딩 에이전트 기반 **브랜드 마케팅 크리에이티브 데스크톱 앱**이다. 사용자가 자신의 브랜드를 등록하면, 로컬에 설치된 코딩 에이전트 CLI(Claude Code / Codex 등)가 그 브랜드의 보이스·가이드·디자인 토큰을 준수하여 마케팅 산출물을 생성한다.

OD(Marketing AX)를 포크한 **독자 제품**이다. OD의 "에이전트 네이티브 디자인 워크스페이스" 인프라를 토대로, 도메인을 디자인 → **브랜드 마케팅 크리에이티브**로 교체·확장한다.

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
- **단일 마케팅 제품** (2026-06-23 확정): 두뇌 1개 = 마케팅. 브랜드 N개·산출물 5종은 그 안의 **데이터**. ~~engine/brain 물리분리 + BrainProvider DI~~ **폐기**(두 번째 버티컬 등장 시 YAGNI). P1은 `startChatRun` god-function + lockstep 3곳을 `shouldRunReview()`로 수렴하는 **리팩터만**.
- **"브랜드" = design-system 메커니즘 확장**: 기존 DESIGN.md 9섹션에 **Voice & Tone / Target Audience / Messaging Pillars** 섹션 추가. 프롬프트 주입 경로(`composeSystemPrompt`) 그대로 재사용. 브랜드는 **사용자 등록 N개**(bodoc식 단일 fork상수 하드와이어가 아님 — 생성 디폴트를 활성 브랜드로 해석).
- **검수 = 기존 파이프라인 엔진 위 커스텀 UI** (2026-06-23 확정): `pipeline.ts` devloop / `until.ts` 게이팅 / `atoms/registry.ts` substrate **재사용**. ~~2번째 spawn 별도 reviewer~~ **보류**(품질부족 입증 시). **OD 디자인 배심원(critique-theater 5역할 롤플레이·Theater UI·`critique.*` SSE) 제거** — M-AX 자체 검수를 엔진 위에 재구축.

### 2.1 설계 원칙
1. 단일 두뇌이므로 도메인무관 인터페이스를 미리 짓지 않는다. `startChatRun` 정리는 **god-function 가독성/lockstep 버그 제거** 목적이지 추상화 목적이 아니다.
2. 브랜드/산출물 추가는 가능한 한 **콘텐츠(design-system 폴더 + skill + plugin manifest)**로 풀고, 소스 수정이 필요한 지점(discovery 질문셋·검수 룰 등 "층 B")은 manifest/DS 필드로 외부화를 우선 검토한다.
3. 검수 커스터마이징은 파이프라인 스키마(`.passthrough()`)에 사용자 단계 조립 UI를 얹어 푼다. 검수 **실행 주체**(메인 에이전트 self-review 단계 / 경량 atom worker)는 P3 설계에서 결정(OPEN).

### 2.2 UI 베이스라인 (2026-06-23)
- M-AX UI는 **bodoc UX 패턴 추종**: 홈 칩 진입 → 인터뷰 폼 구동 생성 → iframe 프리뷰. 카드 컨텍스트메뉴·프로젝트/템플릿 삭제 UX, 모달 backdrop blur 등 bodoc 잡 UX 채택.
- **단 디자인 배심원/Theater는 제거**(§2 검수). bodoc 수동 "디자인 리뷰하기" 단일버튼도 채택 안 함.
- **비주얼 정체성은 M-AX 고유** — bodoc cyan(`#16c5ff`)·보닥명 아님. 전체 식별자 리브랜드(P0)와 일치.

---

## 3. 작업 분해 (4단계)

각 단계는 독립적으로 spec → plan → 구현 사이클을 갖는다. 본 제품 스펙은 전체를 정의하고, **P0~P1만 상세 플랜을 우선 작성**한다.

| 단계 | 제목 | 내용 | 성격 | 의존 |
|------|------|------|------|------|
| **P0** | 리브랜딩 | OD 식별자 **전체** 정리(`OD_*`/`od://`/`.od`/`__od__`/appId/제품명/URL), npm 스코프, 자체 updater·도메인, 빌드·기동 검증 | 토대, 도메인 무관 | — |
| **P1** | startChatRun 정리 | `startChatRun` god-function + lockstep 3곳 → `shouldRunReview()` 수렴 **리팩터만** (BrainProvider/engine 추출 폐기), 동작 100% 보존 | 경량 리팩터 | P0 |
| **P2** | 마케팅 도메인 | 브랜드 **다중화**(design-system 확장, 사용자 N개) + 5종 산출물 `(skill+DS+plugin)` 튜플 + 산출물 선택기 + discovery 분기 | 신규 도메인 | P1 |
| **P3** | 커스텀 검수 | 디자인 배심원 **제거** + 파이프라인 엔진 위 사용자 검수단계 편집 UI (2번째 spawn 보류) | 핵심 차별점, 신규 | P1, P2 |

### 3.1 P0 리브랜딩 (요약)
- 식별자 find-and-replace **전역** (`FORK-GUIDE §3` 인벤토리, P0 플랜 v2): npm 스코프 `@open-design/*`(import 1037곳/512파일) + 루트 name → `OD_*` env(distinct ~202키, `process.env.OD_*` 직접읽기 ~880곳) → `od://`·`.od`·`__od__`·세션파티션 → appId/제품명/서명 → 하드코딩 URL(updater/marketplace/web) + 자체 도메인. **카테고리 전역·순차 치환**(surgical const 아님).
- 검증: `pnpm guard` + `pnpm typecheck` 그린, `pnpm tools-dev run web`로 리브랜딩된 앱 정상 기동.

### 3.2 P1 startChatRun 정리 (요약 — 경량화, BrainProvider 폐기)
- ~~`BrainProvider` 인터페이스 / `engine/brain` 디렉터리 이동~~ **폐기** (단일 두뇌, `ENGINE-BRAIN-SEAM.md` obsolete).
- **핵심 리팩터**: `startChatRun`(server.ts:8123~)의 prompt-builder closure를 명명 헬퍼로 추출(가독성), lockstep 3곳(7925/7984/9995) → `shouldRunReview()` **단일 수렴**(검수 라우팅 버그 구조 제거). 도메인무관 인터페이스·DI는 만들지 않음.
- 목적은 **god-function 가독성 + lockstep 버그 제거**이지 추상화가 아님. 동작 100% 보존.
- 검증: `pnpm typecheck` + `guard`(`checkWebImportIsolation`) + e2e(`real-daemon-run`) 그린, 동작 회귀 없음.

---

## 4. 성공 기준 (제품 레벨)

- [ ] 사용자가 브랜드 **N개** 등록(보이스·팔레트·가이드 포함) → 5종 산출물 각각 1개 이상 생성 가능
- [ ] 브랜드 컨텍스트가 모든 산출물 생성 시 에이전트 프롬프트에 주입됨 (활성 브랜드 기준)
- [ ] 검수 단계를 사용자가 파이프라인에 **추가/제거/재정렬** 가능, 점수·반려가 생성 루프에 반영됨 (디자인 배심원 제거 — M-AX 자체 검수)
- [ ] OD 상표·식별자 **전체** 제거(`FORK-GUIDE §3` 전 항목, 내부 식별자 포함)
- [ ] `pnpm guard` + `pnpm typecheck` + 핵심 e2e 그린
- [ ] 데스크톱 빌드(`pnpm tools-pack`) 산출물이 새 브랜드 식별자로 생성

---

## 5. 범위 밖 (YAGNI / 명시적 제외)

- **engine/brain 물리분리 + BrainProvider DI** — 단일 마케팅 제품, 두 번째 버티컬 등장 시까지 폐기(YAGNI)
- **2번째 spawn 별도 reviewer 프로세스** — 기존 파이프라인 엔진 위 커스텀 검수로 우선, 품질부족 입증 시 재검토
- **OD 디자인 배심원(critique-theater 5역할) 유지** — 제거 대상, M-AX 자체 검수로 대체
- **클라우드 협업 / 멀티유저 / 실시간 동기화** — 로컬 우선 유지
- **OD 업스트림 병합** — 독자 제품, 추적 안 함. bodoc 커밋도 코드 출처 아님(레퍼런스만)
- **OD 마케팅/배포 인프라**(releases.open-design.ai, 마켓플레이스 등) 운영 — 자체 채널 재지정 또는 단순화(별도 단계)
- **새 에이전트 CLI 어댑터 추가** — 기존 22종+ 탐지 재사용으로 충분

---

## 6. 주요 리스크

| 리스크 | 영향 | 완화 |
|--------|------|------|
| `startChatRun` god-function 리팩터(P1) | 회귀 위험 높음 | 동작 100% 보존, e2e 게이트. 추상화 안 하므로 표면 축소 |
| lockstep 3곳 동기화 깨짐 | 검수 라우팅 오류 | `shouldRunReview()` 단일 수렴으로 구조적 제거 |
| `OD_*` env ~880곳 + 스코프 1037곳 전역 치환 누락(P0) | 런타임/컴파일 실패 | 카테고리 grep 0 + typecheck 게이트, 순차 치환, 기동 검증 |
| 디자인 배심원 제거 후 검수 공백(P3) | 검수 실행 주체 부재 | P3 설계에서 메커니즘 확정(메인 self-review 단계 / 경량 atom worker). 파이프라인 엔진은 유지 |
| 층 B(discovery·검수룰) 외부화 난이도(P2) | 매번 소스수정 잔존 | `manifest.schema.ts` 확장성 선검토, 불가 시 최소 소스 seam만 |

---

## 7. 다음 단계

1. (완료) 제품 스펙 방향 재확정 — 단일제품·전체리브랜드·커스텀검수·디자인배심원제거 (`DECISIONS.md` 2026-06-23)
2. **P2 "층 B → 콘텐츠화" 정찰** — discovery 질문셋·검수룰을 manifest/DS 필드로 외부화 가능한지(`manifest.schema.ts` 확장성). 일반화 난이도 확정.
3. `writing-plans` 스킬로 **P1 경량 플랜 재작성**(BrainProvider 폐기 반영) + **P2 플랜** 작성 → `docs/superpowers/plans/`
4. P0(플랜 v2)부터 단계별 구현 (검증 게이트 통과 후 다음 단계)
