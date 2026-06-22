# Open Design — 아키텍처 분석 문서

> **목적**: 이 문서는 Open Design 프로젝트의 전체 아키텍처를 AI 에이전트가 코드베이스를 재분석하지 않고도 파악할 수 있도록 정리한 레퍼런스다. 다른 데스크톱 앱을 설계·구현할 때 참조용으로 사용한다.
>
> **작성 기준일**: 2026-06-22 / 분석 대상 버전: 0.10.0

---

## 0. 한 줄 요약

**Open Design**는 로컬 우선(local-first) 오픈소스 "에이전트 네이티브 디자인 워크스페이스"다. 사용자 머신에 설치된 코딩 에이전트 CLI(Claude Code, Codex, Cursor 등 22종+)를 자동 탐지해 디자인 스킬·디자인 시스템과 짝지어, 실제 HTML/CSS/모션 아티팩트를 라이브 프리뷰로 스트리밍한다. **Next.js 프론트 + Express 데몬 + Electron 셸 + SQLite** 구조의 pnpm 모노레포다.

핵심 워크플로우 루프: `brief → plugin → direction → design system → artifact → handoff → memory`

---

## 1. 아키텍처 전체 그림 (3-프로세스 모델)

이 프로젝트의 가장 중요한 설계 결정은 **3개의 독립 실행 단위를 분리**한 것이다. 데스크톱 앱이지만 Electron에 모든 것을 욱여넣지 않았다.

```
┌─────────────────────────────────────────────────────────────────┐
│                      DESKTOP (Electron 41)                        │
│  apps/desktop  — 메인 프로세스 (얇은 셸)                            │
│  ├─ BrowserWindow → 웹앱 로드 (od://app 또는 http://127.0.0.1:PORT) │
│  ├─ preload.cts → __od__ 글로벌로 네이티브 API 화이트리스트 노출     │
│  └─ Sidecar IPC (Unix socket JSON-RPC) ↔ 데몬과 통신               │
└────────────────────────────────┬────────────────────────────────┘
                                  │ HTTP + SSE + Sidecar IPC
┌────────────────────────────────┴────────────────────────────────┐
│                      DAEMON (Node 24 + Express 5)                  │
│  apps/daemon  — 로컬 백엔드 (실제 두뇌)                             │
│  ├─ /api/* REST + SSE 스트리밍 엔드포인트                           │
│  ├─ 에이전트 CLI 스폰 (stdio 파이프) / BYOK API 프록시              │
│  ├─ better-sqlite3 (프로젝트·대화·메시지 영속화)                    │
│  ├─ 플러그인 로더 / 디자인 시스템 로더                              │
│  └─ MCP stdio 서버 (다른 에이전트에 임베드 가능)                    │
└────────────────────────────────┬────────────────────────────────┘
                                  │ 정적 서빙 또는 리버스 프록시
┌────────────────────────────────┴────────────────────────────────┐
│                      WEB (Next.js 16 + React 18)                   │
│  apps/web  — 렌더러 / 프론트엔드 (UI 전체)                          │
│  ├─ 채팅 UI + 아티팩트 파서 + iframe 라이브 프리뷰                  │
│  ├─ 디자인 시스템·스킬 피커, 파일 워크스페이스, 프로젝트 관리        │
│  └─ SSE 클라이언트로 에이전트 스트림 수신                           │
└───────────────────────────────────────────────────────────────────┘
```

### 왜 이 분리가 중요한가 (다른 앱 설계 시 핵심 교훈)

- **데몬이 독립 실행 가능** → 같은 코어를 Electron 없이 헤드리스(Docker/서버)로 배포 가능. `apps/packaged`가 `headless.mjs`를 별도 번들로 만든다.
- **웹앱이 순수 SPA** → 데스크톱에서도, 브라우저에서도 동일 코드 실행. Electron은 "네이티브 능력만 추가하는 얇은 어댑터".
- **세 단위가 버전 독립** → `packages/sidecar`, `packages/sidecar-proto` 프로토콜이 앱 버전과 분리된 semver를 가진다.

---

## 2. 기술 스택

