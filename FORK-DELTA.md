# Fork Delta — OD → Marketing AX (추가/제거/변경 요약)

> **목적**: 현재 Open Design(OD) 베이스에서 **Marketing AX** 포크가 무엇을 **제거(REMOVE)/변경(RENAME)/확장(EXTEND)/신규(BUILD NEW)/재사용(REUSE)** 하는지 한눈에 정리.
> **근거 문서**: `FORK-GUIDE.md`(재사용·리브랜딩 인벤토리), `docs/superpowers/specs/2026-06-22-marketing-ax-product-design.md`(제품 스펙), `ARCHITECTURE.md`, `ENGINE-BRAIN-SEAM.md`.
> 작성 기준: 0.10.0 / 2026-06-22. 라인 번호는 버전에 따라 이동 가능 — 수정 전 파일 직접 확인.

## 0. 큰 그림

OD가 새 앱과 **같은 도메인**(로컬 에이전트 + 생성 + 브랜드/디자인시스템)이라 대부분 **교체가 아니라 확장**이다. 데몬·웹·contracts 골격 유지. "제거"는 주로 **OD 식별자**와 **OD 운영 인프라**에 국한, 코드 엔진은 거의 안 버린다.

---

## 1. 🔴 제거 (REMOVE)

| 대상 | 이유 |
|------|------|
| **OD 상표·식별자 전부** | Apache-2.0 §6 — "Open Design" 이름/마크 사용권 없음. 제품명·번들ID·URL 제거 의무 |
| **OD 배포·마케팅 인프라** | `releases.open-design.ai`, `open-design-marketplace.json`, 마켓플레이스 repo — 운영 안 함(자체 채널 재지정 또는 단순화) |
| **마케팅 무관 스킬/플러그인/디자인시스템** | 카탈로그 정리(마케팅 스킬만 유지) |
| **OD 업스트림 추적/병합** | 독자 제품, 추적 안 함 |

> 코드 엔진은 거의 안 버림. 제거의 실체는 **식별자 + 운영 인프라**.

---

## 2. 🟡 변경/리네임 (RENAME-THEN-TAKE) — P0 리브랜딩

식별자 전역 치환 (FORK-GUIDE §3 인벤토리):

| 카테고리 | 규모 | 가시성 |
|----------|------|--------|
| npm 스코프 `@open-design/*` → 신규 | 24 package.json + import **1037곳 / 512파일** | 내부(typecheck 강제) |
| env `OD_*` → 신규 접두 | distinct ~202키, 직접 읽기 **~880곳 / 272파일** | 내부 |
| 제품명 "Open Design" → Marketing AX | tools/pack 상수 + web layout | **사용자 가시** |
| `od://` 스킴 / `.od` 데이터디렉터리 / `__od__` 글로벌 / 세션파티션 | 소수 surgical | 내부 |
| appId·번들ID·서명·Windows 레지스트리 | tools/pack 식별자 | **사용자 가시** |
| 하드코딩 URL(updater/marketplace/web) | 도메인 재지정 | **사용자 가시** |
| "Design System" → "Brand" 라벨 | 카피 레벨 | **사용자 가시** |

> ⚠️ ①npm스코프 ②env 는 surgical const 편집이 **아님** — repo-wide 카테고리 치환. 같은 파일 공유 → **순차 치환**(병렬 sed = 충돌). 검증: 카테고리 grep 0 + typecheck.

---

## 3. 🟢 확장 (EXTEND — 위에 얹기)

| 대상 | 추가 내용 | 단계 |
|------|-----------|------|
| **브랜드 모델** | DESIGN.md 9섹션에 **Voice & Tone / Target Audience / Messaging Pillars** 추가 → 코드 변경 없이 프롬프트 자동 주입(`composeSystemPrompt`) | P2 |
| **엔진/두뇌 심** | `engine/`(도메인무관) + `brain/`(도메인) 분리, `BrainProvider` DI(`ctx.brain`). `startChatRun` 수술, lockstep 3곳 → `shouldRunReview()` 단일 수렴 | P1 |
| **마케팅 라우트/atom** | daemon에 추가 | P2 |
| contracts 필드 | `critique`/`design-systems`/`prompts` 스키마에 필드 추가 | P1~P2 |

---

## 4. 🟢 신규 (BUILD NEW)

