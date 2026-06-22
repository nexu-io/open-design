# Fork & Reuse Guide — OD → 브랜드 마케팅 크리에이티브 워크스페이스

> **목적**: 이 포크(`open-design`)를 베이스로 **"로컬 코딩 에이전트 기반 브랜드 마케팅 크리에이티브 데스크톱 앱"**을 만들기 위한 실전 가이드. 무엇을 **그대로 쓰고(REUSE)**, 무엇을 **확장하고(EXTEND)**, 무엇을 **새로 만드는지(BUILD NEW)** 를 파일·심볼·라인 단위로 정리한다.
>
> **새 앱 요구사항**: 사용자가 브랜드를 등록 → 로컬 에이전트가 블로그/SNS 콘텐츠/랜딩페이지/Braze HTML In-app message 등 제작. **핵심 차별점: 메인 에이전트 + 사용자가 커스터마이징 가능한 리뷰/검수 서브에이전트 파이프라인.**
>
> 전체 아키텍처는 같은 폴더 `ARCHITECTURE.md` 참조. 이 문서는 그 위에 "재사용 관점"을 얹는다.
> 작성 기준: 0.10.0 / 2026-06-22. 라인 번호는 버전에 따라 이동 가능 — 수정 전 해당 파일 직접 확인.

---

## 0. 결론 먼저 (TL;DR)

1. **라이선스 Apache-2.0** → 리브랜딩·재배포 자유. LICENSE 유지 + 변경 파일 표시 + "Open Design" 상표 미사용만 지키면 됨.
2. **OD는 새 앱과 같은 도메인**(로컬 에이전트 + 생성 + 브랜드/디자인시스템)이라, 대부분 **교체가 아니라 확장**이다. 데몬·웹·contracts를 버리지 말 것.
3. **"브랜드" = OD의 design-system 메커니즘** → 거의 turnkey. DESIGN.md에 "Voice & Tone / Audience / Messaging" 섹션만 추가하면 코드 변경 없이 프롬프트에 주입됨.
4. **"검수 서브에이전트"의 골격은 전부 존재**(devloop 루프 + until 게이팅 + 점수판 + SSE 이벤트 + Theater UI + 브랜드 주입). 단 **OD의 critique는 단일 에이전트 롤플레이** — 진짜 별도 프로세스 reviewer는 `spawn` 1개 + 커스텀 atom worker 1개를 추가하는 **BUILD NEW**(엔진은 안 만들어도 됨).
5. **마케팅 산출물**: 랜딩/블로그/SNS 카드/Braze HTML은 기존 **HTML→iframe 파이프라인 그대로 재사용**. 순수 텍스트(카피) 출력 모드만 신규.

---

## 1. 라이선스 & 리브랜딩 의무

- **라이선스**: Apache License 2.0 (`LICENSE`, copyright "Open Design contributors"). 영구·취소불가의 복제·수정·서브라이선스·배포 권리.
- **NOTICE 파일 없음** → §4(d) NOTICE 전파 의무 없음.
- **지켜야 할 것 (§4)**: ① LICENSE 사본 유지, ② 수정한 파일에 변경 표시, ③ 기존 저작권/저작자 표시 유지.
- **상표 (§6)**: "Open Design" 이름/마크 사용권은 없음 → 제품명·마크 전부 제거 필요 (아래 §3 리브랜딩 작업과 일치).
- CONTRIBUTING.md / MAINTAINERS.md 에 CLA·반(反)포크 조항 **없음**. (거기서 말하는 "brand"는 제품의 design-system 기능 얘기지 법적 브랜딩 아님.)

**결론**: 법적으로 깨끗. 의무는 기계적(LICENSE 유지 + 변경 표시 + 상표 미사용).

---

## 2. 재사용 매트릭스 (워크스페이스 패키지별)

> 분류: **DROP-IN**(도메인 결합 0, 그대로) / **RENAME-THEN-TAKE**(제너릭 머신이나 OD 식별자 박힘 → 리네임 후) / **EXTEND**(새 앱과 같은 도메인 → 확장 대상, 버리지 말 것)

### 그대로 가져갈 "제너릭 스파인" (DROP-IN, 6 + 셸)

