import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntryView } from '../src/components/EntryView';
import type {
  AgentInfo,
  AppConfig,
  DesignSystemSummary,
  Project,
  ProjectTemplate,
  SkillSummary,
} from '../src/types';

const skill: SkillSummary = {
  id: 'pm-spec',
  name: 'PM Spec',
  description: 'Build product specs',
  triggers: [],
  mode: 'template',
  platform: 'desktop',
  scenario: null,
  previewType: 'html',
  designSystemRequired: false,
  defaultFor: [],
  upstream: null,
  featured: null,
  fidelity: null,
  speakerNotes: null,
  animations: null,
  hasBody: true,
  examplePrompt: '',
};

const designSystem: DesignSystemSummary = {
  id: 'ios-26-liquid-glass',
  title: 'iOS 26 Liquid Glass',
  category: 'Mobile',
  summary: 'Reference system',
  swatches: [],
};

const config: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: '',
  model: 'default',
  agentId: null,
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
};

const agents: AgentInfo[] = [];

describe('EntryView', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('exports a full OneShot studio snapshot from the entry header', async () => {
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createObjectURL = vi.fn(() => 'blob:oneshot-studio-snapshot');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    localStorage.setItem('oneshot:saved-blueprints', JSON.stringify([
      {
        id: 'blueprint-1',
        name: 'Cover run',
        prompt: 'Create a cover packet',
        skillId: 'pm-spec',
        designSystemId: null,
        metadata: { kind: 'template', workflowId: 'oneshot-cover-run' },
        createdAt: 100,
      },
    ]));
    localStorage.setItem('oneshot:library-search-views', JSON.stringify([
      {
        id: 'view-1',
        name: 'Cover boards',
        query: 'cover',
        sourceFilter: 'Board',
        outputFilter: 'visual-reference',
        recencyFilter: '30d',
        createdAt: 200,
      },
    ]));
    localStorage.setItem('oneshot:library-search-transfer-history', JSON.stringify([
      {
        id: 'history-1',
        direction: 'export',
        createdAt: 300,
        viewCount: 1,
      },
    ]));
    localStorage.setItem('oneshot:inspiration-boards', JSON.stringify([
      {
        id: 'board-1',
        title: 'CoverVision references',
        description: 'Covers',
        tags: ['covers'],
        createdAt: 400,
        updatedAt: 400,
      },
    ]));
    localStorage.setItem('oneshot:inspiration-pins', JSON.stringify([
      {
        id: 'pin-1',
        boardId: 'board-1',
        title: 'Typography',
        imageUrl: '',
        sourceUrl: '',
        note: '',
        usageNote: '',
        tags: ['type'],
        createdAt: 500,
      },
    ]));

    render(
      <EntryView
        skills={[skill]}
        designSystems={[designSystem]}
        projects={[project('project-1', 'OneShot Cover Run')]}
        templates={[template('template-1', 'Cover packet template')]}
        defaultDesignSystemId="ios-26-liquid-glass"
        config={config}
        agents={agents}
        onCreateProject={vi.fn()}
        onImportClaudeDesign={vi.fn()}
        onOpenProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onChangeDefaultDesignSystem={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export snapshot' }));

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(anchorClick).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:oneshot-studio-snapshot');
    const exportedText = await (createObjectURL.mock.calls[0][0] as Blob).text();
    const snapshot = JSON.parse(exportedText);
    expect(snapshot).toMatchObject({
      schema: 'oneshot.studio-snapshot.v1',
      counts: {
        projects: 1,
        templates: 1,
        savedBlueprints: 1,
        inspirationBoards: 1,
        inspirationPins: 1,
        libraryViews: 1,
        libraryTransferHistory: 1,
      },
      projects: [expect.objectContaining({ name: 'OneShot Cover Run' })],
      templates: [expect.objectContaining({ name: 'Cover packet template' })],
      savedBlueprints: [expect.objectContaining({ name: 'Cover run' })],
      inspirationBoards: [expect.objectContaining({ title: 'CoverVision references' })],
      inspirationPins: [expect.objectContaining({ title: 'Typography' })],
      libraryViews: [expect.objectContaining({ name: 'Cover boards' })],
      libraryTransferHistory: [expect.objectContaining({ direction: 'export' })],
    });
  });

  it('previews and restores local libraries from a studio snapshot', async () => {
    localStorage.setItem('oneshot:saved-blueprints', JSON.stringify([
      {
        id: 'existing-blueprint',
        name: 'Existing cover run',
        prompt: 'Existing prompt',
        skillId: 'pm-spec',
        designSystemId: null,
        metadata: { kind: 'template', workflowId: 'oneshot-cover-run' },
        createdAt: 100,
      },
    ]));
    localStorage.setItem('oneshot:library-search-views', JSON.stringify([
      {
        id: 'existing-view',
        name: 'Existing boards',
        query: 'existing',
        sourceFilter: 'Board',
        outputFilter: 'visual-reference',
        recencyFilter: 'all',
        createdAt: 200,
      },
    ]));

    renderEntryView();

    const snapshot = {
      schema: 'oneshot.studio-snapshot.v1',
      exportedAt: Date.now(),
      projects: [project('project-from-packet', 'Archived project')],
      templates: [template('template-from-packet', 'Archived template')],
      savedBlueprints: [
        {
          id: 'existing-blueprint',
          name: 'Conflicting cover run',
          prompt: 'Incoming prompt',
          skillId: 'pm-spec',
          designSystemId: null,
          metadata: { kind: 'template', workflowId: 'oneshot-cover-run' },
          createdAt: 300,
        },
        {
          id: 'incoming-blueprint',
          name: 'Incoming dashboard run',
          prompt: 'Incoming dashboard prompt',
          skillId: 'pm-spec',
          designSystemId: null,
          metadata: { kind: 'template', workflowId: 'dashboard-mockup' },
          createdAt: 400,
        },
      ],
      inspirationBoards: [
        {
          id: 'incoming-board',
          title: 'Incoming board',
          description: '',
          tags: [],
          createdAt: 500,
          updatedAt: 500,
        },
      ],
      inspirationPins: [],
      libraryViews: [
        {
          id: 'incoming-view',
          name: 'Incoming boards',
          query: 'cover',
          sourceFilter: 'Board',
          outputFilter: 'visual-reference',
          recencyFilter: '30d',
          createdAt: 600,
        },
      ],
      libraryTransferHistory: [
        {
          id: 'incoming-history',
          direction: 'import',
          createdAt: 700,
          viewCount: 1,
        },
      ],
    };
    const file = new File([JSON.stringify(snapshot)], 'oneshot-studio-snapshot.json', {
      type: 'application/json',
    });

    fireEvent.change(screen.getByLabelText('Import snapshot'), {
      target: { files: [file] },
    });

    expect(await screen.findByRole('dialog', { name: 'Studio snapshot restore preview' })).toBeInTheDocument();
    expect(screen.getByLabelText('Snapshot import audit')).toBeInTheDocument();
    expect(screen.getByText('2 incoming - 1 local - 1 conflicts - 1 restored')).toBeInTheDocument();
    expect(screen.getByText('1 projects and 1 templates remain audit-only in this restore.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restore local libraries' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Restored 4 local studio records from the snapshot.');
    expect(JSON.parse(localStorage.getItem('oneshot:saved-blueprints') ?? '[]')).toEqual([
      expect.objectContaining({ id: 'incoming-blueprint', name: 'Incoming dashboard run' }),
      expect.objectContaining({ id: 'existing-blueprint', name: 'Existing cover run' }),
    ]);
    expect(JSON.parse(localStorage.getItem('oneshot:library-search-views') ?? '[]')).toEqual([
      expect.objectContaining({ id: 'incoming-view', name: 'Incoming boards' }),
      expect.objectContaining({ id: 'existing-view', name: 'Existing boards' }),
    ]);
    expect(JSON.parse(localStorage.getItem('oneshot:inspiration-boards') ?? '[]')).toEqual([
      expect.objectContaining({ id: 'incoming-board', title: 'Incoming board' }),
    ]);
    expect(JSON.parse(localStorage.getItem('oneshot:library-search-transfer-history') ?? '[]')).toEqual([
      expect.objectContaining({ id: 'incoming-history', direction: 'import' }),
    ]);
  });
});

function renderEntryView() {
  return render(
    <EntryView
      skills={[skill]}
      designSystems={[designSystem]}
      projects={[project('project-1', 'OneShot Cover Run')]}
      templates={[template('template-1', 'Cover packet template')]}
      defaultDesignSystemId="ios-26-liquid-glass"
      config={config}
      agents={agents}
      onCreateProject={vi.fn()}
      onImportClaudeDesign={vi.fn()}
      onOpenProject={vi.fn()}
      onDeleteProject={vi.fn()}
      onChangeDefaultDesignSystem={vi.fn()}
      onOpenSettings={vi.fn()}
    />,
  );
}

function project(id: string, name: string): Project {
  return {
    id,
    name,
    skillId: 'pm-spec',
    designSystemId: 'ios-26-liquid-glass',
    createdAt: 1,
    updatedAt: 2,
    metadata: { kind: 'template' },
  };
}

function template(id: string, name: string): ProjectTemplate {
  return {
    id,
    name,
    description: 'Reusable template',
    sourceProjectId: 'project-1',
    files: [],
    createdAt: 3,
  };
}
