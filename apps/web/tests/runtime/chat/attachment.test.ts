import { describe, expect, it } from 'vitest';
import {
  fileNameTail,
  formatAttachmentSize,
  formatMessageClock,
  middleTruncateFileName,
  splitFileName,
} from '../../../src/runtime/chat/attachment';

/** 等宽假尺子:中日韩算两格,其余算一格。够用来验「切在哪儿」这件事。 */
const ruler = (text: string): number => {
  let w = 0;
  for (const ch of text) w += /[　-鿿＀-￯]/.test(ch) ? 2 : 1;
  return w;
};

describe('formatAttachmentSize', () => {
  it('按稿子写成 12 KB / 4 KB', () => {
    expect(formatAttachmentSize(12 * 1024)).toBe('12 KB');
    expect(formatAttachmentSize(4 * 1024)).toBe('4 KB');
    expect(formatAttachmentSize(18 * 1024 + 300)).toBe('18 KB');
  });

  it('小于 1 KB 写字节;不足 1 KB 但非零不会写成 0 KB', () => {
    expect(formatAttachmentSize(0)).toBe('0 B');
    expect(formatAttachmentSize(700)).toBe('700 B');
    expect(formatAttachmentSize(1025)).toBe('1 KB');
  });

  it('拿不到就返回 null —— 不编数,那一行空着', () => {
    expect(formatAttachmentSize(undefined)).toBeNull();
    expect(formatAttachmentSize(null)).toBeNull();
    expect(formatAttachmentSize(Number.NaN)).toBeNull();
    expect(formatAttachmentSize(-1)).toBeNull();
  });
});

describe('splitFileName', () => {
  it('后缀单独拆出来,永不参与截断', () => {
    expect(splitFileName('商品卡组件规格说明终稿.md')).toEqual({
      base: '商品卡组件规格说明终稿',
      ext: '.md',
    });
    expect(splitFileName('埋点清单-v3.csv')).toEqual({ base: '埋点清单-v3', ext: '.csv' });
  });

  it('没有后缀 / 开头的点(隐藏文件)都整串当主名', () => {
    expect(splitFileName('README')).toEqual({ base: 'README', ext: '' });
    expect(splitFileName('.gitignore')).toEqual({ base: '.gitignore', ext: '' });
    expect(splitFileName('trailing.')).toEqual({ base: 'trailing.', ext: '' });
  });
});

describe('fileNameTail —— 末尾保留一个词', () => {
  it('版本尾巴算作一个词', () => {
    expect(fileNameTail('跨端适配检查清单-v3')).toBe('-v3');
    expect(fileNameTail('埋点清单-v3')).toBe('-v3');
    expect(fileNameTail('spec_2')).toBe('_2');
  });

  it('拉丁留最后一个单词', () => {
    expect(fileNameTail('Q3-marketing-plan-final')).toBe('final');
  });

  it('中文留最后 3 字', () => {
    expect(fileNameTail('商品卡组件规格说明终稿-第三轮评审后')).toBe('评审后');
    expect(fileNameTail('商品卡组件规格说明终稿')).toBe('明终稿');
  });

  it('尾巴不能吃掉半个名字 —— 截屏那种全是数字的名字要留住头段', () => {
    // 整条 `-2026-08-17-15.18.32` 都长得像版本号,留下来就没有头段了
    expect(fileNameTail('screenshot-2026-08-17-15.18.32')).toBe('32');
    const out = middleTruncateFileName('screenshot-2026-08-17-15.18.32', 24, ruler);
    expect(out.startsWith('screenshot')).toBe(true);
    expect(out).toContain('…');
  });
});

describe('middleTruncateFileName', () => {
  it('放得下就原样返回', () => {
    expect(middleTruncateFileName('埋点', 100, ruler)).toBe('埋点');
  });

  it('省略号切在中间,末尾那个词留住', () => {
    const out = middleTruncateFileName('商品卡组件规格说明终稿-第三轮评审后', 20, ruler);
    expect(out.startsWith('商品卡')).toBe(true);
    expect(out.endsWith('评审后')).toBe(true);
    expect(out).toContain('…');
    expect(ruler(out)).toBeLessThanOrEqual(20);
  });

  it('版本尾巴不会被吃掉 —— 「-v3」和「-v2」截完还分得清', () => {
    const v3 = middleTruncateFileName('跨端适配检查清单-v3', 18, ruler);
    const v2 = middleTruncateFileName('跨端适配检查清单-v2', 18, ruler);
    expect(v3).toContain('-v3');
    expect(v2).toContain('-v2');
    expect(v3).not.toBe(v2);
  });

  it('取的是「放得下的最长的那一版」—— 头段再多吃一个字就超', () => {
    const budget = 20;
    const name = '商品卡组件规格说明终稿-第三轮评审后';
    const out = middleTruncateFileName(name, budget, ruler);
    expect(ruler(out)).toBeLessThanOrEqual(budget);
    const head = out.slice(0, out.indexOf('…'));
    const oneMore = name.slice(0, head.length + 1);
    expect(ruler(`${oneMore}…评审后`)).toBeGreaterThan(budget);
  });

  it('量不到宽度就原样返回,交给 CSS overflow 兜底 —— 宁可不截,不要截错', () => {
    const long = '商品卡组件规格说明终稿-第三轮评审后';
    expect(middleTruncateFileName(long, 0, ruler)).toBe(long);
    expect(middleTruncateFileName(long, 20, null)).toBe(long);
  });

  it('连「…尾巴」都放不下时不会拼出比原名还长的东西', () => {
    const out = middleTruncateFileName('商品卡组件规格说明终稿', 2, ruler);
    expect(out).toBe('…明终稿');
  });
});

describe('formatMessageClock', () => {
  it('走 24 小时制,写成 14:31 这个形状', () => {
    const at = new Date(2026, 7, 20, 14, 31, 5).getTime();
    expect(formatMessageClock(at)).toBe('14:31');
    expect(formatMessageClock(new Date(2026, 7, 20, 9, 5).getTime())).toBe('09:05');
  });

  it('拿不到时间就不显示', () => {
    expect(formatMessageClock(undefined)).toBeNull();
    expect(formatMessageClock(null)).toBeNull();
    expect(formatMessageClock(Number.NaN)).toBeNull();
  });
});
