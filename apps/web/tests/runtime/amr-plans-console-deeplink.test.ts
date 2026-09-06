/**
 * T54(产品口述 2026-09-06):**升级按钮落在「当前 profile 的 console 套餐页」**,
 * 而不是写死的生产 Pricing。
 *
 * 这条测试存在的理由是一个具体的事故形状:`amrPlansUrlForProfile(_profile)` 的
 * 参数曾经带下划线前缀、刻意不用,于是 test / local / feature-test 的包**一律**跳
 * 生产 `https://open-design.ai/pricing/` —— 而那一页选中套餐会带着 plan + interval
 * 回生产 Vela 直接结账。所以这里钉的不只是「链接对不对」,而是
 * **两个 profile 必须解析到不同的 origin**:只要还有人把 profile 参数忽略掉,
 * 下面那条 origin 对比就会红。
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_AMR_RECHARGE_URL,
  amrPlansUrlForProfile,
  amrPlansUrlForWorkspace,
  setRuntimeAmrConsoleOrigin,
} from '../../src/runtime/amr-guidance';

// 站位用的内部环境 console origin。真实内部主机名不进公开 bundle,
// 打包时由 CI secret 注入、再由 daemon 在运行时报给客户端。
const RUNTIME_CONSOLE_ORIGIN = 'https://vela.example.invalid';

afterEach(() => {
  setRuntimeAmrConsoleOrigin(null);
});

describe('升级按钮的落点:console 的套餐页', () => {
  it('prod 落在生产 console 的套餐页,而不是 Pricing', () => {
    expect(amrPlansUrlForProfile('prod')).toBe(
      `${DEFAULT_AMR_RECHARGE_URL}&billing=plan`,
    );
    expect(amrPlansUrlForProfile('prod')).not.toContain('/pricing');
  });

  it('test profile 落在 test console,不再落在生产 Pricing', () => {
    expect(amrPlansUrlForProfile('test')).toBe(
      'https://vela.powerformer.net/dashboard?source=open_design&billing=plan',
    );
  });

  it('local profile 落在本地 console', () => {
    expect(amrPlansUrlForProfile('local')).toBe(
      'http://localhost:5173/dashboard?source=open_design&billing=plan',
    );
  });

  /**
   * 这条是整组的判据:profile 参数**真的被用到了**。写死一个 URL 也能让上面
   * 几条通过(只要常量恰好对得上),但两个 profile 解析出同一个 origin 不可能。
   */
  it('test 和 prod 必须解析到不同的 origin', () => {
    const test = new URL(amrPlansUrlForProfile('test'));
    const prod = new URL(amrPlansUrlForProfile('prod'));
    expect(test.origin).not.toBe(prod.origin);
    expect(test.searchParams.get('billing')).toBe('plan');
    expect(prod.searchParams.get('billing')).toBe('plan');
  });

  /**
   * 内部环境没有字面量,唯一通路是 daemon 报上来的 origin
   * (`/api/integrations/vela/status` → `setRuntimeAmrConsoleOrigin`)。
   * 复用现成的那条,不另造第二份。
   */
  it('复用 daemon 报的 runtime console origin', () => {
    expect(amrPlansUrlForProfile('feature-test')).toBe(
      `${DEFAULT_AMR_RECHARGE_URL}&billing=plan`,
    );
    setRuntimeAmrConsoleOrigin(RUNTIME_CONSOLE_ORIGIN);
    expect(amrPlansUrlForProfile('feature-test')).toBe(
      `${RUNTIME_CONSOLE_ORIGIN}/dashboard?source=open_design&billing=plan`,
    );
  });

  // 和 `amrConsoleUrlForProfile` 同一条红线:runtime origin 永远改不动生产。
  it('runtime origin 改不动 prod 也改不动未知 profile', () => {
    setRuntimeAmrConsoleOrigin(RUNTIME_CONSOLE_ORIGIN);
    expect(amrPlansUrlForProfile('prod')).toBe(`${DEFAULT_AMR_RECHARGE_URL}&billing=plan`);
    expect(amrPlansUrlForProfile(null)).toBe(`${DEFAULT_AMR_RECHARGE_URL}&billing=plan`);
    expect(amrPlansUrlForProfile(' unknown ')).toBe(
      `${DEFAULT_AMR_RECHARGE_URL}&billing=plan`,
    );
  });

  it('工作区版带上 workspaceId,并且用同一个意图', () => {
    setRuntimeAmrConsoleOrigin(RUNTIME_CONSOLE_ORIGIN);
    const url = amrPlansUrlForWorkspace('feature-test', ' workspace-a ');
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.origin).toBe(RUNTIME_CONSOLE_ORIGIN);
    expect(parsed.pathname).toBe('/dashboard');
    expect(parsed.searchParams.get('workspaceId')).toBe('workspace-a');
    expect(parsed.searchParams.get('billing')).toBe('plan');
  });

  it('没有工作区身份时仍然失败关闭', () => {
    expect(amrPlansUrlForWorkspace('feature-test', null)).toBeNull();
    expect(amrPlansUrlForWorkspace('feature-test', '   ')).toBeNull();
  });
});