| 패키지 | 근거 |
|--------|------|
| `packages/platform` | `node:*` 만 import. 프로세스/프록시/툴체인/HTTP 프리미티브. 도메인 용어 0 |
| `packages/sidecar` | `node:net/fs/path` 만. JSON-over-UnixSocket/named-pipe IPC. 계약 모양은 디스크립터로 주입 |
| `packages/diagnostics` | `redactJsonValue/collectLogSource/buildDiagnosticsZip`. deps=jszip+node |
| `packages/download` | 재개 가능 다운로드+체크섬+원자적 복사. OD 문자열은 sentinel 파일명 1개뿐 |
| `packages/components` | React 프리미티브(Button/Dialog/Input/Select/Textarea). React+CSS modules |
| `packages/metatool` | 빌드 신선도 해싱. 도메인 0 |
| **`apps/desktop` (Electron 셸)** | **도메인 결합 5줄뿐** (`runtime.ts:431,451-452,1356`, `preload.cts:177` — `skillId/designSystemId`를 IPC로 불투명 전달). contracts·daemon 의존 **없음**. 가리키는 웹 번들을 `od://app/`로 프록시할 뿐 → 사실상 "데몬 백드 웹앱용 제너릭 Electron 호스트" |

→ 이 묶음 = **"Electron 셸 + 로컬 데몬 런처" 제너릭 프레임워크**. 새 앱의 토대.

### 리네임 후 가져갈 머신 (RENAME-THEN-TAKE, 5)

| 패키지 | 박힌 OD 식별자 |
|--------|----------------|
| `packages/sidecar-proto` | `OD_*` env(`:24-36`), `ipcBase:"/tmp/open-design/ipc"`/`windowsPipePrefix:"open-design"`(`:64,67`), `OPEN_DESIGN_PRODUCT_NAME`(`:70`), `--od-stamp-*`(`:45-51`) |
| `packages/launcher-proto` | `--od-launcher-*` 플래그명. 코어 로직 제너릭 |
| `packages/host` | `OPEN_DESIGN_HOST_GLOBAL="__od__"`(`:1`), `OpenDesignHostBridge` 타입. `designSystemId/skillId` 필드 — 리네임+필드 정리 후 재사용 |
| `tools/pack` | Electron 패커(mac DMG/win/linux). **식별자 상수 최다 집결**(appId, productName, signing). 머신은 제너릭 |
| `tools/dev` | 데몬/데스크톱/웹 3종 오케스트레이터(`APP_KEYS`). 제너릭 하네스이나 OD 3앱에 배선 |

### 새 앱과 같은 도메인 → 확장 (EXTEND, 버리지 말 것)

| 패키지 | 새 앱에서의 역할 |
|--------|------------------|
| `apps/daemon` | **도메인 코어 = 그대로 토대.** 에이전트 런, design-system(=브랜드), 플러그인, 미디어, **critique 루프**. 마케팅용 라우트/atom만 추가 |
| `apps/web` | 채팅 UI + 아티팩트 프리뷰 + 피커. 마케팅 create-tab/렌더러만 추가 |
| `packages/contracts` | web↔daemon 공유 스키마. `critique`, `design-systems/token-schema`, `plugins/*`, `prompts/system` — 전부 재사용. 필드 추가 확장 |
| `packages/plugin-runtime` | 플러그인/스킬/디자인시스템 매니페스트 파서. 그대로 |
| `packages/agui-adapter` | OD 이벤트 → AG-UI/CopilotKit. 새 이벤트 추가 시 확장 |
| `packages/registry-protocol` | 플러그인 레지스트리 스키마. 마케팅 플러그인 배포 시 재사용 |

> **중요**: 첫 분석은 비(非)디자인 앱 기준으로 데몬/웹/contracts를 "교체 대상"으로 봤지만, **새 앱이 OD와 동일 도메인이므로 이들은 확장 대상**이다. 새로 쓰지 말고 위에 얹어라.

---

## 3. 리브랜딩 find-and-replace 인벤토리

포크가 반드시 바꿔야 하는 하드코딩 식별자. **`pnpm guard`의 "product-neutrality" 검사는 브랜딩 스크러버가 아니다**(특정 사설 오케스트레이터 이름만 막음, "Open Design"/`OD_`/`od://`는 안 잡음) → 아래 목록이 실제 작업 표면.

