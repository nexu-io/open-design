// 红测(E1 / E4 / E6):报错卡的主按钮必须由「失败的性质」推导,而不是每一档手挑一颗。
//
// 权威:`specs/current/run-error-catalog.md` §6.Z(阶梯)、§6.T(阶梯 ↔ F0–F10)、
// §6.X(逐条裁决);`docs/design/run-errors/error-ux-design.md`(32 个场景 + 频次表)。
//
// 在补映射之前这一整份都是红的:
//   - `primaryActionForFailure` / `RunFailureNature` 不存在(阶梯函数没写);
//   - `'contact-support'` 不是 `RunFailurePrimaryAction` 的成员(第 4 档没有出口);
//   - S19(进程异常退出,每月 20,868 次、第二大类)三张表里一档都没有,整个落兜底;
//   - `account_suspended`(封号)没有分类,落兜底 → 拿到一颗必然白点的〔重试〕。
import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * 19 个语言包的路径 —— 从磁盘数,不写死清单。
 *
 * 不用 `import.meta.glob`:那是 Vite 的编译期语法,`tsc` 不认(`apps/web` 的
 * typecheck 里 `ImportMeta` 上没有 `glob`),会在 CI 上红成类型错。读目录既能
 * 通过类型检查,也保留了「新增一个语种自动进覆盖」的性质。
 */
const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../src/i18n/locales');

function localeModulePaths(): string[] {
  return readdirSync(LOCALES_DIR)
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => join(LOCALES_DIR, name));
}

async function loadLocaleDict(path: string): Promise<Record<string, string>> {
  const mod = (await import(/* @vite-ignore */ path)) as Record<string, unknown>;
  return (mod.default ?? Object.values(mod)[0]) as Record<string, string>;
}

import {
  isReconnectOwnedFailure,
  primaryActionForFailure,
  resolveRunFailureUi,
  RECONNECT_OWNED_FAILURE_CODE,
  RUN_FAILURE_FALLBACK_MESSAGE_KEY,
} from '../../src/runtime/amr-guidance';
import {
  GENERIC_DAEMON_DISCONNECT_CODE,
  GENERIC_DAEMON_DISCONNECT_MESSAGE,
} from '../../src/providers/daemon';

describe('主按钮阶梯(§6.Z)', () => {
  // 档 1:我们有能直接解决它的动作 —— 去设置改 key / 换个模型 / 新建对话 /
  // 授权并重试 / 去充值·升级。有它就永远优先,不许越过它去劝人切 Cloud
  // (用户原话:「那是把营销放在解决问题前面」)。
  it('第 1 档:有一键解决的动作时,它就是主按钮', () => {
    expect(primaryActionForFailure({ directFix: 'switch-model' })).toBe('switch-model');
    expect(primaryActionForFailure({ directFix: 'authorize' })).toBe('authorize');
    // 就算这次失败同时是「暂时性」且「本地走不通」,档 1 依然赢。
    expect(
      primaryActionForFailure({
        directFix: 'recharge',
        transient: true,
        localDeadEnd: true,
      }),
    ).toBe('recharge');
  });

  // 档 2:暂时性 —— 从失败处重试。
  it('第 2 档:暂时性失败给重试,并且赢过档 3', () => {
    expect(primaryActionForFailure({ transient: true })).toBe('retry');
    expect(primaryActionForFailure({ transient: true, localDeadEnd: true })).toBe('retry');
  });

  // 档 3:本地这条路根本走不通 —— 主按钮是「切换到 Cloud」。
  // 卡自己不再另起一颗按钮,那颗按钮在下面那张切换卡上(`showSwitchCard`)。
  it('第 3 档:本地走不通时主按钮是切换到 Cloud', () => {
    expect(primaryActionForFailure({ localDeadEnd: true })).toBe('switch-to-cloud');
  });

  // 档 4:上面都没有 —— 〔联系支持〕从常驻次级**提为主**(E6)。
  it('第 4 档:都没有出路时联系支持提为主按钮', () => {
    expect(primaryActionForFailure({})).toBe('contact-support');
  });
});

