# Open Design → Braze 인앱메시지 툴 — 아키텍처 분석

> **목적**: Open Design 코드베이스를 포크해 "Braze 인앱메시지 제작 툴"로 리팩토링하기 위한 구조 분석. 재사용할 도메인 로직, 인프라 계층, 손대면 위험한 구간, 테스트가 비어 있는 구간을 식별한다.
>
> **작성 기준일**: 2026-06-23 / 분석 대상: 0.10.0
> **분석 방법**: 4개 병렬 탐색 에이전트(도메인 / 인프라 / 의존성 / 테스트)의 교차 검증.
> **자매 문서**: 전체 일반 레퍼런스는 `ARCHITECTURE.md` (3-프로세스 모델, 워크플로우 루프).

---

## 0. 포크 관점 한 줄 요약

Open Design는 **데몬(Express+SQLite) ↔ 웹(Next.js) ↔ 데스크톱(Electron)** 3-프로세스 구조다. 핵심 루프는 `brief → 스킬/디자인시스템 선택 → 에이전트 스폰 → 스트림 파싱 → 아티팩트 생성/프리뷰`. Braze 포크는 이 루프에서 **출력 아티팩트를 "HTML 디자인"에서 "Braze 인앱메시지 JSON(content card / IAM)"으로 치환**하고, **Braze REST API를 외부 연동으로 추가**하면 된다. 도메인 모듈 대부분이 의존성 주입 기반이라 이식 가능하다.

---

## 1. 핵심 도메인 모듈 (역할 · 주요 클래스)

데몬(`apps/daemon/src`)이 두뇌. 아래 모듈이 재사용 대상.

### 1.1 에이전트 런타임 / 스폰
- **위치**: `apps/daemon/src/runtimes/`, 배럴 `agents.ts`
- **역할**: 설치된 CLI 에이전트(Claude Code, Codex, Cursor 등 22종+) 탐지·스폰·환경설정.
- **주요 심볼**:
  - `runtimes/registry.ts` → `AGENT_DEFS`, `getAgentDef()` — 에이전트 정의 레지스트리
  - `runtimes/detection.ts` → `detectAgents()` — 버전 프로빙 + auth 체크 + capability
  - `runtimes/launch.ts` → `resolveAgentLaunch()` — 스폰 config + env
  - `runtimes/types.ts` → `RuntimeAgentDef`, `DetectedAgent`, `RuntimeCapabilityMap`
  - `runtimes/defs/*.ts` — 에이전트별 정의 (claude.ts, codex.ts …)
- **Braze 포인트**: 그대로 재사용. 인앱메시지 카피·구조를 LLM에 맡길 때 런타임 계층 변경 불필요.

### 1.2 런 상태머신 + 스트림 파싱
- **위치**: `runs.ts`, `claude-stream.ts`, `json-event-stream.ts`, `qoder-stream.ts`, `copilot-stream.ts`
- **역할**: 외부 에이전트 stdout(JSONL)을 통일된 UI 이벤트로 변환, 런 라이프사이클 관리.
- **주요 심볼**:
  - `runs.ts` → `createChatRunService({...})` → `create/start/stream/cancel/finish/emit`. 런 객체 상태: `queued|running|succeeded|failed|canceled`. SSE 팬아웃 + JSONL 디스크 로그.
  - `claude-stream.ts` → `createClaudeStreamHandler(onEvent)` → `{feed, flush}`. 이벤트: `status / text_delta / thinking_delta / tool_use / tool_result / usage`.
  - `json-event-stream.ts` → `createJsonEventStreamHandler(kind, onEvent)` — opencode/gemini/kimi/cursor/codex 벤더별 핸들러를 canonical 모양으로 정규화.
- **⚠️ 주의**: stdin/`stop_reason` 라이프사이클이 미묘함 → §3 참조.

### 1.3 스킬 시스템
- **위치**: `skills.ts` + `skills/` 디렉터리 (`docs/skills-protocol.md`)
- **역할**: 디스크의 `SKILL.md` 스캔 → frontmatter 파싱 → 스킬 카탈로그.
- **주요 심볼**:
  - `listSkills(roots, opts)` → `SkillInfo[]`
  - `findSkillById(id, listing)` (`SKILL_ID_ALIASES`)
  - `SkillInfo` = `{ id, name, description, triggers, mode, surface, source, designSystemRequired, examplePrompt, critiquePolicy }`
  - 유저 스킬(`USER_SKILLS_DIR`)이 빌트인을 shadow (first root wins).
- **Braze 포인트**: "스킬" = "메시지 템플릿 유형"(IAM modal / slideup / full / content card)으로 재해석. frontmatter 스키마만 교체.

### 1.4 디자인 시스템 + 토큰 계약
- **위치**: `design-systems.ts`, `design-token-contract.ts`, `packages/contracts/src/design-systems/`
- **역할**: 프로젝트 `DESIGN.md` + tokens.css/tailwind 스캔, 컴포넌트 매니페스트·디자인 토큰 계약 생성.
- **주요 심볼**:
  - `listDesignSystems(root)` / `getDesignSystem(id, root)` → `DesignSystemSummary`
  - `DesignSystemProjectManifest` (schema `od-design-system-project/v1`): DESIGN.md, tokens.css, design-tokens.json, tailwind-v4.css, components.html
  - `buildDesignTokenContract({sourceTokens, generatedAt})` → `DesignTokenContract`. `DesignTokenBinding.confidence` = high|medium|low|fallback|alias. 리포트 grade = excellent|usable|needs-review|needs-rebuild.
  - contracts: `token-schema.ts` (`TOKEN_SCHEMA`, `TokenLayer`), `components-manifest.ts` (`extractComponentsManifest()`)
- **Braze 포인트**: 브랜드 토큰(컬러/타이포/spacing)을 Braze 메시지 인라인 스타일로 매핑. 토큰 계약 계층이 브랜드 일관성 확보의 핵심.

### 1.5 아티팩트 (생성 · 라이브 프리뷰 · 발행)
- **위치**: `artifact-create.ts`, `live-artifacts/`, `run-artifacts.ts`
- **역할**: HTML 아티팩트 생성·발행·프리뷰, 템플릿+데이터 라이브 싱크, 생성 메트릭 추적.
- **주요 심볼**:
  - `artifact-create.ts` → `createProjectArtifactFile(opts)`, `resolveCreateArtifactManifest()`. 에러: `ArtifactManifestRequiredError`, `ArtifactManifestInvalidError`.
  - `live-artifacts/schema.ts` — 정확 필드:
    - `LiveArtifact` (`:67`): schemaVersion:1, id, projectId, sessionId?, createdByRunId?, title, slug, status(active|archived|error), pinned, preview, refreshStatus(never|idle|running|succeeded|failed), createdAt/updatedAt(ISO), document.
    - `LiveArtifactDocument` (`:27`): `format:'html_template_v1'`, `templatePath:'template.html'`, `generatedPreviewPath:'index.html'`, `dataPath:'data.json'`, dataJson, dataSchemaJson?, sourceJson?.
    - `LiveArtifactSource` (`:37`): type(local_file|daemon_tool|connector_tool), toolName?, input, connector?{connectorId,toolName,approvalPolicy}, outputMapping?{dataPaths,transform(identity|compact_table|metric_summary)}, refreshPermission(none|manual_refresh_granted_for_read_only).
    - `LiveArtifactProvenance` (`:60`): generatedAt, generatedBy(agent|refresh_runner), sources[].
  - `live-artifacts/store.ts` — 디스크 레이아웃 `LiveArtifactStorePaths` (`:51`): `projectDir/.live-artifacts/{id}/` 하위 artifact.json, template.html, index.html, data.json, provenance.json, refreshes.jsonl, refresh.lock. 메서드: `createLiveArtifact/list/get/update/deleteLiveArtifact`, `regenerateLiveArtifactPreview`, `acquireLiveArtifactRefreshLock`, `commitLiveArtifactRefreshCandidate`, `markLiveArtifactRefreshRunning/Failed`, `recoverStaleLiveArtifactRefreshes`.
  - `live-artifacts/refresh.ts` — `withLiveArtifactRefreshRun()` (`:210`) + `withLiveArtifactRefreshSourceTimeout()` (`:226`). 로컬 refresh 툴: `project_files.search/read_json`, `git.summary`, `public_github_repository_metric`.
  - `run-artifacts.ts` → `countNewHtmlArtifacts()`, `emittedRenderableQuestionForm()`.
- **Braze 포인트**: **가장 크게 바꿀 계층.** ⚠️ **수정(BRAZE-DOMAIN §4.4)**: `'braze_iam_v1'` = 프로퍼티어리 IAM **JSON 아님** — Braze REST에 인라인 IAM 객체 없음(불가). 대신 **Custom HTML IAM = HTML 아티팩트**(기존 `html_template_v1` 모양 거의 유지, brazeBridge·logClick·이미지스펙 craft 제약 추가). `LiveArtifactSource.type='daemon_tool'`의 "Braze API push"는 **IAM 전송 아님** — push/email/content_card 등 REST 채널 또는 대시보드 핸드오프(붙여넣기/HTML-upload). 생성 end-to-end: 에이전트가 create input → `createLiveArtifact` 검증·영속 → refresh로 data.json 갱신.