| 카테고리 | 위치 |
|----------|------|
| **제품명 "Open Design"** | `tools/pack/src/{mac/constants.ts:1, win/constants.ts:1, linux.ts:37}`, `packages/sidecar-proto/src/index.ts:70`, `apps/web/app/layout.tsx:9`, 채널변형 `tools/pack/src/mac/identity.ts:41` |
| **npm 스코프 `@open-design/*`** | 전 워크스페이스 + 루트 `package.json:2 "name":"open-design"` (~20 패키지) |
| **도메인/URL** | `apps/desktop/src/main/updater.ts:81`(`releases.open-design.ai`), `apps/daemon/src/plugins/marketplaces.ts:79-80`, `apps/web/src/components/HandoffButton.tsx:27`, `runtime/amr-guidance.ts:11`, `EntryShell.tsx:190`, `PrivacyConsentModal.tsx:11`(`github.com/nexu-io/open-design`) |
| **앱 번들 ID** | `tools/pack/src/mac/identity.ts:48-52`(`io.open-design.desktop[.beta/.preview/.nightly]`), `win/identity.ts:42-45`, `linux.ts:542` |
| **프로토콜 스킴 `od://`** | `apps/packaged/src/protocol.ts:3`(`OD_SCHEME="od"`), `:4`(`od://app/`), 등록 `:6-17`, 핸들 `:84` — 모든 렌더러→사이드카 fetch가 통과 |
| **데이터 디렉터리 `.od`** | `.od/projects/<id>`; 예약경로 정규식 `apps/web/src/artifacts/validate.ts:41`; guard skip `scripts/guard.ts:50` |
| **세션 파티션** | `apps/web/src/components/DesignBrowserPanel.tsx:229`, `apps/desktop/src/main/runtime.ts:245`(`persist:open-design-design-browser`) |
| **IPC 글로벌 `__od__`** | `packages/host/src/index.ts:1` |
| **env 접두사 `OD_`** (~130개) | 중앙 정의 테이블: `sidecar-proto/src/index.ts:24-36`, `desktop/.../updater.ts:63-78`, `packaged/src/config.ts:14-19`, `daemon/.../marketplaces.ts`. **const 객체 통해 리네임 + 전역 sweep** |
| **Windows 언인스톨 레지스트리 키** | `sidecar-proto/src/index.ts:76-79`(제품명에서 생성) |
| **마켓플레이스 파일명** | `open-design-marketplace.json` (100+ refs; 플러그인 시스템 유지 시만 관련) |

**리브랜딩 순서 권장**: ① 루트+패키지 `package.json` 스코프 일괄 → ② sidecar-proto const 테이블(env/ipc/제품명) → ③ `od://`·`.od`·`__od__`·세션파티션 → ④ tools/pack 식별자(appId/productName/signing) → ⑤ 하드코딩 URL(updater/marketplace/web).

---

## 4. "브랜드" 기능 = design-system 메커니즘 (REUSE + 소폭 EXTEND)

새 앱의 "사용자가 브랜드 등록"은 OD의 design-system이 **거의 그대로** 충족한다.

### 4.1 동작 방식 (이미 다 있음)

- **생성 UI**: `apps/web/src/components/DesignSystemFlow.tsx` (`SetupState` ~`:180`: company, githubUrls, codeFolders, figFiles, assetFiles, notes) → `createDesignSystemDraft()` → 데몬
- **생성 로직(데몬)**: `apps/daemon/src/{design-systems.ts, design-system-import.ts, design-system-generation-jobs.ts}`
- **온디스크 스키마**: `design-systems/<id>/`
  - `DESIGN.md` (frontmatter + 9섹션: Visual Theme, Color Palette, Typography, Components, Layout, Depth, **Do's/Don'ts**, Responsive, Agent Prompt Guide)
  - `manifest.json` (스키마 `od-design-system-project/v1`, `design-systems/_schema/manifest.schema.ts`)
  - `design-tokens.json`(레이어드 ~56 토큰, `contracts/src/design-systems/token-schema.ts`), `tokens.css`, `tailwind-v4.css`, `components.html`+`components.manifest.json`
- **프롬프트 주입(핵심)**: `packages/contracts/src/prompts/system.ts:347-351` `composeSystemPrompt()` 가 `## Active design system` 섹션으로 DESIGN.md 본문을 "권위 있는 소스"로 삽입. 데몬이 `project.designSystemId || appConfig.defaultDesignSystemId`로 활성 DS 해석(`server.ts`) → DESIGN.md + usageMd + tokensCss + componentsManifest + fixtureHtml 로드해 전달. critique BRAND 패널리스트에도 주입.

### 4.2 마케팅 브랜드로 확장

