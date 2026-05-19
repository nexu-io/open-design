// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillSummary } from '@open-design/contracts';

import { ChatComposer } from '../../src/components/ChatComposer';

function makeSkill(overrides: Partial<SkillSummary>): SkillSummary {
  return {
    id: 'skill',
    name: 'Skill',
    description: 'A skill',
    triggers: [],
    mode: 'prototype',
    previewType: 'html',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: '',
    aggregatesExamples: false,
    source: 'built-in',
    ...overrides,
  };
}

function renderComposer(skills: SkillSummary[]) {
  return render(
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      skills={skills}
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
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
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('ChatComposer @ skill picker', () => {
  it('renders more than 8 skills when the catalogue exceeds the legacy cap', async () => {
    const skills = Array.from({ length: 12 }, (_, i) =>
      makeSkill({ id: `skill-${i + 1}`, name: `Skill ${i + 1}` }),
    );
    renderComposer(skills);

    fireEvent.change(screen.getByTestId('chat-composer-input'), {
      target: { value: '@', selectionStart: 1 },
    });

    const popover = await screen.findByTestId('mention-popover');
    await waitFor(() => expect(within(popover).getByText('Skill 1')).toBeTruthy());
    for (let i = 1; i <= 12; i++) {
      expect(within(popover).queryByText(`Skill ${i}`)).not.toBeNull();
    }
  });

  it('orders prefix matches before substring matches when a query is typed', async () => {
    const skills = [
      makeSkill({ id: 'image-collage', name: 'Image Collage' }),
      makeSkill({ id: 'video-skill', name: 'Video Skill', description: 'Has image in description' }),
      makeSkill({ id: 'image-poster', name: 'Image Poster' }),
      makeSkill({ id: 'audio-skill', name: 'Audio Skill', triggers: ['image'] }),
    ];
    renderComposer(skills);

    fireEvent.change(screen.getByTestId('chat-composer-input'), {
      target: { value: '@image', selectionStart: 6 },
    });

    const popover = await screen.findByTestId('mention-popover');
    await waitFor(() => expect(within(popover).getByText('Image Collage')).toBeTruthy());

    const items = within(popover).getAllByRole('button').filter((el) => el.className.includes('mention-item'));
    const names = items.map((el) => el.querySelector('strong')?.textContent ?? '');
    const collageIdx = names.indexOf('Image Collage');
    const posterIdx = names.indexOf('Image Poster');
    const videoIdx = names.indexOf('Video Skill');
    const audioIdx = names.indexOf('Audio Skill');

    expect(collageIdx).toBeGreaterThanOrEqual(0);
    expect(posterIdx).toBeGreaterThanOrEqual(0);
    expect(videoIdx).toBeGreaterThanOrEqual(0);
    expect(audioIdx).toBeGreaterThanOrEqual(0);
    expect(collageIdx).toBeLessThan(videoIdx);
    expect(collageIdx).toBeLessThan(audioIdx);
    expect(posterIdx).toBeLessThan(videoIdx);
    expect(posterIdx).toBeLessThan(audioIdx);
    expect(collageIdx).toBeLessThan(posterIdx);
  });

  it('ranks name-prefix above name-substring above other-field matches', async () => {
    const skills = [
      makeSkill({ id: 'video-skill', name: 'Video Skill', description: 'Has image in description' }),
      makeSkill({ id: 'night-image', name: 'Night Image' }),
      makeSkill({ id: 'audio-skill', name: 'Audio Skill', triggers: ['image'] }),
      makeSkill({ id: 'image-collage', name: 'Image Collage' }),
    ];
    renderComposer(skills);

    fireEvent.change(screen.getByTestId('chat-composer-input'), {
      target: { value: '@image', selectionStart: 6 },
    });

    const popover = await screen.findByTestId('mention-popover');
    await waitFor(() => expect(within(popover).getByText('Image Collage')).toBeTruthy());

    const items = within(popover).getAllByRole('button').filter((el) => el.className.includes('mention-item'));
    const names = items.map((el) => el.querySelector('strong')?.textContent ?? '');
    const prefixIdx = names.indexOf('Image Collage');
    const containsIdx = names.indexOf('Night Image');
    const descriptionIdx = names.indexOf('Video Skill');
    const triggerIdx = names.indexOf('Audio Skill');

    expect(prefixIdx).toBeLessThan(containsIdx);
    expect(containsIdx).toBeLessThan(descriptionIdx);
    expect(containsIdx).toBeLessThan(triggerIdx);
  });

  it('caps the visible list at 24 even when more than 24 skills match an empty query', async () => {
    const skills = Array.from({ length: 30 }, (_, i) =>
      makeSkill({ id: `skill-${String(i + 1).padStart(2, '0')}`, name: `Skill ${String(i + 1).padStart(2, '0')}` }),
    );
    renderComposer(skills);

    fireEvent.change(screen.getByTestId('chat-composer-input'), {
      target: { value: '@', selectionStart: 1 },
    });

    const popover = await screen.findByTestId('mention-popover');
    await waitFor(() => expect(within(popover).getByText('Skill 01')).toBeTruthy());

    const items = within(popover).getAllByRole('button').filter((el) => el.className.includes('mention-item'));
    expect(items.length).toBe(24);
    expect(within(popover).queryByText('Skill 24')).not.toBeNull();
    expect(within(popover).queryByText('Skill 25')).toBeNull();
    expect(within(popover).queryByText('Skill 30')).toBeNull();
  });

  it('keeps prefix matches inside the cap when the substring bucket would push them out', async () => {
    const prefixSkills = Array.from({ length: 26 }, (_, i) =>
      makeSkill({ id: `image-${String(i + 1).padStart(2, '0')}`, name: `Image ${String(i + 1).padStart(2, '0')}` }),
    );
    const substringSkills = Array.from({ length: 5 }, (_, i) =>
      makeSkill({ id: `other-${i + 1}`, name: `Other ${i + 1}`, description: 'mentions image' }),
    );
    renderComposer([...substringSkills, ...prefixSkills]);

    fireEvent.change(screen.getByTestId('chat-composer-input'), {
      target: { value: '@image', selectionStart: 6 },
    });

    const popover = await screen.findByTestId('mention-popover');
    await waitFor(() => expect(within(popover).getByText('Image 01')).toBeTruthy());

    const items = within(popover).getAllByRole('button').filter((el) => el.className.includes('mention-item'));
    expect(items.length).toBe(24);
    expect(within(popover).queryByText('Other 1')).toBeNull();
    expect(within(popover).queryByText('Image 24')).not.toBeNull();
    expect(within(popover).queryByText('Image 25')).toBeNull();
  });

  it('preserves input order among tied prefix matches', async () => {
    const skills = ['Image E', 'Image B', 'Image D', 'Image A', 'Image C'].map((name, i) =>
      makeSkill({ id: `image-${i}`, name }),
    );
    renderComposer(skills);

    fireEvent.change(screen.getByTestId('chat-composer-input'), {
      target: { value: '@image', selectionStart: 6 },
    });

    const popover = await screen.findByTestId('mention-popover');
    await waitFor(() => expect(within(popover).getByText('Image E')).toBeTruthy());

    const items = within(popover).getAllByRole('button').filter((el) => el.className.includes('mention-item'));
    const names = items.map((el) => el.querySelector('strong')?.textContent ?? '');
    expect(names.slice(0, 5)).toEqual(['Image E', 'Image B', 'Image D', 'Image A', 'Image C']);
  });

  it('preserves input order when the query is empty', async () => {
    const skills = ['Zephyr', 'Atlas', 'Marigold', 'Beacon'].map((name, i) =>
      makeSkill({ id: `skill-${i}`, name }),
    );
    renderComposer(skills);

    fireEvent.change(screen.getByTestId('chat-composer-input'), {
      target: { value: '@', selectionStart: 1 },
    });

    const popover = await screen.findByTestId('mention-popover');
    await waitFor(() => expect(within(popover).getByText('Zephyr')).toBeTruthy());

    const items = within(popover).getAllByRole('button').filter((el) => el.className.includes('mention-item'));
    const names = items.map((el) => el.querySelector('strong')?.textContent ?? '');
    expect(names).toEqual(['Zephyr', 'Atlas', 'Marigold', 'Beacon']);
  });
});
