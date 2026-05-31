// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';

// Regression coverage for the @-mention skill staging path. Originally
// flagged as adjacent debt on #2881 / #3356: `insertSkillMention` writes
// `@<name>` into the draft and `applyProjectSkill` updates the project's
// pinned skill, but no path ever calls `setStagedSkills`, so the
// `<StagedSkills>` chip never mounts and the per-turn `meta.skillIds`
// payload is always empty. With #1635 / #2552 restoring `skillIds`
// processing on the daemon, the front-end gap turned the link into a
// silent no-op end-to-end. These specs encode the expected behavior:
// picking a skill from the @-popover (or the tools-menu picker) should
// stage it as a chip and forward `meta.skillIds` to the daemon, and the
// chip and the inline `@<name>` token should stay in sync as the user
// edits the draft or removes the chip.

const SKILL = {
  id: 'deck-builder',
  name: 'Deck Builder',
  description: 'Build a polished slide deck.',
  triggers: ['deck'],
  mode: 'deck' as const,
  previewType: 'html',
  designSystemRequired: false,
  defaultFor: [],
  upstream: null,
  hasBody: true,
  examplePrompt: 'Make a deck',
  aggregatesExamples: false,
};

let fetchMock: ReturnType<typeof vi.fn>;
let skills = [SKILL];

function renderComposer(
  overrides: Partial<ComponentProps<typeof ChatComposer>> = {},
) {
  return render(
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onOpenMcpSettings={vi.fn()}
      skills={skills}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  skills = [SKILL];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/mcp/servers') {
      return new Response(JSON.stringify({ servers: [], templates: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/skills') {
      return new Response(JSON.stringify({ skills }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/projects/project-1' && init?.method === 'PATCH') {
      return new Response(JSON.stringify({ project: { id: 'project-1', skillId: SKILL.id } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('ChatComposer skill chip staging (#1635 follow-up)', () => {
  it('mounts a staged-skill chip after picking a skill from the @-popover', async () => {
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, {
      target: { value: '@deck', selectionStart: 5 },
    });

    await waitFor(() => expect(screen.getByText('Deck Builder')).toBeTruthy());
    fireEvent.click(screen.getByText('Deck Builder'));

    await waitFor(() => expect(input.value).toBe('@Deck Builder '));
    expect(screen.getByTestId('staged-skills').textContent).toContain('Deck Builder');
  });

  it('forwards meta.skillIds when sending after a skill is staged from @-popover', async () => {
    const onSend = vi.fn();
    renderComposer({ onSend });
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, {
      target: { value: '@deck', selectionStart: 5 },
    });

    await waitFor(() => expect(screen.getByText('Deck Builder')).toBeTruthy());
    fireEvent.click(screen.getByText('Deck Builder'));
    await waitFor(() => expect(input.value).toBe('@Deck Builder '));

    fireEvent.change(input, {
      target: { value: '@Deck Builder make slides', selectionStart: 25 },
    });
    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    const call = onSend.mock.calls[0];
    const meta = call?.[3];
    expect(meta?.skillIds).toEqual([SKILL.id]);
  });

  it('removes the inline mention when the staged-skill chip is removed', async () => {
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, {
      target: { value: '@deck', selectionStart: 5 },
    });

    await waitFor(() => expect(screen.getByText('Deck Builder')).toBeTruthy());
    fireEvent.click(screen.getByText('Deck Builder'));
    await waitFor(() => expect(screen.queryByTestId('staged-skills')).not.toBeNull());

    fireEvent.click(screen.getByLabelText(`Remove skill ${SKILL.name}`));

    // The strip preserves the boundary char so neighboring text stays
    // intact ('Plan: @Deck Builder note' → 'Plan: note'). With nothing
    // around the mention only the leading boundary remains; that's the
    // same behavior as `removeStaged` for design-file tokens.
    expect(input.value.trim()).toBe('');
    expect(input.value).not.toContain('@Deck Builder');
    expect(screen.queryByTestId('staged-skills')).toBeNull();
  });

  it('drops the staged-skill chip when the user manually deletes the @-mention', async () => {
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, {
      target: { value: '@deck', selectionStart: 5 },
    });

    await waitFor(() => expect(screen.getByText('Deck Builder')).toBeTruthy());
    fireEvent.click(screen.getByText('Deck Builder'));
    await waitFor(() => expect(screen.queryByTestId('staged-skills')).not.toBeNull());

    fireEvent.change(input, {
      target: { value: '', selectionStart: 0 },
    });

    expect(screen.queryByTestId('staged-skills')).toBeNull();
  });
});
