# P1 — 엔진/두뇌 심 (BrainProvider) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데몬에 `BrainProvider` 의존 역전 심을 도입해 도메인 로직(시스템 프롬프트 조립, 검수 게이트, atom 카탈로그)을 엔진에서 분리하되, 기본 두뇌(`default-design-brain`)로 **기존 동작을 100% 보존**한다.

**Architecture:** `ServerContext`에 `brain: BrainProvider`를 추가(기존 DI 심 재사용). `startChatRun`의 인라인 도메인 결정(prompt-builder closure, lockstep critique 게이트 3곳, static 도메인 import)을 `ctx.brain.*` 호출로 역전한다. 도메인 파일은 `brain/`로 이동, 엔진 파일은 제자리. P1은 **리팩터링만** — 새 기능 없음, 동작 회귀 0이 성공 기준.

**Tech Stack:** TypeScript 5.9, Node 24, Express 5, better-sqlite3, Vitest, Playwright.

## Global Constraints

- P1은 **동작 보존 리팩터**다. 외부 동작(API 응답, 생성 결과, critique 흐름)이 바뀌면 실패.
- `engine/`은 도메인 용어(`design-system`/`brand`/`marketing`/critique 프롬프트)를 import하지 않는다.
- 검증 게이트: `pnpm typecheck` + `pnpm guard`(특히 `checkWebImportIsolation`) + e2e `real-daemon-run.test.ts`, `critique-theater.test.ts` 그린.
- 기존 함수 시그니처(외부 노출)는 유지. 내부 추출만.
- P0(리브랜딩) 완료가 선행 조건.
- 디렉터리 이동 시 import 경로(`.js` 확장자 포함, ESM)를 동반 수정.

---

## File Structure

**신규 (engine 소유 계약 + 기본 두뇌):**
- `apps/daemon/src/brain/provider.ts` — `BrainProvider` 인터페이스 + `RunContext`/`ReviewConfig`/`ReviewerSpec`/`OutputModeSpec` 타입
- `apps/daemon/src/brain/default-design-brain.ts` — 기존 design-system 동작을 위임하는 기본 구현
- `apps/daemon/tests/brain-default.test.ts` — 기본 두뇌 단위 테스트

**이동 (domain → brain/):** P1 후반(Task 7)에서 물리 이동
- `prompts/system.ts`, `prompts/panel.ts` → `brain/prompts/`
- `design-systems.ts`, `design-system-import.ts`, `design-system-generation-jobs.ts` → `brain/`
- `plugins/atoms.ts` (FIRST_PARTY_ATOMS) → `brain/atoms-catalog.ts`

**수정 (engine 측 배선):**
- `server-context.ts` (brain 필드 추가)
- `route-context-contract.ts` (brain 슬라이스)
- `server.ts` (startChatRun: closure → ctx.brain, lockstep 수렴, static import 제거)
- `plugins/atoms/built-ins.ts` (카탈로그를 brain에서 수신)

---

## Task 1: BrainProvider 인터페이스 정의

**Files:**
- Create: `apps/daemon/src/brain/provider.ts`
- Test: `apps/daemon/tests/brain-provider.test.ts`

**Interfaces:**
- Produces:
  - `interface BrainProvider { resolveSystemPrompt(run: RunContext): Promise<string>; shouldRunReview(run: RunContext): boolean; getReviewConfig(run: RunContext): ReviewConfig; registerAtoms(register: (w: AtomWorker) => void): void; listReviewers(): ReviewerSpec[]; listOutputModes(): OutputModeSpec[]; }`
  - `RunContext` — startChatRun이 들고 있는 런 입력 묶음(아래 필드).
  - `ReviewConfig`, `ReviewerSpec`, `OutputModeSpec`.

- [ ] **Step 1: 실패 테스트 작성**

`apps/daemon/tests/brain-provider.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import type { BrainProvider, RunContext } from '../src/brain/provider.js';

describe('BrainProvider contract', () => {
  it('a minimal stub satisfies the interface shape', async () => {
    const stub: BrainProvider = {
      resolveSystemPrompt: async () => 'PROMPT',
      shouldRunReview: () => false,
      getReviewConfig: () => ({ weights: {}, scoreThreshold: 0, maxRounds: 1 }),
      registerAtoms: () => {},
      listReviewers: () => [],
      listOutputModes: () => [],
    };
    const run = {} as RunContext;
    expect(await stub.resolveSystemPrompt(run)).toBe('PROMPT');
    expect(stub.shouldRunReview(run)).toBe(false);
    expect(stub.listReviewers()).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @marketing-ax/daemon exec vitest run tests/brain-provider.test.ts`
