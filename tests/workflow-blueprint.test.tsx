import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WorkflowBlueprint,
  buildReusableBlueprintPrompt,
} from '../src/components/WorkflowBlueprint';

describe('WorkflowBlueprint', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

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
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save blueprint' })).toBeInTheDocument();
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

  it('copies a reusable prompt to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(
      <WorkflowBlueprint
        metadata={{
          kind: 'prototype',
          workflowTitle: 'iOS 26 App Prototype',
          workflowCategory: 'Mobile app',
          workflowOutcome: 'Liquid Glass iPhone concept',
          workflowCheckpoints: ['Layer model'],
          workflowExportPackage: [
            {
              format: 'HTML',
              artifact: 'Interactive iPhone prototype',
              instructions: 'Ship a responsive HTML prototype.',
            },
          ],
          workflowScorecard: ['iOS fit'],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]?.[0]).toContain('Use the OneShot workflow blueprint: iOS 26 App Prototype.');
    expect(writeText.mock.calls[0]?.[0]).toContain('HTML: Interactive iPhone prototype');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('saves a reusable blueprint to local storage', async () => {
    render(
      <WorkflowBlueprint
        skillId="digital-eguide"
        designSystemId="warm-editorial"
        metadata={{
          kind: 'template',
          workflowId: 'oneshot-cover-run',
          workflowTitle: 'OneShot Cover Run',
          workflowCategory: 'Book cover production',
          workflowOutcome: 'CoverVisionOS run packet',
          workflowCheckpoints: ['Genre fit'],
          workflowScorecard: ['Print readiness'],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save blueprint' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument();
    });
    const raw = localStorage.getItem('oneshot:saved-blueprints');
    expect(raw).toBeTruthy();
    expect(raw).toContain('OneShot Cover Run');
    expect(raw).toContain('digital-eguide');
    expect(raw).toContain('warm-editorial');
  });

  it('formats handoff metadata into reusable prompt text', () => {
    const prompt = buildReusableBlueprintPrompt({
      kind: 'template',
      workflowTitle: 'OneShot Cover Run',
      workflowCategory: 'Book cover production',
      workflowOutcome: 'CoverVisionOS run packet',
      workflowCheckpoints: ['Genre fit'],
      workflowScorecard: ['Print readiness'],
      workflowHandoff: {
        system: 'CoverVisionOS',
        stages: ['Layout package'],
        artifacts: ['layout_handoff.md'],
        commands: ['layout-package'],
      },
    });

    expect(prompt).toContain('Workflow context: Book cover production - CoverVisionOS run packet.');
    expect(prompt).toContain('Handoff system: CoverVisionOS.');
    expect(prompt).toContain('- layout_handoff.md');
    expect(prompt).toContain('- layout-package');
  });
});
