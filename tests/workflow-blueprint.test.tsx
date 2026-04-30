import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkflowBlueprint } from '../src/components/WorkflowBlueprint';

describe('WorkflowBlueprint', () => {
  afterEach(() => cleanup());

  it('renders reusable workflow metadata for launched OneShot projects', () => {
    render(
      <WorkflowBlueprint
        metadata={{
          kind: 'template',
          workflowTitle: 'OneShot Cover Run',
          workflowCheckpoints: ['Genre fit', 'Art direction', 'Typography', 'Print specs'],
          workflowExportPackage: [
            {
              format: 'Markdown',
              artifact: 'CoverVisionOS run packet',
              instructions: 'Capture intake and QA.',
            },
            {
              format: 'PDF',
              artifact: 'Production review packet',
              instructions: 'Prepare review packet.',
            },
          ],
          workflowScorecard: ['Genre signal', 'Print readiness'],
          workflowHandoff: {
            system: 'CoverVisionOS',
            stages: ['Layout package', 'Production specs', 'Generation preflight'],
            artifacts: ['layout_handoff.md'],
            commands: ['layout-package', 'preflight'],
          },
        }}
      />,
    );

    expect(screen.getByLabelText('Reusable workflow blueprint')).toBeInTheDocument();
    expect(screen.getByText('Reusable blueprint')).toBeInTheDocument();
    expect(screen.getByText('OneShot Cover Run')).toBeInTheDocument();
    expect(screen.getByText('Genre fit')).toBeInTheDocument();
    expect(screen.getByText('Markdown')).toBeInTheDocument();
    expect(screen.getByText('Genre signal')).toBeInTheDocument();
    expect(screen.getByText('CoverVisionOS')).toBeInTheDocument();
    expect(screen.getByText('layout-package')).toBeInTheDocument();
  });

  it('stays hidden when a project has no workflow identity', () => {
    const { container } = render(<WorkflowBlueprint metadata={{ kind: 'other' }} />);

    expect(container).toBeEmptyDOMElement();
  });
});
