// Pure formatters for the project-view slice: agent prompt builders,
// chat-attachment shaping, and design-system summary/name builders. No doubles.
import { describe, expect, it } from 'vitest';
import {
  designSystemFeedbackAttachments,
  buildBrandAgentExtractionContinuationPrompt,
  designSystemNameForSourceProject,
  buildCreateDesignSystemFromProjectPrompt,
  chatAttachmentsFromPreviewCommentImages,
  mergeChatAttachments,
  historyWithWorkspaceContext,
  commentTaskQuery,
  commentTaskContextAttachment,
  designSystemNeedsWorkPrompt,
  fallbackDesignSystemSummaryForProject,
} from '../../../src/features/project-view/formatters';
import type {
  ChatAttachment,
  ChatCommentAttachment,
  ChatMessage,
  PreviewCommentAttachment,
  Project,
  ProjectFile,
} from '../../../src/types';
import type { RunContextSelection } from '@open-design/contracts';

function file(name: string, over: Partial<ProjectFile> = {}): ProjectFile {
  return { name, path: name, kind: 'file', type: 'file', size: 100, mime: 'text/plain', ...over } as ProjectFile;
}

function project(over: Partial<Project> = {}): Project {
  return { id: 'p1', name: 'Acme', ...over } as Project;
}

function message(id: string, over: Partial<ChatMessage> = {}): ChatMessage {
  return { id, role: 'user', content: 'hi', ...over } as ChatMessage;
}

describe('designSystemFeedbackAttachments', () => {
  it('maps section files to attachments, images stay images, capped at 8', () => {
    const files = [file('a.png', { kind: 'image' }), file('b.css'), file('missing-skip')];
    const out = designSystemFeedbackAttachments(files, ['a.png', 'b.css', 'not-a-file']);
    expect(out).toEqual([
      { path: 'a.png', name: 'a.png', kind: 'image', size: 100 },
      { path: 'b.css', name: 'b.css', kind: 'file', size: 100 },
    ]);
  });

  it('caps the attachment list at 8 entries', () => {
    const files = Array.from({ length: 12 }, (_, i) => file(`f${i}.css`));
    const out = designSystemFeedbackAttachments(files, files.map((f) => f.name));
    expect(out).toHaveLength(8);
  });
});

describe('buildBrandAgentExtractionContinuationPrompt', () => {
  it('builds a fresh prompt with brand id, source, and a visible-files section', () => {
    const prompt = buildBrandAgentExtractionContinuationPrompt({
      metadata: { kind: 'brand', brandId: 'acme', brandSourceUrl: 'https://acme.com' } as Project['metadata'],
      projectFiles: [file('brand.html', { size: 2048 }), file('empty.html', { size: 0 }), file('  ')],
    });
    expect(prompt).toContain('Continue the AI design-system extraction for https://acme.com.');
    expect(prompt).toContain('Brand id: acme');
    expect(prompt).toContain('Current brand extraction continuation context:');
    expect(prompt).toContain('- brand.html (2KB)');
    // size 0 → no KB suffix
    expect(prompt).toContain('- empty.html');
    expect(prompt).not.toContain('empty.html (');
  });

  it('reuses a full seed prompt verbatim and skips the files section when none visible', () => {
    const seed = 'DESIGN SYSTEM EXTRACTION already-detailed instructions';
    const prompt = buildBrandAgentExtractionContinuationPrompt({ promptSeed: seed, projectFiles: [] });
    expect(prompt).toBe(seed);
  });

  it('falls back to placeholders when brand id and source are missing', () => {
    const prompt = buildBrandAgentExtractionContinuationPrompt({ projectFiles: [] });
    expect(prompt).toContain('(current brand id)');
    expect(prompt).toContain('the source website');
  });
});

describe('designSystemNameForSourceProject', () => {
  it('appends "Design System" unless the name already contains it', () => {
    expect(designSystemNameForSourceProject(project({ name: 'Acme' }))).toBe('Acme Design System');
    expect(designSystemNameForSourceProject(project({ name: 'Acme Design System' }))).toBe('Acme Design System');
    expect(designSystemNameForSourceProject(project({ name: '   ' }))).toBe('Untitled Design System');
  });
});