- **코드 변경 없이 가능**: 주입이 "DESIGN.md 본문 이어붙이기"이므로, DESIGN.md에 **"Voice & Tone", "Target Audience", "Messaging Pillars", "Brand Do/Don't(카피 관점)"** 섹션을 추가하면 자동으로 에이전트 프롬프트에 흐른다.
- **구조적 검증이 필요할 때만 코드 수정**: voice/audience를 **검증된 필드**로 다루려면 `manifest.schema.ts` + frontmatter 테스트(`apps/daemon/tests/design-systems-frontmatter.test.ts`) 수정.
- **UI 라벨**: "Design System" → "Brand"로 리네임(카피 레벨), `DesignSystemFlow` 입력 필드에 브랜드 정보(업종/타깃/톤) 추가.

---

## 5. "검수 서브에이전트 파이프라인" (골격 REUSE + spawn/atom BUILD NEW)

새 앱의 **핵심 차별점**. 가장 중요한 발견: **OD의 멀티 에이전트 비평은 진짜 멀티 프로세스가 아니다.**

### 5.1 파이프라인 엔진 (전부 REUSE)

- **스키마**: `contracts/src/plugins/manifest.ts:73-87`
  - `PipelineStage = { id, atoms: string[], repeat?, until?, onFailure? }` (`.passthrough()` → 커스텀 필드 추가 자유)
  - `atoms`는 **자유 문자열 배열, enum 아님** → 새 atom 추가에 스키마 변경 불필요
- **스케줄러(순수)**: `apps/daemon/src/plugins/pipeline.ts`
  - `runPipeline()`(`:92`) 스테이지 순회
  - `runStageWithDevloop()`(`:100`) = **devloop**: `pipeline_stage_started` emit → caller 제공 `runStage()` 호출 → `stage.until`을 `UntilSignals`로 `evaluateUntil()`(`plugins/until.ts`) 평가 → 만족까지 루프(`OD_MAX_DEVLOOP_ITERATIONS` 기본 10) → 매 iteration SQLite `run_devloop_iterations`에 persist
  - **스케줄러는 stage/atom 종류로 분기하지 않음** — 실행은 **caller 콜백**. `server.ts:8071-8100`이 선택(stub=캔드 시그널 / registry=atom worker registry)
- **라이브 배선**: `plugins/pipeline-runner.ts` `runPipelineForRun()`(`:55`), 호출 `server.ts:8101`

### 5.2 atom 카탈로그 & atom worker (REUSE/EXTEND)

- 카탈로그: `apps/daemon/src/plugins/atoms.ts:17-40` (`FIRST_PARTY_ATOMS`): `discovery-question-form, direction-picker, todo-write, file-read/write/edit, research-search, media-image/video/audio, live-artifact, connector, critique-theater, code-import, design-extract, figma-extract, token-map, rewrite-plan, patch-edit, build-test, diff-review, handoff`
- **주의 — atom 대부분은 권고(advisory)**: `atoms/built-ins.ts:29-47` `registerBuiltInAtomWorkers()`가 `critique-theater` 빼고 **전부 no-op 허용 worker**(`run: () => ({signals:{}})`). 실제 작업은 **에이전트 CLI 안에서** 일어남 — 데몬은 독립 ground truth 없음. 즉 **파이프라인 = 단일 에이전트 런 위에 얹은 수렴/게이팅 스캐폴드**.
- **유일한 실(實) worker = `critique-theater`**(`built-ins.ts:53-79`): `run_devloop_iterations.critique_summary`에서 최신 `score=N` 정규식 파싱 → `critique.score`로 until 루프 구동
- **커스텀 atom 계약**: `apps/daemon/src/plugins/atoms/registry.ts` — `AtomWorker { id, describe?, run(ctx)→{signals?, note?} }`, `registerAtomWorker()`(`:58`). 실제 worker 예시(복사용): `atoms/{build-test,diff-review,patch-edit}.ts`

### 5.3 critique-theater 실체 (= 단일 에이전트 롤플레이)

**별도 reviewer 프로세스가 아니다. 한 CLI 세션이 5인 심사위원을 롤플레이한다.**

