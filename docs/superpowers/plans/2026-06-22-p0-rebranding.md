# P0 — 리브랜딩 (OD → Marketing AX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OD(Open Design) 포크에서 모든 하드코딩 제품 식별자를 Marketing AX 값으로 치환하고, 빌드·기동·가드가 그린인 상태를 만든다.

**Architecture:** find-and-replace 중심 작업. 식별자는 대부분 const 테이블에 중앙화돼 있어 정의 지점을 바꾸고 전역 sweep으로 잔존을 검출한다. 각 태스크는 한 식별자 카테고리를 바꾸고 `grep 잔존 0 + typecheck`로 검증한다.

**Tech Stack:** pnpm 10.33.2 monorepo, TypeScript 5.9/6.0, Node 24, esbuild, electron-builder.

## Global Constraints

- 식별자 치환 매핑 (verbatim):
  - 제품명: `Open Design` → `Marketing AX`
  - npm 스코프: `@open-design/` → `@marketing-ax/`
  - 루트 패키지명: `open-design` → `marketing-ax`
  - env 접두사: `OD_` → `MAX_` (모든 env 키)
  - 프로토콜 스킴: `od` (`od://`) → `max` (`max://`)
  - 데이터 디렉터리: `.od` → `.max`
  - host 글로벌: `__od__` → `__max__`
  - appId: `io.open-design.desktop` → `io.marketing-ax.desktop` (채널 접미사 `.beta/.preview/.nightly` 유지)
  - 세션 파티션: `persist:open-design-design-browser` → `persist:marketing-ax-design-browser`
  - ipcBase: `/tmp/open-design/ipc` → `/tmp/marketing-ax/ipc`
  - windowsPipePrefix: `open-design` → `marketing-ax`
  - 마켓플레이스 repo: `nexu-io/open-design` → (자체 repo 미정 → P0에서는 `marketing-ax/marketing-ax` placeholder, 또는 마켓플레이스 비활성화는 P2에서)
- 라이선스 의무(Apache-2.0): 루트 `LICENSE` 파일 유지, 수정 파일에 변경 표시 허용, "Open Design" 상표 잔존 0.
- 각 태스크 종료 시 `pnpm typecheck` 그린 유지. 전체 종료 시 `pnpm guard` 그린.
- `.od` 데이터 디렉터리는 런타임 생성물이므로 코드 식별자만 바꾸고 기존 로컬 `.od/`는 무시(신규 `.max/` 생성됨).

---

## File Structure

리브랜딩이 닿는 파일군:
- 24개 `package.json` (npm 스코프 + 루트 이름)
- `packages/sidecar-proto/src/index.ts` (env/ipc/제품명/stamp/registry)
- `apps/packaged/src/protocol.ts` (스킴)
- `packages/host/src/index.ts` (글로벌)
- `tools/pack/src/{mac,win,linux}/*` (appId/제품명)
- `apps/desktop/src/main/updater.ts` (origin/env)
- `apps/daemon/src/plugins/marketplaces.ts` (URL/repo/env)
- `apps/web/app/layout.tsx` (title)
- `apps/web/src/components/DesignBrowserPanel.tsx`, `apps/desktop/src/main/runtime.ts` (세션 파티션)
- `apps/web/src/artifacts/validate.ts` (예약경로 regex)
- `apps/daemon/src/db.ts`, `scripts/guard.ts` (.od 참조)

---

## Task 1: npm 스코프 + 루트 패키지명 치환

