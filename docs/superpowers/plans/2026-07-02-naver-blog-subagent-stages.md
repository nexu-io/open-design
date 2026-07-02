# naver-blog 리서치·검수 서브에이전트 분리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** naver-blog 스킬의 3단계 Research·6단계 Self-review를 child Claude Code의 Task 서브에이전트로 분리하고, 그 전제인 daemon 사이드체인 스트림 가드와 TaskCard UI를 붙인다.

**Architecture:** OD daemon은 run당 agent CLI 하나를 spawn한다(오케스트레이션 없음). 분리는 스킬 지시문 레벨 — spawn된 Claude Code가 자체 Task tool로 서브에이전트를 돌린다. Claude Code는 서브에이전트 내부 트래픽을 부모 stream-json에 최상위 `parent_tool_use_id` 태그로 내보내는데, 현재 `claude-stream.ts`는 이 태그를 무시해 서브에이전트의 `stop_reason: end_turn`이 메인 turn 종료로 오인되어 stdin이 조기 close될 수 있다(run 중단). 따라서 daemon 가드가 필수 선행이고, 그 위에 contracts 태그 전파 → web TaskCard/숨김 → 스킬 개정 순으로 쌓는다.

**Tech Stack:** TypeScript, Vitest, React 18 (apps/web), Express daemon (apps/daemon), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-07-02-naver-blog-subagent-stages-design.md`

## Global Constraints

- 커밋 메시지 형식 `[what] — [why]`, `Co-authored-by` 트레일러 금지 (AGENTS.md Git commit policy).
- 테스트는 `src/` 형제 `tests/` 디렉토리에만 — `src/` 밑 신규 `*.test.ts` 금지.
- 루트 `pnpm test`/`pnpm build` 없음 — 패키지 스코프 명령만 (`pnpm --filter <pkg> test`).
- 공유 DTO/SSE 이벤트 변경은 `packages/contracts` 먼저 — web/daemon이 다른 shape을 쓰면 안 됨.
- i18n 신규 키는 `apps/web/src/i18n/types.ts` 먼저, 그 뒤 18개 로케일 전부 (`ar de en es-ES fa fr hu id ja ko pl pt-BR ru th tr uk zh-CN zh-TW`).
- naver-blog 스킬 파일은 `plugins/_official/examples/naver-blog/` ↔ `design-templates/naver-blog/` byte-identical (SKILL.md, example.html, references/**) — `apps/daemon/tests/naver-blog-catalog-sync.test.ts` 가드.
- 주석은 한국어 원칙이지만 daemon/web 기존 파일은 영어 주석 컨벤션 — 수정 파일의 기존 컨벤션을 따른다.
- 마무리 게이트: `pnpm guard` + `pnpm typecheck` + 변경 패키지 테스트.

---

### Task 1: 실측 프로브 — 서브에이전트 스트림 형태 캡처

**Files:**
- Create: (스크래치) `/tmp/od-sidechain-probe.jsonl` — 커밋하지 않음
- 참고: `apps/daemon/src/claude-stream.ts` (수정은 Task 2에서)

**Interfaces:**
- Produces: `parent_tool_use_id` 실측 형태 확인 결과. Task 2의 fixture가 이 형태와 일치하는지 판정. 불일치 시 Task 2 fixture를 실측 형태로 교체.

이 플랜의 가정: Claude Code stream-json은 서브에이전트 내부 메시지를 **최상위 필드** `"parent_tool_use_id": "toolu_..."` 로 태그해 내보내고, 메인 라인은 `"parent_tool_use_id": null` 이다. 이 태스크는 가정을 실측으로 검증한다.

- [ ] **Step 1: 로컬 claude CLI로 Task 서브에이전트 dispatch 세션 실행**

```bash
claude -p --output-format stream-json --verbose \
  "Use the Task tool to dispatch a subagent (subagent_type: general-purpose) with the prompt: 'Reply with the single word: pong'. Then report its reply in one sentence." \
  > /tmp/od-sidechain-probe.jsonl 2>&1 || true
