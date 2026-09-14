import { describe, expect, it } from 'vitest';
import { isTodoWriteToolName } from '../src/api/run-completeness.js';

/**
 * 「这是不是一次清单快照」**只能有一个判据**。
 *
 * 2026-08-27 复现:同一件事全仓有三份判据,写法还不一致 ——
 *   `contracts/run-completeness.ts` 四个精确 `===`
 *   `web/runtime/todos.ts`          同样精确 `===`
 *   `web/runtime/chat/tool-kind.ts` 正则,**带 `/i`**
 *
 * 于是 AMR 那条路把名字改坏之后,表现成**「一半坏」** —— 最难查的那种:
 * 带 `/i` 的认得、精确 `===` 的不认,客户端画得出清单,而 daemon 的
 * `endedWithUnfinishedWork` 漏判。
 *
 * 名字是怎么被改坏的(`agent-protocol/acp/updates.ts:438-448`):
 * vela 从不发 `name` 字段,只发 `kind: 'todowrite'`;OD 掉到 title 启发式,
 * 而 `/\bwrite\b/` 因为**词边界**匹配不到 `todowrite` 里的 write,
 * 于是走最后的兜底「首词 title-case」→ `Todowrite`(w 小写)。
 *
 * 讽刺的是 AMR 跑的就是 opencode 本人:直连 BYOK-opencode 时清单正常,
 * 走 AMR 就没了,纯粹是传输层把名字改坏。九家 ACP runtime 同受影响。
 */
describe('清单工具名判据', () => {
  it('认得各家的原生写法', () => {
    for (const name of ['TodoWrite', 'todowrite', 'todo_write', 'update_plan']) {
      expect(isTodoWriteToolName(name), name).toBe(true);
    }
  });

  it('认得 ACP 传输层 title-case 之后的 `Todowrite`', () => {
    expect(isTodoWriteToolName('Todowrite')).toBe(true);
  });

  it('大小写一律不敏感 —— 判据不该依赖某一家怎么拼', () => {
    for (const name of ['TODOWRITE', 'Todo_Write', 'Update_Plan']) {
      expect(isTodoWriteToolName(name), name).toBe(true);
    }
  });

  it('MCP 注入的前缀名也认', () => {
    expect(isTodoWriteToolName('mcp__planner__todo_write')).toBe(true);
  });

  it('长得像但不是的,一个都不许认', () => {
    for (const name of ['Write', 'todowriter', 'write_todos_later', '', 'TodoRead']) {
      expect(isTodoWriteToolName(name), name).toBe(false);
    }
  });

  it('非字符串不炸', () => {
    for (const bad of [null, undefined, 42, {}]) {
      expect(isTodoWriteToolName(bad)).toBe(false);
    }
  });
});