- 프롬프트: `apps/daemon/src/prompts/panel.ts:89-93` *"You are running in CRITIQUE THEATER mode. Speak as a five-panelist design jury inside one CLI session."* — DESIGNER/CRITIC/BRAND/A11Y/COPY 5역할이 **한 프롬프트의 섹션**(`:95-127`), 한 모델이 XML 태그로 출력
- 오케스트레이터: `apps/daemon/src/critique/orchestrator.ts` `runOrchestrator()` — **단일 `stdout` AsyncIterable** 소비
- spawn: `server.ts:9823` (**단일** `spawn()`), `server.ts:10094` (`runOrchestrator` 런당 1회). 2번째 프로세스 없음. `streamFormat==='plain'` 어댑터만(`:9980`)
- 루프/채점(데몬측): `scoreboard.ts` `decideRound(composite, mustFix, cfg)` → `composite>=threshold && mustFix===0`이면 `'ship'` 아니면 `'continue'`. 에이전트가 라운드 넘어 self-revise(`maxRounds` 기본 3)
- 브랜드 주입 이미 존재: `panel.ts:21` `brand:{name, design_md}` → `<BRAND_SOURCE>`로 삽입, BRAND 패널리스트가 적합도 채점

### 5.4 이벤트 & UI (REUSE)

- 이벤트: `contracts/src/critique.ts:284-296` `CRITIQUE_SSE_EVENT_NAMES`: `critique.run_started/panelist_open/panelist_dim/panelist_must_fix/panelist_close/round_end/ship/degraded/interrupted/failed/parser_warning`. payload union `PanelEvent`(`:113-124`)
- UI: `apps/web/src/components/Theater/*` (TheaterStage, PanelistLane, ScoreTicker)

### 5.5 새 앱을 위한 구현 계획

| 요구 | 판정 | 작업 |
|------|------|------|
| devloop 루프 + until 게이팅 | **REUSE** | `pipeline.ts`, `until.ts` 그대로 |
| stage=atom 버킷 + worker registry | **REUSE/EXTEND** | `atoms/registry.ts` 패턴으로 커스텀 atom |
| 비평 루프+점수판+SSE+Theater UI | **REUSE** | `critique/*`, `Theater/*`, `contracts/critique.ts` |
| **진짜 별도 reviewer 서브에이전트(2번째 프로세스)** | **BUILD NEW** | `critique/orchestrator.ts` + `server.ts:9823` 본떠 2번째 `spawn` 추가 |
| 메인+리뷰어 멀티 에이전트 | **BUILD NEW** | 현재 단일 에이전트뿐 |
| 사용자 편집 가능 파이프라인 UI | **BUILD NEW** | 스키마는 `.passthrough()`로 준비됨, 편집 surface만 없음 |

**가장 깔끔한 구현 seam**: 새 atom(예: `review-agent`)을 등록하고 그 `AtomWorker.run(ctx)`에서 **reviewer CLI를 `spawn`** → 출력 점수 파싱 → `{ signals: {'review.score': n} }` 반환. 스케줄러·루프·이벤트·UI가 이미 이 시그널을 받아 처리한다. **즉 만들 것은 "spawn + worker 하나"지 파이프라인 엔진이 아니다.**

**사용자 커스터마이징**: 현재 파이프라인은 플러그인 매니페스트(`open-design.json` → `od.pipeline.stages[]`)에 고정, per-project 편집 UI 없음(`Theater/hooks/useCritiqueTheaterEnabled.ts` + SettingsDialog는 on/off 토글만, project metadata에 `critiqueTheaterEnabled` 불리언). → **사용자가 검수 단계를 추가/재정렬/리뷰어 선택하는 UI는 BUILD NEW** (데이터 모델은 `.passthrough()`로 지원됨).

---

## 6. 마케팅 산출물별 매핑

### 6.1 HTML 아티팩트 → iframe (랜딩/Braze/SNS카드 = REUSE)

엔드투엔드 그대로 재사용:
1. 에이전트가 `file-write` atom으로 HTML 작성
2. 매니페스트 `kind:'html', renderer:'html'` (타입 `apps/web/src/artifacts/types.ts:1-21`)
3. `apps/web/src/artifacts/renderer-registry.ts:34-44` `HtmlRenderer.canRender` 선택
4. `apps/web/src/runtime/srcdoc.ts:38-84` `buildSrcdoc()`가 fragment 래핑/full doc 전달, edit/comment/palette 브릿지 주입
5. `apps/web/src/components/FileViewer.tsx` 샌드박스 `<iframe srcDoc>`(`PooledIframe`) 렌더

→ **랜딩페이지 + Braze HTML In-app 둘 다 이 파이프라인으로 충분.** 새 렌더러 불필요.

