// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreScreenshotChangeSet } from '@launch-studio/store-screenshot';

import { ChangeSetReview } from '../../../src/features/store-screenshots/ChangeSetReview';
import { VersionHistory } from '../../../src/features/store-screenshots/VersionHistory';
import { documentResponse } from './fixtures';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ChangeSetReview', () => {
  it('shows before and after pages and never applies before confirmation', async () => {
    const changeSet = headlineChangeSet();
    const appliedDocument = structuredClone(documentResponse);
    appliedDocument.document.version = 2;
    appliedDocument.document.pages[0]!.headline = 'Focus faster';
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(appliedDocument));
    vi.stubGlobal('fetch', fetchMock);
    const onApplied = vi.fn();

    render(
      <ChangeSetReview
        projectId="project-1"
        document={documentResponse.document}
        changeSet={changeSet}
        affectedPageIds={['page-1']}
        onApplied={onApplied}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Page 1 before')).toBeTruthy();
    expect(screen.getByText('Page 1 after')).toBeTruthy();
    expect(screen.getByText('Page 1')).toBeTruthy();
    expect(screen.getByText('Focus faster')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(appliedDocument.document));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/store-screenshots/changes/apply',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(changeSet),
      }),
    );
  });

  it('cancels without applying', () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const onCancel = vi.fn();

    render(
      <ChangeSetReview
        projectId="project-1"
        document={documentResponse.document}
        changeSet={headlineChangeSet()}
        affectedPageIds={['page-1']}
        onApplied={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows locked AI operations as unchanged and prevents a no-op apply', () => {
    const document = structuredClone(documentResponse.document);
    document.pages[0]!.lockedFields = ['headline'];
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ChangeSetReview
        projectId="project-1"
        document={document}
        changeSet={headlineChangeSet()}
        affectedPageIds={['page-1']}
        onApplied={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Locked fields were preserved.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('VersionHistory', () => {
  it('requires explicit confirmation before restoring and refreshes with the restored document', async () => {
    const restored = structuredClone(documentResponse);
    restored.document.version = 3;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).endsWith('/versions') && !init) {
        return jsonResponse({
          versions: [
            { version: 3, source: 'manual', createdAt: 1_722_211_200_000 },
            { version: 1, source: 'template', createdAt: 1_722_124_800_000 },
          ],
        });
      }
      return jsonResponse(restored);
    });
    vi.stubGlobal('fetch', fetchMock);
    const onRestored = vi.fn();

    render(
      <VersionHistory
        projectId="project-1"
        currentVersion={3}
        onRestored={onRestored}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Restore version 1' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Restore version' }));

    await waitFor(() => expect(onRestored).toHaveBeenCalledWith(restored.document));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/projects/project-1/store-screenshots/versions/1/restore',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ version: 1 }),
      }),
    );
  });
});

function headlineChangeSet(): StoreScreenshotChangeSet {
  return {
    baseVersion: 1,
    operations: [{
      op: 'setText',
      pageId: 'page-1',
      field: 'headline',
      value: 'Focus faster',
    }],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