Expected: FAIL ("Cannot find module '../src/brain/provider.js'")

- [ ] **Step 3: 인터페이스 구현**

`apps/daemon/src/brain/provider.ts`:
```typescript
// Role: 엔진↔두뇌 의존 역전 계약 — 엔진이 인라인으로 하던 도메인 결정을 두뇌에 위임
// Key Features: 시스템 프롬프트 조립, 검수 게이트, atom 카탈로그/reviewer/산출물 모드 선언
// Dependencies: plugins/atoms/registry (AtomWorker 타입)
// Notes: engine/은 이 파일만 알고 구현(brain/*)은 모른다

import type { AtomWorker } from '../plugins/atoms/registry.js';

// startChatRun이 보유한 런 입력 — 두뇌가 프롬프트/게이트 판정에 쓰는 모든 컨텍스트
export interface RunContext {
  agentId: string;
  projectId: string | null;
  conversationId: string | null;
  effectiveSkillId: string | undefined;
  effectiveDesignSystemId: string | undefined;
  streamFormat: string;            // 'agent' | 'plain' 등
  isMediaSurface: boolean;
  isPlainAdapter: boolean;
  locale: string | undefined;
  sessionMode: string | undefined;
  userInstructions: string | undefined;
  // 두뇌가 추가 컨텍스트를 필요로 하면 확장 (engine은 이 묶음만 전달)
  raw: Record<string, unknown>;
}

export interface ReviewConfig {
  weights: Record<string, number>;
  scoreThreshold: number;
  maxRounds: number;
}

export interface ReviewerSpec {
  id: string;
  label: string;
  agentRef?: string;     // 어떤 CLI/모델로 검수할지 (P3에서 사용)
  promptRef?: string;    // 검수 프롬프트 키
  weight: number;
  gate?: string;         // until 시그널 키 (예: 'review.score')
}

export interface OutputModeSpec {
  id: string;            // 'prototype' | 'text' | ...
  label: string;
  rendererHint?: string;
}

export interface BrainProvider {
  // startChatRun의 prompt-builder closure를 흡수
  resolveSystemPrompt(run: RunContext): Promise<string>;
  // critique/검수 게이트 (현 critiqueShouldRun 도메인 판정)
  shouldRunReview(run: RunContext): boolean;
  getReviewConfig(run: RunContext): ReviewConfig;
  // atom 카탈로그를 엔진 registry에 등록 (built-ins 역전)
  registerAtoms(register: (worker: AtomWorker) => void): void;
  // 사용자 커스터마이징 검수의 원천 (P3)
  listReviewers(): ReviewerSpec[];
  // create-tab/렌더러용 산출물 모드
  listOutputModes(): OutputModeSpec[];
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @marketing-ax/daemon exec vitest run tests/brain-provider.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/daemon/src/brain/provider.ts apps/daemon/tests/brain-provider.test.ts
git commit -m "Add BrainProvider engine/brain seam interface (P1 task1)"
```

---

## Task 2: ServerContext에 brain 슬라이스 배선

**Files:**
- Modify: `apps/daemon/src/server-context.ts` (after `critique: any;`, around :126)
- Modify: `apps/daemon/src/route-context-contract.ts`

**Interfaces:**
- Consumes: `BrainProvider` (Task 1)
- Produces: `ServerContext.brain: BrainProvider`

- [ ] **Step 1: ServerContext에 필드 추가**

`apps/daemon/src/server-context.ts` — `import type { BrainProvider } from './brain/provider.js';` 추가하고, 인터페이스 내 `critique: any;` 다음 줄에:
```typescript
  critique: any;
  brain: BrainProvider;
  lifecycle?: {
```

- [ ] **Step 2: 타입체크로 미구현 컨텍스트 검출**

Run: `pnpm typecheck`
Expected: FAIL — `ServerContext` 조립부(server.ts)에서 `brain` 누락 에러. 이 에러가 Task 3에서 채워질 지점을 가리킴.

- [ ] **Step 3: route-context-contract 영향 확인**

`route-context-contract.ts`는 `ServerContext extends AllRegisteredRouteDeps`를 검증한다. `brain` 추가는 ServerContext를 넓히므로 기존 assert는 깨지지 않음(추가 필드는 호환). 변경 불필요 — 확인만.

Run: `grep -n 'brain' apps/daemon/src/route-context-contract.ts`
Expected: 출력 없음(아직 라우트가 brain을 요구하지 않음 — 정상)

