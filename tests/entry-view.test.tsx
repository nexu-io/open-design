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
});

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
