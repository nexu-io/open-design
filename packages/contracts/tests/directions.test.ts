/**
 * 方向**库**本身的形状。
 *
 * 这份测试原来钉的是 `findDirectionByLabel` —— 一个「拿用户在方向表单里看到的
 * label 反查方向」的 helper。2026-09-08 产品把「让用户挑设计风格」整条路删掉之后
 * (`e2e/tests/design-direction-picker-removed.test.ts`),那个表单不存在了,helper
 * 也随之删掉:仍然需要「按 id 或 label 取一份规格」的只剩 `od tools directions`,
 * 而它走的是 daemon 侧的 `formatDirectionSpecText`,label 容错本来就在那一处。
 *
 * 库**没有**跟着删 —— 它是 agent **自己推断**方向之后绑定调色板的事实源。
 * 所以判据换成库自己的不变量:id 唯一、规格完整、拼出来的块每条都在。
 */
import { describe, expect, it } from 'vitest';
import { DESIGN_DIRECTIONS, renderDirectionSpecBlock } from '../src/prompts/directions.js';

describe('design direction library', () => {
  it('每个方向都有唯一的 kebab-case id', () => {
    const ids = DESIGN_DIRECTIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
  });

  it('每个方向都带着可以直接绑进 `:root` 的完整规格', () => {
    expect(DESIGN_DIRECTIONS.length).toBeGreaterThan(0);
    for (const d of DESIGN_DIRECTIONS) {
      expect(d.label.length, `${d.id} 没有 label`).toBeGreaterThan(0);
      expect(d.mood.length, `${d.id} 没有 mood`).toBeGreaterThan(0);
      expect(d.references.length, `${d.id} 没有参考`).toBeGreaterThan(0);
      expect(d.displayFont.length, `${d.id} 没有 display 字体栈`).toBeGreaterThan(0);
      expect(d.bodyFont.length, `${d.id} 没有 body 字体栈`).toBeGreaterThan(0);
      expect(d.posture.length, `${d.id} 没有版式姿态`).toBeGreaterThan(0);
      // 六个色值一个都不能少 —— 缺一个,seed 的 `:root` 就会留一条旧值
      for (const slot of ['bg', 'surface', 'fg', 'muted', 'border', 'accent'] as const) {
        expect(d.palette[slot], `${d.id} 缺 --${slot}`).toMatch(/\S/);
      }
    }
  });

  it('拼进系统提示词的那一块把每个方向都写了出来', () => {
    const block = renderDirectionSpecBlock();
    for (const d of DESIGN_DIRECTIONS) {
      expect(block, `${d.id} 没进提示词块`).toContain(`(id: ${d.id})`);
      expect(block, `${d.id} 的 accent 没进提示词块`).toContain(d.palette.accent);
    }
  });
});
