# Engine / Brain Seam — 데몬 분리 실행 계획

> **목적**: `apps/daemon`을 **도메인 무관 ENGINE** + **교체 가능 도메인 BRAIN**으로 가르는 구체적 실행 계획. 새 앱(브랜드 마케팅 크리에이티브 워크스페이스)의 두뇌를 깨끗이 얹고, 핵심 요구인 **멀티 에이전트 검수 오케스트레이션**을 엔진 1급 기능으로 만들기 위함.
>
> 기반: 데몬 내부 결합도 실측(2026-06-22). 라인 번호는 0.10.0 기준 — 작업 전 직접 확인.
> 관련: `ARCHITECTURE.md`(전체 구조), `FORK-GUIDE.md`(재사용 매트릭스·리브랜딩).

---

## 0. 확정된 결정

| 결정 | 값 | 영향 |
|------|----|----|
| 업스트림 추적 | **독자 제품 (병합 안 함)** | 데몬 내부 자유 재배치 가능, 머지 충돌 비용 0 |
| 두뇌 개수 | **일단 단일, 나중 개방** | 빅뱅 패키지 추출은 보류(YAGNI) |
| **채택안** | **데몬 내부 `engine/`·`brain/` 디렉터리 심 + `BrainProvider` 인터페이스(의존 역전)** | 같은 패키지·같은 프로세스. 두뇌 2개째 시점에 `packages/engine`로 승격 |

**설계 원칙**
1. `engine/`은 도메인 용어를 **모름** — `design-system`/`brand`/`marketing`/critique 프롬프트를 import 하지 않는다.
2. `brain/`이 `BrainProvider`를 구현해 엔진에 **주입**된다(`ServerContext.brain`).
3. **reviewer는 두뇌의 선언** — 두뇌가 노출하는 reviewer 카탈로그를 사용자가 파이프라인에 조립 → "사용자 커스터마이징 검수" 자연 해결.

---

## 1. 왜 실현 가능한가 — 이미 ~70% 준비됨

실측이 확인한 기존 자산:

- **DI 심이 이미 존재**: `src/server-context.ts:90-130` `ServerContext` — ~40개 capability 슬라이스(`db, design, http, paths, projectStore, conversations, chat, agents, critique, media, deploy, orbit, research, mcp, …`)의 플랫 레코드. 각 route registrar가 `Pick<ServerContext, K>` 슬라이스를 받음. 계약 검증 `assertServerContextSatisfiesRoutes()` at `server.ts:12388`. → **`BrainProvider`가 `ctx.brain`으로 들어갈 정확한 지점.**
- **server.ts는 모놀리식이 아니라 등록 허브**: 12,607줄이지만 하단 1/3(~5096-12458)이 `registerXxxRoutes(app, ctx-slice)` 시퀀스. 구조가 심을 거부하지 않음.
- **critique LOOP/PROMPT 이미 분리**: `critique/orchestrator.ts`가 **`panel.ts`를 import 안 함.** `runOrchestrator({cfg, db, bus, stdout, child})`만 받음. 채점 `computeComposite(scores, cfg.weights)`(`scoreboard.ts:27`)는 역할 무관·가중치 구동. → critique 도메인 교체 = `prompts/panel.ts` + `contracts/critique.ts`(PANELIST_ROLES+weights) **2파일만**. 루프는 무수정.
- **SQLite 모듈러**: 워크스페이스 테이블(`projects/conversations/messages/agent_sessions/tabs/deployments/routines`)은 `db.ts`, 도메인 테이블은 각자 모듈+자체 migration fn(`critique/persistence.ts`, `plugins/persistence.ts`, `media-tasks.ts`). 도메인 FK는 **바깥으로만** 향함(→projects/conversations, ON DELETE CASCADE). `db.ts:migrate()`가 조율(`:350-352`).

---

## 2. engine/ vs brain/ 파일 분류표

### ENGINE (도메인 무관 — 그대로 `engine/`, 로직 무변경)