wc -l /tmp/od-sidechain-probe.jsonl
```

Expected: 10줄 이상의 JSONL. (claude 미인증/미설치로 실패 시: 이 태스크를 SKIP 표시하고 Task 2의 synthetic fixture 가정을 유지하되, Task 6 도그푸딩에서 실측 확인을 반드시 수행한다고 플랜 체크박스에 메모.)

- [ ] **Step 2: parent_tool_use_id 존재·형태 확인**

```bash
grep -c 'parent_tool_use_id' /tmp/od-sidechain-probe.jsonl
grep -o '"parent_tool_use_id":"[^"]*"' /tmp/od-sidechain-probe.jsonl | sort -u | head
python3 -c "
import json,sys
for line in open('/tmp/od-sidechain-probe.jsonl'):
    try: o=json.loads(line)
    except Exception: continue
    p=o.get('parent_tool_use_id')
    sr=(o.get('message') or {}).get('stop_reason') if isinstance(o.get('message'),dict) else None
    print(o.get('type'), 'parent=',p, 'stop_reason=',sr)
"
```

Expected 관찰 3가지:
1. `"parent_tool_use_id":"toolu_..."` 태그 라인이 1개 이상 존재 (사이드체인).
2. 사이드체인 `assistant` 라인 중 `stop_reason: end_turn` 이 존재 — 이것이 버그 트리거.
3. 메인 라인은 `parent= None` 또는 `null`.

판정:
- 관찰 1·2 확인 → 가정 일치. Task 2 진행.
- `parent_tool_use_id` 라인이 0개 (CLI가 사이드체인을 아예 안 내보냄) → stdin 조기 close 위험은 이 CLI 버전에선 없음. **그래도 Task 2~4를 그대로 진행** (가드는 무해하고, 향후 CLI 업데이트·`--include-partial-messages` 조합 대비). 커밋 메시지에 "probe: no sidechain lines observed on <claude --version>" 명시.
- 태그가 최상위가 아니라 다른 위치(예: `message` 내부) → Task 2의 fixture와 구현의 필드 접근 경로를 실측 위치로 수정 후 진행.

- [ ] **Step 3: claude 버전 기록**

```bash
claude --version
```

관찰 결과 요약(버전, 관찰 1~3 판정)을 Task 2 커밋 메시지 본문에 1줄로 남긴다. 커밋은 없음.

---

### Task 2: daemon 사이드체인 가드 — red spec → fix

**Files:**
- Create: `apps/daemon/tests/claude-stream-sidechain.test.ts`
- Modify: `apps/daemon/src/claude-stream.ts` (라인 ~380 dispatch 블록 + 신규 helper)

**Interfaces:**
- Consumes: `createClaudeStreamHandler(onEvent)` — 기존 export, `apps/daemon/src/claude-stream.ts`.
- Produces: 사이드체인 라인에서 (a) `turn_end`·`text_delta`·`thinking_delta`·`status` 미발화, (b) `{ type: 'tool_use', id, name, input, parentToolUseId }` 및 `{ type: 'tool_result', toolUseId, content, isError, parentToolUseId }` 이벤트. Task 3·4가 `parentToolUseId` 필드명에 의존.

- [ ] **Step 1: failing test 작성**

`apps/daemon/tests/claude-stream-sidechain.test.ts` 전체 내용:

```ts
/**
 * Regression tests for the sidechain (subagent) guard in `claude-stream.ts`.
 *
 * Claude Code emits subagent-internal traffic in the parent stream-json
 * tagged with a top-level `parent_tool_use_id`. Untagged handling lets a
 * subagent's final `stop_reason: end_turn` emit `turn_end`, which the
 * daemon's stdin-close bookkeeping treats as the MAIN turn ending — closing
 * stream-json stdin mid-run. Sidechain text must also stay out of the
 * text_delta channel (it would feed the artifact parser).
 * Spec: docs/superpowers/specs/2026-07-02-naver-blog-subagent-stages-design.md
 */

import { describe, expect, it } from 'vitest';
import { createClaudeStreamHandler } from '../src/claude-stream.js';

type Event = Record<string, unknown>;

function collect(): { events: Event[]; sink: (ev: Event) => void } {
  const events: Event[] = [];
  return { events, sink: (ev) => events.push(ev) };
}

function feedLine(handler: ReturnType<typeof createClaudeStreamHandler>, line: object) {
  handler.feed(JSON.stringify(line) + '\n');
}