### 1.6 채팅 / 대화 / 프로젝트
- **위치**: `chat-routes.ts`, `project-routes.ts`, `projects.ts`
- **역할**: 채팅/런 라우트 핸들러, 프로젝트 영속화, 아티팩트 인벤토리.
- **주요 심볼**:
  - `registerChatRoutes(app, ctx)` — `GET /api/runs`, `/api/runs/:id/events`(SSE), `/cancel`, `/feedback`. `FEEDBACK_REASON_ALLOWLIST`.
  - `registerProjectRoutes(app, ctx)` — 프로젝트 CRUD + `POST /api/projects/:id/files`(아티팩트 생성)
  - `projects.ts` → `listFiles()`, `readFile/writeFile()`(매니페스트 추론), `resolveProjectDir()`(외부 루트 지원). `DESIGN_HANDOFF_FILENAME`, `DESIGN_MANIFEST_FILENAME`.

### 1.7 질문폼 / 디스커버리
- **위치**: `question-form-detect.ts`, `prompts/`
- **역할**: 어시스턴트 텍스트에서 렌더 가능한 `<question-form>` 감지(클라리파잉 질문). **stdin 툴주입 아님** — 마크다운 아티팩트 방식(AGENTS.md "Asking the user questions").
- **주요 심볼**:
  - `emittedRenderableQuestionForm(text)` → boolean
  - `questionFormBodyIsRenderable(body)`, `findQuestionFormCloseTag()`, `QUESTION_FORM_OPEN_RE`
  - `prompts/`: `discovery.ts`, `directions.ts`, `media-contract.ts`, `deck-framework.ts`, `system.ts`(시스템 프롬프트 합성)
- **Braze 포인트**: 그대로 재사용. "어떤 세그먼트? 어떤 트리거 이벤트? CTA 문구?" 같은 캠페인 디스커버리에 적합.

### 1.8 미디어 생성
- **위치**: `media.ts`, `media-adapters/`, `media-models.ts`, `media-config.ts`, `media-routes.ts`
- **역할**: 미디어 요청을 프로바이더(OpenAI, Grok, OpenRouter, AIHubMix, ElevenLabs …)로 라우팅, 모델 capability 추상화.
- **주요 심볼**:
  - `executeMediaGeneration(ctx: MediaContext)` — 디스패처. surface = image|video|audio.
  - `media-adapters/types.ts` → `MediaFamily`(seedance|wan|veo|generic), `ModelCapability`, `VideoBuildInput`, `BuiltVideoRequest`
  - `media-models.ts` → `findMediaModel()`, `modelsForSurface()`
- **Braze 포인트**: 인앱메시지 히어로 이미지·아이콘 생성에 재사용.

### 1.9 데이터 플로우 루프 (포크 적용형)
```
유저 브리프 → [질문폼 디스커버리] question-form-detect.ts
            → [템플릿유형 + 브랜드토큰 선택] skills.ts, design-systems.ts
            → [시스템 프롬프트 합성] prompts/system.ts
            → [에이전트 탐지·스폰] runtimes/, agents.ts
            → [스트림 파싱→tool_use] claude-stream.ts, runs.ts
            → [토큰·컴포넌트 적용] design-token-contract.ts
            → [Braze 메시지 아티팩트 생성/프리뷰] artifact-create.ts, live-artifacts/
            → [Braze API push] (신규) connectors / live-artifact source
```

### 1.10 공유 계약 / 호스트
- `packages/contracts/src/` — `api/chat.ts`, `api/artifacts.ts`, `api/live-artifacts.ts`, `design-systems/*`, `plugins/*`, `analytics/events.ts`. **순수 TS** (Next/Express/Node fs 금지).
- `packages/host/src/index.ts` — Electron IPC 브리지: `OpenDesignHostClient`, 프로젝트 임포트/워킹디렉터리 선택(HMAC 토큰), 스크린샷.

---

## 2. 인프라 계층 (DB · 외부 API · 큐 · IPC)

### 2.1 데이터베이스
- **엔진**: SQLite 3 (`better-sqlite3`), WAL 모드, FK on.
- **오픈**: `openDatabase(projectRoot, { dataDir }): SqliteDb` (`db.ts:32`). pragma `journal_mode=WAL`, `foreign_keys=ON` (`db.ts:39-40`). 파일 `app.sqlite` (경로 `RUNTIME_DATA_DIR` 기반 — AGENTS.md "Daemon data directory contract").
- **마이그레이션**: 별도 러너 없음. `db.ts:56-355` 인라인 `CREATE TABLE` + `ALTER TABLE` + PRAGMA 체크 (forward-compatible 컬럼 추가). **신규 컬럼은 ALTER 블록(`db.ts:257-355`)에 추가, CREATE 본문 수정 금지** (기존 DB 마이그레이션 위해).
- **테이블 + 핵심 컬럼 (CREATE 그대로)**:

| 테이블 | 줄 | 핵심 컬럼 |
|---|---|---|
| `projects` | 56 | id PK, name, skill_id, design_system_id, pending_prompt, metadata_json, custom_instructions, created_at, updated_at |
| `conversations` | 76 | id PK, project_id FK CASCADE, title, session_mode DEFAULT 'design', created_at, updated_at |
| `messages` | 99 | id PK, conversation_id FK, role, content, agent_id, run_id, run_status, events_json, attachments_json, produced_files_json, feedback_json, applied_plugin_snapshot_json, session_mode, run_context_json, position |
| `agent_sessions` | 89 | PK(conversation_id, agent_id), session_id, stable_prompt_hash, updated_at |
| `preview_comments` | 125 | id PK, project_id FK, conversation_id FK, file_path, element_id, selector, label, text, position_json, style_json, slide_key DEFAULT -1; UNIQUE(project_id,conversation_id,file_path,element_id,slide_key) |
| `deployments` | 176 | id PK, project_id FK, file_name, provider_id, url, deployment_id, status DEFAULT 'ready', provider_metadata_json; UNIQUE(project_id,file_name,provider_id) |
| `routines` | 198 | id PK, name, prompt, schedule_kind, schedule_value, schedule_json, project_mode, project_id, agent_id, context_json, enabled DEFAULT 1 |
| `routine_runs` | 215 | id PK, routine_id FK, trigger, status, project_id, conversation_id, agent_run_id, error, error_code |
| `routine_schedule_claims` | 231 | PK(routine_id, slot_at), claimed_at — 멀티데몬 분산락 |
| `tabs` | 157 | PK(project_id, name), position, is_active |
| `tabs_state` | 166 | project_id PK, state_json, updated_at |
| `media_tasks` | (별도) | id PK, project_id, status(queued\|running\|done\|failed\|interrupted), surface, model, progress_json, file_json, error_json |
| `critique_artifacts`, `plugins_*` | — | critique/persistence.ts, plugins/persistence.ts |

- **accessor 네이밍** (CRUD 일관 패턴): `list*`/`get*`/`insert*`/`update*`/`delete*`/`upsert*` — 예 `insertProject`, `listMessages`, `upsertMessage`, `appendMessageAgentEvent`, `upsertAgentSession`, `upsertPreviewComment`, `insertRoutineRun`. Braze 테이블도 동일 패턴으로 accessor 추가.
- **Braze 포인트**: ⚠️ **수정(BRAZE-DOMAIN §4.4)**: `braze_messages`는 IAM JSON 페이로드 저장소 아님(그런 객체 없음). 테이블이 필요하면 **생성 HTML 아티팩트 메타 + 대시보드 핸드오프 상태**(brand_id, output_mode, artifact_path, braze_campaign_id?, delivery_channel, status) 모델. accessor 5종 패턴은 동일. red-spec 먼저.

### 2.2 외부 API
**LLM (BYOK) — Braze REST client가 복사할 정확한 패턴** (auth 헤더 + 키 소스):

| 프로바이더 | 빌더 위치 | auth 헤더 | 키 소스 (env → 파일) |
|---|---|---|---|
| OpenAI | `chat-routes.ts:951` (`POST /api/proxy/openai/stream`) | `Authorization: Bearer ${key}` | `OD_OPENAI_API_KEY`/`OPENAI_API_KEY`/`AZURE_*` → media-config.json `providers.openai.apiKey` |
| Anthropic | `chat-routes.ts:913` | `x-api-key: ${key}` + `anthropic-version: 2023-06-01` | `resolveProviderConfig(root,'anthropic')` |
| Google | `chat-routes.ts:1220`, `google-models.ts:21` | `x-goog-api-key: ${key}` | `OD_GOOGLE_API_KEY`/`GOOGLE_API_KEY`/`GEMINI_API_KEY` |
| xAI/Grok | `xai-oauth.ts:31` (OAuth2+PKCE, issuer `auth.x.ai`) | `Authorization: Bearer ${accessToken}` | 파일 `${dataDir}/xai-tokens.json` (chmod 0600), `xai-oauth-server.ts` 127.0.0.1:56121 콜백 |
| AIHubMix | `aihubmix.ts:34` (`aihubmixHeaders`) | `Authorization: Bearer ${key}` + `APP-Code: DMCY9912` | `OD_AIHUBMIX_API_KEY`; base `aihubmix.com/v1`; 모델명 prefix로 openai/anthropic/gemini 분기 |
| ElevenLabs | `elevenlabs-voices.ts:127` | `xi-api-key: ${key}` | `OD_ELEVENLABS_API_KEY`; base `api.elevenlabs.io`; 캐시 TTL 10분 |

- **키 해석 우선순위** (`media-config.ts:146`): `OD_MEDIA_CONFIG_DIR` → `OD_DATA_DIR` → `<root>/.od`, 파일 `media-config.json` 구조 `{ providers: { <id>: { apiKey, baseUrl } } }`.
- **Braze client 템플릿**: 신규 `braze-client.ts` — env `OD_BRAZE_API_KEY` 우선, 폴백 `<dataDir>/braze-tokens.json` (xai-tokens.ts 패턴, chmod 0600). 헤더 `Authorization: Bearer ${key}`, instance endpoint `rest.iad-0X.braze.com` (워크스페이스별).