| 레이어 | 기술 | 버전 |
|--------|------|------|
| 언어 | TypeScript (100%, 전부 ESM) | 5.9.3 (desktop/packaged만 6.0.3) |
| 데스크톱 런타임 | Electron | 41.3.0 |
| 프론트엔드 | Next.js (App Router) + React | 16.2.6 / 18.3.1 |
| 스타일 | Tailwind CSS 4 + CSS Modules + PostCSS | 4 |
| 애니메이션 | `motion/react` (Framer Motion 후속) | — |
| 리치 텍스트 | Lexical | — |
| 백엔드 데몬 | Node + Express | Node 24 / Express 5.2.1 |
| DB | better-sqlite3 (WAL 모드) | 12.10.0 |
| 번들러 | esbuild (패키지·패키징) + tsc | — |
| 단위/통합 테스트 | Vitest | 4.1.6 |
| E2E 테스트 | Playwright | 1.60.0 |
| 패키지 매니저 | pnpm (workspace protocol) | 10.33.2 |
| 재현 빌드 | Nix flake (dream2nix) + mise 폴백 | — |
| 랜딩 페이지 | Astro (별도) | — |

**런타임 요구**: Node ~24.x (`engines` 강제), pnpm 10.33.2 (Corepack 핀 + `packageManager` 필드).

---

## 3. 모노레포 구조

`pnpm-workspace.yaml` 정의: `packages/*`, `apps/*`, `tools/*`, `e2e`.

### apps/ — 실행 단위

| 패키지 | 역할 |
|--------|------|
| **`daemon`** | Express 서버. 에이전트 스폰, `/api/*` 서빙, MCP stdio 서버, SQLite, 플러그인/디자인시스템 로더, BYOK 프록시(Anthropic/OpenAI/Azure/Google/Ollama, SSRF 방어 포함) |
| **`web`** | Next.js 16 프론트엔드. 채팅 UI, 아티팩트 파서, iframe 프리뷰, 피커, 파일 워크스페이스, MCP 설정 |
| **`desktop`** | Electron 메인 프로세스. 사이드카 프로토콜, 앱 라이프사이클, 네이티브 윈도우 관리 |
| **`packaged`** | 배포 집계 엔트리. 데몬+웹+데스크톱을 단일 배포물로 결합. `headless.mjs`(Electron 없는 서버판)도 생성 |
| **`landing-page`** | Astro 정적 마케팅 사이트 (open-design.ai) |
| **`telemetry-worker`** | Cloudflare Worker 분석(PostHog) |

### packages/ — 공유 라이브러리

| 패키지 | 역할 |
|--------|------|
| **`contracts`** | web↔daemon API 경계의 공유 TS 타입 (프로젝트 모델, 아티팩트 매니페스트, 디자인시스템/스킬 스키마, 분석). esbuild로 export별 슬라이스 번들 |
| **`components`** | 재사용 React UI 프리미티브(Button, Dialog, FormControls 등). 헤드리스 미니멀, esbuild 번들, TSDoc |
| **`platform`** | OS/프로세스 프리미티브(spawn, fs, env 탐지). **직접 `node:fs` 안 씀** → web/CI에서 주입 가능 |
| **`sidecar`** | 데스크톱↔웹 브릿지용 사이드카 IPC 런타임 (앱 버전과 독립 semver) |
| **`sidecar-proto`** | 사이드카 IPC 메시지 프로토콜 타입 |
| **`host`** | 렌더러 호스트 프로토콜 브릿지(아티팩트 iframe ↔ 메인/렌더러 통신) |
| **`plugin-runtime`** | 순수 TS 플러그인 매니페스트 파서/검증기/머저/리졸버/다이제스트. **`node:fs` 0** → 로더는 주입 |
| **`registry-protocol`** | 플러그인 레지스트리 백엔드 API 타입(zod 스키마) |
| **`agui-adapter`** | OD 내부 이벤트 ↔ AG-UI / CopilotKit 표준 프로토콜 양방향 어댑터 |
| **`diagnostics`** | 로그 수집/리댁션/zip 익스포트(데몬+데스크톱 트러블슈팅) |
| **`download`** | 파일 다운로드 조율 프리미티브 |
| **`launcher-proto`** | Electron 런처 프로토콜 타입(패키저↔앱 핸드오프) |
| **`metatool`** | 내부: 빌드된 툴 신선도 체크 메타데이터 헬퍼 |

> **설계 패턴 핵심**: 공유 패키지(`platform`, `plugin-runtime`)는 의도적으로 `node:fs`/DOM 의존을 0으로 유지. fs 접근이 필요한 곳은 **로더를 주입**받는다. → 같은 로직을 데몬·웹·CI 어디서든 재사용.

