// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'postcss';
import { zhCN } from '../../../src/i18n/locales/zh-CN';
import { ShareTab } from '../../../src/components/share/ShareTab';

afterEach(cleanup);

type Props = ComponentProps<typeof ShareTab>;
function props(overrides: Partial<Props> = {}): Props {
  return {
    menuOrigin: 'artifact-card', workspaceContext: null, t: (key) => key,
    shareAccess: 'private', shareAccessMenuOpen: false, shareAccessBusy: false,
    viewerOnly: false, setShareAccessMenuOpen: vi.fn(), setWorkspaceShareAccess: vi.fn(),
    canPublishPublic: true, filePublished: true, publishedFileUrl: 'https://example.test/artifact/p/s',
    copyPublishedFileLink: vi.fn().mockResolvedValue(undefined), publishLinkFeedback: null,
    publishingPublicFile: false, publishProgress: null,
    unpublishCurrentFilePublic: vi.fn().mockResolvedValue(undefined), viewerOnlyDisabledTitle: 'read only',
    publishCurrentFilePublic: vi.fn().mockResolvedValue(undefined), publishFailureKey: null,
    streaming: false,
    sharePageUrl: '', canCopyShareLink: false, shareUnavailableHint: '',
    copyShareLink: vi.fn().mockResolvedValue(true), copyShareLinkLabel: '',
    canOpenSharePage: false, shareLinkStatusHint: '', ...overrides,
  };
}


describe('S7 publish failure visual seam', () => {
  it.each(['artifact-card', 'toolbar'] as const)('offers valid recovery from %s without adding deployment controls', (menuOrigin) => {
    const input = props({ menuOrigin, filePublished: false, publishFailureKey: 'fileViewer.publishFileFailed', t: (key) => zhCN[key] });
    const { rerender } = render(<ShareTab {...input} />);
    expect(screen.getByRole('status')).toHaveTextContent('生成分享链接失败，请稍后重试。');
    fireEvent.click(screen.getByRole('menuitem', { name: zhCN['preview.retry'] }));
    expect(input.publishCurrentFilePublic).toHaveBeenCalledTimes(1);
    rerender(<ShareTab {...input} publishingPublicFile publishFailureKey={null} publishProgress={0.4} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('progressbar')).toBeVisible();
    rerender(<ShareTab {...input} filePublished publishFailureKey={null} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: zhCN['preview.retry'] })).toBeNull();
    expect(screen.getByRole('button', { name: zhCN['fileViewer.copyShareLink'] })).toBeEnabled();
  });
  it.each(['fileViewer.publishFileFailed', 'fileViewer.publishFileTooLarge'] as const)('renders the canvas warning icon without changing %s copy or retry', (publishFailureKey) => {
    const input = props({ filePublished: false, publishFailureKey, t: (key) => zhCN[key] });
    render(<ShareTab {...input} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe(zhCN[publishFailureKey]);
    expect(status.className).toContain('publishError');
    expect(status.className).not.toContain('chrome-publish-error');
    const icon = status.querySelector('svg')!;
    expect(icon).not.toBeNull();
    for (const [name, value] of Object.entries({ width: '14', height: '14', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'aria-hidden': 'true', focusable: 'false' })) {
      expect(icon).toHaveAttribute(name, value);
    }
    expect(icon.querySelector('circle')).toHaveAttribute('cx', '8');
    expect(icon.querySelector('circle')).toHaveAttribute('cy', '8');
    expect(icon.querySelector('circle')).toHaveAttribute('r', '6.2');
    expect(icon.querySelector('path')).toHaveAttribute('d', 'M8 4.8v3.6M8 11h.01');
    const retry = screen.getByRole('menuitem', { name: zhCN['preview.retry'] });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(input.publishCurrentFilePublic).toHaveBeenCalledTimes(1);
    expect(input.copyPublishedFileLink).not.toHaveBeenCalled();
  });

  it('keeps generic and size messages distinct, without attributing unknown failures to the network', () => {
    expect(zhCN['fileViewer.publishFileFailed']).toBe('生成分享链接失败，请稍后重试。');
    expect(zhCN['fileViewer.publishFileTooLarge']).toBe('项目超过 20 MiB 分享上限。请减小 HTML 和引用资源的总大小后重试。');
  });

  it.each([{ publishFailureKey: null }, { canPublishPublic: false }])('omits the error when absent or gated: %j', (overrides) => {
    render(<ShareTab {...props({ publishFailureKey: 'fileViewer.publishFileFailed', ...overrides })} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each(['streaming', 'viewerOnly', 'publishingPublicFile'] as const)('retains %s disablement during a failure', (restriction) => {
    const input = props({ filePublished: false, publishFailureKey: 'fileViewer.publishFileFailed', [restriction]: true });
    render(<ShareTab {...input} />);
    const button = screen.getByRole('menuitem');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(input.publishCurrentFilePublic).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('fileViewer.publishFileFailed');
  });

  it('declares local canvas error geometry independent of legacy global error rules', () => {
    const css = parse(readFileSync(resolve(__dirname, '../../../src/components/share/ShareTab.module.css'), 'utf8'));
    const declarations = (selector: string) => {
      const values: Record<string, string> = {};
      css.walkRules(selector, rule => { rule.walkDecls(decl => { values[decl.prop] = decl.value; }); });
      return values;
    };
    expect(declarations('p.publishError')).toMatchObject({ margin: '0', padding: '0', display: 'flex', 'align-items': 'flex-start', gap: '6px', color: '#C94E4E', 'font-size': '12px', 'line-height': '18px' });
    expect(declarations('.publishError > svg')).toMatchObject({ flex: 'none', 'margin-top': '2px' });
  });
});