**미디어**: ElevenLabs(`elevenlabs-voices.ts`, 캐시 TTL 10분), SenseAudio(`byok-tools.ts`), `media-adapters/`.

**텔레메트리**: Langfuse — `langfuse-bridge.ts`, `langfuse-trace.ts` (런 완료·피드백·usage 리포트, fire-and-forget). consent 게이트: `telemetry.metrics`, `telemetry.content` (`app-config.json`).

**MCP**: `mcp.ts`(stdio/HTTP 서버), `mcp-config.ts`, `mcp-oauth.ts`(RFC 7591 DCR + PKCE, 토큰 `mcp-tokens.json`), `mcp-live-artifacts-server.ts`.

**OAuth**: xai-oauth-server, mcp-oauth, `desktop-auth.ts`(CLI 임포트 토큰 서명).

- **Braze 포인트**: 신규 `braze-client.ts` (fetch 기반 REST). 토큰은 `xai-tokens.ts` 패턴 따라 `<dataDir>/braze-tokens.json`. Braze는 instance-specific REST endpoint(`rest.iad-0x.braze.com`)+API key 헤더 → BYOK 패턴 그대로 이식 가능.

### 2.3 큐 / 백그라운드 잡
**전용 큐(Redis/Bull) 없음.** 모두 인메모리 또는 SQLite 백킹:
- **미디어 잡**: `media_tasks` 테이블 + `media-tasks.ts` (insert/patch). 라이프사이클 queued→running→done|failed|interrupted.
- **디자인시스템 생성 잡**: `design-system-generation-jobs.ts` — 인메모리 잡맵. 단계: explore-resources → create-draft → generate-files → register-files → prepare-review.
- **루틴(스케줄)**: `routines.ts` → `RoutineService` (timezone-aware cron, schedule_kind hourly|daily|weekdays|weekly). `routine_schedule_claims`로 멀티데몬 분산락.
- **파일워처**: `project-watchers.ts` — chokidar 기반, refcount per-project, 이벤트 `{type:'file-changed', path, kind:add|change|unlink}`.
- **Braze 포인트**: 캠페인 스케줄 발송이 필요하면 `routines` 패턴 재사용. 단발 발송은 `media_tasks`형 잡 테이블 신설.

### 2.4 IPC / 프로세스 모델
- **사이드카 IPC**: Unix 소켓(또는 Windows pipe) JSON-RPC. 계약 `packages/sidecar-proto/src/index.ts` (메시지: STATUS, SHUTDOWN, CLICK, CONSOLE, EVAL, SCREENSHOT, EXPORT_PDF, MINT_IMPORT_TOKEN, REGISTER_DESKTOP_AUTH, UPDATE). 스탬프 5필드: app/mode/namespace/ipc/source.
- **서버**: `sidecar/server.ts` → `DaemonSidecarHandle`, `createJsonIpcServer()`(@marketing-ax/sidecar). 소켓 경로 `/tmp/open-design/ipc/<namespace>/<app>.sock`. desktop-auth 게이트(임포트 토큰 TTL 60s).
- **부트스트랩**: `sidecar/index.ts` → `bootstrapSidecarRuntime()` → `startDaemonSidecar()`.
- **프로세스 계층**: 데몬(메인 루프)이 MCP 서버 / 에이전트 런타임 / 미디어 잡 / 루틴 러너 스폰.

### 2.5 데몬 내부 구조 (apps/daemon)
데몬 = 두뇌. 모노레포 복잡도 대부분 여기 집중 (`apps/daemon/src` = **340개 .ts**, 21개 서브디렉터리).

**부팅 흐름**:
```
cli.ts (7,955줄, `od` 바이너리)
  → daemon-startup.ts (startDaemonRuntime, 180줄 — 얇은 래퍼)
  → server.ts (12,607줄 — startServer, 실제 배선)
  → server-context.ts (134줄 — RouteDeps/HttpDeps 주입)
```

**라우트 배선 — 하이브리드 (god-file 통념 보정)**:
- server.ts가 **register\* 모듈 ~30개** 호출로 위임: `registerProjectRoutes`, `registerMediaRoutes`, `registerMcpRoutes`, `registerLiveArtifactRoutes`, `registerPluginRoutes`, `registerMemoryRoutes`, `registerRoutineRoutes`, `registerTerminalRoutes`, `registerXaiRoutes`, `registerVelaRoutes`… (`routes/` 13파일 + `*-routes.ts` 7파일)
- **그러나** server.ts에 여전히 **81개 직접 `app.*()` + 67개 인라인 `/api/` 엔드포인트** 잔존 → 절반만 모듈화. 나머지 절반이 god-file 하중(§3.1).

**서브디렉터리 도메인 맵 (21개)**:
| dir | 역할 |
|---|---|
| `runtimes/` | 에이전트 정의·탐지·스폰 (§1.1) |
| `routes/` `http/` | 라우트 핸들러 분리분 |
| `live-artifacts/` | 아티팩트 스토어·리프레시 |
| `plugins/` `registry/` | 플러그인 로더·영속화 |
| `media-adapters/` `services/` | 미디어 프로바이더 |
| `connectors/` `integrations/` | 외부 연동 |
| `critique/` `qa/` | 디자인 비평·검증 |
| `prompts/` `genui/` | 시스템 프롬프트·UI 생성 |
| `sidecar/` | IPC 서버 |
| `storage/` `logging/` `metrics/` | 인프라 횡단 |
| `tools/` `research/` | 에이전트 툴·리서치 |

**Braze 포크 관점**:
- **cli.ts(7.9K)도 god-file** — capability dual-track 규칙(모든 기능 UI+CLI 양쪽)으로 모든 기능이 CLI 서브커맨드로도 노출. Braze 기능 추가 = 여기도 동시 수정.
- 신규 도메인은 **`routes/` 모듈 + register\* 패턴**으로 추가 (인라인 67개 대열 합류 금지).
- 포크 초기에 server.ts 인라인 67개를 register\* 모듈로 마저 추출 → god-file 해소 (§3.1).

### 2.6 HTTP / SSE
- **엔트리**: `server.ts`(메인 리스너), `server-context.ts`(`RouteDeps`, `HttpDeps`: `createSseResponse`, `sendApiError`), `route-registration-guard.ts`(가드된 라우트 싱글톤 강제).
- **SSE**: `ctx.http.createSseResponse()`, `text/event-stream`, `data: <json>\n\n`. 백프레셔: `res.on('close')`, `writableEnded` 체크.
- **주요 라우트**: `POST /api/chat`(SSE), `GET /api/runs/:id/events`(SSE), `POST /api/projects/:id/media/generate`, `/import`, `/preview-comments`, 터미널·MCP 로그 SSE.
- **인증**: 로컬 전용 데몬(`requireLocalDaemonRequest`, `isLocalSameOrigin`) + desktop-auth 게이트.
- **⚠️ AGENTS.md 규칙**: 모든 capability는 **UI + `od` CLI 양쪽** 노출 필수 (`SUBCOMMAND_MAP`). Braze 기능 추가 시 HTTP 엔드포인트 + 웹 UI + CLI 서브커맨드 3종 동시 착지.

---

## 3. 순환 의존성 · 의심 구간

**좋은 소식**: 진짜 순환 의존성 미탐지. 경계는 대체로 깨끗.
- ✓ `apps/web` → `apps/daemon/src` import 0건 (HTTP + contracts만)
- ✓ `packages/contracts` → 데몬 내부 import 0건 (순수 TS 유지)
- ✓ 사이드카 인식이 `apps/*/sidecar/`에 격리됨
- ✓ 라우트 파일들(chat-routes, project-routes…) 상호 import 없음

**나쁜 소식 — 하중을 받는 이음새(load-bearing seams):**

### 3.1 🔴 god-file: `server.ts` (~12,607줄)
- 로컬 모듈 **162 direct import**. 라우트 등록·DB 컨텍스트·HTTP 계층의 배선 허브.
- 12개 파일이 역으로 server.ts에서 `RUNTIME_DATA_DIR`, `applyClaudeStreamJsonRunBookkeeping` 등을 import → **양방향 결합**.
- **위험**: 라우트 하나 바꿔도 이 엔트리포인트로 파급. 포크 시 `route-registry.ts`로 라우트 배선 추출 권장(162→~20).

### 3.2 🔴 스트림 파서 stdin / `stop_reason` 라이프사이클 (HIGH)
- **핵심 가드** `applyClaudeStreamJsonRunBookkeeping` (`server.ts:4251-4282`):
  ```
  cleanTerminalTurn = (type==='turn_end' && stopReason!=='tool_use')   // :4265-4268
                   || (type==='usage'    && stopReason!=='tool_use')
  if (!cleanTerminalTurn) return;                                       // :4270 — stdin 안 닫음
  run.turnCompletedCleanly = true;                                      // :4275
  run.child.stdin.end(); run.stdinOpen = false;                         // :4278-4280 — 여기서만 닫음
  ```