### 6.2 기존 재사용 가능 스킬 (`skills/`, `plugins/_official/examples/`)

| 용도 | 스킬 | 비고 |
|------|------|------|
| 랜딩페이지 | `cinematic-landing-page`(prototype, React/Vite/Tailwind/GSAP), `web-artifacts-builder`, saas-landing류 | REUSE |
| 블로그 | `blog-post`(prototype, HTML), `article-magazine` | REUSE (HTML 출력) |
| SNS 카드 | `social-x-post-card`, `social-reddit-card`, `social-spotify-card`(prototype, HTML 카드) | REUSE (비주얼) |
| 카피/전략 | `copywriting`, `marketing-psychology`, `ad-creative`(design-system 모드=가이드/LLM 출력) | REUSE |

### 6.3 BUILD NEW

- **Braze HTML In-app message 스킬**: 기존 없음. **가장 쉬운 길** = `prototype` 모드 신규 스킬 + Braze 제약 HTML 템플릿. 에이전트가 `file-write`로 HTML 작성 → live-artifact iframe 렌더(§6.1). 새 렌더러 불필요(Braze in-app = HTML).
- **순수 텍스트(카피) 출력 모드**: 현재 `text`/`markdown` **프로젝트 모드 없음**. 모드 목록(`contracts/src/analytics/events.ts` `TrackingProjectKind`): prototype/live_artifact/slide_deck/template/image/video/hyperframes/audio/design_system/other. markdown은 "HTML 안의 아티팩트"(`markdown-document` kind + `MarkdownRenderer`)로만 존재.
  - 블로그/SNS **카피**(스타일드 HTML 아님)를 1급으로 다루려면: `TrackingProjectKind` + `CreateTab`(`NewProjectPanel.tsx:113`)에 `text`/`markdown` 추가 + renderer-registry에 `TextRenderer`/`MarkdownProjectRenderer` 추가. renderer-registry 패턴이라 작고 독립적.

---

## 7. 프로세스 간 결합도 (재사용 안전성)

- **web↔daemon: 규약 기반 느슨한 결합**. `pnpm guard`의 `checkWebImportIsolation`(`scripts/guard.ts:891`)이 web이 daemon/sidecar 소스 import하는 것을 **금지** → web은 HTTP `/api/*` + `@open-design/contracts` 타입으로만 통신. (단 생성된 RPC 클라이언트는 아니고, 실제 호출은 `fetch('/api/...')` 문자열 경로. contracts는 타입/스키마만, web에서 192× import.)
- **desktop 셸: 깨끗하게 재사용 가능**. 제너릭 패키지만 의존, daemon/contracts 의존 0. config/env로 파라미터화(사이드카 경로, 웹 dist, 업데이트 URL). 바꿀 식별자만: `od://` 스킴, `__od__`, 세션 파티션, updater origin, 번들 id.
- **daemon: 도메인 코어** → 새 앱이 같은 도메인이라 토대로 유지하고 라우트/atom 확장.

---

## 8. 설정 추출 포인트 (코드 변경 없이 리스킨)

- **중앙 런타임 config** `apps/packaged/src/config.ts:23-49` `RawPackagedConfig` (tools/pack가 빌드 시 베이크): `updateMetadataUrl`(릴리스 origin 오버라이드), `telemetryRelayUrl`/`posthogKey`/`posthogHost`, `resourceRoot`, `namespace`, daemon/web 사이드카 엔트리, `webOutputMode`, `appVersion`, `amrProfile`
- **env 오버라이드(리빌드 불요)**: `OD_UPDATE_METADATA_URL`/`_CHANNEL`/`_ENABLED`(`updater.ts:63-78`), `OD_DATA_DIR`/`OD_SIDECAR_IPC_PATH`/`OD_PORT`/`OD_WEB_PORT`(`sidecar-proto:24-36`), `OD_PACKAGED_CONFIG_PATH`/`_NAMESPACE`, `OD_MARKETPLACE_REPO`/`_REF`/`_REGISTRY_BASE_URL`
- **코드 수정 필요(외부화 안 됨 = 리브랜딩 바닥)**: 제품명 상수, 번들 id, `od://` 스킴, `__od__` 글로벌, 세션 파티션, npm 스코프, `windowsPipePrefix`/`ipcBase` 기본값, web/marketplace 하드코딩 URL → §3 목록

---

## 9. 권장 포크 로드맵 (순서)

