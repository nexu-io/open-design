import { describe, expect, it } from 'vitest';
import { de } from '../../src/i18n/locales/de';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import { zhTW } from '../../src/i18n/locales/zh-TW';

it('uses German labels for both workspace visibility options', () => {
  expect(de['fileViewer.workspaceAccessPrivate']).toBe('Nur ich');
  expect(de['fileViewer.workspaceAccessMembers']).toBe('Teammitglieder');
});

describe('Chinese workspace scope member labels', () => {
  it.each([
    { locale: 'zh-CN', dict: zhCN, label: '团队成员', privateDescription: '只有你可以在工作区内访问此项目。' },
    { locale: 'zh-TW', dict: zhTW, label: '團隊成員', privateDescription: '只有你可以在工作區內存取此專案。' },
  ])('$locale matches the canvas and its private-state instruction', ({ dict, label, privateDescription }) => {
    expect(dict['fileViewer.workspaceAccessMembers']).toBe(label);
    expect(dict['fileViewer.workspaceSharePrivateDescription']).toBe(privateDescription);
  });
});