- **불변식**: `stop_reason: 'tool_use'`는 모델이 툴 실행 대기 중(claude-code 내부 러너) → stdin 닫으면 후속 응답 truncate. **절대 닫지 말 것.**
- stdin open: `server.ts:11038`(stream-json 스폰), 강제종료 닫기 `:8860`.
- `claude-stream.ts`는 assistant 메시지 content block 순회 **후** `turn_end` 방출 (final stop_reason + 모든 tool_use 본 뒤 결정 — AGENTS.md "Agent runtime conventions"). 순서 어긋나면 레이스.
- 결합: `json-event-stream.ts`(846줄), `qoder-stream.ts`(173줄), `copilot-stream.ts`(137줄, 무테스트). **변경 전 mocks/ 트레이스 리플레이 필수** (`PATH=$PWD/mocks/bin:$PATH OD_MOCKS_TRACE=<id> OD_MOCKS_NO_DELAY=1`).

### 3.3 🟡 데이터 디렉터리 escape candidates (MEDIUM)
- `resolveDataDir(raw, projectRoot, opts)` (`daemon-paths.ts:125-163`): raw 없으면 `requireExplicit`(=`OD_SANDBOX_MODE`)일 때 throw, 아니면 `path.join(projectRoot,'.od')` silent fallback (`:135`). AGENTS.md가 "escape candidate"로 명시.
- 파생 (`server.ts:1444-1489`): `RUNTIME_DATA_DIR` → `ARTIFACTS_DIR`/`PROJECTS_DIR`/`USER_SKILLS_DIR`/`USER_DESIGN_SYSTEMS_DIR`/`CRITIQUE_ARTIFACTS_DIR`. canonical은 `fs.realpathSync`(`:1456`).
- 결합: `legacy-data-migrator.ts` (레거시 마커 ~31개 — 데몬 최다). 포크는 `OD_DATA_DIR` 명시 요구로 `:135` fallback 제거 권장.

### 3.4 🟡 아티팩트 finalization 안무 (MEDIUM)
- `run-artifacts.ts` / `live-artifacts/store.ts` / `artifact-stub-guard.ts` / `finalize-design.ts` / `db.ts` 5개 파일이 라이프사이클 협응, TODO/FIXME 마커 분산.
- **위험**: 아티팩트 쓰기 로직 변경 시 5곳 동시 수정 필요, 한 곳 놓치면 post-run finalization 깨짐. **Braze 아티팩트 신설 시 가장 먼저 건드릴 구간 — 계약을 문서화하고 시작.**

### 3.5 🟡 디자인시스템 생성 (MEDIUM)
- `design-systems.ts` (~3,143줄, 레거시 마커 9개). 파일워처·플러그인 레지스트리·아티팩트 스토어에 강결합.
- 컴포넌트 매니페스트/토큰 출력 변경 시 `design-token-contract-rebuild.ts` 하류 파손.

### 3.6 사이즈 핫스팟 (top)
```
daemon: server.ts(12.6K)  cli.ts(7.9K)  media.ts(4.0K)  design-systems.ts(3.1K)
        project-routes.ts(2.6K)  chat-routes.ts(2.2K)  db.ts(2.1K)
web:    FileViewer.tsx(10.1K)  SettingsDialog.tsx(7.5K)  ProjectView.tsx(6.6K)
```
- 메모리 시스템 `memory.ts(857)→memory-llm.ts(1.2K)→memory-connectors.ts(1.4K)`는 일방향 체인, 순환 없음 — 안전하게 교체 가능.

---

## 4. 테스트 커버리지가 낮은 영역

- **프레임워크**: Vitest(Node) + Playwright(UI). **커버리지 계측 미설정** (vitest coverage / c8 / nyc 없음) → 정량 지표 부재. 포크 초기에 vitest coverage 추가 권장.
- **총 테스트**: ~876개. daemon 354 / web 330 / e2e(ui 36 + tests 26 + specs 7) / tools 37 / packages 43 / scripts 11.
- vitest config: `apps/daemon/vitest.config.ts`(`environment:'node'`, `fileParallelism:false`), `apps/web/vitest.config.ts`, `e2e/vitest.config.ts`. 커버리지 instrumentation 어디에도 없음.

### 4.1 도메인별 분포 (daemon 354)
| 도메인 | 테스트 | 상태 |
|---|---|---|
| Plugins | 70 | 🟢 충실 |
| Routes(일반) | 35 | 🟡 보통 |
| Agent/Runtimes | 27 | 🟢 충실 |
| Critique | 22 | 🟢 |
| Chat/Projects | 20 | 🟡 |
| Live-artifacts | 19 | 🟡 |
| Media | 17 | 🟡 |
| MCP | 16 | 🟡 |
| Design-systems | 15 | 🟡 (표면 큼) |
| Memory/Routines | 9 | 🔴 희박 |
| DB/Storage | 8 | 🔴 희박 |
| Skills | 7 | 🔴 희박 |

### 4.2 대형 파일 직접 테스트 현황 (정밀 재조사 — 1차 추정 정정)
> ⚠️ 초기 추정은 db.ts/media.ts/chat-routes/project-routes를 "무테스트"로 분류했으나, 파일명 매칭 재조사 결과 **직접 테스트 존재**. 정정.

| 파일 | 줄 | 직접 테스트 | 판정 |
|---|---|---|---|
| `db.ts` | 2,062 | ✅ `storage-db-verify.test.ts`, `db-agent-sessions.test.ts` 등 ~7개 | 🟢 (단, 테이블별 커버 편차 — Braze 테이블 추가 시 red-spec 동반) |
| `media.ts` | 4,026 | ✅ `media-elevenlabs/aihubmix/adapters.test.ts` 등 ~19개 | 🟡 프로바이더는 충실, **메인 디스패처 `executeMediaGeneration` 경로 커버 얕음** |
| `chat-routes.ts` | 2,187 | ✅ `chat-route.test.ts` (1) | 🟡 단일 — 분기 커버 얕음 |
| `project-routes.ts` | 2,606 | ✅ `projects-routes.test.ts`, `project-design-system-routes.test.ts` (2) | 🟡 |
| **`copilot-stream.ts`** | 137 | ❌ **없음** | 🔴 유일하게 직접 테스트 0 — claude/json-event/qoder는 있음 |
| `design-token-evidence.ts` | 243 | ❌ (contract 테스트만) | 🟡 evidence 생성 미커버 |
| `server.ts` | 12,607 | △ focused 7개(cors/paths/keepalive/bootstrap) | 🟡 대부분 e2e 암묵 커버 |

**핵심**: "전부 무테스트"가 아니라 **분기 깊이**가 문제. db/media/routes는 happy-path 위주 → Braze 분기 추가 시 신규 분기는 무방비. `copilot-stream.ts`만 절대 공백.

### 4.3 e2e 커버리지
- `specs/`(7): orbit/run, dialog/main, pet/main, namespace/main, mac/linux/win 패키징.
- `tests/`(26): 데몬 HTTP 경계 + mock 서버 하네스 (dialog, amr, tools-dev, frames, packaged, report, antigravity).
- `ui/`(36 Playwright): 앱 라이프사이클, 채팅(todo autoscroll, ds switch), settings(connectors/media/ds/memory routines), 프로젝트/자동화.
- **갭**: 미디어 잡 오케스트레이션 spec 없음, 디자인토큰 계약 생성/리빌드 spec 없음, 채팅 라우트는 UI 우회만.

### 4.4 포크 전 권장 (리스크 티어)
- **🔴 절대 공백**: `copilot-stream.ts`(직접 테스트 0) — Copilot 사용 시 red-spec 먼저.
- **🟡 분기 얕음, 신규 분기 무방비**: `media.ts`(디스패처), `chat-routes.ts`, `project-routes.ts`, `design-token-evidence.ts` — Braze 분기 추가 전 해당 경로 red-spec.
- **🟡 검증 필요**: `server.ts`, `design-systems.ts`, `mcp.ts`(16 테스트/1K+줄).
- **🟢 충실**: db.ts(~7), runtimes(27), 스트림파서(claude/json-event/qoder), design-token-contract, plugins(70).
- 공통: AGENTS.md "Bug follow-up workflow" — 데몬 HTTP 경계 Vitest가 가장 싼 레이어. 신규 Braze 기능은 red-spec → 구현 순서.

---

## 5. 웹 프론트엔드 구조 (apps/web)

**스택**: Next.js 16.2 (App Router, `output: export`) + React 18.3 + **외부 상태 라이브러리 없음** (Context + localStorage + 데몬 sync). 149 tsx / 212 ts / 48 css. `next dev --turbopack`.

### 5.1 부팅 체인
```
app/layout.tsx (45줄) — <I18nProvider><AnalyticsProvider>, 테마 인라인 스크립트(FOUC 방지, localStorage 'open-design:config' 읽어 data-theme/accent 선적용)
  → app/[[...slug]]/page.tsx (19줄) — catch-all, generateStaticParams: slug:[] (export용). "전체가 client-driven SPA" 주석
  → app/[[...slug]]/client-app.tsx (32줄) — 'use client'. installErrorHandlers()+installWebObservability() 모듈로드 시 실행. dynamic(() => import('src/App'), { ssr:false }), 폴백 'Loading Open Design…'
  → src/App.tsx (2,263줄) — 루트. 데몬 연결·projects/agents/skills 로드, useRoute()로 top-level view 디스패치
```
- **App.tsx 렌더 트리**: `<div.workspace-shell><WorkspaceTabsBar/><div.workspace-shell__body>{appMain}</div></div>` + 조건부 `PetOverlay / TooltipLayer / SettingsDialog / Toast / PrivacyConsentModal`. `appMain` = `MarketplaceView | PluginDetailView | DesignSystemCreationFlow | DesignSystemDetailView | ProjectView | EntryView` (route.kind 분기).