describe('claude-stream sidechain guard', () => {
  it('does NOT emit turn_end / text_delta for a sidechain assistant end_turn', () => {
    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);

    feedLine(handler, {
      type: 'assistant',
      parent_tool_use_id: 'toolu_task_1',
      message: {
        id: 'msg-side-1',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'subagent final answer' }],
      },
    });

    expect(events.filter((e) => e.type === 'turn_end')).toHaveLength(0);
    expect(events.filter((e) => e.type === 'text_delta')).toHaveLength(0);
  });

  it('still emits turn_end for a main-line assistant end_turn (parent_tool_use_id null)', () => {
    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);

    feedLine(handler, {
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        id: 'msg-main-1',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'main answer' }],
      },
    });

    const turnEnds = events.filter((e) => e.type === 'turn_end');
    expect(turnEnds).toHaveLength(1);
    expect(turnEnds[0]!.stopReason).toBe('end_turn');
  });

  it('tags sidechain tool_use and tool_result with parentToolUseId', () => {
    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);

    feedLine(handler, {
      type: 'assistant',
      parent_tool_use_id: 'toolu_task_1',
      message: {
        id: 'msg-side-2',
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'toolu_side_ws', name: 'WebSearch', input: { query: '실비 청구' } },
        ],
      },
    });
    feedLine(handler, {
      type: 'user',
      parent_tool_use_id: 'toolu_task_1',
      message: {
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_side_ws', content: 'results…', is_error: false },
        ],
      },
    });

    const uses = events.filter((e) => e.type === 'tool_use');
    expect(uses).toHaveLength(1);
    expect(uses[0]!.parentToolUseId).toBe('toolu_task_1');
    expect(uses[0]!.name).toBe('WebSearch');

    const results = events.filter((e) => e.type === 'tool_result');
    expect(results).toHaveLength(1);
    expect(results[0]!.parentToolUseId).toBe('toolu_task_1');
    expect(results[0]!.toolUseId).toBe('toolu_side_ws');
  });

  it('drops sidechain stream_event deltas entirely', () => {
    const { events, sink } = collect();
    const handler = createClaudeStreamHandler(sink);

    feedLine(handler, {
      type: 'stream_event',
      parent_tool_use_id: 'toolu_task_1',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'sidechain streamed text' },
      },
    });

    expect(events.filter((e) => e.type === 'text_delta')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: red 확인**

Run: `pnpm --filter @marketing-ax/daemon test -- claude-stream-sidechain`
Expected: FAIL — 1번 테스트에서 `turn_end` 1개 발화(0 기대), 3번 테스트에서 `parentToolUseId` undefined.

- [ ] **Step 3: 가드 구현**

`apps/daemon/src/claude-stream.ts` — JSONL 오브젝트 dispatch 함수(`if (obj.type === 'system' && obj.subtype === 'init')` 검사가 있는 함수, ~line 380)의 **첫 분기 앞**에 삽입:

```ts
    // Sidechain guard. Claude Code emits subagent-internal traffic in the
    // parent stream tagged with a top-level `parent_tool_use_id`. Those
    // lines must not drive main-line state: a subagent's final
    // `stop_reason: end_turn` would emit `turn_end` and close stream-json
    // stdin mid-run, and sidechain text would feed the artifact parser.
    // Surface only tagged tool activity so the UI can tell it apart.
    const parentToolUseId =
      typeof obj.parent_tool_use_id === 'string' && obj.parent_tool_use_id.length > 0
        ? obj.parent_tool_use_id
        : null;
    if (parentToolUseId) {
      handleSidechainLine(obj, parentToolUseId);
      return;
    }
```

같은 파일, 그 dispatch 함수 인근(형제 스코프, `onEvent`·`isRecord`·`stringifyToolResult` 접근 가능한 위치)에 helper 추가:

```ts
  // Subagent-internal lines: emit only tagged tool activity. Text, thinking,
  // status, and stop_reason signals from the sidechain are intentionally
  // dropped — the Task tool_result on the main line already carries the
  // subagent's final answer. Bypasses emitToolUse on purpose: the artifact
  // duplicate-suppression bookkeeping there tracks MAIN-line Write contents.
  function handleSidechainLine(obj: Record<string, unknown>, parentToolUseId: string) {
    if (obj.type === 'assistant' && isRecord(obj.message) && Array.isArray(obj.message.content)) {
      for (const block of obj.message.content) {
        if (!isRecord(block)) continue;
        if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
          onEvent({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input ?? null,
            parentToolUseId,
          });
        }
      }
      return;
    }
    if (obj.type === 'user' && isRecord(obj.message) && Array.isArray(obj.message.content)) {
      for (const block of obj.message.content) {
        if (!isRecord(block)) continue;
        if (block.type === 'tool_result') {
          onEvent({
            type: 'tool_result',
            toolUseId: block.tool_use_id,
            content: stringifyToolResult(block.content),
            isError: Boolean(block.is_error),
            parentToolUseId,
          });
        }
      }
    }
    // stream_event / system / result lines from the sidechain: drop.
  }
```

주의: `stringifyToolResult`가 dispatch 함수보다 아래에 정의돼 있으면 hoisting되는 `function` 선언인지 확인하고, 아니면 helper를 그 아래로 옮긴다.

- [ ] **Step 4: green 확인 + 기존 스트림 테스트 회귀 확인**

Run: `pnpm --filter @marketing-ax/daemon test -- claude-stream`
Expected: `claude-stream-sidechain` 4/4 PASS, `claude-stream-thinking` 기존 테스트 전부 PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/daemon/tests/claude-stream-sidechain.test.ts apps/daemon/src/claude-stream.ts
git commit -m "Guard claude-stream against subagent sidechain lines — a subagent end_turn closed stream-json stdin mid-run"
```

커밋 본문에 Task 1 프로브 결과 1줄 포함 (예: `probe: claude 2.x.y, top-level parent_tool_use_id confirmed, sidechain end_turn observed`).

---

### Task 3: contracts 태그 전파 + 영속화 매핑

**Files:**
- Modify: `packages/contracts/src/sse/chat.ts` — `DaemonAgentPayload`의 `tool_use`(~line 89)·`tool_result`(~line 101)
- Modify: `packages/contracts/src/api/chat.ts` — `PersistedAgentEvent`의 `tool_use`·`tool_result`(~line 399-400)
- Modify: `apps/daemon/src/server.ts` — `daemonAgentPayloadToPersistedAgentEvent`(~line 2615-2629)

**Interfaces:**
- Consumes: Task 2의 `parentToolUseId` 이벤트 필드.
- Produces: `PersistedAgentEvent` tool_use/tool_result에 `parentToolUseId?: string` — Task 4의 web 필터·TaskCard가 의존. 옵셔널이므로 기존 소비자 무영향.

- [ ] **Step 1: contracts 타입 수정**

`packages/contracts/src/sse/chat.ts`:

```ts
  /** Present when this tool call happened inside a subagent (sidechain);
   *  value is the parent Task tool_use id. UI renders sidechain activity
   *  distinctly (or hides it) instead of mixing it into the main flow. */
  | { type: 'tool_use'; id: string; name: string; input: unknown; parentToolUseId?: string }
```

(`tool_result`도 동일하게 `parentToolUseId?: string` 추가. 독블록은 tool_use 쪽에만.)

`packages/contracts/src/api/chat.ts`:

```ts
  | { kind: 'tool_use'; id: string; name: string; input: unknown; parentToolUseId?: string }
  | { kind: 'tool_result'; toolUseId: string; content: string; isError: boolean; parentToolUseId?: string }
```

- [ ] **Step 2: server.ts 매핑 통과**

`daemonAgentPayloadToPersistedAgentEvent`의 두 분기 수정:

```js
  if (type === 'tool_use' && typeof data.id === 'string' && typeof data.name === 'string') {
    return {
      kind: 'tool_use',
      id: data.id,
      name: data.name,
      input: normalizePersistedToolInput(data.input),
      ...(typeof data.parentToolUseId === 'string' && data.parentToolUseId
        ? { parentToolUseId: data.parentToolUseId }
        : {}),
    };
  }
```

```js
  if (type === 'tool_result' && typeof data.toolUseId === 'string') {
    return {
      kind: 'tool_result',
      toolUseId: data.toolUseId,
      content: String(data.content ?? ''),
      isError: Boolean(data.isError),
      ...(typeof data.parentToolUseId === 'string' && data.parentToolUseId
        ? { parentToolUseId: data.parentToolUseId }
        : {}),
    };
  }
```

- [ ] **Step 3: typecheck + daemon test**

Run: `pnpm typecheck && pnpm --filter @marketing-ax/daemon test`
Expected: PASS (옵셔널 필드 추가라 breaking 없음).

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/sse/chat.ts packages/contracts/src/api/chat.ts apps/daemon/src/server.ts
git commit -m "Propagate parentToolUseId through SSE + persisted agent events — so the web can tell subagent activity apart"
```

---

### Task 4: web — TaskCard + 사이드체인 숨김 + i18n

**Files:**
- Modify: `apps/web/src/i18n/types.ts` — `'tool.task': string;` 추가 (기존 `'tool.glob'` 근처, ~line 2890)
- Modify: `apps/web/src/i18n/locales/{ar,de,en,es-ES,fa,fr,hu,id,ja,ko,pl,pt-BR,ru,th,tr,uk,zh-CN,zh-TW}.ts` — 각 파일의 `'tool.search'` 항목 옆에 `'tool.task'` 추가
- Modify: `apps/web/src/components/ToolCard.tsx` — Task 분기 + `TaskCard` 컴포넌트
- Modify: `apps/web/src/components/AssistantMessage.tsx` — `buildBlocks`(~line 2675)에서 사이드체인 tool_use 스킵
- Create: `apps/web/tests/components/tool-card-task.test.tsx`

**Interfaces:**
- Consumes: `PersistedAgentEvent.tool_use.parentToolUseId` (Task 3), `useT()` i18n 훅, `.op-card`/`ResultBadge` 기존 패턴.
- Produces: `name === 'Task'` tool_use가 TaskCard로 렌더, `parentToolUseId` 있는 tool_use는 메인 트랜스크립트에서 숨김.

- [ ] **Step 1: i18n 키 추가**

`types.ts`에 `'tool.task': string;`. 로케일 값 (각 파일의 `'tool.search'` 정의 옆에 추가):

| locale | value |
|---|---|
| en | `'Subagent'` |
| ko | `'서브에이전트'` |
| ja | `'サブエージェント'` |
| zh-CN | `'子代理'` |
| zh-TW | `'子代理'` |
| de | `'Subagent'` |
| es-ES | `'Subagente'` |
| fr | `'Sous-agent'` |
| pt-BR | `'Subagente'` |
| ru | `'Субагент'` |
| uk | `'Субагент'` |
| pl | `'Subagent'` |
| id | `'Subagen'` |
| tr | `'Alt ajan'` |
| th | `'ซับเอเจนต์'` |
| ar | `'وكيل فرعي'` |
| fa | `'عامل فرعی'` |
| hu | `'Alügynök'` |

- [ ] **Step 2: failing test 작성**

`apps/web/tests/components/tool-card-task.test.tsx` 전체 내용:

```tsx
// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { AgentEvent, ChatMessage } from '../../src/types';

function messageWithEvents(events: AgentEvent[]): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    events,
    startedAt: 1_000,
    endedAt: 3_000,
    runStatus: 'succeeded',
  };
}

describe('Task tool rendering + sidechain hiding', () => {
  afterEach(() => cleanup());

  it('renders a Task tool_use as a TaskCard with its description', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'toolu_task_1',
            name: 'Task',
            input: {
              description: '리서치 서브에이전트',
              prompt: 'Read research-subagent.md and …',
              subagent_type: 'general-purpose',
            },
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    const card = container.querySelector('.op-task');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('리서치 서브에이전트');
    // The raw prompt JSON must NOT leak into the card head (GenericCard did).
    expect(card!.querySelector('.op-card-head')!.textContent).not.toContain('general-purpose');
  });

  it('hides sidechain tool_use events from the main transcript', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'toolu_task_1',
            name: 'Task',
            input: { description: '리서치 서브에이전트', prompt: 'p', subagent_type: 'general-purpose' },
          },
          {
            kind: 'tool_use',
            id: 'toolu_side_ws',
            name: 'WebSearch',
            input: { query: '실비 청구' },
            parentToolUseId: 'toolu_task_1',
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    // The sidechain WebSearch must not render its own card.
    expect(container.querySelector('.op-web')).toBeNull();
    expect(container.querySelector('.op-task')).not.toBeNull();
  });
});
```

- [ ] **Step 3: red 확인**

Run: `pnpm --filter @marketing-ax/web test -- tool-card-task`
Expected: FAIL — `.op-task` 없음(GenericCard 렌더), `.op-web` 카드 존재.

- [ ] **Step 4: 구현**

`ToolCard.tsx` — `WebSearchCard` 분기(~line 73) 다음, `isAskUserQuestionName` 분기 앞에:

```tsx
  if (name === 'Task') return <TaskCard input={use.input} result={result} runStreaming={isStreaming} runSucceeded={isSucceeded} />;
```

`WebSearchCard` 아래에 컴포넌트 추가:

```tsx
function TaskCard({ input, result, runStreaming, runSucceeded }: { input: unknown; result?: Props['result']; runStreaming: boolean; runSucceeded: boolean }) {
  const t = useT();
  const obj = (input ?? {}) as { description?: string; subagent_type?: string };
  const label = obj.description?.trim() || obj.subagent_type || '';
  return (
    <div className="op-card op-task">
      <div className="op-card-head">
        <ResultBadge result={result} runStreaming={runStreaming} runSucceeded={runSucceeded} />
        <span className="op-title">{t('tool.task')}</span>
        <span className="op-meta">{label}</span>
      </div>
      {result && !result.isError && result.content.trim() ? (
        <pre className="op-output">{truncate(result.content, 1200)}</pre>
      ) : null}
      <FileErrorDetail result={result} />
    </div>
  );
}
```

(`truncate`·`FileErrorDetail`은 같은 파일 기존 helper. `op-task` 클래스는 스타일 훅 용도 — 신규 CSS 불필요, `op-card` 기본으로 충분.)

`AssistantMessage.tsx` `buildBlocks`의 tool_use 분기(~line 2697) 첫 줄에:

```ts
    if (ev.kind === "tool_use") {
      // Sidechain (subagent-internal) tool calls are represented by their
      // parent TaskCard; rendering them inline would read as main-agent work.
      if (ev.parentToolUseId) continue;
```

- [ ] **Step 5: green 확인 + 회귀**

Run: `pnpm --filter @marketing-ax/web test && pnpm --filter @marketing-ax/web typecheck`
Expected: 신규 2개 포함 전부 PASS. (i18n 키 누락 시 typecheck가 로케일 파일명으로 실패 — 해당 파일에 키 추가.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/i18n/types.ts apps/web/src/i18n/locales apps/web/src/components/ToolCard.tsx apps/web/src/components/AssistantMessage.tsx apps/web/tests/components/tool-card-task.test.tsx
git commit -m "Add TaskCard + hide sidechain tool events — subagent runs read as one labeled card instead of raw Task JSON and interleaved internal calls"
```

---

### Task 5: naver-blog 스킬 개정 — 3·6단계 서브에이전트 분리 + references 2종

**Files:**
- Create: `plugins/_official/examples/naver-blog/references/research-subagent.md`
- Create: `plugins/_official/examples/naver-blog/references/review-subagent.md`
- Modify: `plugins/_official/examples/naver-blog/SKILL.md` — 3·6단계 교체
- Create/Modify: `design-templates/naver-blog/` 동일 3파일 (byte-identical 복사)

**Interfaces:**
- Consumes: 없음 (Task 2~4와 독립 — 단 배포 전 Task 2 머지가 전제, 스펙 §5).
- Produces: 서브에이전트 dispatch 지시문. 산출물 계약: `research.md`(리서치), 채점표+P0/P1 목록(검수) — 런타임 무관 동일.

- [ ] **Step 1: research-subagent.md 작성**

`plugins/_official/examples/naver-blog/references/research-subagent.md` 전체 내용:

```markdown
# 리서치 서브에이전트 — dispatch 지시

메인 에이전트: 서브에이전트 dispatch 도구(Task 등)가 있으면 **반드시** 이 지시로
리서치를 분리 실행한다. 없으면 아래 "서브에이전트 임무"를 인라인으로 동일 수행한다
(산출물 계약 동일). dispatch 프롬프트에 다음 입력을 채워 넣는다:

- `{topic}` — 인터뷰에서 확정한 주제
- `{keyword}` — 타겟 롱테일 키워드 (없으면 "없음")
- `{audience}` — 타겟 독자
- `{design_md_path}` — 활성 design-systems/<brand>/DESIGN.md 절대 경로
- `{cwd}` — 프로젝트 작업 디렉토리 절대 경로

## 서브에이전트 임무 (dispatch 프롬프트 본문)

너는 네이버 블로그 글 기획을 위한 리서치 전담 에이전트다. 최종 텍스트 반환만이
메인에게 전달된다 — 잡담 없이 결과만.

1. `{design_md_path}` Read — 출처 정책(금지 출처: 예. 네이버 블로그/카페/지식iN)과
   면책·금지어 규칙을 확인한다.
2. WebSearch로 `{topic}` / `{keyword}` 관련 1차 출처를 수집한다. 우선순위:
   공공기관·법령·공식 통계 > 언론 보도 > 업계 리포트. 금지 출처는 버린다.
3. `{cwd}/research.md` 를 Write한다. 형식:

   # research — {topic}
   ## 핵심 사실
   - [사실 1] (출처 #1, 발행일)
   - …
   ## 수치·통계
   - [수치] (출처 #, 발행일)
   ## 출처
   1. [제목](URL) — 발행처, 발행일, 신뢰도(상/중/하)
   ## 리서치 공백
   - [확인 못 한 것·추가 취재 필요 항목]

4. 반환(최종 텍스트): 핵심 사실 불릿 **최대 10줄** + "상세: research.md" 1줄.
   검색 결과 원문·긴 인용은 반환에 넣지 말 것 — research.md에만 담는다.
```

- [ ] **Step 2: review-subagent.md 작성**

`plugins/_official/examples/naver-blog/references/review-subagent.md` 전체 내용:

```markdown
# 검수 서브에이전트 — dispatch 지시

메인 에이전트: 서브에이전트 dispatch 도구가 있으면 **반드시** 신선한 컨텍스트의
검수자에게 위임한다(작성자 자기검수 편향 차단). 없으면 인라인 자가검수로 동일
채점표를 수행한다. dispatch 프롬프트에 다음 입력을 채워 넣는다:

- `{html_path}` — 검수 대상 <slug>.html 절대 경로
- `{brief_path}` — brief.md 절대 경로
- `{research_path}` — research.md 절대 경로 (없으면 "없음")
- `{design_md_path}` — 활성 DESIGN.md 절대 경로
- `{craft_path}` — craft/naver-blog-html.md 절대 경로 (스킬 스테이징 또는 레포 경로)

## 서브에이전트 임무 (dispatch 프롬프트 본문)

너는 네이버 블로그 글 검수 전담 에이전트다. **report-only — 파일을 수정하지
마라.** 최종 텍스트 반환만이 메인에게 전달된다.

1. Read: `{craft_path}`, `{design_md_path}`, `{brief_path}`, `{research_path}`,
   `{html_path}`. 전부 직접 읽고 판단한다 — 메인의 요약을 신뢰하지 않는다.
2. 채점 (각 축 감점 사유를 개별 발견으로 기록):
   - craft 13 HTML룰 (13개 각 pass/fail)
   - SEO 5항목 (제목 첫15자 키워드·heading 구조·본문 키워드 밀도·내부 일관성·CTA)
   - 브랜드 anti-pattern (DESIGN.md의 금지어·금지 표현·면책 누락)
   - 팩트체크: 본문의 모든 수치·기관명·제도명을 research.md 출처와 대조.
     1차 매핑 실패 시 정성 판단으로 완화하되 발견으로 기록.
3. 반환 형식 (이 구조 그대로):

   ## 검수 결과
   - 총점: NN/100
   - 게이트: 발행 가능(≥80) / 수정 필요(60~79) / 재기획(<60)
   ### P0 (발행 차단)
   - [파일·위치] 문제 — 근거
   ### P1 (권고)
   - [파일·위치] 문제 — 근거
   ### 축별 점수
   - craft: NN, SEO: NN, 브랜드: NN, 팩트: NN

메인 에이전트: P0·감점 항목을 수정한 뒤 **재검수 1회**(신규 dispatch, 같은 지시).
재검수 후에도 <80이면 점수·발견목록을 사용자에게 보고하고 판단을 위임한다.
```

- [ ] **Step 3: SKILL.md 3·6단계 교체**

`plugins/_official/examples/naver-blog/SKILL.md`의 3단계 줄을 다음으로 교체:

```markdown
3. **Research(서브에이전트)** — dispatch 도구 있으면 **반드시** 분리: `references/research-subagent.md` Read 후 그 지시대로 리서치 서브에이전트에 위임(입력: 주제·키워드·독자·DESIGN.md 경로·cwd). 서브에이전트가 WebSearch로 1차 출처 수집 → `research.md`를 cwd에 Write → 핵심 사실 ≤10줄만 반환(SERP 덤프는 research.md에 격리). dispatch 불가 런타임은 같은 절차 인라인(산출물 계약 동일). 브랜드 출처 정책 준수(예: 네이버 블로그/카페/지식iN 금지). 라이브 SERP 도구 없음.
```

6단계 줄을 다음으로 교체:

```markdown
6. **Review(서브에이전트 검수)** — dispatch 도구 있으면 **반드시** 신선한 컨텍스트 검수자에게 위임: `references/review-subagent.md` Read 후 지시대로(검수자가 craft·DESIGN.md·brief.md·research.md·`<slug>.html` 직접 Read). 검수자는 **report-only** — craft 13 HTML룰 + SEO 5항목 + 브랜드 anti-pattern + 팩트체크(research.md 대조) 채점표와 P0/P1 목록만 반환. 수정은 메인이 반영 후 재검수 1회. 게이트 ≥80 발행 / 60~79 수정 / <60 재기획 — 재검수 후에도 <80이면 사용자 보고·판단 위임. dispatch 불가 시 인라인 자가검수(같은 채점표).
```

4단계 문구 중 `sources` 부분을 `sources(research.md 참조)`로 수정.

- [ ] **Step 4: design-templates 동기화**

```bash
cp plugins/_official/examples/naver-blog/SKILL.md design-templates/naver-blog/SKILL.md
cp plugins/_official/examples/naver-blog/references/research-subagent.md design-templates/naver-blog/references/
cp plugins/_official/examples/naver-blog/references/review-subagent.md design-templates/naver-blog/references/
```

- [ ] **Step 5: catalog-sync 가드 확인**

Run: `pnpm --filter @marketing-ax/daemon test -- naver-blog`
Expected: `naver-blog-catalog-sync` 포함 전부 PASS. (references/** 글롭이 신규 파일을 집는지 확인 — 실패하면 테스트의 shared-subset 목록에 두 파일 추가.)

- [ ] **Step 6: Commit**

```bash
git add plugins/_official/examples/naver-blog design-templates/naver-blog
git commit -m "Split naver-blog research/review into subagent stages — fresh-context reviewer + research.md isolation, inline fallback for non-Task runtimes"
```

---

### Task 6: 통합 검증 + 도그푸딩

**Files:** 없음 (검증만)

**Interfaces:**
- Consumes: Task 1~5 전부.

- [ ] **Step 1: 전체 게이트**

```bash
pnpm guard
pnpm typecheck
pnpm --filter @marketing-ax/daemon test
pnpm --filter @marketing-ax/web test
```

Expected: 전부 PASS.

- [ ] **Step 2: 도그푸딩 run (스펙 §7-4)**

```bash
pnpm tools-dev run web --daemon-port 17456 --web-port 17573
```

웹에서 naver-blog 플러그인 프로젝트 생성 → "정형외과 실비 청구 범위 블로그 글 써줘 — 도수치료 받는 직장인 대상." → 인터뷰·컨펌 진행. 확인 항목:

1. 3단계에서 Task dispatch 발생 + TaskCard가 "서브에이전트 / 리서치…" 라벨로 렌더 (raw JSON 아님)
2. 사이드체인 WebSearch 카드가 메인 트랜스크립트에 안 섞임
3. run이 서브에이전트 도중 끊기지 않고 완주 (stdin 조기 close 재발 없음)
4. `research.md`·`brief.md`·`<slug>.html` cwd 생성
5. 6단계 검수 서브에이전트 채점표 반환 + 게이트 동작

- [ ] **Step 3: 결과 보고**

5개 확인 항목 결과를 사용자에게 보고. Task 1 프로브가 SKIP이었다면 여기서 실측 확정. 실패 항목은 해당 태스크로 돌아가 수정.