### tools/ — 빌드/개발 CLI

| 툴 | 명령 | 역할 |
|----|------|------|
| `dev` | `pnpm tools-dev` | 데몬+웹+데스크톱 라이프사이클 오케스트레이터(start/stop/logs/check, 포트 관리) |
| `pack` | `pnpm tools-pack` | Electron 바이너리 빌드(macOS .dmg, Win .exe, Linux .AppImage) |
| `serve` | `pnpm tools-serve` | 빌드된 웹 dist 로컬 서빙(릴리스 전 테스트) |

### 루트 디자인 에셋 디렉터리 (이 앱의 "콘텐츠")

| 디렉터리 | 내용 |
|----------|------|
| `skills/` | SKILL.md 파일(Claude Code 프로토콜) — web-prototype, saas-landing, dashboard 등 |
| `design-systems/` | 150개 DESIGN.md 시스템(9섹션 스키마: 팔레트/타이포/스페이싱/레이아웃/컴포넌트/모션/보이스/브랜드/안티패턴) |
| `design-templates/` | 덱/PPT 테마 36, HyperFrames 템플릿 11, Seedance 비디오 프롬프트 39 |
| `plugins/` | 261개 공식 플러그인(시나리오 11, 이미지템플릿 45, 비디오템플릿 50, 디자인시스템 래핑 142, atoms 13, examples 140) + community/ + registry/ |
| `prompt-templates/` | 이미지 93 + 비디오 프롬프트 카탈로그 |
| `craft/` | 편집 가이드(접근성, RTL, 타이포 위계, anti-AI-slop 체크리스트, 폼 검증) |
| `assets/` | 디바이스 프레임(iPhone 15 Pro, Pixel, MacBook), 아이콘, 레퍼런스 이미지 |
| `mocks/` | 테스트/시딩 픽스처 |

---

## 4. 데스크톱 앱 아키텍처 (Electron 상세)

### 4.1 엔트리 포인트

| 파일 | 역할 |
|------|------|
| `apps/desktop/src/main/index.ts` | 메인 프로세스 부트스트랩 & IPC 서버 |
| `apps/desktop/src/main/runtime.ts` | 윈도우 관리, 보안 게이트, API 오케스트레이션 |
| `apps/desktop/src/main/preload.cts` | 샌드박스 프리로드 브릿지(`__od__` 글로벌 노출) |
| `apps/packaged/src/index.ts` | 패키지 릴리스 엔트리(스플래시, 사이드카 오케스트레이션, 단일 인스턴스 락) |

> `.cts` 확장자 주의: 프리로드는 샌드박스에서 Node 모듈을 쓰려고 CommonJS로 별도 컴파일된다. 메인은 ESM이지만 Electron 호환을 위해 CJS 폴백 산출(`dist/main/index.js`).

### 4.2 IPC 패턴 (3종류)

**(A) 메인 ↔ 렌더러 (Electron contextBridge)**
프리로드가 `__od__` 글로벌에 **화이트리스트된 능력 객체**만 노출:
- `project` — 폴더 선택/임포트, 워킹디렉터리 작업 (HMAC 토큰 검증)
- `shell` — 외부 URL/파일매니저 열기 (경로 검증)
- `browser` — 세션 데이터 클리어
- `capture` — 스크린샷/페이지 캡처
- `updater` — 업데이트 체크/다운로드/설치
- `pdf` — PDF 출력
- `pet` — 데스크톱 펫 표시 토글

`ipcMain` 핸들러 예: `dialog:pick-and-import`(폴더 선택 → HMAC 토큰 발급 → `/api/import/folder`에 원자적 POST), `shell:open-external`(검증된 URL), `od:update:*`, `od:print-pdf`, `diagnostics:export-to-file`.

**(B) 메인 ↔ 사이드카 (Unix 소켓 JSON-RPC)**
`OD_SIDECAR_IPC_PATH` 경로의 Unix 소켓 위 양방향 JSON-RPC. 데몬이 데스크톱을 원격 제어(테스트/자동화/헤드리스)할 때 사용.
메시지 타입: `STATUS, EVAL, SCREENSHOT, CONSOLE, SHOW, CLICK, EXPORT_PDF, UPDATE, SHUTDOWN, REGISTER_DESKTOP_AUTH, MINT_IMPORT_TOKEN`.

