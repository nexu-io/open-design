import { useMemo, useState } from 'react';

import type { ProjectFile, ProjectMetadata } from '../../types';
import { ProductionCanvasBoard } from './ProductionCanvasBoard';
import { ProductionTaskCard, productionTaskCardForId, PRODUCTION_TASK_CARD_CATALOG } from './ProductionTaskCard';
import { ProductionWorkflowRail, type ProductionWorkflowStep } from './ProductionWorkflowRail';

interface Props {
  projectId: string;
  projectName: string;
  metadata: ProjectMetadata | null | undefined;
  projectFiles: ProjectFile[];
}

type ProductionProjectMetadata = ProjectMetadata & {
  workflowMode?: 'production';
  taskCardId?: string;
  voiceTone?: string;
  voiceProfileId?: string;
};

const DEFAULT_SCRIPT_DRAFT = [
  'Hook: explain the core idea in one line.',
  'Body: show the main example with one clear visual.',
  'Wrap-up: finish with a useful takeaway or CTA.',
].join('\n');

function splitScriptDraft(scriptDraft: string) {
  return scriptDraft
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function createVoicePreview(scriptSections: string[], voiceTone: string) {
  if (scriptSections.length === 0) {
    return 'Add a script line to generate a voice preview.';
  }

  return `Voice profile (${voiceTone}) will speak ${scriptSections.length} beats: ${scriptSections.join(' / ')}`;
}

function createStoryboardShots(scriptSections: string[]) {
  if (scriptSections.length === 0) {
    return ['Add a script line to create storyboard shots.'];
  }

  return scriptSections.map((section, index) => `Shot ${index + 1}: ${section}`);
}

export function ProductionWorkspace({ projectId, projectName, metadata, projectFiles }: Props) {
  const productionMetadata = metadata as ProductionProjectMetadata | null | undefined;
  const selectedTaskCard = productionTaskCardForId(productionMetadata?.taskCardId);
  const taskCardCount = PRODUCTION_TASK_CARD_CATALOG.length;
  const [scriptDraft, setScriptDraft] = useState(DEFAULT_SCRIPT_DRAFT);

  const scriptSections = useMemo(() => splitScriptDraft(scriptDraft), [scriptDraft]);
  const voiceTone = productionMetadata?.voiceTone ?? 'professional';
  const voicePreview = useMemo(
    () => createVoicePreview(scriptSections, voiceTone),
    [scriptSections, voiceTone],
  );
  const storyboardShots = useMemo(() => createStoryboardShots(scriptSections), [scriptSections]);
  const workflowSteps: readonly ProductionWorkflowStep[] = useMemo(
    () => [
      {
        id: 'script',
        label: 'Script',
        status: scriptSections.length > 0 ? 'active' : 'empty',
        description: scriptSections.length > 0
          ? `${scriptSections.length} beats ready to drive voice and storyboard.`
          : 'Start with a clear, editable script backbone.',
      },
      {
        id: 'voice',
        label: 'Voice',
        status: scriptSections.length > 0 ? 'ready' : 'empty',
        description: scriptSections.length > 0
          ? `Voice preview follows the same ${voiceTone} script draft.`
          : 'Generate a voiceover from the script in one click.',
      },
      {
        id: 'storyboard',
        label: 'Storyboard',
        status: scriptSections.length > 0 ? 'ready' : 'empty',
        description: scriptSections.length > 0
          ? `${storyboardShots.length} shots are already lined up from the script.`
          : 'Turn beats into shots when you are ready.',
      },
      {
        id: 'assets',
        label: 'Assets',
        status: projectFiles.length > 0 ? 'ready' : 'empty',
        description: 'Collect generated and uploaded media in one place.',
      },
      {
        id: 'output',
        label: 'Output',
        status: scriptSections.length > 0 ? 'ready' : 'empty',
        description: 'Export the assembled video when the sequence is complete.',
      },
    ],
    [projectFiles.length, scriptSections.length, storyboardShots.length, voiceTone],
  );

  return (
    <section className="production-workspace" data-testid="production-workspace" data-project-id={projectId}>
      <header className="production-workspace__header">
        <div>
          <p className="production-workspace__eyebrow">Production mode</p>
          <h2>{projectName}</h2>
          <p className="production-workspace__lede">
            {scriptSections.length > 0
              ? `${scriptSections.length} script beats now drive the voice and storyboard lanes in one beginner-friendly flow.`
              : 'Script, voice, storyboard, assets, and output stay connected in one beginner-friendly flow.'}
          </p>
        </div>
        <button type="button" className="production-workspace__primary-action">
          Export draft video
        </button>
      </header>

      <ProductionCanvasBoard />

      <div className="production-workspace__grid">
        <section className="production-workspace__pane">
          <h3>Task card</h3>
          <p className="production-workspace__count">{taskCardCount} starter flows</p>
          <ProductionTaskCard card={selectedTaskCard} selected metadata={productionMetadata} />
        </section>

        <section className="production-workspace__pane">
          <h3>Workflow rail</h3>
          <ProductionWorkflowRail steps={workflowSteps} />
        </section>

        <section className="production-workspace__pane">
          <h3>Script</h3>
          <p>Write or generate the script here, then keep later lanes linked to the same segments.</p>
          <label style={{ display: 'grid', gap: 8 }}>
            <span className="production-workspace__label">Editable script draft</span>
            <textarea
              aria-label="Editable script draft"
              value={scriptDraft}
              onChange={(event) => setScriptDraft(event.target.value)}
              rows={6}
              style={{
                width: '100%',
                resize: 'vertical',
                borderRadius: 16,
                border: '1px solid rgba(148, 163, 184, 0.25)',
                background: 'rgba(15, 23, 42, 0.82)',
                color: '#e2e8f0',
                padding: '14px 16px',
                lineHeight: 1.6,
              }}
            />
          </label>
        </section>

        <section className="production-workspace__pane">
          <h3>Voice</h3>
          <p>One-click voiceover generation is ready from the same script.</p>
          <p data-testid="production-voice-preview">{voicePreview}</p>
          <button type="button" className="production-workspace__secondary-action">
            Generate voiceover
          </button>
        </section>

        <section className="production-workspace__pane">
          <h3>Storyboard</h3>
          <p>Beginner-friendly empty state: break the script into shots when you need more control.</p>
          <ol data-testid="production-storyboard-shots">
            {storyboardShots.map((shot) => (
              <li key={shot}>{shot}</li>
            ))}
          </ol>
        </section>

        <section className="production-workspace__pane">
          <h3>Assets</h3>
          {projectFiles.length > 0 ? (
            <ul>
              {projectFiles.slice(0, 5).map((file) => (
                <li key={file.name}>{file.name}</li>
              ))}
            </ul>
          ) : (
            <p>No assets yet. Generated files will land here.</p>
          )}
        </section>

        <section className="production-workspace__pane">
          <h3>Output</h3>
          <p>Review the assembled result and export once the sequence is ready.</p>
        </section>
      </div>
    </section>
  );
}