describe('buildCreateDesignSystemFromProjectPrompt', () => {
  it('embeds the source id, name, metadata json, active DS, and visible files', () => {
    const prompt = buildCreateDesignSystemFromProjectPrompt({
      project: project({ id: 'src', name: 'Acme', metadata: { kind: 'other' } as Project['metadata'] }),
      projectFiles: [file('index.html', { size: 0 }), file('style.css', { size: 4096 })],
      activeDesignSystem: { id: 'ds1', title: 'Acme DS' } as never,
    });
    expect(prompt).toContain('Source project id: src');
    expect(prompt).toContain('Active design system id: ds1');
    // size 0 → no KB suffix; size 4096 → 4KB suffix
    expect(prompt).toContain('- index.html\n');
    expect(prompt).toContain('- style.css (4KB)');
    expect(prompt).toContain('"kind": "other"');
  });

  it('notes "(none)" active DS and the no-files fallback line', () => {
    const prompt = buildCreateDesignSystemFromProjectPrompt({ project: project(), projectFiles: [] });
    expect(prompt).toContain('Active design system: (none)');
    expect(prompt).toContain('(none listed yet; rely on context/source-context.md after the copy finishes)');
    expect(prompt).toContain('{}');
  });

  it('summarizes the overflow when more than 140 files exist', () => {
    const files = Array.from({ length: 150 }, (_, i) => file(`f${i}.txt`));
    const prompt = buildCreateDesignSystemFromProjectPrompt({ project: project(), projectFiles: files });
    expect(prompt).toContain('...and 10 more files listed in context/source-context.md');
  });
});

describe('chatAttachmentsFromPreviewCommentImages', () => {
  it('dedupes by path and derives a name from the basename when blank', () => {
    const images = [
      { path: ' a/b.png ', name: '  ' },
      { path: 'a/b.png', name: 'dup' },
      { path: 'c.png', name: 'Named' },
      { path: 'dir/', name: '' },
      { path: '  ', name: 'blank-path' },
    ] as PreviewCommentAttachment[];
    expect(chatAttachmentsFromPreviewCommentImages(images)).toEqual([
      { path: 'a/b.png', name: 'b.png', kind: 'image' },
      { path: 'c.png', name: 'Named', kind: 'image' },
      // basename of 'dir/' is empty, so the raw path is used as the name.
      { path: 'dir/', name: 'dir/', kind: 'image' },
    ]);
  });

  it('returns [] for a non-array input', () => {
    expect(chatAttachmentsFromPreviewCommentImages(undefined)).toEqual([]);
  });
});

describe('mergeChatAttachments', () => {
  it('flattens groups, trims paths, and dedupes across groups', () => {
    const g1: ChatAttachment[] = [{ path: ' a ', name: 'a', kind: 'file' }];
    const g2: ChatAttachment[] = [{ path: 'a', name: 'dup', kind: 'file' }, { path: 'b', name: 'b', kind: 'image' }, { path: '  ', name: 'x', kind: 'file' }];
    expect(mergeChatAttachments(g1, g2)).toEqual([
      { path: 'a', name: 'a', kind: 'file' },
      { path: 'b', name: 'b', kind: 'image' },
    ]);
  });
});