**(C) 웹 ↔ 데몬 (HTTP + SSE)**
렌더러(웹앱)는 데몬 `/api/*`로 fetch + SSE. Electron IPC를 거치지 않음 — 브라우저 환경과 동일 코드 경로.

### 4.3 윈도우 & 네이티브 통합

- **스플래시 윈도우**: 데몬 콜드부트 시간을 가리려 데몬 기동 전 먼저 표시(패키지판).
- **메인 BrowserWindow**: `discoverUrl()` 로드. `webPreferences.sandbox: true`.
- **펫 윈도우**: 선택적 플로팅 윈도우(360×300).
- **세션 파티션**: `persist:open-design-design-browser`로 격리.
- **네이티브 메뉴**: 표준 + Develop 메뉴(Cmd/Ctrl+Alt+Shift+D로 토글, AMR 프로파일 전환).
- **자동 업데이트**: 릴리스 메타데이터 피드 폴링 → 검증 다운로드 → 렌더러 알림. 채널별 주기(stable 6h, beta 15m).

### 4.4 보안 경계 (다른 앱에 그대로 차용 가치 높음)

- 프리로드 샌드박스 + contextBridge로 화이트리스트 API만 노출.
- 경로 검증: 비절대경로/상대 심링크/`.app` 번들(macOS) 거부.
- `/api/import/folder`에 **HMAC 토큰 게이트**(데스크톱 전용 시크릿) — PR #974 보안 경계.
- 프로세스별 auth 시크릿을 기동 시 발급해 데몬에 등록. 세션 중 데몬 재시작 시 lazy 재인증(503 `DESKTOP_AUTH_PENDING` 재시도).

---

## 5. 프론트엔드 아키텍처 (apps/web)

### 5.1 상태 관리 — "라이브러리 없음" 철학

**Redux/Zustand/Jotai 미사용.** React 내장 `useSyncExternalStore` 기반의 경량 패턴:

- **커스텀 라우터** `apps/web/src/router.ts`: react-router 없이 URL 기반 상태.
  - enum 라우트: `home | project | marketplace-detail | design-system-*`
  - 중앙 `navigate()` + 마이크로태스크 지연 업데이트(안전한 리렌더)
  - `window.history.pushState()` + 커스텀 popstate 디스패치, 딥링크 지원
  - 경로 인코딩 예: `/projects/:id/conversations/:cid/files/:path`
- **로컬스토리지 백킹 config** `apps/web/src/state/config.ts`: 사용자 설정(API 프로토콜, CLI 선호, 디자인시스템 선택) → localStorage + 데몬 `/api/config` 동기화.
- **데몬 프로바이더** `apps/web/src/providers/daemon.ts`: 채팅/런 이벤트 SSE 클라이언트.

### 5.2 컴포넌트 구조

- **모놀리식 루트** `apps/web/src/App.tsx`(~86KB)가 전 뷰 오케스트레이션:
  - `EntryShell` → marketplace/projects/design-systems/integrations
  - `ProjectView` → 채팅 + 아티팩트 프리뷰어 + 워크스페이스 탭
  - `WorkspaceTabsBar` → 파일/채팅/터미널/라이브아티팩트 멀티탭
- `apps/web/src/components/`에 **~202개 피처 컴포넌트 파일**(ChatPane, DesignSystemFlow, ConnectorsBrowser 등).
- 스타일: Tailwind 유틸 + CSS Modules(`.module.css`) 혼용. styled-components/Emotion 미사용. **디자인 토큰 레이어는 UI가 아니라 아티팩트 생성 시점에 적용**됨.

### 5.3 데이터 흐름

```
1. React 컴포넌트 액션 → 데몬 API 호출(fetch POST / SSE)
2. 데몬 처리 → SQLite 저장 → SSE 이벤트 emit
3. 프론트 SSE 구독 → 컴포넌트 상태 갱신 → 리렌더
```

---

## 6. 데이터 레이어

### 6.1 SQLite (메타데이터)

- 엔진: better-sqlite3, WAL 모드, FK 제약 on.
- 위치: `<projectRoot>/.od` (또는 `OD_DATA_DIR` env). Nix에서는 read-only store 회피 위해 `~/.od`.
- 스키마(`apps/daemon/src/db.ts`):
  - `projects`(id, name, skill_id, design_system_id, pending_prompt, metadata_json, ...)
  - `templates`, `conversations`, `agent_sessions`, `messages`, 그리고 마이그레이션으로 `critique`/`media_tasks`/`plugins`.

