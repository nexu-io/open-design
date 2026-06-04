// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hostMock = vi.hoisted(() => ({
  available: false,
  pickAndImport: vi.fn(),
}));

vi.mock('@open-design/host', () => ({
  isOpenDesignHostAvailable: () => hostMock.available,
  pickAndImportHostProject: hostMock.pickAndImport,
}));

import { HomeView } from '../../src/components/HomeView';
import type { SkillSummary } from '../../src/types';

const prototypeSkill: SkillSummary = {
  id: 'prototype-skill',
  name: 'Prototype',
  description: 'Build prototypes',
  mode: 'prototype',
  surface: 'web',
  previewType: 'html',
  designSystemRequired: true,
  defaultFor: ['prototype'],
  triggers: [],
  upstream: null,
  hasBody: true,
  examplePrompt: 'Build a prototype.',
  aggregatesExamples: false,
};

beforeEach(() => {
  hostMock.available = false;
  hostMock.pickAndImport.mockReset();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (url) => {
    if (typeof url === 'string' && url === '/api/plugins') {
      return json({ plugins: [] });
    }
    if (typeof url === 'string' && url === '/api/mcp/servers') {
      return json({ servers: [], templates: [] });
    }
    if (typeof url === 'string' && url === '/api/dialog/open-folder') {
      return json({ path: '/Users/me/Site' });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HomeView folder import', () => {
  it('opens the local-server folder picker from the home affordance', async () => {
    const onImportFolder = vi.fn();

    renderHome({ onImportFolder });

    expect(await screen.findByTestId('home-existing-project')).toBeTruthy();
    const button = screen.getByRole('button', {
      name: 'Open existing project',
    }) as HTMLButtonElement;

    expect(screen.queryByRole('heading', { name: 'Open existing project' })).toBeNull();
    expect(screen.getByText('Choose a folder from your disk.')).toBeTruthy();
    expect(screen.queryByLabelText('Project folder path')).toBeNull();
    expect(button.disabled).toBe(false);
    fireEvent.click(button);

    await waitFor(() => {
      expect(onImportFolder).toHaveBeenCalledWith('/Users/me/Site');
    });
  });

  it('uses the desktop trusted folder picker when the host bridge is available', async () => {
    hostMock.available = true;
    const importResult = {
      conversationId: 'conversation-host',
      entryFile: 'index.html',
      ok: true,
      projectId: 'project-host',
    } as const;
    hostMock.pickAndImport.mockResolvedValue(importResult);
    const onImportFolderResponse = vi.fn();

    renderHome({ onImportFolderResponse });

    const button = await screen.findByRole('button', { name: 'Open existing project' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(hostMock.pickAndImport).toHaveBeenCalledWith({ skillId: 'prototype-skill' });
    });
    await waitFor(() => {
      expect(onImportFolderResponse).toHaveBeenCalledWith(importResult);
    });
  });
});

function renderHome(overrides: Partial<React.ComponentProps<typeof HomeView>> = {}) {
  return render(
    <HomeView
      projects={[]}
      skills={[prototypeSkill]}
      onSubmit={() => undefined}
      onOpenProject={() => undefined}
      onViewAllProjects={() => undefined}
      {...overrides}
    />,
  );
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