### 5.2 라우팅 (`src/router.ts`, 182줄)
- **Route union** (`:21-39`):
  ```ts
  | { kind:'home'; view:EntryHomeView }   // home|onboarding|projects|tasks|plugins|design-systems|integrations
  | { kind:'design-system-create' }
  | { kind:'design-system-detail'; designSystemId:string }
  | { kind:'project'; projectId:string; conversationId?:string|null; fileName:string|null }
  | { kind:'marketplace' } | { kind:'marketplace-detail'; pluginId:string }
  ```
- `useRoute():Route` (`:179`, `useSyncExternalStore` + `popstate` 구독), `navigate(route,{replace?})` (`:148`, history push + `queueMicrotask`로 popstate dispatch), `parseRoute(pathname)` (`:41-106`).
- URL 모델: `/projects/:id/conversations/:cid/files/...`, `/design-systems/(create|:id)`, `/marketplace(/:id)`.
- **Braze 추가**: union에 `{ kind:'braze-messages'; campaignId?:string }` 추가 → `parseRoute`/`buildPath` 분기 → App.tsx `appMain` 분기에 `<BrazeMessageEditor/>` 마운트.

### 5.3 상태 관리 (`src/state/`)
- **라이브러리 없음.** Context + localStorage + 데몬 sync. 서버 상태도 SWR/react-query 아닌 **커스텀 fetch + useState 허브**(App.tsx).
- `state/config.ts` (~850줄) — `AppConfig`(mode 'daemon'|'api', apiKey, apiProtocol, apiProtocolConfigs, mediaProviders, agentModels, agentCliEnv, theme, accentColor `#c96442`, telemetry{metrics,content}, skillId, designSystemId …). `loadConfig()`(localStorage `'open-design:config'`)/`saveConfig()`/`syncConfigToDaemon()`(`POST /api/config/prefs`)/`mergeDaemonConfig()`.
- `state/projects.ts` (~1,300줄) — `createProject/getProject/listProjects/patchProject/deleteProject` (→ `/api/projects*`).
- `state/appearance.ts` — `applyAppearanceToDocument()` (data-theme + `--accent*` CSS 변수).
- `state/mcp.ts` — MCP 서버 config fetch/sync.
- **App.tsx useState 허브**: config, projects, agents, skills, designSystems, designTemplates, daemonLive, settingsOpen… + useRef 변이추적(`projectListMutationVersionRef`, `pendingLocalProjectIdsRef`).
- **Braze 추가**: `state/braze.ts` 신설(`BrazeConfig`) + `AppConfig.braze?` 확장 + `syncBrazeConfigToDaemon()`.

### 5.4 데몬 통신 + SSE (`src/providers/`)
- `providers/daemon.ts` (~1,400줄) — **SSE 클라이언트 코어**:
  - `streamViaDaemon({url,init,onEvent,onError,onComplete,signal,timeout})` (`:560`) — fetch ReadableStream SSE.
  - `reattachDaemonRun()` (`:676`, in-flight 재연결, `Last-Event-ID`/`?after=`), `fetchChatRunStatus()` (`:686`), `listProjectRuns()` (`:871`), `reportChatRunFeedback()` (`:835`), `saveArtifact()` (`:1269`), `fetchAmrModels()`/`fetchVelaLoginStatus()`/`startVelaLogin()`.
  - **이벤트 종류**: `'agent'`(Claude stream-json 파싱 — status/text_delta/thinking_delta/tool_use/tool_result/usage/raw), `'stdout'`(타 CLI 평문→rolling 'text'), `'stderr'`(비정상 종료시만).
- `providers/sse.ts` (38줄) — `parseSseFrame(frame)` → `{kind:'event',event,data,id?} | {kind:'comment'} | {kind:'empty'}`.
- `providers/registry.ts` (~2,500줄) — `fetchAgentsStream({onAgent,signal})`(증분 SSE), `fetchAgents/fetchSkills/fetchDesignSystems/fetchDesignTemplates/fetchPromptTemplates`, `uploadProjectFiles`, `fetchDesignSystemDetail/Revisions`.
- **분석 헤더** (`/api/*` 호출 주입): `ANALYTICS_HEADER_DEVICE_ID/CLIENT_TYPE/LOCALE/REQUEST_ID/SESSION_ID`.
- **Braze 추가**: `providers/braze.ts` — `fetchBrazeCampaigns()`/`createBrazeMessage()`/`streamBrazeGeneration({prompt,templateId,onEvent})` (= `streamViaDaemon`로 `/api/braze/generate` 소비).

### 5.5 런타임 이벤트 프로세서 (`src/runtime/`, 21파일)
에이전트 tool 출력 → React UI. 대표: `todos.ts`(TodoWrite snapshot `latestTodosFromEvents`/`parseTodoWriteInput`/`isTodoWriteToolName`), `exports.ts`(파일 export), `markdown.tsx`, `srcdoc.ts`(샌드박스 프리뷰 HTML 생성), `tool-renderers.ts`, `react-component.ts`, `amr-guidance.ts`, `plugin-source.ts`.

### 5.6 핵심 컴포넌트 (줄 수 = 측정값)
| 컴포넌트 | 줄 | 역할 | props 위치 |
|---|---|---|---|
| `FileViewer.tsx` | 10,169 | **아티팩트 프리뷰 라우터** (HTML/React/MD/SVG/이미지/비디오/오디오/스케치/PDF). HtmlViewer가 듀얼-iframe 브리지 (§5.7) | `:936` |
| `SettingsDialog.tsx` | 7,521 | 설정 전 surface — Execution/Keys(BYOK)/Library/Memory/Appearance/Design Systems. **Braze API 키 추가 위치** | `:1069` |
| `ProjectView.tsx` | 6,611 | 프로젝트 에디터 (파일트리+FileWorkspace+ChatComposer+ChatPane+사이드바) | — |
| `ChatComposer.tsx` | 4,817 | 입력(Lexical @-mention)+첨부+컨텍스트선택. `ChatComposerHandle`(imperative), `ChatSendMeta`(queueOnly/research/context/skillIds) | `:160` |
| `FileWorkspace.tsx` | 4,393 | 2-패널(파일트리+프리뷰), 탭상태, 질문폼 탭 | `:366` |
| `DesignSystemFlow.tsx` | 4,365 | `DesignSystemCreationFlow`(setup→processing→generated) + `DesignSystemDetailView` | `:297` |
| `HomeHero.tsx` | 3,902 | 홈 입력 hero, 스타터칩, 플러그인/스킬 픽. `HomeHeroHandle` | `:95` |
| `ChatPane.tsx` | 3,675 | 메시지 로그, `AssistantMessage`(memo), 스크롤 앵커(유저턴 top 고정), PinnedTodoSlot, 질문폼 배너 | `:420` |
| `DesignBrowserPanel.tsx` | 3,138 | 디자인시스템 브라우징/임포트 | — |
| `EntryShell.tsx` | 3,056 | 홈 레이아웃 셸 (nav rail + view 라우팅) | `:405` |

### 5.7 FileViewer 듀얼-iframe 브리지 (프리뷰의 심장 — Braze 메시지 프리뷰 핵심)
- **렌더 모드 결정** `shouldUrlLoadHtmlPreview()` (`file-viewer-render-mode.ts:76-96`): preview 모드 & 비-deck & 비-comment/inspect/edit/palette/draw/tweaks & 비-forceInline일 때만 **URL-load**(`<iframe src=/api/projects/:id/raw/:file>`). 하나라도 걸리면 **srcDoc 인라인**(브리지 주입). 새 srcDoc-전용 브리지 추가 시 `UrlLoadDecision`에 disqualifier 추가.
- **호스트가 두 iframe 동시 마운트, CSS visibility 스왑** (모드 토글 시 리로드 플래시 방지). `iframeRef.current`는 활성 iframe과 정렬.
- **postMessage `od:*` 프로토콜**:
  - 호스트→iframe: `od:srcdoc-transport-activate`, `od:comment-mode`, `od-edit-mode`, `od-edit-preview-style`(id,styles,version), `od:inspect-mode`, `od:inspect-overrides`, `od:preview-scroll-restore`.
  - iframe→호스트: `od:comment-hover/leave`, `od:preview-scroll`, `od:inspect-target`, `od:tweaks-available`, `od:slide-state`.
  - 수신 필터 `isOurIframe(ev.source)` (양쪽 허용); 활성 전용 신호(`od:tweaks-available`)는 `ev.source === iframeRef.current?.contentWindow` 재확인.
- **Braze 포인트**: 메시지 HTML 프리뷰는 FileViewer/HtmlViewer 재사용. modal/slideup/full IAM 렌더 + 브랜드토큰 인라인. 편집은 ManualEditPanel/PaletteTweaks 재사용.

### 5.8 i18n (`src/i18n/`)
- 18 로케일: `ar de en es-ES fa fr hu id it ja ko pl pt-BR ru th tr uk zh-CN zh-TW`. `I18nProvider`+`useI18n()`/`useT()`. RTL: `ar fa`.
- **키 추가 절차**(엄격, AGENTS.md): ① `types.ts`의 `Dict`에 키 추가(먼저, 안 하면 typecheck 에러) → ② `content.ts`(영문) → ③ 18개 `content.<locale>.ts` 전부. `t('key',{vars})` 보간.

### 5.9 분석/관측 (`src/analytics/`, `src/observability/`)
- `AnalyticsProvider`/`useAnalytics()` (track/setConsent/setIdentity). `analytics/events.ts` 타입드 헬퍼(`trackPageView/trackRunCreated/trackRunFinished` → `send()`). PostHog 백엔드, consent 게이트.
- `installWebObservability()` = bootTiming + longTask + whiteScreenDetector + resourceError + stuckRunTracking.
- **Braze 추가**: `trackBrazeMessageCreated({campaignId,templateId,agentId,success,durationMs})`.

