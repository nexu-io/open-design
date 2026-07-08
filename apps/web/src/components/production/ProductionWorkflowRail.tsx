export type ProductionWorkflowStepId = 'script' | 'voice' | 'storyboard' | 'assets' | 'output';

export interface ProductionWorkflowStep {
  id: ProductionWorkflowStepId;
  label: string;
  status: 'ready' | 'active' | 'empty' | 'complete';
  description: string;
}

interface Props {
  steps: readonly ProductionWorkflowStep[];
}

export function ProductionWorkflowRail({ steps }: Props) {
  return (
    <ol className="production-workflow-rail" aria-label="Production workflow">
      {steps.map((step) => (
        <li key={step.id} className={`production-workflow-rail__step is-${step.status}`}>
          <span className="production-workflow-rail__label">{step.label}</span>
          <span className="production-workflow-rail__description">{step.description}</span>
        </li>
      ))}
    </ol>
  );
}
