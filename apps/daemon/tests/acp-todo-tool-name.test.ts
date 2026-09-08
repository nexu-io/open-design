import { describe, expect, it } from 'vitest';
import { isTodoWriteToolName } from '@open-design/contracts';
import { acpToolName } from '../src/agent-protocol/acp/updates.js';

/**
 * ACP 传输层**不许把清单工具的名字改坏**。
 *
 * 真实形状(2026-08-27 核实):AMR 走 vela 的 ACP 桥,而 vela **从不发 `name` 字段** ——
 * `acp_runtime.go` 的 `mapOpenCodeToolPart` 只发 sessionUpdate / toolCallId /
 * status / title / kind / rawInput / rawOutput / content,把原始 opencode 工具名
 * 塞在 `kind` 里。于是 OD 掉到 title 启发式,而那里的 `/\bwrite\b/` 因为**词边界**
 * 匹配不到 `todowrite` 里的 write,最后走兜底「首词 title-case」→ `Todowrite`。
 *
 * 后果:清单在 AMR 上整个消失。讽刺的是 AMR 跑的就是 opencode 本人 ——
 * 直连 BYOK-opencode 一切正常,走 AMR 就没了,纯粹是传输层改坏了名字。
 * 九家 ACP runtime(amr / devin / hermes / kilo / kimi / kiro / reasonix /
 * trae-cli / vibe)同受影响。
 *
 * 下游那份判据已经改成大小写不敏感(所以即使这里漏了也还有一层网),
 * 但**名字本身就不该被改坏** —— 传输层保真是它自己的职责,
 * 靠下游宽容等于把这条坏账留给每一个未来的消费者。
 */
describe('ACP 清单工具名保真', () => {
  it('vela 的真实帧形状:只有 kind、没有 name → 名字仍要认得出是清单', () => {
    const name = acpToolName({ kind: 'todowrite', title: 'todowrite', toolCallId: 't1' });
    expect(isTodoWriteToolName(name), `实收 ${name}`).toBe(true);
  });

  it('带描述性 title 也一样', () => {
    const name = acpToolName({ kind: 'todowrite', title: 'todowrite: 复刻列表页', toolCallId: 't2' });
    expect(isTodoWriteToolName(name), `实收 ${name}`).toBe(true);
  });

  it('别家的写法同样保真', () => {
    for (const kind of ['todo_write', 'update_plan', 'write_todos']) {
      const name = acpToolName({ kind, title: kind, toolCallId: 't3' });
      expect(isTodoWriteToolName(name), `${kind} → ${name}`).toBe(true);
    }
  });

  it('长得像但不是清单的,不许被认成清单', () => {
    for (const kind of ['write', 'edit', 'read', 'execute']) {
      const name = acpToolName({ kind, title: kind, toolCallId: 't4' });
      expect(isTodoWriteToolName(name), `${kind} → ${name}`).toBe(false);
    }
  });
});