**Files:**
- Modify: 24개 `package.json` (루트 + apps/* + packages/* + tools/* + e2e)

**Interfaces:**
- Produces: 모든 워크스페이스 패키지가 `@marketing-ax/*` 스코프, 루트 이름 `marketing-ax`.

- [ ] **Step 1: 현재 스코프 참조 전수 확인**

Run: `cd /Users/gyumin/Project/open-design && grep -rln '@open-design/' --include=package.json`
Expected: 24개 경로 출력 (루트, apps/{daemon,desktop,landing-page,packaged,telemetry-worker,web}, e2e, packages/{agui-adapter,components,contracts,diagnostics,download,host,launcher-proto,metatool,platform,plugin-runtime,registry-protocol,sidecar-proto,sidecar}, tools/{dev,pack,serve})

- [ ] **Step 2: 모든 package.json의 스코프 치환**

Run:
```bash
cd /Users/gyumin/Project/open-design
grep -rl '@open-design/' --include=package.json . | xargs sed -i '' 's#@open-design/#@marketing-ax/#g'
```

- [ ] **Step 3: 루트 패키지명 치환**

루트 `package.json`의 `"name": "open-design",` → `"name": "marketing-ax",`. 정확히 그 라인만:
```bash
sed -i '' 's/"name": "open-design",/"name": "marketing-ax",/' package.json
```

- [ ] **Step 4: 잔존 검증**

Run: `grep -rn '@open-design/' --include=package.json . ; grep -n '"name": "open-design"' package.json`
Expected: 둘 다 출력 없음(잔존 0)

- [ ] **Step 5: 재설치로 워크스페이스 링크 재생성**

Run: `pnpm install`
Expected: 성공, `@marketing-ax/*` 워크스페이스 링크 해소

- [ ] **Step 6: 타입체크**

Run: `pnpm typecheck`
Expected: PASS (스코프 변경이 import 경로에 영향 없음 — workspace protocol)

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "Rebrand npm scope to @marketing-ax — fork identity (P0 task1)"
```

---

## Task 2: sidecar-proto 식별자 (env / ipc / 제품명 / stamp / registry)

**Files:**
- Modify: `packages/sidecar-proto/src/index.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `SIDECAR_ENV`/`SIDECAR_STAMP_FLAGS`/`DESKTOP_UPDATE_ENV` 류가 `MAX_*` 키, `OPEN_DESIGN_PRODUCT_NAME = "Marketing AX"`, ipcBase/pipe prefix 변경. 다른 패키지는 이 const를 import하므로 정의만 바꾸면 전파됨.

- [ ] **Step 1: env 테이블 치환 (`OD_` → `MAX_`)**

`packages/sidecar-proto/src/index.ts:24-36` `SIDECAR_ENV`의 각 값을 변경. 현재:
```typescript
export const SIDECAR_ENV = Object.freeze({
  BASE: "OD_SIDECAR_BASE",
  DAEMON_CLI_PATH: "OD_DAEMON_CLI_PATH",
  DAEMON_PORT: "OD_PORT",
  IPC_BASE: "OD_SIDECAR_IPC_BASE",
  IPC_PATH: "OD_SIDECAR_IPC_PATH",
  NAMESPACE: "OD_SIDECAR_NAMESPACE",
  SOURCE: "OD_SIDECAR_SOURCE",
  TOOLS_DEV_PARENT_PID: "OD_TOOLS_DEV_PARENT_PID",
  WEB_DIST_DIR: "OD_WEB_DIST_DIR",
  WEB_PORT: "OD_WEB_PORT",
  WEB_TSCONFIG_PATH: "OD_WEB_TSCONFIG_PATH",
} as const);
```
→ 각 `"OD_...”`를 `"MAX_..."`로 (예: `BASE: "MAX_SIDECAR_BASE"`, `DAEMON_PORT: "MAX_PORT"` 등 11개 전부).

- [ ] **Step 2: stamp 플래그 치환**

`:46-52` `SIDECAR_STAMP_FLAGS`의 각 값 `--od-stamp-*` → `--max-stamp-*` (app/ipc/mode/namespace/source 5개).

- [ ] **Step 3: 제품명·ipc·pipe 치환**

```
:64  ipcBase: "/tmp/open-design/ipc",      → ipcBase: "/tmp/marketing-ax/ipc",
:67  windowsPipePrefix: "open-design",      → windowsPipePrefix: "marketing-ax",
:70  export const OPEN_DESIGN_PRODUCT_NAME = "Open Design";  → ... = "Marketing AX";
```
(상수 *이름* `OPEN_DESIGN_PRODUCT_NAME`은 식별자라 유지해도 무방하나, 값만 `Marketing AX`로. 원하면 이름도 `PRODUCT_NAME`으로 리네임 — 단 import처 동반 수정 필요. P0에서는 값만 변경 권장.)

- [ ] **Step 4: registry 키는 자동 전파 확인**

`:76-79` `resolveWindowsUninstallRegistryKey`는 `OPEN_DESIGN_PRODUCT_NAME`을 참조하므로 Step 3로 자동 반영. 코드 변경 불필요.

- [ ] **Step 5: 잔존 검증 + 타입체크**

Run: `grep -n '"OD_\|--od-stamp\|open-design' packages/sidecar-proto/src/index.ts ; pnpm typecheck`
Expected: grep 출력 0, typecheck PASS

- [ ] **Step 6: 커밋**

```bash
git add packages/sidecar-proto/src/index.ts
git commit -m "Rebrand sidecar-proto identifiers (env/ipc/product) to Marketing AX (P0 task2)"
```

---

## Task 3: 프로토콜 스킴 + host 글로벌

**Files:**
- Modify: `apps/packaged/src/protocol.ts`, `packages/host/src/index.ts`

**Interfaces:**
- Produces: 렌더러→사이드카 fetch가 `max://app/`로, 프리로드 브릿지 글로벌이 `__max__`.

- [ ] **Step 1: 스킴 치환**

`apps/packaged/src/protocol.ts:3`:
```
const OD_SCHEME = "od";   → const OD_SCHEME = "max";
```
(상수 이름 `OD_SCHEME`은 유지 가능; 값만 `"max"`. `OD_ENTRY_URL`/registerSchemesAsPrivileged/handler는 상수 참조라 자동 전파.)

- [ ] **Step 2: host 글로벌 치환**

`packages/host/src/index.ts:1`:
```
export const OPEN_DESIGN_HOST_GLOBAL = "__od__";   → ... = "__max__";
```

- [ ] **Step 3: 잔존 검증 + 타입체크**

Run: `grep -rn '"od"\|__od__\|od://' apps/packaged/src/protocol.ts packages/host/src/index.ts ; pnpm typecheck`
Expected: grep 출력 0, typecheck PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/packaged/src/protocol.ts packages/host/src/index.ts
git commit -m "Rebrand protocol scheme to max:// and host global to __max__ (P0 task3)"
```

---

## Task 4: 데이터 디렉터리 `.od` + 세션 파티션 + 예약경로 + guard skip

**Files:**
- Modify: `apps/web/src/artifacts/validate.ts:41`, `scripts/guard.ts:50`, `apps/web/src/components/DesignBrowserPanel.tsx:229`, `apps/desktop/src/main/runtime.ts:245`
- Also: 데이터 디렉터리 `.od` 문자열 사용처 전역 sweep

**Interfaces:**
- Produces: 신규 데이터 디렉터리 `.max`, 세션 파티션 `persist:marketing-ax-design-browser`.

- [ ] **Step 1: `.od` 데이터 디렉터리 참조 전수 확인**

Run: `grep -rn "'\.od'\|\"\.od\"\|/\.od\b\|\.od/" apps packages scripts --include=*.ts --include=*.tsx | grep -v node_modules`
Expected: 데이터 디렉터리/예약경로 참조 목록(validate.ts, guard.ts, db 경로 helper 등). 출력 검토 후 각각 `.max`로 치환 대상 식별.

- [ ] **Step 2: 예약경로 regex 치환**

`apps/web/src/artifacts/validate.ts:41`:
```
const RESERVED_PROJECT_PATH_RE = /(?:^|\/|\.\/)(?:\.live-artifacts|\.od|\.tmp)(?=$|[/?#"'`\s>)])/i;
```
→ `\.od` 부분만 `\.max`로:
```
const RESERVED_PROJECT_PATH_RE = /(?:^|\/|\.\/)(?:\.live-artifacts|\.max|\.tmp)(?=$|[/?#"'`\s>)])/i;
```

- [ ] **Step 3: guard skip-list 치환**

`scripts/guard.ts:50` `".od",` → `".max",` (인접 `.od-e2e`가 있으면 `.max-e2e`로 동반).

- [ ] **Step 4: 세션 파티션 치환 (2곳)**

```
apps/web/src/components/DesignBrowserPanel.tsx:229
  'persist:open-design-design-browser'  → 'persist:marketing-ax-design-browser'
apps/desktop/src/main/runtime.ts:245
  "persist:open-design-design-browser"  → "persist:marketing-ax-design-browser"
```

- [ ] **Step 5: 데이터 디렉터리 경로 helper 치환**

Step 1에서 찾은 `.od` 디렉터리 생성/해석 코드(데몬 데이터 디렉터리 contract — `AGENTS.md` 참조)를 `.max`로. 정확한 위치는 Step 1 grep 결과로 확정.

- [ ] **Step 6: 잔존 검증 + 타입체크**

Run: `grep -rn "open-design-design-browser\|\.od\b" apps packages scripts --include=*.ts --include=*.tsx | grep -v node_modules ; pnpm typecheck`
Expected: 의도된 잔존 외 0, typecheck PASS

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "Rebrand data dir to .max + session partition + reserved paths (P0 task4)"
```

---

## Task 5: 패키징 식별자 (appId / 제품명)

**Files:**
- Modify: `tools/pack/src/mac/identity.ts`, `tools/pack/src/mac/constants.ts`, `tools/pack/src/win/constants.ts`, `tools/pack/src/win/identity.ts`, `tools/pack/src/linux.ts`

**Interfaces:**
- Produces: 빌드 산출물의 appId `io.marketing-ax.desktop`, 제품명 `Marketing AX`.

- [ ] **Step 1: mac appId 치환**

`tools/pack/src/mac/identity.ts:48-52`:
```typescript
function appIdForChannel(channel: ReleaseChannelIdentity): string {
  if (channel === "beta") return "io.open-design.desktop.beta";
  if (channel === "nightly") return "io.open-design.desktop.nightly";
  if (channel === "preview") return "io.open-design.desktop.preview";
  return "io.open-design.desktop";
}
```
→ 각 `io.open-design.desktop` → `io.marketing-ax.desktop`.

- [ ] **Step 2: 제품명 상수 치환 (3파일)**

```
tools/pack/src/mac/constants.ts:1   export const PRODUCT_NAME = "Open Design";  → "Marketing AX"
tools/pack/src/win/constants.ts:1   export const PRODUCT_NAME = "Open Design";  → "Marketing AX"
tools/pack/src/linux.ts:37          const PRODUCT_NAME = "Open Design";          → "Marketing AX"
```
(win/identity.ts:42-45 displayNameForChannel은 `PRODUCT_NAME` 템플릿 참조라 자동 전파.)

- [ ] **Step 3: linux appId 치환**

`tools/pack/src/linux.ts:542` `appId: "io.open-design.desktop",` → `appId: "io.marketing-ax.desktop",`.

- [ ] **Step 4: 잔존 검증 + 타입체크**

Run: `grep -rn 'open-design\|Open Design' tools/pack/src ; pnpm typecheck`
Expected: grep 출력 0, typecheck PASS

- [ ] **Step 5: 커밋**

```bash
git add tools/pack/src
git commit -m "Rebrand packaging identifiers (appId/product name) to Marketing AX (P0 task5)"
```

---

## Task 6: 하드코딩 URL + env 잔여 + 제목

**Files:**
- Modify: `apps/desktop/src/main/updater.ts`, `apps/daemon/src/plugins/marketplaces.ts`, `apps/web/app/layout.tsx`

**Interfaces:**
- Produces: 업데이트 origin/마켓플레이스 URL/HTML 제목이 새 브랜드.

- [ ] **Step 1: updater env 접두사 치환**

`apps/desktop/src/main/updater.ts:63-79` `DESKTOP_UPDATE_ENV`의 모든 값 `OD_UPDATE_*` → `MAX_UPDATE_*` (16개).

- [ ] **Step 2: updater origin 치환**

`:81` `const DEFAULT_RELEASE_ORIGIN = "https://releases.open-design.ai";` → 자체 릴리스 origin. P0에서는 placeholder `"https://releases.marketing-ax.example"`로 두고, 실제 도메인 확정 시 교체(또는 `MAX_UPDATE_METADATA_URL` env로 런타임 오버라이드 가능하므로 빌드 시 주입).

- [ ] **Step 3: marketplace repo/URL/env 치환**

`apps/daemon/src/plugins/marketplaces.ts`:
```
:76  const DEFAULT_MARKETPLACE_REPO = 'nexu-io/open-design';  → 'marketing-ax/marketing-ax' (placeholder)
:79  const PUBLIC_MARKETPLACE_BASE_URL = 'https://open-design.ai/marketplace';  → placeholder 또는 P2에서 처리
:80  const PUBLIC_PLUGINS_BASE_URL = 'https://open-design.ai/plugins';          → placeholder
```
env 키 `OD_MARKETPLACE_*` (REPO/REGISTRY_BASE_URL/REPO_REF/REGISTRY_PATH) → `MAX_MARKETPLACE_*`.
(마켓플레이스 전면 비활성화 결정은 제품 스펙 §5에 따라 별도. P0는 식별자만.)

- [ ] **Step 4: HTML 제목 치환**

`apps/web/app/layout.tsx:9` `title: 'Open Design',` → `title: 'Marketing AX',`.

- [ ] **Step 5: 잔존 검증 + 타입체크**

Run: `grep -rn 'OD_UPDATE\|OD_MARKETPLACE\|open-design\.ai\|nexu-io/open-design' apps ; pnpm typecheck`
Expected: 의도된 placeholder 외 0, typecheck PASS

- [ ] **Step 6: 커밋**

```bash
git add apps/desktop/src/main/updater.ts apps/daemon/src/plugins/marketplaces.ts apps/web/app/layout.tsx
git commit -m "Rebrand hardcoded URLs/env/title to Marketing AX (P0 task6)"
```

---

## Task 7: 전역 sweep + 가드 + 기동 검증 (게이트)

**Files:** (검증 전용, 잔존 발견 시 해당 파일 수정)

**Interfaces:**
- Produces: OD 식별자 잔존 0, guard/typecheck/기동 그린 — P0 완료 게이트.

- [ ] **Step 1: 전역 OD 식별자 sweep**

Run:
```bash
cd /Users/gyumin/Project/open-design
grep -rn 'open-design\|Open Design\|OD_\|__od__\|od://\|io\.open-design' \
  apps packages tools scripts --include=*.ts --include=*.tsx --include=*.json \
  | grep -v node_modules | grep -v 'docs/' | grep -v '\.md:'
```
Expected: 출력 0. 잔존 시 카테고리별로 해당 태스크 규칙 적용해 수정 후 재실행.

> 주의: `LICENSE`, `docs/*.md`, `CHANGELOG.md` 등 문서/라이선스의 "Open Design" 언급은 의도적 유지(라이선스 attribution). sweep에서 문서는 제외.

- [ ] **Step 2: 가드 통과**

Run: `pnpm guard`
Expected: PASS (특히 cross-app import, style policy)

- [ ] **Step 3: 타입체크 통과**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 개발 기동 검증**

Run: `pnpm tools-dev run web` (별도 터미널에서 기동 후 브라우저 확인)
Expected: 데몬+웹 정상 기동, 데이터 디렉터리 `.max/` 생성됨, 프로토콜 `max://` 동작, HTML 제목 "Marketing AX". 기존 기능(프로젝트 생성, 디자인시스템 목록) 정상.

- [ ] **Step 5: 최종 커밋**

```bash
git add -A
git commit -m "Verify rebranding sweep + guard + dev boot green (P0 complete)"
```

---

## Self-Review 체크 (작성자 수행)

- **스펙 커버리지**: 제품 스펙 §3.1(리브랜딩 항목) + §4(성공기준 "OD 식별자 완전 제거") + FORK-GUIDE §3 인벤토리 전 카테고리 → Task 1~6에 매핑됨. ✅
- **누락 카테고리 점검**: npm스코프(T1)/sidecar-proto(T2)/스킴·글로벌(T3)/데이터디렉터리·파티션(T4)/패키징(T5)/URL·env(T6) + 전역sweep(T7). FORK-GUIDE §3 A~J 전부 커버. ✅
- **placeholder**: 릴리스 origin·마켓플레이스 도메인은 "확정 도메인 미정"이라 명시적 placeholder + env 오버라이드 경로 안내. 실제 미결정 사항이므로 허용. ✅