describe('historyWithWorkspaceContext', () => {
  it('appends a workspace-context block to the matching user message only', () => {
    const context: RunContextSelection = {
      workspaceItems: [
        {
          id: 'w',
          kind: 'file',
          label: 'file.ts',
          path: 'file.ts',
          absolutePath: '/abs/file.ts',
          url: 'https://x',
          title: 'Title',
          tabId: 't1',
        },
        // A bare item exercises the "no details" branch.
        { id: 'w2', kind: 'project', label: 'Bare' },
      ],
    };
    const history = [message('u1'), message('a1', { role: 'assistant', content: 'ok' })];
    const [user, assistant] = historyWithWorkspaceContext(history, 'u1', context);
    expect(user?.content).toContain('<active-workspace-context>');
    expect(user?.content).toContain('1. file: file.ts');
    expect(user?.content).toContain('path: file.ts');
    expect(user?.content).toContain('absolute: /abs/file.ts');
    expect(user?.content).toContain('url: https://x');
    expect(user?.content).toContain('title: Title');
    expect(user?.content).toContain('tab: t1');
    expect(user?.content).toContain('2. project: Bare');
    expect(assistant?.content).toBe('ok');
  });

  it('returns the history unchanged when there are no workspace items', () => {
    const history = [message('u1')];
    expect(historyWithWorkspaceContext(history, 'u1', undefined)).toBe(history);
    expect(historyWithWorkspaceContext(history, 'u1', { workspaceItems: [] })).toBe(history);
  });
});

describe('comment task helpers', () => {
  it('commentTaskQuery trims the comment text', () => {
    expect(commentTaskQuery({ comment: '  do this  ' } as ChatCommentAttachment)).toBe('do this');
    expect(commentTaskQuery({} as ChatCommentAttachment)).toBe('');
  });

  it('commentTaskContextAttachment clears the comment and marks it query context', () => {
    const out = commentTaskContextAttachment({ id: 'c', comment: 'x' } as ChatCommentAttachment);
    expect(out.comment).toBe('');
    expect(out.commentContext).toBe('query');
  });
});

describe('designSystemNeedsWorkPrompt', () => {
  it('lists the section files as @-mentions', () => {
    const prompt = designSystemNeedsWorkPrompt('Colors', 'too dark', ['tokens.css', 'DESIGN.md']);
    expect(prompt).toContain('Needs work on the design system section "Colors".');
    expect(prompt).toContain('too dark');
    expect(prompt).toContain('- @tokens.css');
    expect(prompt).toContain('- @DESIGN.md');
  });

  it('notes when no section files are registered', () => {
    const prompt = designSystemNeedsWorkPrompt('Colors', 'fb', []);
    expect(prompt).toContain('No generated files are registered for this section yet.');
  });
});

describe('fallbackDesignSystemSummaryForProject', () => {
  it('returns null without a design-system id or when not a design-system project', () => {
    expect(fallbackDesignSystemSummaryForProject(project(), null)).toBeNull();
    expect(fallbackDesignSystemSummaryForProject(project(), 'ds1')).toBeNull();
  });

  it('builds a draft summary with provenance when a source url is present', () => {
    const p = project({ name: 'Acme Design System', metadata: { kind: 'brand', brandSourceUrl: 'https://acme.com' } as Project['metadata'] });
    const summary = fallbackDesignSystemSummaryForProject(p, 'ds1');
    expect(summary?.id).toBe('ds1');
    expect(summary?.title).toBe('Acme');
    expect(summary?.status).toBe('draft');
    expect(summary?.summary).toContain('https://acme.com');
    expect(summary?.provenance?.sourceUrls).toEqual(['https://acme.com']);
  });

  it('omits provenance and summary text when no source url is present', () => {
    const p = project({ name: 'Brandy', metadata: { kind: 'brand', sourceFileName: 'kit.fig' } as Project['metadata'] });
    const summary = fallbackDesignSystemSummaryForProject(p, 'ds2');
    expect(summary?.title).toBe('kit.fig');
    expect(summary?.summary).toBe('');
    expect(summary?.provenance).toBeUndefined();
  });

  it('falls back to the raw project name when stripping "Design System" empties it', () => {
    // Leading whitespace lets the whole name match the strip regex → '' → the
    // chain falls through to the raw `project.name`.
    const p = project({ name: ' Design System', metadata: { kind: 'brand' } as Project['metadata'] });
    expect(fallbackDesignSystemSummaryForProject(p, 'ds3')?.title).toBe(' Design System');
  });

  it('falls back to the literal "Design system" when the project name is blank', () => {
    const p = project({ name: '', metadata: { kind: 'brand' } as Project['metadata'] });
    expect(fallbackDesignSystemSummaryForProject(p, 'ds4')?.title).toBe('Design system');
  });
});