| 파일 | 상태 | 비고 |
|------|------|------|
| `plugins/pipeline.ts`, `pipeline-runner.ts` | CLEAN | devloop 스케줄러. 도메인 누수 0 |
| `plugins/until.ts` | CLEAN | import 0. 닫힌 어휘 표현 평가기 |
| `plugins/atoms/registry.ts` | CLEAN | 순수 id→handler 맵(`:56-70`) |
| `agents.ts` + `runtimes/*` | mostly CLEAN | spawn/탐지/스트림 파싱 머신. `runtimes/registry.ts`의 24 CLI 정의는 엔진-config로 취급 |
| `critique/orchestrator.ts`, `scoreboard.ts` | CLEAN | 루프/채점, panel.ts 미참조 |
| `critique/run-registry.ts`, `config.ts`, `persistence.ts` | CLEAN | 런 생명주기/abort/env/마이그레이션 |
| `db.ts` 워크스페이스 테이블, `storage/*` | CLEAN | projects/conversations/messages/tabs/... |
| BYOK 프록시 + SSE (`chat-routes.ts:913-1259`, `createSseResponse`) | CLEAN | 도메인 무관 전송 |
| 엔진성 라우트 | CLEAN | `routes/{active-context,host-tools,static-resource,routine,memory,automation}`, `terminal-routes`, `mcp-routes`, `connectors/routes` |

### BRAIN (도메인 특화 — `brain/`로 이동)

| 파일 | 비고 |
|------|------|
| `prompts/system.ts` (83KB) `composeSystemPrompt`(`:508`) | 도메인 프롬프트. `renderPanelPrompt` import(`:38`). 내부에 universal scaffolding 섞임 → 분리는 하위 작업 |
| `prompts/panel.ts` | critique 5역할 프롬프트 + 브랜드 주입 |
| `design-systems.ts` (119KB) | **Express 결합 0인 순수 모듈** — `listDesignSystems/readDesignSystem/createUserDesignSystem/...`. 이동 쉬움 |
| `design-system-import.ts`, `design-system-generation-jobs.ts` | 브랜드 생성 |
| `plugins/atoms.ts` | 23개 도메인 atom id 하드코딩(`:16-41`: design-extract/figma-extract/token-map/...) |
| 도메인 라우트 | `routes/{design-system-tool,genui,vela,deploy,handoff}`, `media-routes`, `routes/plugins/*` |
| `contracts/critique.ts` PANELIST_ROLES + 기본 weights | critique 역할 정의(마케팅 역할로 교체) |

### 경계 파일 (LEAKY — 의존 역전 대상)

| 파일 | 누수 | 처리 |
|------|------|------|
| `plugins/atoms/built-ins.ts` | `../atoms.js`에서 `FIRST_PARTY_ATOMS` import(`:20`) 후 등록(`:31-45`), critique-theater 특수처리 | **카탈로그를 두뇌에서 받기** → `ctx.brain.registerAtoms(registry)` |
| `server.ts` 상단 static 도메인 import | `design-systems.ts`(`:161-167`), `prompts/system.ts`(`:21-26`), `critique/orchestrator.ts`(`:221`), skills | **`ctx.brain.*` 호출로 치환** |
| `db.ts:59-60` | `projects.skill_id` + `projects.design_system_id` 컬럼(도메인 정체성이 워크스페이스 테이블에 누출) | nullable TEXT라 치명적 아님. 일반화하거나 brain 소유 사이드테이블로 이전(선택) |

---

## 3. BrainProvider 인터페이스 초안

엔진이 현재 **인라인으로 호출하는 도메인 훅**을 인터페이스로 승격. `ServerContext.brain`에 추가.

