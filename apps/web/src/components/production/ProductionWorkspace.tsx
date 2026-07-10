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

const DEFAULT_PRODUCTION_STEPS: readonly ProductionWorkflowStep[] = [
  {
    id: 'script',
    label: 'Script',
    status: 'active',
    description: 'Start with a clear, editable script backbone.',
  },
  {
    id: 'voice',
    label: 'Voice',
    status: 'ready',
    description: 'Generate a voiceover from the script in one click.',
  },
  {
    id: 'storyboard',
    label: 'Storyboard',
    status: 'empty',
    description: 'Turn beats into shots when you are ready.',
  },
  {
    id: 'assets',
    label: 'Assets',
    status: 'ready',
    description: 'Collect generated and uploaded media in one place.',
  },
  {
    id: 'output',
    label: 'Output',
    status: 'ready',
    description: 'Export the assembled video when the sequence is complete.',
  },
] as const;

export function ProductionWorkspace({ projectId, projectName, metadata, projectFiles }: Props) {
  const productionMetadata = metadata as ProductionProjectMetadata | null | undefined;
  const selectedTaskCard = productionTaskCardForId(productionMetadata?.taskCardId);
  const taskCardCount = PRODUCTION_TASK_CARD_CATALOG.length;

  return (
    <section className="production-workspace" data-testid="production-workspace" data-project-id={projectId}>
      <header className="production-workspace__header">
        <div>
          <p className="production-workspace__eyebrow">Production mode</p>
          <h2>{projectName}</h2>
          <p className="production-workspace__lede">
            Script, voice, storyboard, assets, and output stay connected in one beginner-friendly flow.
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
          <ProductionWorkflowRail steps={DEFAULT_PRODUCTION_STEPS} />
        </section>

        <section className="production-workspace__pane">
          <h3>Script</h3>
          <p>Write or generate the script here, then keep later lanes linked to the same segments.</p>
        </section>

        <section className="production-workspace__pane">
          <h3>Voice</h3>
          <p>One-click voiceover generation is ready from the same script.</p>
          <button type="button" className="production-workspace__secondary-action">
            Generate voiceover
          </button>
        </section>

        <section className="production-workspace__pane">
          <h3>Storyboard</h3>
          <p>Beginner-friendly empty state: break the script into shots when you need more control.</p>
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