### 5.10 CSS 소유권
- `src/index.css` = **import-only 캐스케이드** (선택자 추가 금지). 순서: remixicon → tokens → base → primitives → shell/chat/design-system-flow/entrance → workspace/* → viewer/*.
- 신규 컴포넌트는 **CSS Module**(`Component.module.css`) 우선, 공유 전역은 `styles/`. 토큰 변수(`--color-*`/`--space-*`/`--font-*`) 재사용. 새 전역 선택자는 소유 feature 문서화. (AGENTS.md "Web CSS ownership" / "UI animation philosophy": ease-out `cubic-bezier(0.23,1,0.32,1)`, enter ~200ms/exit ~140ms, accordion `grid-template-rows 0fr→1fr`.)
- 컴포넌트 reuse: `@marketing-ax/components`의 `Button`/`VisuallyHidden` 등 우선, raw `primary`/`ghost`/`sr-only` 신규 금지.

### 5.11 Braze 포크 — 웹 변경 7-포인트 (착지 위치)
1. `router.ts` union + parse/build에 `braze-messages` kind.
2. `state/braze.ts` + `AppConfig.braze?` + sync 함수.
3. `providers/braze.ts` (streamViaDaemon 재사용).
4. `components/BrazeMessageEditor.tsx` 신설 (ChatComposer→템플릿픽으로 치환, FileViewer 프리뷰 재사용).
5. `SettingsDialog.tsx`에 Braze 키 섹션(endpoint/API key/app key).
6. `analytics/events.ts` Braze 이벤트.
7. `i18n/types.ts` + 18 로케일 `braze.*` 키.
8. App.tsx `appMain` 분기 마운트.

**재사용 vs 교체**: 재사용 — FileViewer/HtmlViewer(프리뷰), PaletteTweaks/ManualEditPanel(편집), ChatPane(이력/피드백), SettingsDialog(키). 교체 — `ProjectFile`→`BrazeMessage` 모델, ChatComposer 자유입력→템플릿픽, FileWorkspace 탭→메시지+variant 셀렉터, DesignSystemFlow→Braze 템플릿 라이브러리, HomeHero→메시지 신규/편집 진입.

---

## 6. Braze 포크 — 권장 진입 순서

> ⚠️ **BRAZE-DOMAIN §4.4 반영**: 아래 2·4는 IAM JSON 모델 기준이라 수정됨 — `braze_messages`=HTML 아티팩트 메타+핸드오프 상태, `braze_iam_v1`=Custom HTML 아티팩트(JSON 아님).

1. **vitest coverage 계측 추가** + `db.ts` red-spec 작성 (테이블 추가의 안전망).
2. `db.ts`에 `braze_messages` 테이블(아티팩트 메타+핸드오프 상태) 인라인 마이그레이션.
3. `braze-client.ts` 신설 (xai-tokens 패턴, `<dataDir>/braze-tokens.json`) — REST 채널(push/email/content-card)·trigger/send·schedule용. IAM 전송 아님.
4. `live-artifacts/schema.ts`에 `format:'braze_iam_v1'`(=Custom HTML 아티팩트) 추가 + HTML→iframe 프리뷰 재사용 (§3.4 5-파일 계약 먼저 문서화).
5. 스킬/디자인시스템 frontmatter를 "메시지 템플릿 유형 + 브랜드 토큰"으로 재해석.
6. HTTP 엔드포인트 + 웹 UI + `od braze` CLI 서브커맨드 **3종 동시** 착지 (capability dual-track 규칙).
7. ⚠️ §3.1 route-registry 추출은 확정 P1 스코프(startChatRun+shouldRunReview 리팩터만)와 충돌 — 포크 초기 강제 추출 안 함 (DECISIONS 2026-06-23).

---

## 7. 부록 — 정밀 레퍼런스 (수정 진입용)

### 7.1 라우트 인벤토리
**register\*Routes 모듈** (server.ts import `:480-506`) — 신규 도메인은 이 패턴 따름:
`registerChatRoutes`(chat-routes.ts), `registerProjectRoutes`/`ProjectArtifactRoutes`/`ProjectFileRoutes`/`ProjectUploadRoutes`(project-routes.ts), `registerMediaRoutes`(media-routes.ts), `registerMcpRoutes`(mcp-routes.ts), `registerLiveArtifactRoutes`/`registerDesignSystemToolRoutes`/`registerDeployRoutes`/`registerGenuiRoutes`/`registerHostToolsRoutes`/`registerMemoryRoutes`/`registerRoutineRoutes`/`registerStaticResourceRoutes`/`registerActiveContextRoutes`/`registerAutomationRoutes`/`registerXaiRoutes`/`registerVelaRoutes`/`registerHandoffRoutes`(routes/*), `registerPluginRoutes`/`PluginAssetRoutes`/`PluginMarketplaceRoutes`/`PluginEventRoutes`/`ProjectPluginRoutes`(routes/plugins/*), `registerFinalizeRoutes`/`ImportRoutes`/`ProjectExportRoutes`(import-export-routes.ts), `registerConnectorRoutes`(connectors/routes.ts), `registerTerminalRoutes`, `registerSocialShareRoutes`.

**server.ts 인라인 엔드포인트 (67개, 카테고리별 라인)** — Braze는 여기 합류 말고 register\* 모듈로:
| 카테고리 | 예시 (METHOD path @line) |
|---|---|
| Health/Status | GET /api/health@4977, /api/ready@4982, /api/version@4992, /api/daemon/status@5055, /api/daemon/db@5085 |
| Daemon ops | POST /api/daemon/db/verify@5148, /vacuum@5164, /shutdown@5192; GET /api/metrics@5211, /api/analytics/config@5339; POST /api/observability/event@5385 |
| Projects/Conv | DELETE /api/projects/:id@5960; GET /events@5979; GET/POST /conversations@6020/6027; PATCH/DELETE /:cid@6085/6094; GET messages@6105; PUT message@6113 |
| Comments/Tabs | GET/POST comments@6138/6148; PATCH/DELETE@6167/6192; GET/PUT tabs@6213/6220 |
| Templates | GET /api/templates@6250, /:id@6254; POST@6260; DELETE@6310 |
| Design Systems | GET/POST /api/design-systems@6356/6367; generation-jobs@6376; revision-jobs@6397; token-contract/rebuild-jobs@6413; /:id@6473; /workspace@6489; /files@6501 |

### 7.2 런타임 에이전트 정의 (`runtimes/defs/`, 24+)
`RuntimeAgentDef` 필드 (types.ts `:93`): id, name, bin, versionArgs, fallbackModels, `buildArgs(prompt,imagePaths,extraDirs?,opts?,ctx?)`, streamFormat, fallbackBins?, promptInputFormat('text'|'stream-json'), eventParser?, env?, listModels?/fetchModels?, supportsImagePaths?, maxPromptArgBytes?, mcpDiscovery?, externalMcpInjection('claude-mcp-json'|'acp-merge'|'opencode-env-content'), resumesSessionViaCli?.
- defs: aider, amp, amr, antigravity, **claude**(promptInputFormat='stream-json', externalMcpInjection='claude-mcp-json', resumesSessionViaCli), codex, codebuddy(stream-json), copilot, cursor-agent, deepseek, devin, gemini, grok-build, hermes, kilo, kimi, kiro, opencode, pi, qoder, qwen, reasonix, trae-cli, vibe.
- **Braze**: 에이전트 계층 변경 불필요 (메시지 카피/구조 생성은 기존 런타임 그대로 사용).

### 7.3 contracts API 모듈 (`packages/contracts/src/api/`, ~30)
주요 DTO 소유 파일: `app-config.ts`(AppConfigPrefs), `artifacts.ts`(ArtifactKind/Status), `chat.ts`(ChatRole/SessionMode/ChatRequest), `comments.ts`(PreviewComment), `connectors.ts`(ConnectorDetail), `files.ts`(ProjectFile), `live-artifacts.ts`(LiveArtifact 미러), `mcp.ts`(McpServerConfig), `media.ts`(MediaExecutionPolicy), `memory.ts`(MemoryEntry), `projects.ts`(ProjectKind/Platform/DisplayStatus), `proxy.ts`(ProxyStreamRequest), `registry.ts`(AgentInfo/AgentModelOption), `research.ts`(ResearchOptions), `routines.ts`(RoutineSchedule/Kind), `terminals.ts`(TerminalSession/SseEvent), `version.ts`(AppVersionInfo).
- **Braze**: 신규 `api/braze.ts` — `BrazeMessage`, `BrazeMessageInput`, `BrazeCampaign`, `BrazeGenerateRequest` DTO. **데몬/웹 분기 전 여기 먼저 정의** (AGENTS.md: contracts가 SSOT, 순수 TS 유지).

### 7.4 capability dual-track 클로저 (신규 기능 1-PR 3종 동시)
HTTP 엔드포인트(`routes/braze.ts` + `api/braze.ts` 계약) + 웹 UI(`apps/web/src/`) + `od braze` CLI 서브커맨드(`cli.ts` `SUBCOMMAND_MAP` 등록, `--json`/`--prompt-file` 지원). 셋 다 같은 `/api/*` 호출. PR 템플릿 Surface area에 UI+CLI 양쪽 체크.

---

## 8. 관련 포크 문서 + 이미 결정된 사항 (⚠️ 먼저 읽을 것)

> 이 레포는 **이미 포크 기획 진행 중** (브랜치 `docs/marketing-ax-fork-plan`). 아래 결정을 **재도출·모순 금지**. 이 §8은 그 문서들의 요약 cross-ref — 충돌 시 원문이 SSOT.

### 8.1 관련 문서 맵
| 문서 | 내용 |
|---|---|
| `FORK-DELTA.md` | 제거/리네임/확장/신규 버킷 |
| `FORK-GUIDE.md` | 재사용 매트릭스(패키지별), 라이선스/리브랜딩 의무 |
| `ENGINE-BRAIN-SEAM.md` | engine(도메인무관)/brain(도메인특화) 파일 분류 — **물리분리는 폐기, 분류는 참고용** |
| `DECISIONS.md` | 확정 결정 누적 (2026-06-22~23) |
| `docs/superpowers/specs/2026-06-22-marketing-ax-product-design.md` | 제품 정의 (5개 출력) |
| `docs/superpowers/plans/2026-06-22-p0-rebranding.md` | P0 리브랜드 태스크 9개 |
| `docs/superpowers/plans/2026-06-22-p1-engine-brain-seam.md` | P1 = startChatRun 리팩터만 |
| `docs/handoffs/2026-06-22-1653.md` | 블로킹 제약 |

### 8.2 제품 방향 — Braze는 5개 출력 중 **하나**
- 기존 기획 = **"Marketing AX" 브랜드 마케팅 크리에이티브 워크스페이스** (OD의 standalone 포크, Apache-2.0).
- 출력 5종: ① 크리에이티브 기획 ② 블로그 ③ SNS 카드/HTML ④ 랜딩페이지 ⑤ **Braze HTML In-app 메시지**.
- 차별점: 단일 에이전트 생성이 아니라 **유저 커스텀 리뷰 파이프라인** (브랜드핏/톤/법무/팩트체크 서브에이전트 조립).
- **⚠️ 스코프 결정 필요 (사용자)**: (a) 전체 Marketing AX 빌드 후 Braze=5분의1, vs (b) Braze-only로 4개 출력·리뷰 파이프라인 제거하고 최소화. 기존 문서는 (a) 전제. Braze 단독 툴 원하면 (b)로 FORK-DELTA의 REMOVE 범위 확대.

### 8.3 확정 아키텍처 (2026-06-23) — 재설계 금지
- **단일 marketing brain.** 1 도메인, N 브랜드+출력은 데이터. **engine/brain 물리분리·BrainProvider DI 폐기 (YAGNI).**
- ⮕ **내 §3.1 "route-registry 추출" 권장은 결정과 충돌** — 확정 P1 스코프는 ① `startChatRun` god-function(`server.ts:8123~`) 프롬프트빌더 클로저 추출 ② lockstep 3곳(7925 gate / ~8000 addendum / 9995 orchestrator) → `shouldRunReview()` 수렴 **두 가지뿐, 가독성·락스텝 버그 제거 목적**. 디렉터리 이동·추상화 금지. (§3.1은 "이상적 구조" 참고로만, 실행은 P1 스코프 준수.)
- 브랜드 = `DESIGN.md` + Voice&Tone / Target Audience / Messaging Pillars 섹션 → `composeSystemPrompt`로 자동 주입 (§10).
- 리뷰 = **기존 파이프라인 엔진**(devloop + until + scoreboard + SSE) 재사용 + 커스텀 UI. OD critique-theater 5-role panel + Theater UI는 **제거**. 2차 스폰은 보류(품질바 미검증).
- Braze IAM = **프로토타입 모드 + Braze 제약 템플릿**으로 빌드. HTML→iframe 파이프라인(`renderer-registry`→`srcdoc`→`FileViewer`) **그대로 재사용** — 신규 렌더러 불필요.

### 8.4 engine/brain 분류 (참고용, 물리분리 아님)
- **ENGINE (도메인무관, 무변경)**: `runtimes/*`+`agents.ts`(스폰/스트림), `plugins/pipeline*.ts`·`until.ts`·`atoms/registry.ts`, `critique/orchestrator.ts`·`scoreboard.ts`·`run-registry.ts`, `db.ts`(워크스페이스 테이블)·`storage/*`, BYOK 프록시+SSE(`chat-routes.ts:913-1259`), 엔진 라우트(active-context/host-tools/static-resource/routine/memory/automation/terminal/mcp/connectors).
- **BRAIN (도메인특화, Braze에서 수정)**: `prompts/system.ts`·`panel.ts`, `design-systems.ts`·`design-system-import.ts`·`design-system-generation-jobs.ts`, `plugins/atoms.ts`(23 도메인 atom), 도메인 라우트(design-system-tool/genui/vela/deploy/handoff/media/plugins), `contracts/critique.ts`.
- **누수 경계 (수정 시 주의)**: `plugins/atoms/built-ins.ts`(FIRST_PARTY_ATOMS import), `server.ts` 정적 import(design-systems/system.ts/orchestrator), `db.ts:59-60`(projects.skill_id/design_system_id).

### 8.5 리브랜드/라이선스 의무 (P0)
- **Apache-2.0**: LICENSE 사본 유지, 수정 파일 표시, 기존 저작권 고지 유지. **"Open Design" 상표 사용 금지** (§6) — 제품명/마크 제거 필수.
- **리네임 규모 (대규모, 표면적 아님)**: npm scope `@open-design/*` → 24 package.json + **import 1037곳/512파일**; env `OD_*` → ~202키, 직접읽기 **~880곳/272파일**; `od://`+`__od__`+`.od`+세션파티션; appId/서명/레지스트리; 하드코딩 URL. "Open Design" 문자열 7157곳.
- **macOS sed 주의**: BSD `sed`는 `\b` 미지원 → `perl -pi -e`. `.od`는 anchored 치환(`.odd` 누수 금지).
- 검증 게이트: `pnpm typecheck`(import+env 수렴) → `pnpm guard`(product-neutrality/web isolation) → `pnpm tools-dev run web`(부팅 + `.max/` 생성 + `max://` 동작).

### 8.6 현재 상태
P0 v2 플랜 완료, **구현 0/9**. 시작 지점 = P0 task 1(npm scope). 코드 정찰로 P0 v1이 규모 ~50× 과소추정 판명 → 카테고리 전면 치환(순차, 병렬 sed 충돌).

---

## 9. 확장 콘텐츠 작성 포맷 (에이전트가 Braze 출력 뽑는 실제 메커니즘)

Braze 메시지 유형 = **스킬/디자인템플릿**, 브랜드 = **디자인시스템**. 에이전트는 이 on-disk 파일을 읽어 출력.

### 9.1 SKILL.md (skills/ · design-templates/ 공용)
구조: `<skill-root>/SKILL.md` + `assets/` + `references/` + `examples/`. frontmatter = YAML, body = 에이전트가 읽는 워크플로 마크다운.

핵심 필드 (전체는 `docs/skills-protocol.md`):
- 필수: `name`, `description`, `triggers[]`
- 로케일: `zh_name`/`en_name`/`zh_description`/`en_description`, `category`, `emoji`, `featured`, `tags[]`
- **`od.*` 네임스페이스**:
  - `od.mode`: `prototype|deck|template|design-system|utility|image|video|audio`
  - `od.surface`/`od.platform`/`od.scenario`, `od.upstream`
  - `od.preview.{type(html|jsx|pptx|markdown), entry, reload}`
  - `od.design_system.{requires(bool), sections[]}` — DESIGN.md 주입 여부 + 섹션 프루닝(토큰 절약)
  - `od.craft.requires[]` — craft 룰 주입 (예 `[typography, color, anti-ai-slop]`)
  - `od.inputs[]`(UI 폼 필드), `od.parameters[]`(생성 후 라이브 슬라이더), `od.outputs.{primary, secondary[]}`
  - `od.example_prompt` + `od.example_prompt_i18n{locale: prompt}`, `od.capabilities_required[]`, `od.default_for`

**최소 Braze 템플릿 스킬** (`design-templates/braze-message/SKILL.md`):
```yaml
---
name: braze-message-template
description: Braze in-app-message 템플릿 — card/modal/banner, CTA, 디자인시스템 준수.
triggers: ["braze", "in-app message", "iam"]
od:
  mode: template
  surface: mobile
  preview: { type: html, entry: preview.html }
  design_system: { requires: true, sections: [color, typography, components] }
  craft: { requires: [color, typography, anti-ai-slop] }
  example_prompt: "프로모션 modal IAM을 CTA 2개로 만들어줘."
---
# Braze Message Template Workflow
1. 활성 DESIGN.md 읽어 브랜드 컬러·타이포·spacing 확보.
2. 유형 선택: card / modal / banner / full.
3. 플레이스홀더 채우기: headline, body, image?, CTA 1–2.
4. preview.html 생성 (Braze JSON + HTML 렌더러).
5. self-check: 위계 명확 / accent ≤2회 / 하드코딩 컬러 0(var(--*)) / letter-spacing 룰.
6. 출력: HTML 1파일 + braze-message.json (Braze API 포맷).
```

### 9.2 DESIGN.md (디자인시스템 = 브랜드)
`design-systems/<slug>/DESIGN.md` — 9 섹션 prose: ① Visual Theme ② Color Palette & Roles ③ Typography ④ Component Stylings ⑤ Layout ⑥ Depth & Elevation ⑦ Do's/Don'ts ⑧ Responsive ⑨ Agent Prompt Guide. 실예 `design-systems/apple/DESIGN.md`.

형제 파일:
- `manifest.json` — `schemaVersion:"od-design-system-project/v1"`, `files{design,tokens,designTokens,tailwind,components}`, `craft{applies,suggested,exemptions}`, `preview{dir,pages}`.
- `tokens.css` — `:root{ --bg --surface --fg --accent --font-display --font-body --text-xs..4xl --leading-* --tracking-* --space-1..12 --radius-* }`.
- `design-tokens.json` — `schemaVersion:1, format:"od-design-tokens/v1"`, `summary{score,grade,layerCounts}`, `tokens[]{name,value,type,layer(A1-identity|B-slot|A2|A1-structure),confidence,reason,sources}`.
- `tailwind-v4.css`(@theme), `components.html`(픽스처), `USAGE.md`, `preview/`, `source/evidence.md`.
- **Braze 브랜드 확장**: DESIGN.md에 Voice&Tone / Target Audience / Messaging Pillars 섹션 추가 (§8.3 확정) → 프롬프트 자동 주입.

### 9.3 design-template (SKILL.md과 동일 포맷)
`design-templates/<slug>/` — SKILL.md 매니페스트 동일, `od.mode`가 `deck|prototype|image|video|audio` 등. baked `example.html`(production-ready, 플레이스홀더 금지). deck는 키보드/휠/터치/dots 네비 계약 (`design-templates/AGENTS.md`).

### 9.4 craft (브랜드무관 룰, 스킬이 opt-in)
`craft/<slug>.md` — DESIGN.md 위에 얹는 보편 룰. 파일: `typography(-hierarchy/-editorial)`, `color`, `anti-ai-slop`, `state-coverage`, `animation-discipline`, `accessibility-baseline`, `rtl-and-bidi`, `form-validation`, `laws-of-ux`. 스킬 frontmatter `od.craft.requires:[...]`로 주입.
- **자동 검사(P0)**: `apps/daemon/src/lint-artifact.ts` — indigo accent 금지, 2-stop hero gradient 금지, emoji-as-icon 금지 등. 나머지는 guidance.

---

## 10. 시스템 프롬프트 합성 + Braze 출력 스티어링

### 10.1 `composeSystemPrompt()` (`prompts/system.ts:508-871`)
29-layer 스택을 **엄격 순서**로 조립 (순서 = 우선순위, 뒤가 recency로 이김):
1. injection resistance(FIRST) → 2. API 모드 override(`streamFormat==='plain'`) → 3. chat 모드 override → 4. skip-discovery → 5. UI locale → **6. DISCOVERY_AND_PHILOSOPHY(~3K토큰 RULE 1/2/3)** → 7. direction 라이브러리(활성 DS 없을 때) → 8. shared frames → 9. official designer 프롬프트 → 10. personal memory → 11. custom instructions → **12. 활성 디자인시스템(DESIGN.md + tokens.css + manifest)** → 13. 활성 craft → **14. 활성 스킬(→`derivePreflight()` asset read)** → 15. plugin → 16. stage atoms → 17. 프로젝트 metadata → **18. deck framework(LAST 고정)** → 19. media contract → … → 25. 중간대화 clarifying → 26. role-marker guard(LAST, recency).

입력: skillBody, designSystemBody, designSystemTokensCss(verbatim `:root{}`), componentsManifest, metadata(kind/platform/fidelity…), craftBody, locale.

### 10.2 디스커버리 RULE 1/2/3 (`prompts/discovery.ts:23-305`)
- **RULE 1 (턴1)**: `<question-form id="discovery">` 또는 `id="task-type"` + prose 1줄. STOP (툴·thinking 금지).
- **RULE 2 (턴2)**: `brand` 답으로 분기 — A(`brand_spec`/`reference_match`): brand-spec 추출(Bash+Read+WebFetch)→`brand-spec.md`; B(그외): 활성 DS 사용 or 직접 선택.
- **RULE 3 (턴3+)**: TodoWrite 9-step → build → P0/P1/P2 체크리스트 → 5-dim critique(philosophy/hierarchy/execution/specificity/restraint 각 ≥3/5) → artifact emit(신규 canonical HTML 작성 시만).
- `<question-form>` = **툴콜 아님**, UI 파싱 마크업. `id`/option `value`는 영문 고정(라우팅용 `pick_direction`/`brand_spec`/`reference_match`), 표시문구만 로케일.

### 10.3 BYOK 미러 (`packages/contracts/src/prompts/system.ts:239-408`)
데몬↔BYOK 모드 동기화 필수. `API_MODE_OVERRIDE`/`CHAT_MODE_OVERRIDE` byte-for-byte 복사. 데몬에만 있는 extras(injection resistance, DS 구조화 필드, craft, critique, agent override)는 BYOK엔 없음. **Braze 출력 계약 추가 시 양쪽 동기화.**

### 10.4 아티팩트 출력 계약 + Braze 주입 지점
- 기본 계약(`prompts/official-system.ts`): `<artifact type="text/html" title="..." identifier="...">` 완전 `<!doctype html>`, CSS 인라인. **신규 canonical HTML 작성 턴에만** emit (discovery.ts:184 invariant가 다른 단계 override).
- 가드: `role-marker-guard.ts:167`(`## user/assistant` 위조 마커 → 응답 truncate), `title-marker.ts`(`<od-title>` 추출).

**Braze 출력 스티어링 — 2가지 주입 옵션**:
- **Option A (빠름, 메타데이터)**: `system.ts` `renderMetadataBlock()`(`:1061-1398`)에서 `metadata.kind==='iam'`일 때 "`<artifact text/html>` 대신 Braze JSON manifest 출력" 블록 push. 디스커버리/RULE/DS/craft 전부 무변경, 최종 emit 모양만 변경.
- **Option B (권장, 스킬)**: `design-templates/braze-iam/SKILL.md` 작성(§9.1) — `assets/template.html`(IAM 스켈레톤) + `references/{layouts,checklist}.md`. 스킬 body가 system.ts:718 주입 시 `derivePreflight()`로 출력 모양 재정의. 워크플로·메타·우선순위 불변, 출력 shape만 스킬이 덮음.
- **두 옵션 공통 보존**: RULE 1/2/3, DS 주입, craft, 체크리스트+5-dim critique. **Braze는 "프로토타입 + 제약 템플릿"이므로 Option B가 §8.3 확정 방향과 일치.**

---

## 11. Braze 타깃 도메인 (✅ 리서치 완료 → `BRAZE-DOMAIN.md`)

> **완료 2026-06-23**: `deep-research` 스킬(107 에이전트, 24 primary 소스, 25 claim 3표 검증·0 kill)로 채움. 상세 → **[`BRAZE-DOMAIN.md`](./BRAZE-DOMAIN.md)**.
>
> 핵심 검증 사실: IAM 6유형(slideup/modal/fullscreen/custom_html + 웹전용 2), 이미지 PNG/JPEG/GIF·≤5MB·유형별 종횡비, CTA ≤2·하드 글자제한 없음, `brazeBridge`(appboyBridge deprecated)·`allowUserSuppliedJavascript` 게이트·logClick('0')/('1') 매핑, 인스턴스별 REST 호스트·Bearer 인증·`/messages|campaigns|canvas/trigger/{send,schedule}`·Content Block CRUD, 트리거 페이로드(`campaign_id`+`trigger_properties`+`broadcast`+`audience`+`recipients`≤50).
>
> ⚠️ 미검증 잔여(BRAZE-DOMAIN §6 Open Q): `/messages/send` 인라인 IAM 스키마, 세그먼트/트리거 상세, slideup 글자제약, HTML/CSS 샌니타이징 — 구현 전 2차 리서치.

원래 리서치 대상 항목(전부 BRAZE-DOMAIN.md에서 처리):
1. **IAM 메시지 유형** — modal / slideup / full-screen / HTML-upload(커스텀 HTML) / content card. 각 유형의 필드·제약(이미지 크기, 글자수, CTA 개수). → §9.1 스킬 `od.mode` 변형 + 템플릿 분기.
2. **HTML In-app 제약** — Braze가 허용하는 HTML/CSS/JS 범위, `appboyBridge`/딥링크 액션, 클릭 트래킹 속성. → craft 룰 + lint-artifact 규칙으로 인코딩.
3. **Braze REST API** — endpoint(인스턴스별 `rest.iad-0X.braze.com`), 인증(API key + workspace), 캠페인/메시지 CRUD·send·schedule, 템플릿 API. → §2.2 `braze-client.ts` + §2.3 발송 잡 + §2.1 `braze_messages` 테이블 스키마 확정.
4. **메시지 JSON 스키마** — IAM payload 구조(message/buttons/extras/trigger). → `LiveArtifactDocument.format:'braze_iam_v1'`(§1.5) 데이터 모델.
5. **세그먼트/트리거** — 디스커버리 질문폼(§10.2)에 "타깃 세그먼트? 트리거 이벤트?" 추가 항목.

권장: 별도 `BRAZE-DOMAIN.md` 작성(Braze 공식 문서 리서치 산출) → 이 §11에서 링크. `deep-research` 스킬 활용 가능.

---

*분석 산출: 11 병렬 탐색 에이전트(3라운드) 교차검증 + 기존 포크 문서(FORK-DELTA/GUIDE/ENGINE-BRAIN-SEAM/DECISIONS/specs/plans) cross-ref. 라인 수·줄 번호·테스트 수는 분석 시점(0.10.0) 근사치 — 코드 변경 시 재확인 필요(needs verification). server.ts 인라인 라인 번호는 12.6K줄 파일이라 드리프트 가능. §11 Braze 도메인 리서치 완료(2026-06-23) → BRAZE-DOMAIN.md.*
