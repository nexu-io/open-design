// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { Conversation, ProjectFile, ProjectMetadata } from '../../src/types';

const composerMocks = vi.hoisted(() => ({
  focus: vi.fn(),
  restoreDraft: vi.fn(),
  setDraft: vi.fn(),
}));

const translate = (key: string, vars?: Record<string, string | number>) => {
  if (key === 'chat.designArtifactsShowMore') {
    return `Show ${vars?.count ?? ''} more design files`;
  }
  return key;
};

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, ref) => {
    useImperativeHandle(ref, () => ({
      focus: composerMocks.focus,
      restoreDraft: composerMocks.restoreDraft,
      setDraft: composerMocks.setDraft,
    }));
    return <output data-testid="composer" />;
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const conversations: Conversation[] = [
  { id: 'conv-1', projectId: 'project-1', title: 'Conversation 1', createdAt: 1, updatedAt: 1 },
];

function renderPane(extra: Partial<React.ComponentProps<typeof ChatPane>>) {
  return render(
    <ChatPane
      projectKindForTracking="prototype"
      messages={[]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      conversations={conversations}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      projectMetadata={{ kind: 'prototype' }}
      {...extra}
    />,
  );
}

function file(name: string, kind: ProjectFile['kind'], mtime: number): ProjectFile {
  return {
    name,
    size: 128,
    mtime,
    kind,
    mime: kind === 'html' ? 'text/html' : kind === 'image' ? 'image/jpeg' : 'text/plain',
  };
}

describe('ChatPane starter prompts', () => {
  it('shows four default starter prompts and fills the composer from a card', () => {
    renderPane({});

    const starterCards = screen.getAllByRole('listitem');
    expect(starterCards).toHaveLength(4);
    expect(screen.getByText('chat.example1Title')).toBeTruthy();
    expect(screen.getByText('chat.example2Title')).toBeTruthy();
    expect(screen.getByText('chat.example3Title')).toBeTruthy();
    expect(screen.getByText('chat.example4Title')).toBeTruthy();

    fireEvent.click(screen.getByText('chat.example4Title').closest('button')!);
    expect(composerMocks.setDraft).toHaveBeenCalledWith('chat.example4Prompt');
  });
});

describe('ChatPane imported folder artifacts', () => {
  it('replaces empty starter prompts with design artifact previews', () => {
    const onRequestOpenFile = vi.fn();
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'site/index.html',
    };

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('README.md', 'text', 30),
        file('site/index.html', 'html', 20),
        file('assets/hero-mockup.jpg', 'image', 10),
        file('bundle.js.map', 'code', 40),
      ],
      onRequestOpenFile,
    });

    expect(screen.queryByText('chat.startTitle')).toBeNull();
    expect(screen.queryByText('chat.example1Title')).toBeNull();

    const artifactGrid = screen.getByTestId('chat-design-artifacts');
    expect(within(artifactGrid).getByText('site/index.html')).toBeTruthy();
    expect(within(artifactGrid).getByText('assets/hero-mockup.jpg')).toBeTruthy();
    expect(within(artifactGrid).queryByText('README.md')).toBeNull();
    expect(within(artifactGrid).queryByText('bundle.js.map')).toBeNull();

    const firstCard = screen.getByTestId('chat-design-artifact-0');
    expect(firstCard.querySelector('iframe')?.getAttribute('src')).toBe(
      '/api/projects/project-1/raw/site/index.html?v=20',
    );

    fireEvent.doubleClick(firstCard);
    expect(onRequestOpenFile).toHaveBeenCalledTimes(1);
    expect(onRequestOpenFile).toHaveBeenCalledWith('site/index.html');
  });

  it('shows the five most recently modified artifacts before revealing more', () => {
    const metadata: ProjectMetadata = {
      kind: 'prototype',
      importedFrom: 'folder',
      entryFile: 'site/index.html',
    };

    renderPane({
      projectMetadata: metadata,
      projectFiles: [
        file('site/index.html', 'html', 10),
        file('site/about.html', 'html', 80),
        file('assets/latest-screenshot.jpg', 'image', 70),
        file('site/styleguide.html', 'html', 60),
        file('assets/hero-mockup.jpg', 'image', 50),
        file('docs/pitch.pdf', 'pdf', 40),
        file('docs/report.docx', 'document', 30),
        file('README.md', 'text', 90),
        file('bundle.js.map', 'code', 100),
      ],
      onRequestOpenFile: vi.fn(),
    });

    const artifactGrid = screen.getByTestId('chat-design-artifacts');
    expect(screen.getAllByTestId(/chat-design-artifact-\d+/)).toHaveLength(5);
    expect(within(artifactGrid).getByText('site/about.html')).toBeTruthy();
    expect(within(artifactGrid).getByText('assets/latest-screenshot.jpg')).toBeTruthy();
    expect(within(artifactGrid).getByText('site/styleguide.html')).toBeTruthy();
    expect(within(artifactGrid).getByText('assets/hero-mockup.jpg')).toBeTruthy();
    expect(within(artifactGrid).getByText('docs/pitch.pdf')).toBeTruthy();
    expect(within(artifactGrid).queryByText('docs/report.docx')).toBeNull();
    expect(within(artifactGrid).queryByText('site/index.html')).toBeNull();
    expect(within(artifactGrid).queryByText('README.md')).toBeNull();

    const moreButton = screen.getByTestId('chat-design-artifacts-more');
    expect(moreButton.textContent).toContain('Show 2 more design files');
    fireEvent.click(moreButton);

    expect(screen.getAllByTestId(/chat-design-artifact-\d+/)).toHaveLength(7);
    expect(within(artifactGrid).getByText('docs/report.docx')).toBeTruthy();
    expect(within(artifactGrid).getByText('site/index.html')).toBeTruthy();
    expect(screen.queryByTestId('chat-design-artifacts-more')).toBeNull();
  });
});
