// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreatorBackupPanel } from '../../src/components/CreatorBackupPanel';

vi.mock('@open-design/host', () => ({
  restoreCreatorBackup: vi.fn(),
  isCreatorBackupRestoreAvailable: vi.fn(() => true),
}));

import { isCreatorBackupRestoreAvailable, restoreCreatorBackup } from '@open-design/host';

const projects = [{ id: 'project-1', name: 'Demo Project' }];

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function backupSummary(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    id: 'creator-backup:abc',
    createdAt: '2026-07-17T10:00:00.000Z',
    profile: 'full',
    projectIds: ['project-1'],
    fileCount: 5,
    totalSize: 2048,
    status: 'ready',
    validated: false,
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CreatorBackupPanel', () => {
  it('shows an empty state when the project has no backups', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { backups: [] }));
    render(<CreatorBackupPanel projects={projects} />);
    expect(await screen.findByText('No backups for this project yet.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/creator-backups');
  });

  it('lists project-scoped backups with validate and restore actions', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { backups: [backupSummary({ validated: true })] }));
    render(<CreatorBackupPanel projects={projects} />);
    expect(await screen.findByText('creator-backup:abc')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Validate backup creator-backup:abc' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore backup creator-backup:abc' })).toBeTruthy();
  });

  it('creates a backup via POST and reloads the list', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { backups: [] }))
      .mockResolvedValueOnce(
        jsonResponse(201, {
          backup: {
            schemaVersion: 1,
            id: 'creator-backup:new',
            createdAt: '2026-07-17T10:00:00.000Z',
            profile: 'full',
            projectIds: ['project-1'],
            files: [],
            fileCount: 0,
            totalSize: 0,
            status: 'ready',
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { backups: [] }));
    render(<CreatorBackupPanel projects={projects} />);
    await screen.findByText('No backups for this project yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Create backup' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/project-1/creator-backups',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('validates a backup and surfaces the result', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { backups: [backupSummary({ validated: false })] }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'creator-backup:abc', valid: true, issues: [], fileCount: 5, totalSize: 2048 }))
      .mockResolvedValueOnce(jsonResponse(200, { backups: [backupSummary({ validated: true })] }));
    render(<CreatorBackupPanel projects={projects} />);
    const validateButton = await screen.findByRole('button', { name: 'Validate backup creator-backup:abc' });
    fireEvent.click(validateButton);
    expect(await screen.findByText('Backup is valid')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/creator-backups/creator-backup%3Aabc/validate',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('restores a backup through the host bridge', async () => {
    vi.mocked(restoreCreatorBackup).mockResolvedValue({ ok: true });
    vi.stubGlobal('confirm', vi.fn(() => true));
    fetchMock.mockResolvedValue(jsonResponse(200, { backups: [backupSummary({ validated: true })] }));
    render(<CreatorBackupPanel projects={projects} />);
    const restoreButton = await screen.findByRole('button', { name: 'Restore backup creator-backup:abc' });
    fireEvent.click(restoreButton);
    await waitFor(() => expect(restoreCreatorBackup).toHaveBeenCalledWith('creator-backup:abc'));
    expect(await screen.findByText(/Restore complete/)).toBeTruthy();
  });

  it('surfaces a failed restore from the host bridge', async () => {
    vi.mocked(restoreCreatorBackup).mockResolvedValue({ ok: false, error: 'daemon not available' });
    vi.stubGlobal('confirm', vi.fn(() => true));
    fetchMock.mockResolvedValue(jsonResponse(200, { backups: [backupSummary({ validated: true })] }));
    render(<CreatorBackupPanel projects={projects} />);
    const restoreButton = await screen.findByRole('button', { name: 'Restore backup creator-backup:abc' });
    fireEvent.click(restoreButton);
    await waitFor(() => expect(restoreCreatorBackup).toHaveBeenCalledWith('creator-backup:abc'));
    expect(await screen.findByText(/daemon not available/)).toBeTruthy();
  });

  it('degrades to read-only when restore is unavailable (non-desktop / web build)', async () => {
    vi.mocked(isCreatorBackupRestoreAvailable).mockReturnValue(false);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const confirmSpy = vi.mocked(globalThis.confirm as unknown as ReturnType<typeof vi.fn>);
    fetchMock.mockResolvedValue(jsonResponse(200, { backups: [backupSummary({ validated: true })] }));
    render(<CreatorBackupPanel projects={projects} />);
    // No enabled Restore action: the button rendered is the disabled "desktop only" variant.
    const disabled = await screen.findAllByRole('button', { name: 'Restore backup creator-backup:abc (desktop only)' });
    expect(disabled.length).toBeGreaterThan(0);
    const disabledButton = disabled[0]!;
    expect(disabledButton.hasAttribute('disabled')).toBe(true);
    expect(await screen.findByText(/仅桌面应用可执行恢复/)).toBeTruthy();
    // Clicking the disabled button does nothing: no bridge call, no confirm dialog.
    fireEvent.click(disabledButton);
    expect(restoreCreatorBackup).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