| 대상 | 핵심 | 단계 |
|------|------|------|
| **진짜 멀티에이전트 검수** (핵심 차별점) | OD critique = 단일 에이전트 5역할 롤플레이. → `review-agent` atom + **2번째 `spawn`** = 실제 별도 reviewer 프로세스. devloop/until/SSE/Theater UI는 재사용 | P3 |
| **사용자 커스터마이징 파이프라인 편집 UI** | 검수단계 추가/재정렬/리뷰어 선택. 데이터모델은 `.passthrough()`로 준비됨, 편집 surface만 신규 | P3 |
| **Braze HTML In-app 스킬** | prototype 모드 신규 스킬 + Braze 제약 템플릿 | P2 |
| **순수 텍스트(카피) 모드** | `text`/`markdown` project kind + 렌더러 | P2 |

---

## 5. ♻️ 재사용 (REUSE — 그대로)

- **HTML→iframe 파이프라인** — 랜딩/블로그/SNS카드/Braze 전부 (`renderer-registry`→`srcdoc`→`FileViewer`)
- **검수 엔진 골격** — devloop 스케줄러(`pipeline.ts`) + until 게이팅(`until.ts`) + 점수판(`scoreboard.ts`) + SSE 이벤트 + Theater UI
- **마케팅 스킬** — `copywriting`, `marketing-psychology`, `ad-creative`, `cinematic-landing-page`, `blog-post`, `social-*-card`
- **Electron 셸 + 제너릭 패키지 6종** — platform / sidecar / diagnostics / download / components / metatool
- **에이전트 CLI 어댑터 22종+** — 신규 어댑터 불필요

---

## 6. 단계 매핑 & 핵심 산출물

| 단계 | 성격 | 의존 |
|------|------|------|
| **P0** 리브랜딩 | 제거 + 변경 (도메인 무관 토대) | — |
| **P1** 엔진/두뇌 심 | 확장 (리팩터, 동작 100% 보존) | P0 |
| **P2** 마케팅 두뇌 | 신규 도메인 (브랜드 + 5종 산출물) | P1 |
| **P3** 멀티에이전트 검수 | 핵심 신규 차별점 | P1, P2 |

**핵심 산출물 5종**: 크리에이티브 기획 / 블로그 / SNS / 랜딩페이지 / Braze HTML In-app.

---

## 7. 스코프 결정 (2026-06-23 확정 — bodoc 정찰 후)

> 오버엔지니어링 후보 3개 → 사용자 결정으로 해소. 근거: bodoc-iam-builder가 헤비 추상화 0으로 작동하는 IAM 전용기를 출시한 실측(`DECISIONS.md` 2026-06-23).

| 후보 | 결정 | 귀결 |
|------|------|------|
| **P1 `BrainProvider` 도메인무관 심** | **폐기** — 단일 마케팅 제품(두뇌 1개, 브랜드 N개는 데이터). 두 번째 버티컬 나올 때까지 YAGNI | P1 = `startChatRun` god-function + lockstep 3곳 → `shouldRunReview()` 수렴 **리팩터만**. `ENGINE-BRAIN-SEAM.md`/P1 BrainProvider 플랜은 obsolete |
| **P0 내부 식별자 리네임** | **전체 리브랜드 채택** — 가시-only(bodoc 방식)는 "껍데기"라 독립 제품 정체성 부족. 스코프/OD_/od:///.od/__od__/appId/PRODUCT_NAME + 자체 updater | P0 플랜 v2(전역 카테고리 순차 치환) 유효 |
| **P3 2번째 spawn** | **보류** — 기존 파이프라인 엔진 위 커스텀 검수 UI 먼저. 품질부족 입증 시 2번째 프로세스 | — |

### 7.1 추가 결정 — 디자인 배심원 제거
- **제거**: OD critique-theater 5인 심사위원(`panel.ts` 롤플레이, `critique/orchestrator.ts`, `scoreboard.ts`, Theater UI, `critique.*` SSE) + bodoc 수동 "디자인 리뷰하기" 단일버튼
- **유지**: 검수 파이프라인 엔진(`pipeline.ts` devloop / `until.ts` 게이팅 / `atoms/registry.ts`) — critique-theater와 분리된 제너릭 substrate
- **신규(P3)**: M-AX 자체 커스텀 검수를 그 엔진 위에 재구축
- **OPEN**: 디자인 배심원이 OD 유일 실(實) 검수 worker였음. 제거+2번째spawn 보류 → 검수 실행 주체(메인 에이전트 self-review 단계 / 경량 atom worker)는 P3 설계 미정

### 7.2 추가 결정 — UI 베이스라인
- M-AX UI는 **bodoc UX 패턴 추종**: 홈 칩 진입, 인터뷰 폼 구동 생성, 카드 컨텍스트메뉴·프로젝트 삭제 UX, 모달 backdrop blur. (단 디자인 배심원/Theater는 §7.1로 제거)
- **비주얼 정체성은 M-AX 고유** — bodoc cyan(`#16c5ff`)/보닥명 아님. 전체 리브랜드(§7 결정)와 일치
