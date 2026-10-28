/**
 * OPEND-2849 第四轮 · 词典层判据。
 *
 * zh-CN 逐字等于产品《报错文案｜精简版》对应格的「润色标题 / 润色正文」(标点照抄)。
 * 19 个语言:每个键都在、非英文语言不是英文原文、不再带旧措辞的变量(例如 {balance})。
 * 被拆成标题 + 正文的旧键不得残留。
 */
import { describe, expect, it } from 'vitest';

import { LOCALES, type Dict, type Locale } from '../../src/i18n/types';

async function loadDict(locale: Locale): Promise<Dict> {
  const module = await import(`../../src/i18n/locales/${locale}.ts`);
  const dict = Object.values(module).find((value): value is Dict => Boolean(value) && typeof value === 'object');
  if (!dict) throw new Error(`No dictionary export found for locale ${locale}`);
  return dict;
}

function lookup(dict: Dict, key: string): string | undefined {
  return (dict as unknown as Record<string, string | undefined>)[key];
}

const PRODUCT_ZH: Record<string, string> = {
  // S04 发送前·Open Design 智能体没登录
  'chat.amrBalanceGate.signedOutTitle': 'Open Design 尚未登录',
  'chat.amrBalanceGate.signedOutMessage': '请先登录，以便查看项目和继续对话。',
  // S06 发送前·额度不足
  'chat.amrBalanceGate.title': '可用额度不足',
  'chat.amrBalanceGate.message': '当前额度不足，请充值或升级套餐后再试。',
  'chat.amrBalanceOwner.title': '团队额度不足',
  'chat.amrBalanceOwner.message': '当前团队额度不足，请联系团队管理员充值或升级订阅。',
  'chat.amrBalanceOwner.messageNoOwnerName': '当前团队额度不足，请联系团队管理员充值或升级订阅。',
  // S15 运行中·额度不足
  'chat.upgrade.pausedTitle': '额度不足，任务已暂停',
  'chat.upgrade.pausedMessage': '当前额度不足，请充值或升级套餐后再试。',
  'chat.upgrade.pausedTeamTitle': '团队额度不足，任务已暂停',
  'chat.upgrade.pausedTeamMessage': '当前团队额度不足，请联系团队管理员充值或升级订阅。',
  // S24a / S24c
  'assistant.unfinishedLabel': '任务尚未完成',
  'assistant.unfinishedDetail': '本次任务仍有 {n} 项内容未完成。',
  'assistant.canceledLabel': '任务已停止',
  'assistant.canceledDetail': '本次运行已按你的操作停止。',
  // S03(首页建项目被拒:未登录)· S28a 本地服务断开 —— 首页错误块是一个文本块,标题\n正文
  'entry.authExpiredBody': 'Open Design 尚未登录\n请先登录，以便查看项目和继续对话。',
  'home.daemonRecovering': '本地连接已断开\n暂时无法连接这台电脑上的 Open Design 服务，请重启客户端。',
  // S31c 下载更新失败
  'updater.dialogDownloadFailed': '更新下载未完成\n请确认网络连接正常后再试。',
  'updater.downloadFailedTitle': '更新下载未完成',
  // S32a 浏览器没打开
  'settings.amrActivationBrowserFailedTitle': '无法打开登录页面',
  'settings.amrActivationBrowserFailedDescription': '浏览器未能自动打开，请重新尝试登录。',
  // S09a 限流·自动重试
  'chat.edge.retryingRateLimitedTitle': '模型服务请求繁忙',
  'chat.edge.retryingRateLimitedDescription':
    '当前使用该模型服务的请求较多，已达到供应商的请求频率上限，请稍后再试，或者切换其他模型。',
};

const REMOVED_KEYS = ['settings.amrActivationBrowserFailed'];

describe('OPEND-2849 第四轮 zh-CN 逐字', () => {
  it.each(Object.entries(PRODUCT_ZH))('%s', async (key, expected) => {
    const zh = await loadDict('zh-CN');
    expect(lookup(zh, key)).toBe(expected);
  });
});

describe.each(LOCALES)('OPEND-2849 第四轮 locale %s', (locale) => {
  it('每个键都在、非英文不是英文原文、旧变量与旧键不残留', async () => {
    const dict = await loadDict(locale);
    const en = await loadDict('en');
    for (const key of Object.keys(PRODUCT_ZH)) {
      const value = lookup(dict, key);
      expect(value?.trim(), `${locale} ${key}`).toBeTruthy();
      if (locale !== 'en') expect(value, `${locale} ${key}`).not.toBe(lookup(en, key));
    }
    expect(lookup(dict, 'chat.amrBalanceGate.message')).not.toContain('{balance}');
    expect(lookup(dict, 'assistant.unfinishedDetail')).toContain('{n}');
    for (const key of ['entry.authExpiredBody', 'home.daemonRecovering', 'updater.dialogDownloadFailed']) {
      expect(lookup(dict, key)?.split('\n'), `${locale} ${key}`).toHaveLength(2);
    }
    for (const key of REMOVED_KEYS) expect(lookup(dict, key)).toBeUndefined();
  });
});