1. **리브랜딩 패스** (§3) — package.json 스코프 → sidecar-proto const → `od://`/`.od`/`__od__`/세션파티션 → tools/pack 식별자 → 하드코딩 URL. `pnpm guard`·`pnpm typecheck` 녹색 확인.
2. **셸 + 데몬 기동 검증** — `pnpm tools-dev run web`으로 리브랜딩된 앱이 기존 기능대로 도는지.
3. **"브랜드" 리스킨** (§4) — design-system UI/카피를 Brand로, DESIGN.md에 Voice/Audience/Messaging 섹션 추가(코드 변경 최소).
4. **마케팅 스킬 정리** (§6) — 불필요 스킬/플러그인/디자인시스템 제거, 마케팅 스킬 유지 + Braze HTML 스킬 신규.
5. **(핵심) reviewer 서브에이전트** (§5.5) — `review-agent` atom + 2번째 `spawn` 워커 구현, until 시그널 배선, Theater UI 재사용/확장.
6. **(핵심) 파이프라인 편집 UI** (§5.5) — per-project 검수 단계 추가/재정렬/리뷰어 선택 surface. 데이터 모델은 준비됨.
7. **순수 텍스트 모드** (§6.3) — 카피 1급 출력이 필요하면 `text`/`markdown` project kind + 렌더러.
8. **배포 리스킨** — updater origin/채널, appId/서명, 마켓플레이스 repo 재지정(또는 플러그인 시스템 단순화).

---

## 10. 핵심 파일 인덱스 (이 가이드 점프용)

```
# 파이프라인/검수 (5장)
apps/daemon/src/plugins/pipeline.ts            # devloop 스케줄러
apps/daemon/src/plugins/until.ts               # until 게이팅 평가
apps/daemon/src/plugins/atoms.ts               # FIRST_PARTY_ATOMS 카탈로그
apps/daemon/src/plugins/atoms/registry.ts      # AtomWorker 계약/등록
apps/daemon/src/plugins/atoms/built-ins.ts     # no-op + critique-theater worker
apps/daemon/src/critique/orchestrator.ts       # 단일 stdout 비평 오케스트레이터
apps/daemon/src/critique/scoreboard.ts         # decideRound 채점
apps/daemon/src/prompts/panel.ts               # 5인 심사위원 프롬프트 + 브랜드 주입
apps/daemon/src/server.ts:8071-8101,9823,10094 # 파이프라인/critique spawn 배선
packages/contracts/src/plugins/manifest.ts:73-87  # PipelineStage 스키마(.passthrough)
packages/contracts/src/critique.ts:113-124,284-296 # PanelEvent / SSE 이벤트명
apps/web/src/components/Theater/*               # 비평 UI

# 브랜드/디자인시스템 (4장)
apps/web/src/components/DesignSystemFlow.tsx    # 생성 UI
apps/daemon/src/design-systems.ts              # 생성 로직
packages/contracts/src/prompts/system.ts:347-351  # 프롬프트 주입 지점
design-systems/_schema/manifest.schema.ts      # manifest 스키마
packages/contracts/src/design-systems/token-schema.ts  # 토큰 스키마

# 마케팅 산출물 (6장)
apps/web/src/artifacts/renderer-registry.ts:34-44  # HtmlRenderer 선택
apps/web/src/runtime/srcdoc.ts:38-84           # iframe srcdoc 빌드
apps/web/src/components/FileViewer.tsx         # 샌드박스 iframe 렌더
apps/web/src/components/NewProjectPanel.tsx:113   # CreateTab 종류
packages/contracts/src/analytics/events.ts     # TrackingProjectKind

# 리브랜딩 (3장)
packages/sidecar-proto/src/index.ts:24-36,64-79   # OD_* env / ipc / 제품명
apps/packaged/src/protocol.ts:3-17,84          # od:// 스킴
packages/host/src/index.ts:1                   # __od__ 글로벌
tools/pack/src/{mac,win}/identity.ts           # appId / 제품명 / 서명
apps/desktop/src/main/updater.ts:63-81         # 업데이트 origin/env
scripts/guard.ts:614,891                       # product-neutrality / web import isolation
```

---

*이 문서는 정적 분석 + 소스 직독 기반이다. spawn/atom 신규 구현은 실제 작업 전 `server.ts`의 critique spawn 흐름과 `atoms/registry.ts` 계약을 다시 확인할 것.*