- [ ] **Step 4: 커밋(타입 에러는 Task 3에서 해소되므로 WIP 커밋 생략, Task 3와 묶음)**

(이 태스크는 Task 3과 한 커밋으로 묶는다 — 단독으로는 typecheck 실패 상태)

---

## Task 3: 기본 두뇌 구현 + 컨텍스트 조립 (동작 보존)

**Files:**
- Create: `apps/daemon/src/brain/default-design-brain.ts`
- Modify: `apps/daemon/src/server.ts` (ServerContext 조립부에 `brain` 추가)
- Test: `apps/daemon/tests/brain-default.test.ts`

**Interfaces:**
- Consumes: `BrainProvider`, `composeSystemPrompt`, `resolveDesignSystemAssets`, `FIRST_PARTY_ATOMS`, critique config
- Produces: `createDefaultDesignBrain(deps): BrainProvider`

- [ ] **Step 1: 실패 테스트 작성**

`apps/daemon/tests/brain-default.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createDefaultDesignBrain } from '../src/brain/default-design-brain.js';

describe('default design brain', () => {
  it('registerAtoms registers the first-party catalog (incl critique-theater)', () => {
    const brain = createDefaultDesignBrain({ /* deps stub */ } as any);
    const ids: string[] = [];
    brain.registerAtoms((w) => ids.push(w.id));
    expect(ids).toContain('critique-theater');
    expect(ids).toContain('file-write');
  });

  it('listOutputModes includes prototype', () => {
    const brain = createDefaultDesignBrain({} as any);
    expect(brain.listOutputModes().map((m) => m.id)).toContain('prototype');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @marketing-ax/daemon exec vitest run tests/brain-default.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 기본 두뇌 구현**

`apps/daemon/src/brain/default-design-brain.ts` — 기존 동작을 위임. `resolveSystemPrompt`는 현재 startChatRun closure가 하던 일(design-system 자산 해석 + composeSystemPrompt 호출)을 그대로 수행:
```typescript
// Role: OD 기존 design-system 동작을 BrainProvider로 래핑 — P1 동작 보존용 기본 두뇌
// Key Features: composeSystemPrompt 위임, critique 게이트, FIRST_PARTY_ATOMS 등록
// Dependencies: prompts/system, design-systems, plugins/atoms, plugins/atoms/built-ins
// Notes: P1은 동작 보존만 — 새 로직 추가 금지. 마케팅 두뇌(P2)가 이 구조를 복제·교체.

import type { BrainProvider, RunContext, ReviewConfig } from './provider.js';
import type { AtomWorker } from '../plugins/atoms/registry.js';

export interface DefaultBrainDeps {
  composeSystemPrompt: (input: any) => string;
  resolveDesignSystemAssets: (id: string, builtIn: string, userRoot: string) => Promise<any>;
  designSystemsDir: string;
  userDesignSystemsDir: string;
  firstPartyAtoms: ReadonlyArray<{ id: string }>;
  critiqueTheaterWorker: AtomWorker['run'];
  defaultReviewConfig: ReviewConfig;
  // startChatRun이 closure에서 계산하던 비-design-system 입력 빌더
  buildBaseComposeInput: (run: RunContext) => Promise<Record<string, unknown>>;
}