```ts
// engine/brain/provider.ts  (엔진이 소유하는 계약, 구현은 brain/이 제공)
export interface BrainProvider {
  // 1) 시스템 프롬프트 조립 — startChatRun의 prompt-builder closure를 통째로 흡수
  //    (skill body + design-system/brand body·tokens·manifest·fixture + craft + memory + plugin block)
  resolveSystemPrompt(run: RunContext): Promise<string>

  // 2) 검수 게이트 — 현 critiqueShouldRun 도메인 판정을 한 곳으로
  shouldRunReview(run: RunContext): boolean
  getReviewConfig(run: RunContext): ReviewConfig   // weights/thresholds/maxRounds

  // 3) atom 카탈로그 — built-ins.ts가 두뇌에서 받음
  registerAtoms(registry: AtomRegistry): void

  // 4) (신규 요구) reviewer 카탈로그 — 사용자 커스터마이징 검수의 원천
  listReviewers(): ReviewerSpec[]   // { id, label, agentRef, promptRef, weight, gate }

  // 5) 산출물/스킬 메타 — create-tab, 렌더러 선택에 필요한 도메인 정의
  listOutputModes(): OutputModeSpec[]
}
```

- `RunContext` = 엔진이 이미 들고 있는 런 입력(project, conversation, adapter format, surface kind, 선택된 skill/brand id 등)을 묶은 값.
- 엔진은 `BrainProvider` 타입만 알고, **구현(`brain/default-design-brain.ts` 또는 새 `brain/marketing-brain.ts`)은 모른다.**

---

## 4. 가장 비싼 매듭 (예산 정직하게)

> 인터페이스 설계는 쉽다. **시간은 `startChatRun` 수술에서 나간다.**

1. **`startChatRun` god-function** (`server.ts:8123`→~11000). 내부 prompt-builder closure(~`7580-8048`)가 skill·design-system·craft·memory·plugin·`critiqueShouldRun`을 **한 클로저에서 인라인 해결** 후 `composeSystemPrompt`(`:7984`) 호출. 엔진 plumbing(spawn args, adapter, SSE)과 BRAIN 판정이 뒤섞임.
2. **lockstep 3곳** (가장 깨지기 쉬움) — critique 라우팅이 세 지점에서 일치해야 함:
   - 게이트 `server.ts:7925-7929` (`critiqueShouldRun = enabled && brand && skill && !media && plainAdapter`)
   - 프롬프트 addendum `:7984/8015`
   - orchestrator 분기 `:9995`
   → 이 3곳을 `ctx.brain.shouldRunReview()` 하나로 수렴시키는 게 핵심.
3. **`design` god-object** (`server.ts:5307`, `design.runs.finish/fail/start`) — 엔진이지만 startChatRun 10여 곳에서 도메인 로직과 섞여 호출.
4. **`prompts/system.ts` 83KB 모놀리식** — universal(언어/메모리/MCP)과 design-system/critique/brand 블록이 한 compose에. 프롬프트 내부 분리는 별도 하위 작업.

---

## 5. Phase-1 실행 순서 (~10-15 파일)

> 최고 레버리지: **`BrainProvider` 도입 → `startChatRun`의 prompt-builder closure를 `ctx.brain.resolveSystemPrompt`로 추출.** 이 한 번의 역전이 매듭 #1·#2·static import를 동시에 제거.

1. **인터페이스 + 컨텍스트 배선**
   - `engine/brain/provider.ts` 신규(인터페이스, §3)
   - `server-context.ts` — `brain: BrainProvider` 추가
   - `route-context-contract.ts` — 계약 확장
2. **기본 두뇌 구현(현 동작 보존)**
   - `brain/default-design-brain.ts` — 기존 design-system 동작을 그대로 래핑(`resolveSystemPrompt`=현 closure, `shouldRunReview`=현 게이트, `registerAtoms`=현 카탈로그)
   - 검증: 동작 동일(아무것도 안 바뀐 상태로 그린)
3. **god-function 수술(핵심)**
   - `startChatRun`의 prompt-builder closure → `ctx.brain.resolveSystemPrompt()`로 추출
   - lockstep 3곳 → `ctx.brain.shouldRunReview()` 단일 호출로 수렴
   - `server.ts` 상단 static 도메인 import 제거 → `ctx.brain.*`
