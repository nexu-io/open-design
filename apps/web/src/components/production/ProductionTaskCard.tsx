import type { ProjectMetadata } from '../../types';

export type ProductionTaskCardId =
  | 'science-explainer'
  | 'talking-head'
  | 'storyboard'
  | 'product-showcase';

export interface ProductionTaskCardDef {
  id: ProductionTaskCardId;
  title: string;
  description: string;
}

export const PRODUCTION_TASK_CARD_CATALOG: readonly ProductionTaskCardDef[] = [
  {
    id: 'science-explainer',
    title: 'Science explainer',
    description: 'Explain a concept with clear structure and simple visuals.',
  },
  {
    id: 'talking-head',
    title: 'Talking-head narration',
    description: 'Generate a voice-led script with a stable presenter persona.',
  },
  {
    id: 'storyboard',
    title: 'Storyboard planning',
    description: 'Break a script into shots, assets, and timing.',
  },
  {
    id: 'product-showcase',
    title: 'Product showcase',
    description: 'Present a product with scene-level polish and pacing.',
  },
] as const;

type ProductionProjectMetadata = ProjectMetadata & {
  workflowMode?: 'production';
  voiceTone?: string;
  voiceProfileId?: string;
  taskCardId?: string;
};

export function productionTaskCardForId(taskCardId: string | null | undefined): ProductionTaskCardDef {
  return (
    PRODUCTION_TASK_CARD_CATALOG.find((card) => card.id === taskCardId) ??
    PRODUCTION_TASK_CARD_CATALOG[0]!
  );
}

interface Props {
  card: ProductionTaskCardDef;
  selected?: boolean;
  metadata?: ProjectMetadata | null;
}

export function ProductionTaskCard({ card, selected = false, metadata }: Props) {
  const productionMetadata = metadata as ProductionProjectMetadata | null | undefined;
  return (
    <article className={`production-task-card${selected ? ' is-selected' : ''}`}>
      <div className="production-task-card__header">
        <h3>{card.title}</h3>
        {selected ? <span className="production-task-card__pill">Selected</span> : null}
      </div>
      <p>{card.description}</p>
      {productionMetadata?.workflowMode === 'production' ? (
        <dl className="production-task-card__meta">
          <div>
            <dt>Voice tone</dt>
            <dd>{productionMetadata.voiceTone ?? 'professional'}</dd>
          </div>
          <div>
            <dt>Voice profile</dt>
            <dd>{productionMetadata.voiceProfileId?.trim() || 'Default voice'}</dd>
          </div>
        </dl>
      ) : null}
    </article>
  );
}