export function createDefaultDesignBrain(deps: DefaultBrainDeps): BrainProvider {
  return {
    async resolveSystemPrompt(run) {
      const base = await deps.buildBaseComposeInput(run);
      let dsFields: Record<string, unknown> = {};
      if (run.effectiveDesignSystemId) {
        const assets = await deps.resolveDesignSystemAssets(
          run.effectiveDesignSystemId,
          deps.designSystemsDir,
          deps.userDesignSystemsDir,
        );
        dsFields = {
          designSystemUsageMd: assets.usageMd,
          designSystemTokensCss: assets.tokensCss,
          designSystemComponentsManifest: assets.componentsManifest,
          designSystemFixtureHtml: assets.fixtureHtml,
          designSystemPullIndex: assets.pullIndex,
          designSystemImportMode: assets.importMode,
        };
      }
      return deps.composeSystemPrompt({ ...base, ...dsFields });
    },

    shouldRunReview(run) {
      // 현 critiqueShouldRun 게이트와 동일 조건
      const r = run.raw;
      return Boolean(
        r.critiqueEnabledForRun &&
        r.critiqueBrand !== undefined &&
        r.critiqueSkill !== undefined &&
        !run.isMediaSurface &&
        run.isPlainAdapter,
      );
    },

    getReviewConfig() {
      return deps.defaultReviewConfig;
    },

    registerAtoms(register) {
      for (const atom of deps.firstPartyAtoms) {
        if (atom.id === 'critique-theater') {
          register({ id: atom.id, describe: 'critique score from devloop', run: deps.critiqueTheaterWorker });
          continue;
        }
        register({ id: atom.id, describe: 'permissive default', run: () => ({ signals: {} }) });
      }
    },

    listReviewers() {
      // P1: critique-theater 단일(롤플레이). P3에서 실제 reviewer 추가.
      return [{ id: 'critique-theater', label: 'Design jury (5-panel)', weight: 1, gate: 'critique.score' }];
    },

    listOutputModes() {
      return [
        { id: 'prototype', label: 'Prototype' },
        { id: 'live-artifact', label: 'Live artifact' },
        { id: 'deck', label: 'Deck' },
        { id: 'image', label: 'Image' },
        { id: 'video', label: 'Video' },
        { id: 'design-system', label: 'Design system' },
      ];
    },
  };
}
```

- [ ] **Step 4: server.ts에서 brain 조립**

`server.ts`의 ServerContext 조립부(`critique` 슬라이스 인근)에 `createDefaultDesignBrain` 호출을 추가하고 `brain` 필드 할당. `buildBaseComposeInput`은 startChatRun closure에서 design-system 외 입력(skillBody/craft/memory/metadata/template/audio/critique/plugin 등)을 계산하던 코드를 함수로 추출해 전달. `critiqueTheaterWorker`는 `built-ins.ts`에서 export하도록 변경(현재 내부 함수 → export).

- [ ] **Step 5: 테스트 + 타입체크 통과**

Run: `pnpm --filter @marketing-ax/daemon exec vitest run tests/brain-default.test.ts ; pnpm typecheck`
Expected: PASS (Task 2의 brain 누락 에러도 해소)

- [ ] **Step 6: 커밋**

```bash
git add apps/daemon/src/brain/ apps/daemon/src/server-context.ts apps/daemon/src/server.ts apps/daemon/tests/brain-default.test.ts
git commit -m "Add default design brain + wire ctx.brain (behavior-preserving) (P1 task2+3)"
```

---

## Task 4: startChatRun 프롬프트 조립을 ctx.brain.resolveSystemPrompt로 역전

**Files:**
- Modify: `apps/daemon/src/server.ts` (prompt-builder closure, 현 :7811-8028)

**Interfaces:**
- Consumes: `ctx.brain.resolveSystemPrompt(run)`
- Produces: startChatRun이 design-system 필드를 직접 명명하지 않음

- [ ] **Step 1: 회귀 기준선 — critique-theater e2e 통과 확인**

Run: `pnpm --filter @marketing-ax/e2e exec vitest run tests/critique-theater.test.ts` (또는 해당 e2e 러너)
Expected: PASS — 이 기준선이 추출 후에도 유지돼야 함

- [ ] **Step 2: RunContext 구성 + brain 호출로 치환**

`startChatRun` 내부에서 design-system 자산 해석(:7811-7824)과 `composeSystemPrompt` 직접 호출(:7984-8028)을 제거하고, 대신 `RunContext`를 구성해 `const prompt = await ctx.brain.resolveSystemPrompt(run);`로 치환. design-system 외 입력(skillBody/craft/memory/...)은 Task 3에서 추출한 `buildBaseComposeInput`이 담당하므로 closure에서 해당 계산을 그 함수로 이동.

> 추출 원칙: closure의 기존 코드를 **그대로** `buildBaseComposeInput`/`resolveSystemPrompt`로 옮긴다(로직 변경 0). server.ts 상단 `design-systems.ts`(:161-167)·`prompts/system.ts`(:21-26) static import 제거.

- [ ] **Step 3: 타입체크 + 동작 회귀 검증**

Run: `pnpm typecheck ; pnpm --filter @marketing-ax/e2e exec vitest run tests/real-daemon-run.test.ts tests/critique-theater.test.ts`
Expected: PASS, 생성 결과/critique 흐름 동일

- [ ] **Step 4: 커밋**

```bash
git add apps/daemon/src/server.ts
git commit -m "Invert startChatRun system-prompt assembly to ctx.brain (P1 task4)"
```

---

## Task 5: critique 게이트 lockstep 3곳을 shouldRunReview로 수렴

**Files:**
- Modify: `apps/daemon/src/server.ts` (:7925-7929 게이트, :8015 addendum, :9995 orchestrator 분기)

**Interfaces:**
- Consumes: `ctx.brain.shouldRunReview(run)`
- Produces: critique 라우팅이 단일 진실원에서 파생

- [ ] **Step 1: 게이트를 brain 호출로 치환**

`:7925-7929`의 인라인 불리언:
```typescript
const critiqueShouldRun = critiqueEnabledForRun
  && critiqueBrand !== undefined
  && critiqueSkill !== undefined
  && !isMediaSurface
  && isPlainAdapter;
