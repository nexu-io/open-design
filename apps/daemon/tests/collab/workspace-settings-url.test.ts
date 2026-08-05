import { describe, expect, it } from 'vitest';
import {
  parseWorkspaceCollabContext,
  resolveWorkspaceSettingsUrl,
} from '../../src/collab/workspace-context.js';

// B's web console takes ?workspaceId deep links (target page opens directly
// when it matches the account's Active Workspace; otherwise the web asks the
// user to confirm the switch). Console links must pin the id — a bare
// /settings link depends on whatever workspace another device left active.
describe('resolveWorkspaceSettingsUrl', () => {
  it('builds the settings deep link with the workspace id pinned', () => {
    expect(
      resolveWorkspaceSettingsUrl('ws-1', undefined, {
        OD_VELA_WEB_URL: 'https://web.example',
      } as NodeJS.ProcessEnv),
    ).toBe('https://web.example/settings?workspaceId=ws-1&source=open_design');
  });

  it('appends the id to an explicit URL that lacks it and preserves one that has it', () => {
    expect(resolveWorkspaceSettingsUrl('ws-1', 'https://web.example/settings')).toBe(
      'https://web.example/settings?workspaceId=ws-1&source=open_design',
    );
    expect(
      resolveWorkspaceSettingsUrl('ws-1', 'https://web.example/settings?workspaceId=ws-other'),
    ).toBe('https://web.example/settings?workspaceId=ws-other&source=open_design');
    expect(
      resolveWorkspaceSettingsUrl(
        'ws-1',
        'https://web.example/settings?source=vela',
      ),
    ).toBe('https://web.example/settings?source=vela&workspaceId=ws-1');
  });

  it('returns undefined without a base and leaves unparseable explicit values alone', () => {
    expect(
      resolveWorkspaceSettingsUrl('ws-1', undefined, {} as NodeJS.ProcessEnv),
    ).toBeUndefined();
    expect(resolveWorkspaceSettingsUrl('ws-1', 'not-a-url')).toBe('not-a-url');
  });
});

describe('parseWorkspaceCollabContext', () => {
  it('preserves the Personal workspace console link used by team actions', () => {
    const context = parseWorkspaceCollabContext({
      workspaceId: 'ws-personal',
      workspaceType: 'personal',
      workspaceMemberId: 'wm-owner',
      role: 'owner',
      memberStatus: 'active',
      lifecycleState: 'active',
      workspaceSettingsUrl: 'https://web.example/settings',
    });

    expect(context?.workspaceSettingsUrl).toBe(
      'https://web.example/settings?workspaceId=ws-personal&source=open_design',
    );
  });
});
