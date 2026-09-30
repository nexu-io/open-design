// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { zhCN } from '../../../src/i18n/locales/zh-CN';
import { ShareTab } from '../../../src/components/share/ShareTab';

afterEach(cleanup);

type Props = ComponentProps<typeof ShareTab>;
const team = { workspaceId: 'w', teamId: 'w', workspaceMemberId: 'm', workspaceType: 'team' } as WorkspaceCollabContext;
const personal = { workspaceId: 'w', workspaceMemberId: 'm', workspaceType: 'personal' } as WorkspaceCollabContext;
function props(overrides: Partial<Props> = {}): Props {
  return {
    menuOrigin: 'artifact-card', workspaceContext: team, t: key => zhCN[key],
    shareAccess: 'private', shareAccessMenuOpen: false, shareAccessBusy: false,
    viewerOnly: false, setShareAccessMenuOpen: vi.fn(), setWorkspaceShareAccess: vi.fn(),
    canPublishPublic: true, filePublished: false, publishedFileUrl: '',
    copyPublishedFileLink: vi.fn().mockResolvedValue(undefined), publishLinkFeedback: null,
    publishingPublicFile: false, publishProgress: null,
    unpublishCurrentFilePublic: vi.fn().mockResolvedValue(undefined), viewerOnlyDisabledTitle: 'read only',
    publishCurrentFilePublic: vi.fn().mockResolvedValue(undefined), publishFailureKey: null,
    streaming: false, sharePageUrl: '', canCopyShareLink: false, shareUnavailableHint: '',
    copyShareLink: vi.fn().mockResolvedValue(true), copyShareLinkLabel: '',
    canOpenSharePage: false, shareLinkStatusHint: '', ...overrides,
  };
}

const notice = '发布后团队成员可见。';

describe('decision 67 #11: publishing a private team-workspace project makes it team-visible', () => {
  it('tells the owner before the first publish', () => {
    render(<ShareTab {...props()} />);
    expect(screen.getByRole('note')).toHaveTextContent(notice);
    expect(screen.getByRole('menuitem', { name: '生成并复制链接' })).toBeEnabled();
  });

  it.each([
    ['a personal workspace', { workspaceContext: personal }],
    ['a project already visible to the team', { shareAccess: 'workspace' as const }],
    ['a published file', { filePublished: true, publishedFileUrl: 'https://viewer.example.test/s' }],
    ['a publish in progress', { publishingPublicFile: true, publishProgress: 0.3 }],
    ['a view-only member', { viewerOnly: true }],
  ])('stays quiet for %s', (_label, overrides) => {
    render(<ShareTab {...props(overrides)} />);
    expect(screen.queryByText(notice)).toBeNull();
  });
});