```
→
```typescript
const critiqueShouldRun = ctx.brain.shouldRunReview(run);
```
(`run.raw`에 `critiqueEnabledForRun`/`critiqueBrand`/`critiqueSkill`을 담아 전달 — Task 4의 RunContext 구성에 포함.)

- [ ] **Step 2: addendum·orchestrator 분기는 critiqueShouldRun 변수 재사용 확인**

`:8015`(prompt addendum)는 Task 4에서 brain 내부로 이동됨 → server.ts에서 제거됨. `:9995` orchestrator 분기는 동일 `critiqueShouldRun` 변수를 참조하므로 자동 일치. 세 지점이 한 변수(=brain 판정)에서 파생됨을 확인.

Run: `grep -n 'critiqueShouldRun' apps/daemon/src/server.ts`
Expected: 게이트 정의 1곳 + orchestrator 분기 참조. addendum 잔존 없음.

- [ ] **Step 3: 타입체크 + critique e2e**

Run: `pnpm typecheck ; pnpm --filter @marketing-ax/e2e exec vitest run tests/critique-theater.test.ts`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add apps/daemon/src/server.ts
git commit -m "Converge critique lockstep gates into ctx.brain.shouldRunReview (P1 task5)"
```

---

## Task 6: atom 카탈로그 등록을 brain으로 역전

**Files:**
- Modify: `apps/daemon/src/plugins/atoms/built-ins.ts`
- Modify: 호출처(`registerBuiltInAtomWorkers` 호출 지점)

**Interfaces:**
- Consumes: `ctx.brain.registerAtoms(register)`
- Produces: built-ins가 `atoms.ts`를 직접 import하지 않음(카탈로그를 brain이 제공)

- [ ] **Step 1: built-ins를 brain 위임으로 변경**

`built-ins.ts:29-47` `registerBuiltInAtomWorkers`를 brain 기반으로:
```typescript
export function registerAtomWorkersFromBrain(brain: BrainProvider): void {
  if (installed) return;
  brain.registerAtoms(registerAtomWorker);
  installed = true;
}
```
`critiqueTheaterWorker`는 export 유지(기본 두뇌가 참조). `import { FIRST_PARTY_ATOMS } from '../atoms.js';` 제거(브레인이 카탈로그 소유).

- [ ] **Step 2: 호출처 갱신**

`registerBuiltInAtomWorkers()` 호출 지점을 찾아 `registerAtomWorkersFromBrain(ctx.brain)`로 교체.

Run: `grep -rn 'registerBuiltInAtomWorkers' apps/daemon/src`
Expected: 정의 + 호출처 식별 → 호출처 교체

- [ ] **Step 3: 타입체크 + atom 동작 e2e**

Run: `pnpm typecheck ; pnpm --filter @marketing-ax/e2e exec vitest run tests/real-daemon-run.test.ts`
Expected: PASS (critique-theater atom이 여전히 점수 산출)

- [ ] **Step 4: 커밋**

```bash
git add apps/daemon/src/plugins/atoms/built-ins.ts apps/daemon/src/server.ts
git commit -m "Invert atom catalog registration to ctx.brain.registerAtoms (P1 task6)"
```

---

## Task 7: 도메인 파일 brain/ 디렉터리로 이동

**Files:**
- Move: `prompts/system.ts`, `prompts/panel.ts` → `brain/prompts/`
- Move: `design-systems.ts`, `design-system-import.ts`, `design-system-generation-jobs.ts` → `brain/`
- Move: `plugins/atoms.ts` → `brain/atoms-catalog.ts`
- Modify: 모든 import 참조

**Interfaces:**
- Produces: 엔진 파일은 도메인 파일을 직접 import하지 않고 `ctx.brain` 경유. `engine/` vs `brain/` 디렉터리 경계 확립.

- [ ] **Step 1: 이동 전 import처 전수 확인**

