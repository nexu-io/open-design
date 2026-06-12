// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';
import { composerText, typeAndSettle } from '../helpers/lexical-composer';

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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// Gate the project PATCH (applyProjectSkill) so the test can observe the
// composer state *while the async apply is still in flight* — that mid-flight
// window is exactly where the #3596 caret drift happened.
let resolveProjectPatch: ((res: Response) => void) | null;
let projectPatched: Promise<Response>;

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
      skills={[SKILL]}
      {...overrides}
    />,
  );
}

async function flushMounts() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function skillPill(): Element | null {
  return screen
    .getByTestId('chat-composer-input')
    .querySelector('.composer-inline-mention[data-mention-kind="skill"]');
}

beforeEach(() => {
  resolveProjectPatch = null;
  projectPatched = new Promise<Response>((resolve) => {
    resolveProjectPatch = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/skills') return jsonResponse({ skills: [SKILL] });
      if (url === '/api/projects/project-1' && init?.method === 'PATCH') {
        // Stay pending until the test resolves it.
        return projectPatched;
      }
      return jsonResponse([]);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('ChatComposer skill mention caret (#3596)', () => {
  it('inserts the skill pill before the async project patch resolves', async () => {
    const onProjectSkillChange = vi.fn();
    renderComposer({ onProjectSkillChange });
    await flushMounts();

    await typeAndSettle('@deck');
    await waitFor(() => expect(screen.getByText('Deck Builder')).toBeTruthy());

    fireEvent.click(screen.getByText('Deck Builder'));

    // The pill must land while applyProjectSkill's PATCH is still pending.
    // Before the fix, insertSkillMention awaited the patch first, so the
    // editor selection drifted and the pill was dropped at the end of the
    // draft only after the patch resolved. Asserting the pill exists here —
    // with onProjectSkillChange (fired post-patch) not yet called — pins the
    // insert-before-await ordering that keeps the caret aligned.
    await waitFor(() => expect(skillPill()).toBeTruthy());
    expect(skillPill()?.textContent).toBe('@Deck Builder');
    expect(onProjectSkillChange).not.toHaveBeenCalled();

    act(() => {
      resolveProjectPatch?.(
        jsonResponse({ project: { id: 'project-1', skillId: SKILL.id } }),
      );
    });

    await waitFor(() =>
      expect(onProjectSkillChange).toHaveBeenCalledWith('deck-builder'),
    );
    await waitFor(() => expect(composerText()).toBe('@Deck Builder '));
  });
});