describe('原则四:重试只在有用时出现', () => {
  // 设计原则四逐字点名的三类。§6.Z:「第 4 档正好兜住原则四:额度用完、
  // 账号被封、CPU 不支持这三类拿不到重试」。这三条各自的依据:
  //   - 额度用完  hard_quota            → §6.Z 点名裁决(S08,每月 23,333 次、P0 最大类)
  //   - 账号被封  account_suspended     → §6.Z 原则四那一句 + 主表 R-064(「卡(联系支持,不给 Retry)」)
  //   - CPU 不支持 cpu_unsupported      → §6.Z 原则四那一句
  it.each([
    ['hard_quota' as const],
    ['account_suspended' as const],
    ['cpu_unsupported' as const],
  ])('%s 拿不到任何形态的重试', (detail) => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', detail, 'claude');
    expect(ui.primaryAction).not.toBe('retry');
    expect(ui.secondaryRetry).toBe(false);
  });

  it('封号落第 4 档:主按钮是联系支持,且不劝人切 Cloud', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'account_suspended', 'amr');
    expect(ui.primaryAction).toBe('contact-support');
    expect(ui.showSwitchCard).toBe(false);
    expect(ui.titleKey).toBe('chat.runError.title.accountSuspended');
    expect(ui.messageKey).toBe('chat.runError.accountSuspendedMessage');
  });

  // R-031 主表:「后续流程 F10 反馈」「可重试:不可」。文案本来就写着
  // 「请更新到最新版本或联系支持」,今天给的却是一颗重试 —— 按钮和句子对不上。
  it('运行时定义非法落第 4 档,不再给一颗白点的重试', () => {
    const ui = resolveRunFailureUi('AGENT_RUNTIME_DEF_INVALID', null, 'claude');
    expect(ui.primaryAction).toBe('contact-support');
    expect(ui.secondaryRetry).toBe(false);
  });
});

describe('S19 进程崩了 / 异常退出(每月 20,868 次、占失败 16.3%、P0 第二大类)', () => {
  // 稿子 `error-ux-design.md:212-217` 原文:
  //   显示:{智能体} 意外退出了 —— 它没说为什么。重试一般能恢复;反复出现的话,
  //         把日志发给我们。〔重试 | 导出日志〕
  // 「导出日志」是常驻次级(§6.Z),所以这里只钉主按钮 = 重试(档 2)。
  const S19_DETAILS = [
    'process_crashed',
    'signal_killed',
    'terminated_unknown',
    'exit_code',
    'exit_nonzero',
    'execution_failed',
  ] as const;

  it.each(S19_DETAILS)('%s 有专属文案,主按钮是重试', (detail) => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', detail, 'claude');
    expect(ui.titleKey).toBe('chat.runError.title.agentCrashed');
    expect(ui.messageKey).toBe('chat.runError.agentCrashedMessage');
    expect(ui.primaryAction).toBe('retry');
    // 这不是「本地走不通」,不该顺手劝人切 Cloud。
    expect(ui.showSwitchCard).toBe(false);
  });

  // S19 对每个 agent 都一样(AMR 也会崩)。今天 AMR 分支的 catch-all 会把它
  // 吃成「任务执行失败」+ 原始英文串。
  it('AMR 自己崩了也走 S19,不落 AMR 的 catch-all', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'process_crashed', 'amr');
    expect(ui.titleKey).toBe('chat.runError.title.agentCrashed');
    expect(ui.messageKey).toBe('chat.runError.agentCrashedMessage');
  });
});

describe('兜底不许把上游原文摊在卡面(E2)', () => {
  // 兜底文案是一条真实存在的 i18n 键,不是 `null`。ChatPane 拿它替掉
  // 「没命中映射表就直接渲染 rawError」那条路。
  it('导出了一条兜底文案键', () => {
    expect(RUN_FAILURE_FALLBACK_MESSAGE_KEY).toBe('chat.runError.fallbackMessage');
  });
});