4. **카탈로그 역전**
   - `plugins/atoms/built-ins.ts` → `ctx.brain.registerAtoms(registry)` (atoms.ts 직접 import 제거)
5. **디렉터리 이동**
   - `prompts/*`, `panel.ts`, `design-systems*.ts`, `plugins/atoms.ts`, 도메인 라우트 → `brain/`
   - 엔진 파일(§2)은 `engine/`로. 루프/pipeline/until/registry/runtimes/BYOK/SSE/DB워크스페이스는 **로직 무변경**

검증 게이트: 각 단계 후 `pnpm typecheck` + `pnpm guard`(특히 `checkWebImportIsolation`) + 핵심 e2e(`real-daemon-run`, `critique-theater`) 그린.

---

## 6. 새 마케팅 두뇌 + 멀티 에이전트 검수 (Phase-2)

심이 서면, 새 앱 요구가 두뇌 교체 + 엔진 확장으로 깔끔히 풀린다.

### 6.1 마케팅 두뇌 (`brain/marketing-brain.ts`)
- `resolveSystemPrompt` — 브랜드(=design-system + Voice/Audience/Messaging 섹션, `FORK-GUIDE §4`) 주입. **주입 경로 자체는 엔진이라 두뇌만 갈아끼움.**
- `listOutputModes` — 랜딩/블로그/SNS카드/Braze HTML(기존 HTML→iframe 재사용) + 텍스트 카피(신규 모드, `FORK-GUIDE §6.3`)
- `registerAtoms` — 마케팅 atom + **`review-agent` atom(신규)**

### 6.2 진짜 멀티 에이전트 검수 (엔진 신규 1급 기능)
- **OD critique = 단일 에이전트 롤플레이**(orchestrator 1 spawn, stdout 1). 진짜 2번째 프로세스 reviewer는 BUILD NEW.
- **구현 seam**: `review-agent` atom의 `AtomWorker.run(ctx)`에서 reviewer CLI를 **2번째 `spawn`**(critique orchestrator 흐름 모방) → 출력 점수 파싱 → `{ signals: {'review.score': n} }` 반환. 스케줄러·until·이벤트·Theater UI가 이미 이 시그널을 처리.
- **사용자 커스터마이징**: 두뇌의 `listReviewers()` 카탈로그를 파이프라인 편집 UI에서 사용자가 조립(추가/재정렬/리뷰어 선택). 파이프라인 스키마는 `.passthrough()`로 준비됨, 편집 surface만 신규(`FORK-GUIDE §5.5`).

→ **만들 것은 "spawn + worker + 편집 UI"지 파이프라인 엔진이 아니다.** 엔진은 Phase-1에서 이미 멀티 에이전트를 1급으로 수용하도록 정리돼 있음.

---

## 7. 요약 — 무엇이 비싸고 무엇이 공짜인가

| 항목 | 비용 |
|------|------|
| `BrainProvider` 인터페이스 + `ctx.brain` 배선 | 낮음 (DI 심 이미 존재) |
| 기본 두뇌로 현 동작 보존 | 낮음 |
| **`startChatRun` 수술 + lockstep 3곳 수렴** | **높음 (여기가 예산의 대부분)** |
| 디렉터리 이동(engine/ brain/) | 낮음-중 (독자 제품이라 머지 걱정 0) |
| critique 도메인 교체 | 낮음 (2파일: panel.ts + critique.ts) |
| 마케팅 두뇌 작성 | 중 (주입 경로 재사용) |
| 진짜 멀티 에이전트 reviewer | 중 (spawn 1 + worker 1) |
| 파이프라인 편집 UI | 중 (데이터 모델 준비됨, surface 신규) |

---

*이 계획은 정적 분석 + 소스 직독 기반이다. Phase-1 착수 전 `server.ts`의 `startChatRun`(8123~)과 lockstep 3곳(7925/7984/9995), `server-context.ts:90-130`을 직접 열어 현 시그니처를 재확인할 것.*