### 6.2 파일 기반 (실제 아티팩트)

- 프로젝트 파일은 `.od/projects/<id>/` 아래(HTML 아티팩트, 스케치, 업로드).
- **DB는 메타데이터만**, 실제 산출물은 파일시스템이 소유. 워크스페이스 탭 상태는 DB에.

### 6.3 디자인 시스템 영속 구조

`design-systems/<id>/`:
- `DESIGN.md` — 브랜드 가이드
- `design-tokens.json` / `tokens.css` — 토큰 값 + CSS 커스텀 프로퍼티
- `components.html` / `components.manifest.json` — 컴포넌트 라이브러리 + 메타
- `tailwind-v4.css`, `manifest.json`(schemaVersion, id, category, craft rules, preview pages)

> **핵심 철학 — "filesystem-of-skills"**: 디자인 시스템·플러그인·스킬을 전부 **이식 가능한 Markdown + JSON 파일**로 저장. DB가 아니라 파일이 진실의 원천. 에이전트가 런타임에 발견·리믹스 가능.

---

## 7. 플러그인 시스템

### 7.1 스펙 (`plugins/spec/SPEC.md`)

- **최소 플러그인**: `SKILL.md`(YAML frontmatter + Markdown)만 있는 디렉터리.
- **확장 플러그인**: `open-design.json` 매니페스트 추가(마켓플레이스 노출).

### 7.2 매니페스트 구조 (`open-design.json`)

```jsonc
{
  "specVersion": "1.0.0",
  "name": "...", "title": "...", "version": "...", "license": "...", "tags": [],
  "compat": { "agentSkills": ["./SKILL.md"] },
  "od": {
    "kind": "...",        // Import | Create | Export | Share | Deploy | Refine | Extend
    "taskKind": "...",    // new-generation | figma-migration | code-migration | tune-collab
    "mode": "...",        // prototype | deck | live-artifact | image | video | hyperframes | audio | design-system
    "scenario": "...",
    "pipeline": { "stages": [ /* discovery-question-form, file-write, live-artifact, critique-theater ... */ ] },
    "inputs": [ /* apply 시점 폼 필드 */ ],
    "capabilities": [ /* prompt:inject, fs:write, fs:read, mcp, subprocess, bash, network, connector */ ],
    "context": { "assets": [ /* 레퍼런스 파일 상대경로 */ ] }
  }
}
```

### 7.3 런타임 (`packages/plugin-runtime/src/`)

순수 TS(파서/검증기/머저/리졸버/다이제스트), `node:fs`/DOM 의존 0. 로더는 데몬·웹·CI가 주입.
로딩 흐름:
```
1. 웹이 데몬 레지스트리에서 플러그인 메타 fetch
2. plugin-runtime이 매니페스트 + SKILL.md 검증·머지
3. 데몬이 플러그인 컨텍스트 + capabilities를 에이전트 프롬프트에 주입
4. 에이전트가 아티팩트 스트리밍 → 프론트가 샌드박스 iframe에 렌더
```

---

## 8. AI / 에이전트 통합 (이 앱의 핵심 차별점)

### 8.1 에이전트 어댑터 (`apps/daemon/src/agents.ts`)

- 데몬이 `PATH`를 스캔해 설치된 CLI 자동 탐지: `claude, codex, cursor-agent, copilot, gemini, opencode, qwen, qoder, devin, cline, kimi, hermes, pi, trae, vibe` 등.
- CLI별 argv 모양과 스트림 파서를 정의. 스트림 포맷: `agent`(타입드 JSON), `stdout`(평문), `stderr`.
- CLI 미발견 시 **BYOK API 모드** 폴백(Anthropic/OpenAI/Azure/Google/Ollama/LM Studio/vLLM).
- `od mcp install <agent>`로 데몬을 MCP 서버로 해당 에이전트 설정에 와이어링.

### 8.2 아티팩트 스트리밍

- 마크다운 블록 파싱: `apps/web/src/artifacts/parser.ts`
- 라이브 아티팩트 스키마: `apps/daemon/src/live-artifacts/schema.ts`(샌드박스 iframe 내 HTML5+CSS+JS)
- 인스트림 GenUI: `apps/web/src/artifacts/question-form.ts`(생성 도중 사용자 입력 폼)