Run:
```bash
cd /Users/gyumin/Project/open-design/apps/daemon/src
grep -rn "from '.*prompts/system\|from '.*prompts/panel\|from '.*design-systems\|from '.*plugins/atoms'" . | grep -v node_modules
```
Expected: import처 목록 — 이동 후 경로 수정 대상

- [ ] **Step 2: git mv로 이동**

```bash
cd /Users/gyumin/Project/open-design/apps/daemon/src
mkdir -p brain/prompts
git mv prompts/system.ts brain/prompts/system.ts
git mv prompts/panel.ts brain/prompts/panel.ts
git mv design-systems.ts brain/design-systems.ts
git mv design-system-import.ts brain/design-system-import.ts
git mv design-system-generation-jobs.ts brain/design-system-generation-jobs.ts
git mv plugins/atoms.ts brain/atoms-catalog.ts
```

- [ ] **Step 3: import 경로 수정**

Step 1에서 찾은 모든 import처의 경로를 새 위치로 수정(ESM이라 `.js` 확장자 유지). 도메인 파일 상호 import(system.ts→panel.ts 등)도 동반 수정. **엔진 파일이 도메인 파일을 직접 import하면 안 됨** — 남아있으면 `ctx.brain` 경유로 리팩터(대부분 Task 3~6에서 이미 제거됨).

- [ ] **Step 4: 엔진 격리 검증**

Run:
```bash
cd /Users/gyumin/Project/open-design/apps/daemon/src
grep -rn "from '.*brain/" --include=*.ts . | grep -v '/brain/' | grep -v 'provider.js\|default-design-brain'
```
Expected: 출력 0 (엔진 코드는 brain/ 내부를 import하지 않고 provider/default-brain만 참조)

- [ ] **Step 5: 타입체크 + 가드 + e2e**

Run: `pnpm typecheck ; pnpm guard ; pnpm --filter @marketing-ax/e2e exec vitest run tests/real-daemon-run.test.ts tests/critique-theater.test.ts`
Expected: 모두 PASS

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "Move domain files under brain/ — establish engine/brain seam (P1 task7)"
```

---

## Task 8: P1 완료 게이트 — 전체 회귀 검증

**Files:** (검증 전용)

**Interfaces:**
- Produces: 동작 회귀 0, 엔진/두뇌 심 확립 — P1 완료.

- [ ] **Step 1: 전체 타입체크**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 2: 가드 (web import isolation 포함)**

Run: `pnpm guard`
Expected: PASS — `checkWebImportIsolation` 포함

- [ ] **Step 3: 핵심 e2e 스위트**

Run: `pnpm --filter @marketing-ax/e2e exec vitest run tests/real-daemon-run.test.ts tests/critique-theater.test.ts tests/app.test.ts`
Expected: PASS

- [ ] **Step 4: 개발 기동 + 수동 스모크**

Run: `pnpm tools-dev run web`
Expected: 프로젝트 생성 → 디자인시스템 선택 → 생성 실행 → critique 흐름까지 P0와 동일하게 동작(회귀 없음).

- [ ] **Step 5: 최종 커밋**

```bash
git add -A
git commit -m "Verify engine/brain seam — behavior preserved, P1 complete"
```

---

## Self-Review 체크 (작성자 수행)

- **스펙 커버리지**: 제품 스펙 §3.2(P1 요약)·§2(아키텍처 심)·ENGINE-BRAIN-SEAM §5(Phase-1 순서) → Task 1~8 매핑. ✅
- **타입 일관성**: `BrainProvider` 메서드명(resolveSystemPrompt/shouldRunReview/getReviewConfig/registerAtoms/listReviewers/listOutputModes)이 Task 1 정의와 Task 3 구현, Task 4~6 호출에서 일치. `RunContext.raw`로 critique 입력 전달 — Task 4(구성)·Task 5(소비) 일치. ✅
- **placeholder 스캔**: 추출 태스크는 "기존 코드를 그대로 이동"으로 명시(closure 본문은 이미 존재하는 코드). 새로 작성하는 코드(provider.ts, default-design-brain.ts)는 완전 코드 제시. ✅
- **리스크 정합**: 가장 비싼 매듭(startChatRun, lockstep)은 Task 4·5로 분리, 각 태스크가 e2e 회귀 게이트를 가짐. ✅
- **주의**: Task 4의 closure 추출은 실제 코드 범위가 크므로(7811~8028), 실행 시 `server.ts` 해당 영역을 직접 열어 현 변수 흐름을 재확인할 것(라인 번호는 P0 변경으로 이동 가능).
