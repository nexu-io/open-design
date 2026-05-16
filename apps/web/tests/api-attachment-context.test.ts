import { afterEach, describe, expect, it, vi } from 'vitest';

import { historyWithApiAttachmentContext } from '../src/api-attachment-context';
import {
  fetchProjectFilePreview,
  fetchProjectFileText,
} from '../src/providers/registry';
import type { ChatMessage, ProjectFile } from '../src/types';

vi.mock('../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../src/providers/registry')>(
    '../src/providers/registry',
  );
  return {
    ...actual,
    fetchProjectFilePreview: vi.fn().mockResolvedValue(null),
    fetchProjectFileText: vi.fn().mockResolvedValue(null),
  };
});

const mockedFetchProjectFilePreview = vi.mocked(fetchProjectFilePreview);
const mockedFetchProjectFileText = vi.mocked(fetchProjectFileText);

describe('historyWithApiAttachmentContext', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('adds extracted document previews to the target user message', async () => {
    mockedFetchProjectFilePreview.mockResolvedValue({
      kind: 'document',
      title: 'brief.docx',
      sections: [{ title: 'Document', lines: ['Hello world', 'Second line'] }],
    });

    const history = await historyWithApiAttachmentContext(
      [userMessage('msg-1', 'Summarize this', [{ path: 'brief.docx', name: 'brief.docx', kind: 'file' }])],
      'msg-1',
      'project-1',
      [projectFile('brief.docx', 'document')],
    );

    expect(mockedFetchProjectFilePreview).toHaveBeenCalledWith('project-1', 'brief.docx');
    expect(history[0]?.content).toContain('<attached-project-files>');
    expect(history[0]?.content).toContain('Hello world');
    expect(history[0]?.content).toContain('Second line');
  });

  it('reads raw text attachments with a cache buster from file metadata', async () => {
    mockedFetchProjectFileText.mockResolvedValue('const answer = 42;');

    const history = await historyWithApiAttachmentContext(
      [userMessage('msg-1', 'Use this code', [{ path: 'src/demo.ts', name: 'demo.ts', kind: 'file' }])],
      'msg-1',
      'project-1',
      [projectFile('src/demo.ts', 'code')],
    );

    expect(mockedFetchProjectFileText).toHaveBeenCalledWith(
      'project-1',
      'src/demo.ts',
      { cache: 'no-store', cacheBustKey: 123 },
    );
    expect(history[0]?.content).toContain('```ts');
    expect(history[0]?.content).toContain('const answer = 42;');
  });

  it('does not fetch raw text for sketch image attachments', async () => {
    const history = await historyWithApiAttachmentContext(
      [userMessage('msg-1', 'Use this sketch', [{ path: 'sketch-board.png', name: 'sketch-board.png', kind: 'image' }])],
      'msg-1',
      'project-1',
      [projectFile('sketch-board.png', 'sketch')],
    );

    expect(mockedFetchProjectFileText).not.toHaveBeenCalled();
    expect(mockedFetchProjectFilePreview).not.toHaveBeenCalled();
    expect(history[0]?.content).toContain('kind: sketch');
    expect(history[0]?.content).toContain('Content preview unavailable');
  });

  it('uses filename inference when the project file list has not refreshed yet', async () => {
    mockedFetchProjectFilePreview.mockResolvedValue({
      kind: 'pdf',
      title: 'report.pdf',
      sections: [{ title: 'PDF', lines: ['Quarterly results'] }],
    });

    const history = await historyWithApiAttachmentContext(
      [userMessage('msg-1', 'Read this', [{ path: 'report.pdf', name: 'report.pdf', kind: 'file' }])],
      'msg-1',
      'project-1',
      [],
    );

    expect(mockedFetchProjectFilePreview).toHaveBeenCalledWith('project-1', 'report.pdf');
    expect(history[0]?.content).toContain('Quarterly results');
  });
});

function userMessage(
  id: string,
  content: string,
  attachments: NonNullable<ChatMessage['attachments']>,
): ChatMessage {
  return {
    id,
    role: 'user',
    content,
    createdAt: 1,
    attachments,
  };
}

function projectFile(path: string, kind: ProjectFile['kind']): ProjectFile {
  return {
    name: path.split('/').pop() ?? path,
    path,
    type: 'file',
    size: 100,
    mtime: 123,
    kind,
    mime: 'application/octet-stream',
  };
}