### 8.3 SSE 스트리밍 엔드포인트

- `apps/daemon/src/chat-routes.ts` — SSE 스트림
- `apps/daemon/src/project-routes.ts` — 프로젝트 파일/대화 API
- `apps/daemon/src/live-artifacts/store.ts` — 인메모리 라이브 아티팩트 레지스트리

---

## 9. 빌드 & 배포

### 9.1 빌드 체인

- **TS 빌드**: `tsc -p tsconfig.json` → `dist/main/index.js`(Electron용 CJS), 프리로드(`.cts`)는 별도 컴파일.
- **패키지 번들**: `apps/packaged/esbuild.config.mjs`가 `src/index.ts` → `dist/index.mjs`. `headless.mjs`(Electron 없는 서버판)도 번들. 웹앱은 Next standalone으로 정적 export 후 번들에 포함.
- **electron-builder 타깃**:
  - macOS: dmg(설치) + zip(포터블) + dir / 코드서명·노터라이즈 (`tools/pack/src/mac/builder.ts`)
  - Windows: NSIS(.exe) + 포터블 zip / 서명·버전 리소스 (`tools/pack/src/win/builder.ts`)
  - Linux: AppImage(주) + dir / glibc 호환 (`tools/pack/src/linux.ts`)
- **빌드 캐시**: `.tmp/tools-pack/` 아래 네임스페이스·OS별 계층. 키에 소스트리 해시+의존 버전+매니페스트 해시 포함.

### 9.2 배포 채널

- **릴리스 원본**: `https://releases.open-design.ai` (`OD_UPDATE_METADATA_URL`).
- **Docker**: `deploy/Dockerfile`(Alpine 단일 런타임 = 데몬+정적 export), `deploy/docker-compose.yml`(데몬+웹, Electron 없음, nginx 옵션).
- **Helm**: `tools/pack/helm/open-design/`(AWS/Azure/GCP/Tencent/Aliyun/Huawei).
- **데스크톱 채널**: stable(6h) / beta(15m) / preview / nightly. 채널별 메타 피드 `latest-<os>-<channel>.yml`.
- **업데이트 라이프사이클**: 메타 체크 → 다운로드 → 설치(JS 증분 또는 런처 재시작). SHA256 체크섬 + 서명 검증.

### 9.3 로깅/진단

- `apps/desktop/src/main/diagnostics.ts` — 진단 번들 익스포트.
- 로그: `logs/desktop/latest.log`, `logs/desktop/renderer.log`, `logs/daemon/`, `logs/web/`.
- Help 메뉴 또는 `window.openDesignDesktop.exportDiagnostics()`로 수동 익스포트(메인+렌더러 로그+크래시+시스템정보).

---

## 10. 테스트

| 종류 | 프레임워크 | 위치 |
|------|-----------|------|
| E2E | Playwright 1.60 | `e2e/tests/`, `e2e/ui/`, 설정 `e2e/playwright.config.ts` |
| 단위/통합 | Vitest 4.1 | `apps/web/tests/`, `packages/*/tests/` |
| 시각 회귀 | pixelmatch + pngjs | E2E 스크린샷 diff |

- E2E 우선순위 태그: `[P0] [P0P1] [P1] [P2]`.
- 테스트 카테고리: critical-smoke, app 워크플로우, 프로젝트 관리, 설정/API 프로토콜, 워크스페이스 키보드 내비, 실제 데몬 런(real-daemon-run, critique-theater).
- 헬퍼: `e2e/lib/`(페이지 오브젝트, 픽스처 빌더), 픽스처 `e2e/resources/`.

---

## 11. 개발 환경 & 주요 스크립트

### 11.1 빠른 시작

```bash
corepack enable
pnpm install
pnpm tools-dev run web    # 데몬+웹 포그라운드 개발
```

- `postinstall.mjs`가 `better-sqlite3` 네이티브 리빌드 처리(esbuild/sharp/protobufjs는 `onlyBuiltDependencies`).
- 데몬 데이터 디렉터리 계약은 변경 전 `AGENTS.md` 확인 필수.

### 11.2 루트 스크립트

