// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { Project } from '../../src/types';
import { prepareProjectHomeEntry } from '../../src/state/project-home-entry';
import { applyPlugin, listConversations, patchConversation, patchProject } from '../../src/state/projects';

vi.mock('../../src/state/projects', () => ({
  applyPlugin: vi.fn(), listConversations: vi.fn(),
  patchConversation: vi.fn(), patchProject: vi.fn(),
}));

const project = {
  id: 'named-project', name: 'My project', skillId: null, designSystemId: null,
  createdAt: 1, updatedAt: 1, metadata: { kind: 'other', nameSource: 'user' },
} satisfies Project;
const brief = {
  name: 'Generated name', skillId: null, designSystemId: null,
  pendingPrompt: 'Create a deck', pluginId: 'deck', pluginInputs: { slides: 10 },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(patchProject).mockResolvedValue(project);
});

it('binds the selected plugin to the named project before saving the brief', async () => {
  vi.mocked(applyPlugin).mockResolvedValue({ appliedPlugin: { snapshotId: 'snapshot' } } as never);
  await prepareProjectHomeEntry(project, brief, null);
  expect(applyPlugin).toHaveBeenCalledWith('deck', expect.objectContaining({
    projectId: 'named-project', inputs: { slides: 10 }, workspaceContext: null,
  }));
  expect(patchProject).toHaveBeenCalledWith('named-project', expect.objectContaining({
    name: 'My project', pendingPrompt: 'Create a deck',
  }), null);
});

it('keeps the brief retryable if applying its type fails', async () => {
  vi.mocked(applyPlugin).mockResolvedValue(null);
  await expect(prepareProjectHomeEntry(project, brief, null)).rejects.toThrow('creation type');
  expect(patchProject).not.toHaveBeenCalled();
});

it('keeps the selected chat mode on the existing initial conversation', async () => {
  vi.mocked(listConversations).mockResolvedValue([{ id: 'initial', sessionMode: 'design' }] as never);
  vi.mocked(patchConversation).mockResolvedValue({ id: 'initial', sessionMode: 'chat' } as never);
  await prepareProjectHomeEntry(project, { ...brief, pluginId: undefined, conversationMode: 'chat' }, null);
  expect(patchConversation).toHaveBeenCalledWith('named-project', 'initial', { sessionMode: 'chat' }, null);
});
