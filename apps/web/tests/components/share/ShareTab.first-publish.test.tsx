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


const uploadPath = 'M12 15V4m-4 4 4-4 4 4M5 20h14';
const firstProps = (overrides: Partial<Props> = {}) => props({ filePublished: false, ...overrides });

describe('S1 first-publish visual seam', () => {
  it.each(['artifact-card', 'toolbar'] as const)('%s uses the S2 uploading label for both visible and accessible progress', menuOrigin => {
    render(<ShareTab {...firstProps({ menuOrigin, t: key => zhCN[key], publishingPublicFile: true, publishProgress: 0.45 })} />);
    expect(screen.getByRole('menuitem', { name: '上传中 45%' })).toBeDisabled();
    expect(screen.getByRole('progressbar', { name: '上传中' })).toHaveAttribute('value', '0.45');
  });
  it.each(['artifact-card', 'toolbar'] as const)('%s explains closing only while publishing, not while stopping', (menuOrigin) => {
    const input = firstProps({ menuOrigin, t: key => zhCN[key] });
    const hint = '关闭面板不会中断上传。';
    const { rerender } = render(<ShareTab {...input} />);
    expect(screen.queryByText(hint)).toBeNull();
    rerender(<ShareTab {...input} publishingPublicFile publishProgress={0.45} />);
    expect(screen.getByText(hint).className).toContain('publishHint');
    rerender(<ShareTab {...input} filePublished publishingPublicFile />);
    expect(screen.queryByText(hint)).toBeNull();
    rerender(<ShareTab {...input} publishFailureKey="fileViewer.publishFileFailed" />);
    expect(screen.queryByText(hint)).toBeNull();
  });

  it('uses the S2 help typography without borrowing the failure or copy hint', () => {
    const css = parse(readFileSync(resolve(__dirname, '../../../src/components/share/ShareTab.module.css'), 'utf8'));
    const values: Record<string, string> = {};
    css.walkRules('p.publishHint', rule => { rule.walkDecls(decl => { values[decl.prop] = decl.value; }); });
    expect(values).toMatchObject({ margin: '0', color: '#999999', 'font-size': '10.5px', 'line-height': '17px' });
  });
  it.each([0, 0.45, 0.9])('integrates progress %s into the busy control without changing its value', (publishProgress) => {
    const input = firstProps({ publishingPublicFile: true, publishProgress });
    render(<ShareTab {...input} />);
    const button = screen.getByRole('menuitem');
    const progress = screen.getByRole('progressbar');
    expect(button).toHaveTextContent(`fileViewer.uploadingFile ${Math.round(publishProgress * 100)}%`);
    expect(button).toBeDisabled();
    expect(progress).toHaveAttribute('value', String(publishProgress));
    expect(progress.parentElement).toBe(button.parentElement);
    expect(progress.className).toContain('publishProgress');
    expect(button.className).toContain('publishingButton');
    fireEvent.click(button);
    expect(input.publishCurrentFilePublic).not.toHaveBeenCalled();
  });
  it('scopes the 360px canvas shell to the mounted share panel, not Export', () => {
    const css = parse(readFileSync(resolve(__dirname, '../../../src/components/share/ShareTab.module.css'), 'utf8'));
    const values: Record<string, string> = {};
    css.walkRules(':global(.chrome-share-menu--unified .chrome-unified-popover):has(.panel)', rule => {
      rule.walkDecls(decl => { values[decl.prop] = decl.value; });
    });
    expect(values).toMatchObject({
      width: '360px', 'max-width': 'calc(100vw - 32px)', padding: '16px 20px', gap: '12px', 'font-weight': '400',
      border: '1px solid #00000008', 'border-radius': '12px', background: '#FFFFFF',
      'box-shadow': '0 8px 28px #00000010, 0 2px 6px #00000006',
    });
    const { container } = render(<ShareTab {...firstProps()} />);
    expect(container.firstElementChild?.className).toContain('panel');
  });
  it('binds the canvas button style, Chinese label and 13px upload icon', () => {
    render(<ShareTab {...firstProps({ t: (key) => zhCN[key] })} />);
    const button = screen.getByRole('menuitem', { name: '生成并复制链接' });
    expect(button.className).toContain('copyButton');
    expect(button.className).not.toContain('share-menu-item');
    const icon = button.querySelector('svg')!;
    for (const [name, value] of Object.entries({ width: '13', height: '13', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) {
      expect(icon).toHaveAttribute(name, value);
    }
    expect(icon.querySelector('path')).toHaveAttribute('d', uploadPath);
  });

  it('uses only the existing publish callback and leaves deployment outside the seam', () => {
    const input = firstProps({ menuOrigin: 'toolbar' });
    render(<ShareTab {...input} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'fileViewer.generateAndCopyLink' }));
    expect(input.publishCurrentFilePublic).toHaveBeenCalledTimes(1);
    expect(input.copyPublishedFileLink).not.toHaveBeenCalled();
    expect(input.unpublishCurrentFilePublic).not.toHaveBeenCalled();
    expect(screen.queryByRole('menuitem', { name: 'Deploy' })).toBeNull();
  });

  it.each(['streaming', 'viewerOnly', 'publishingPublicFile'] as const)('preserves %s disablement and feedback', (restriction) => {
    const input = firstProps({ [restriction]: true, publishProgress: restriction === 'publishingPublicFile' ? 0.45 : null });
    render(<ShareTab {...input} />);
    const button = screen.getByRole('menuitem');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', String(restriction === 'publishingPublicFile'));
    fireEvent.click(button);
    expect(input.publishCurrentFilePublic).not.toHaveBeenCalled();
    if (restriction === 'publishingPublicFile') {
      expect(button).toHaveTextContent('fileViewer.uploadingFile');
      const spinner = button.querySelector('.icon-spin');
      expect(spinner).not.toBeNull();
      for (const [name, value] of Object.entries({ width: '13', height: '13', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'aria-hidden': 'true', focusable: 'false' })) {
        expect(spinner).toHaveAttribute(name, value);
      }
      expect(spinner?.querySelector('path')).toHaveAttribute('d', 'M12 3a9 9 0 1 0 9 9');
      expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0.45');
    } else {
      expect(button).toHaveAttribute('title', restriction === 'viewerOnly' ? 'read only' : 'fileViewer.shareAfterGenerationComplete');
    }
  });

  it.each(['fileViewer.publishFileFailed', 'fileViewer.publishFileTooLarge'] as const)('keeps %s and retry callback', (publishFailureKey) => {
    const input = firstProps({ publishFailureKey });
    render(<ShareTab {...input} />);
    expect(screen.getByRole('status')).toHaveTextContent(publishFailureKey);
    const retry = screen.getByRole('menuitem', { name: 'preview.retry' });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(input.publishCurrentFilePublic).toHaveBeenCalledTimes(1);
  });

  it('keeps the public-publish gate', () => {
    render(<ShareTab {...firstProps({ canPublishPublic: false })} />);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('declares canvas geometry through the existing local seam, not shared Button defaults', () => {
    const css = parse(readFileSync(resolve(__dirname, '../../../src/components/share/ShareTab.module.css'), 'utf8'));
    const values: Record<string, string> = {};
    css.walkRules('button.copyButton', rule => { rule.walkDecls(decl => { values[decl.prop] = decl.value; }); });
    expect(values).toMatchObject({ height: '32px', 'border-radius': '6px', padding: '0 8px', gap: '5px', background: '#29292B', color: '#FFFFFF', 'font-size': '12px', 'font-weight': '500', 'line-height': '18px', border: '0' });
  });
});