| 스크립트 | 역할 |
|----------|------|
| `pnpm tools-dev` | 데몬+웹+데스크톱 라이프사이클 오케스트레이터 |
| `pnpm tools-pack` | 패키지 바이너리 빌드 |
| `pnpm tools-serve` | 빌드된 웹 export 로컬 서빙 |
| `pnpm guard` | 품질 검사(ESLint, 스타일 정책, 제품 중립성, cross-app import, postinstall 테스트, craft 레퍼런스 린트) |
| `pnpm typecheck` | 워크스페이스 전역 TS 체크(4 워커) + scripts/ tsc |
| `pnpm i18n:check` / `i18n:coverage` | i18n 커버리지(EN/ES/PT/DE/FR/ZH-CN/ZH-TW/KO/JA/AR/RU/UK/TR) |
| `pnpm seed:*` | 테스트 프로젝트/큐레이트 스킬 시딩 |
| `pnpm nix:update-hash` | Nix pnpm-deps 해시 갱신 |

---

## 12. 다른 데스크톱 앱을 만들 때 차용할 핵심 패턴 (요약)

1. **3-프로세스 분리(Electron 셸 / 로컬 데몬 / 웹 SPA)** — Electron은 네이티브 어댑터로만. 같은 코어로 데스크톱·웹·헤드리스 동시 지원.
2. **공유 패키지에 `node:fs`/DOM 0** — 로더 주입 패턴으로 데몬/웹/CI 재사용.
3. **프로토콜 패키지 분리(sidecar, contracts)** — 앱 버전과 독립 semver로 경계 안정화.
4. **contextBridge 화이트리스트 + 경로/HMAC 검증** — 보안 기본기.
5. **상태 라이브러리 없이 `useSyncExternalStore` + URL 라우터 + localStorage** — 경량 SPA.
6. **콘텐츠를 파일시스템(Markdown+JSON)으로** — DB는 메타만. 이식·버전·에이전트 발견 용이.
7. **SSE 스트리밍 데이터 흐름** — 에이전트/장기 작업 출력에 적합.
8. **`tools/dev` 같은 라이프사이클 오케스트레이터 CLI** — 멀티 프로세스 개발 경험 통합.
9. **패키징을 별도 `tools/pack` + `apps/packaged`로** — 빌드 캐시·멀티플랫폼·헤드리스 변형 분리.

---

## 13. 핵심 파일 인덱스 (빠른 점프용)

```
# 데스크톱
apps/desktop/src/main/index.ts        # 메인 부트스트랩 + IPC 서버
apps/desktop/src/main/runtime.ts      # 윈도우/보안/오케스트레이션
apps/desktop/src/main/preload.cts     # __od__ 브릿지
apps/desktop/src/main/diagnostics.ts  # 진단 익스포트
apps/packaged/src/index.ts            # 패키지 엔트리(스플래시/단일인스턴스)
apps/packaged/esbuild.config.mjs      # 패키지 번들 설정

# 데몬
apps/daemon/src/db.ts                 # SQLite 스키마/마이그레이션
apps/daemon/src/agents.ts             # 에이전트 CLI 어댑터/탐지
apps/daemon/src/chat-routes.ts        # SSE 채팅 스트림
apps/daemon/src/project-routes.ts     # 프로젝트 파일/대화 API
apps/daemon/src/live-artifacts/schema.ts  # 라이브 아티팩트 스키마
apps/daemon/src/live-artifacts/store.ts   # 인메모리 레지스트리

# 웹
apps/web/src/App.tsx                  # 모놀리식 루트(~86KB)
apps/web/src/router.ts                # URL 기반 커스텀 라우터
apps/web/src/state/config.ts          # 설정 영속(localStorage+데몬)
apps/web/src/providers/daemon.ts      # SSE 클라이언트
apps/web/src/artifacts/parser.ts      # 아티팩트 마크다운 파서
apps/web/src/artifacts/question-form.ts   # 인스트림 GenUI

# 공유
packages/contracts/src/               # web↔daemon 타입
packages/plugin-runtime/src/          # 플러그인 파서/검증/머지
packages/platform/src/                # OS/프로세스 프리미티브(fs 주입)
packages/sidecar/                     # 사이드카 IPC 런타임

# 스펙/설정
plugins/spec/SPEC.md                  # 플러그인 계약
pnpm-workspace.yaml / flake.nix / mise.toml
AGENTS.md                             # 데몬 데이터 디렉터리 계약 등
```

---

*이 문서는 코드베이스 정적 분석 기반이다. 일부 라인 번호·세부 구현은 버전에 따라 달라질 수 있으니, 실제 수정 작업 전에는 해당 파일을 직접 확인할 것.*
