// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StoreScreenshotWorkspace } from '../../../src/features/store-screenshots/StoreScreenshotWorkspace';
import {
  completedExportJobResponse,
  completedGenerateJobResponse,
  documentResponse,
  failedJobResponse,
  queuedJobResponse,
} from './fixtures';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('StoreScreenshotWorkspace', () => {
  it('shows platform switching and the four-page gallery', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/validate')) {
        return new Response(JSON.stringify({ valid: true, issues: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(documentResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));

    render(<StoreScreenshotWorkspace projectId="project-1" aiGenerationEnabled={false} />);

    expect(await screen.findAllByTestId('store-screenshot-card')).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'App Store' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Google Play' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    await waitFor(() => {
      expect(screen.getByText('Ready to export')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Google Play' }));

    expect(screen.getByRole('tab', { name: 'Google Play' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const firstCard = screen.getAllByTestId('store-screenshot-card')[0]!;
    expect(within(firstCard).getByText('Google Play page 1')).toBeTruthy();
    expect(within(firstCard).getByTestId('store-screenshot-canvas')).toHaveStyle({
      aspectRatio: '1080 / 1920',
    });
  });

  it('disables AI generation without a provider and keeps manual editing available', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/validate')) {
        return new Response(JSON.stringify({ valid: true, issues: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(documentResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }));

    render(<StoreScreenshotWorkspace projectId="project-1" aiGenerationEnabled={false} />);

    const generate = await screen.findByRole('button', { name: 'Generate with AI' });
    expect(generate).toBeDisabled();
    expect(screen.getByText('Connect a Provider to generate with AI. You can keep editing manually.')).toBeTruthy();
    expect(screen.getAllByTestId('store-screenshot-card')[0]).toBeEnabled();
  });

  it('keeps generation pending through queued polls and prevents duplicate submits', async () => {
    vi.useFakeTimers();
    let jobPolls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/validate')) {
        return jsonResponse({ valid: true, issues: [] });
      }
      if (url.endsWith('/generate') && init?.method === 'POST') {
        return jsonResponse(queuedJobResponse('generate'), 202);
      }
      if (url.endsWith('/jobs/generate-job-1')) {
        jobPolls += 1;
        return jsonResponse(
          jobPolls === 1
            ? queuedJobResponse('generate')
            : completedGenerateJobResponse,
        );
      }
      return jsonResponse(documentResponse);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<StoreScreenshotWorkspace projectId="project-1" aiGenerationEnabled />);
    await act(async () => {
      await Promise.resolve();
    });
    const generate = screen.getByRole('button', { name: 'Generate with AI' });

    fireEvent.click(generate);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Generating…' }));
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/generate'))).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByText('Generation complete. Ready for preview.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generate with AI' })).toBeEnabled();
  });

  it('opens AI output in ChangeSet review and applies only after confirmation', async () => {
    const completed = structuredClone(completedGenerateJobResponse);
    if (completed.job.type !== 'generate' || completed.job.status !== 'done') {
      throw new Error('Expected completed generate fixture');
    }
    if (!('preview' in completed.job.result!)) {
      throw new Error('Expected a generation job result');
    }
    completed.job.result.preview = {
      changeSet: {
        baseVersion: 1,
        operations: [{
          op: 'setText',
          pageId: 'page-1',
          field: 'headline',
          value: 'AI reviewed headline',
        }],
      },
      affectedPageIds: ['page-1'],
    };
    const applied = structuredClone(documentResponse);
    applied.document.version = 2;
    applied.document.pages[0]!.headline = 'AI reviewed headline';
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/validate')) return jsonResponse({ valid: true, issues: [] });
      if (url.endsWith('/generate') && init?.method === 'POST') {
        return jsonResponse(queuedJobResponse('generate'), 202);
      }
      if (url.endsWith('/jobs/generate-job-1')) return jsonResponse(completed);
      if (url.endsWith('/changes/apply')) return jsonResponse(applied);
      if (url.endsWith('/versions')) return jsonResponse({ versions: [] });
      return jsonResponse(documentResponse);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<StoreScreenshotWorkspace projectId="project-1" aiGenerationEnabled />);
    await screen.findAllByTestId('store-screenshot-card');
    fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));

    expect(await screen.findByRole(
      'dialog',
      { name: 'Review changes' },
      { timeout: 2_000 },
    )).toBeTruthy();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/changes/apply'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => (
        String(input).endsWith('/changes/apply')
      ))).toBe(true);
      expect(screen.getAllByText('AI reviewed headline').length).toBeGreaterThan(0);
    });
  });

  it('routes page add, duplicate, delete, order, and lock operations through preview', async () => {
    const previewedOperations: unknown[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/validate')) return jsonResponse({ valid: true, issues: [] });
      if (url.endsWith('/versions')) return jsonResponse({ versions: [] });
      if (url.endsWith('/changes/preview') && init?.body) {
        const changeSet = JSON.parse(String(init.body)) as {
          operations: unknown[];
        };
        previewedOperations.push(changeSet.operations[0]);
        const operation = changeSet.operations[0] as {
          op: string;
          pageId?: string;
          page?: { id: string };
        };
        return jsonResponse({
          changeSet,
          affectedPageIds: [operation.pageId ?? operation.page?.id],
        });
      }
      return jsonResponse(documentResponse);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<StoreScreenshotWorkspace projectId="project-1" />);
    await screen.findAllByTestId('store-screenshot-card');

    for (const action of [
      'Add page',
      'Duplicate page',
      'Move page right',
      'Lock page',
      'Delete page',
    ]) {
      fireEvent.click(screen.getByRole('button', { name: action }));
      await screen.findByRole('dialog', { name: 'Review changes' });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    }

    expect(previewedOperations.map((operation) => (
      (operation as { op: string }).op
    ))).toEqual([
      'insertPage',
      'duplicatePage',
      'movePage',
      'setLocks',
      'deletePage',
    ]);
    expect(fetchMock.mock.calls.filter(([input]) => (
      String(input).endsWith('/changes/apply')
    ))).toHaveLength(0);
  });

  it('prevents duplicate generation while the start request is unresolved', async () => {
    let resolveGeneration!: (response: Response) => void;
    const generationResponse = new Promise<Response>((resolve) => {
      resolveGeneration = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/validate')) {
        return jsonResponse({ valid: true, issues: [] });
      }
      if (url.endsWith('/generate') && init?.method === 'POST') {
        return generationResponse;
      }
      return jsonResponse(documentResponse);
    });
    vi.stubGlobal('fetch', fetchMock);

    const rendered = render(
      <StoreScreenshotWorkspace projectId="project-1" aiGenerationEnabled />,
    );
    await screen.findAllByTestId('store-screenshot-card');
    fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));
    await act(async () => {
      await Promise.resolve();
    });

    const pendingButton = screen.getByRole('button', { name: 'Generating…' });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(fetchMock.mock.calls.filter(([input]) => (
      String(input).endsWith('/generate')
    ))).toHaveLength(1);

    await act(async () => {
      resolveGeneration(jsonResponse(queuedJobResponse('generate'), 202));
      await generationResponse;
    });
    rendered.unmount();
  });

  it('recovers from a transient poll failure without losing the pending job', async () => {
    vi.useFakeTimers();
    let jobPolls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/validate')) {
        return jsonResponse({ valid: true, issues: [] });
      }
      if (url.endsWith('/generate') && init?.method === 'POST') {
        return jsonResponse(queuedJobResponse('generate'), 202);
      }
      if (url.endsWith('/jobs/generate-job-1')) {
        jobPolls += 1;
        if (jobPolls === 1) {
          return apiErrorResponse(503, 'INTERNAL_ERROR', 'poll temporarily unavailable');
        }
        return jsonResponse(completedGenerateJobResponse);
      }
      return jsonResponse(documentResponse);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<StoreScreenshotWorkspace projectId="project-1" aiGenerationEnabled />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(screen.getByText('poll temporarily unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Generating…' }));
    expect(fetchMock.mock.calls.filter(([input]) => (
      String(input).endsWith('/generate')
    ))).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(jobPolls).toBe(2);
    expect(screen.getByText('Generation complete. Ready for preview.')).toBeTruthy();
    expect(screen.queryByText('poll temporarily unavailable')).toBeNull();
  });

  it('keeps an exhausted poll job pending until the user retries its query', async () => {
    vi.useFakeTimers();
    let jobPolls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/validate')) {
        return jsonResponse({ valid: true, issues: [] });
      }
      if (url.endsWith('/generate') && init?.method === 'POST') {
        return jsonResponse(queuedJobResponse('generate'), 202);
      }
      if (url.endsWith('/jobs/generate-job-1')) {
        jobPolls += 1;
        if (jobPolls <= 3) {
          return apiErrorResponse(503, 'INTERNAL_ERROR', `poll failure ${jobPolls}`);
        }
        return jsonResponse(completedGenerateJobResponse);
      }
      return jsonResponse(documentResponse);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<StoreScreenshotWorkspace projectId="project-1" aiGenerationEnabled />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });

    expect(jobPolls).toBe(3);
    expect(screen.getByText('poll failure 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(jobPolls).toBe(3);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(jobPolls).toBe(4);
    expect(screen.getByText('Generation complete. Ready for preview.')).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([input]) => (
      String(input).endsWith('/generate')
    ))).toHaveLength(1);
  });

  it('shows a terminal job failure and clears the pending state', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/validate')) {
        return jsonResponse({ valid: true, issues: [] });
      }
      if (url.endsWith('/generate') && init?.method === 'POST') {
        return jsonResponse(queuedJobResponse('generate'), 202);
      }
      if (url.endsWith('/jobs/generate-job-1')) {
        return jsonResponse(failedJobResponse('generate'));
      }
      return jsonResponse(documentResponse);
    }));

    render(<StoreScreenshotWorkspace projectId="project-1" aiGenerationEnabled />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(screen.getByRole('alert')).toHaveTextContent('generate failed');
    expect(screen.getByRole('button', { name: 'Generate with AI' })).toBeEnabled();
  });

  it('shows a download link when an export job completes', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/validate')) {
        return jsonResponse({ valid: true, issues: [] });
      }
      if (url.endsWith('/export') && init?.method === 'POST') {
        return jsonResponse(queuedJobResponse('export'), 202);
      }
      if (url.endsWith('/jobs/export-job-1')) {
        return jsonResponse(completedExportJobResponse);
      }
      return jsonResponse(documentResponse);
    }));

    render(<StoreScreenshotWorkspace projectId="project-1" aiGenerationEnabled />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(screen.getByRole('link', { name: 'Download ZIP' })).toHaveAttribute(
      'href',
      '/api/projects/project-1/store-screenshots/jobs/export-job-1/download',
    );
  });

  it('cancels job polling when the workspace unmounts', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/validate')) {
        return jsonResponse({ valid: true, issues: [] });
      }
      if (url.endsWith('/generate') && init?.method === 'POST') {
        return jsonResponse(queuedJobResponse('generate'), 202);
      }
      return jsonResponse(documentResponse);
    });
    vi.stubGlobal('fetch', fetchMock);

    const rendered = render(
      <StoreScreenshotWorkspace projectId="project-1" aiGenerationEnabled />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));
    await act(async () => {
      await Promise.resolve();
    });
    rendered.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(fetchMock.mock.calls.some(([input]) => (
      String(input).endsWith('/jobs/generate-job-1')
    ))).toBe(false);
  });

  it('cancels a scheduled backoff retry when the workspace unmounts', async () => {
    vi.useFakeTimers();
    let jobPolls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/validate')) {
        return jsonResponse({ valid: true, issues: [] });
      }
      if (url.endsWith('/generate') && init?.method === 'POST') {
        return jsonResponse(queuedJobResponse('generate'), 202);
      }
      if (url.endsWith('/jobs/generate-job-1')) {
        jobPolls += 1;
        return apiErrorResponse(503, 'INTERNAL_ERROR', 'poll temporarily unavailable');
      }
      return jsonResponse(documentResponse);
    });
    vi.stubGlobal('fetch', fetchMock);

    const rendered = render(
      <StoreScreenshotWorkspace projectId="project-1" aiGenerationEnabled />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(jobPolls).toBe(1);

    rendered.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(jobPolls).toBe(1);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function apiErrorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status);
}