describe('新文案进了 19 个语言包', () => {
  // 新键必须在全部 19 个 locale 里都有真值 —— 缺一个,那个语种的用户会在卡上
  // 看到一条裸键名。顺带:这条会把 19 个 locale 文件全 import 一遍,所以它同时
  // 是一次语法体检。
  const NEW_KEYS = [
    'chat.runError.title.agentCrashed',
    'chat.runError.agentCrashedMessage',
    'chat.runError.title.accountSuspended',
    'chat.runError.accountSuspendedMessage',
    'chat.runError.fallbackMessage',
  ] as const;

  // 显式给宽超时:这一条要现场 transform 19 个 locale 文件,机器忙的时候
  // 会逼近 vitest 默认的 5s —— 那种红是环境噪音,不是回归。
  it('每个语种都有这五条,且都不是空串', { timeout: 30_000 }, async () => {
    const paths = localeModulePaths();
    expect(paths).toHaveLength(19);
    for (const path of paths) {
      const dict = await loadLocaleDict(path);
      for (const key of NEW_KEYS) {
        expect(typeof dict[key], `${path} → ${key}`).toBe('string');
        expect(dict[key]!.trim().length, `${path} → ${key}`).toBeGreaterThan(0);
      }
    }
  });

  // 稿子里 S19 那句是「{智能体} 意外退出了」—— 插值位不能在翻译里掉。
  it('S19 文案每个语种都保留了 {agent} 插值位', { timeout: 30_000 }, async () => {
    for (const path of localeModulePaths()) {
      const dict = await loadLocaleDict(path);
      expect(dict['chat.runError.agentCrashedMessage'], path).toContain('{agent}');
    }
  });
});

describe('R9 断线不许和重连行抢同一件事', () => {
  // 交付稿第 84 格已经在流水最后一行画了「连接失败 +〔重新连接〕」(S29,
  // 已接线:`runtime/chat/reconnect-state.ts` + `ChatPane` 流水尾部)。
  // 而 `DAEMON_STREAM_DISCONNECTED` 今天落 `resolveRunFailureUi` 的兜底分支,
  // 于是同一件事出两块 UI、两种说法 —— 设计稿 4058 明说要避免的。
  it('断线码有专属分流,不落兜底', () => {
    const ui = resolveRunFailureUi(RECONNECT_OWNED_FAILURE_CODE, null, 'claude');
    expect(ui.suppressCard).toBe(true);
    // 兜底那条的标志是「任务执行失败」+ 没有专属文案。命中了就说明还在兜底里。
    expect(ui.titleKey).not.toBe('chat.runError.title.generic');
  });

  it('结构化 code 和历史行的原文两条线索都认', () => {
    expect(isReconnectOwnedFailure(RECONNECT_OWNED_FAILURE_CODE, null)).toBe(true);
    // 这条码引入之前落库的行只有 detail 没有 code(ProjectView 的
    // `hasGenericDisconnectFailureEvent` 也是按同一对线索认的)。
    expect(isReconnectOwnedFailure(null, GENERIC_DAEMON_DISCONNECT_MESSAGE)).toBe(true);
  });

  // 两个常量必须跟传输层逐字一致。amr-guidance 不能 import providers/daemon
  // (那边已经 import 了这边的 setRuntimeAmrConsoleOrigin,会成环),所以字面量
  // 是抄的 —— 抄的东西要有人钉住,否则改了一边就静默失配。
  it('常量跟 providers/daemon 的原件逐字一致', () => {
    expect(RECONNECT_OWNED_FAILURE_CODE).toBe(GENERIC_DAEMON_DISCONNECT_CODE);
  });

  // 反向:模型服务那条连接断了(S11)是**另一件事** —— 重连行管的是浏览器到
  // daemon 的 SSE,管不到上游模型。那张卡要留着,连同它的重试。
  it('不误伤 S11:上游连接中断照旧出卡', () => {
    const ui = resolveRunFailureUi('AGENT_CONNECTION_DROPPED', null, 'claude');
    expect(ui.suppressCard).toBeUndefined();
    expect(ui.primaryAction).toBe('retry');
    expect(ui.messageKey).toBe('chat.connectionDropped');
  });
});
