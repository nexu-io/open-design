import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectPacketView } from '../src/components/ProjectPacketView';
import type { Project, ProjectFile } from '../src/types';

describe('ProjectPacketView', () => {
  it('surfaces Website Studio disk artifacts, review state, pins, and evidence trail', () => {
    const onOpenFile = vi.fn();
    const project: Project = {
      id: 'project-1',
      name: 'Website Studio v1',
      skillId: 'saas-landing',
      designSystemId: 'webflow',
      createdAt: 1,
      updatedAt: 2,
      metadata: {
        kind: 'prototype',
        websiteStudio: {
          intake: {
            business: 'OneShot Design',
            audience: 'Design operators',
            offer: 'Project-backed site packet',
            conversion: 'Start a build',
            sourcePath: 'C:\\references',
          },
          sitemap: ['Home'],
          selectedSectionIds: ['hero'],
          tokens: {},
          deployTarget: 'http://127.0.0.1:3004',
          deployCommandEvidence: '',
          deployVerification: {
            target: 'http://127.0.0.1:3004',
            status: 'ok',
            checkedAt: 1,
            httpStatus: 200,
            detail: 'HTTP 200 response verified.',
          },
          adapterStatus: 'verified-local',
          qualityReviews: [
            {
              id: 'visual-quality',
              title: 'Visual quality',
              status: 'blocked',
              note: 'Needs proof',
              evidence: 'Pinned note',
            },
          ],
          pins: [
            {
              id: 'pin-1',
              target: 'Artifact / site_plan.md',
              note: 'Tie source proof to this plan.',
              createdAt: 1,
            },
          ],
          evidenceStudio: {
            sourcePath: 'C:\\references',
            originals: 2,
            thumbnails: 1,
            supportingAssets: 3,
            flaggedFiles: 1,
            reviewGate: 'Review before export.',
            files: [
              {
                path: 'cover.png',
                role: 'original',
                size: 1200,
                reason: 'Image source.',
              },
            ],
            lastScanAt: 1,
            scanError: null,
          },
          updatedAt: 3,
          artifacts: {
            'site_plan.md': '# Site Plan',
            'codex_build_brief.md': '# Codex Build Brief',
            'packet_review.md': '# Packet Review',
          },
        },
      },
    };
    const files: ProjectFile[] = [
      {
        name: 'site_plan.md',
        size: 12,
        mtime: 1,
        kind: 'text',
        mime: 'text/markdown',
      },
      {
        name: 'codex_build_brief.md',
        size: 22,
        mtime: 1,
        kind: 'text',
        mime: 'text/markdown',
      },
      {
        name: 'packet_review.md',
        size: 15,
        mtime: 1,
        kind: 'text',
        mime: 'text/markdown',
      },
    ];

    render(<ProjectPacketView project={project} files={files} onOpenFile={onOpenFile} />);

    expect(screen.getByText('Project Packet')).toBeInTheDocument();
    expect(screen.getByText('verified-local')).toBeInTheDocument();
    expect(screen.getByText('site_plan.md')).toBeInTheDocument();
    expect(screen.getByLabelText('Project packet readiness summary')).toHaveTextContent('artifacts');
    expect(screen.getByText('Codex handoff')).toBeInTheDocument();
    expect(screen.getByText('Packet history')).toBeInTheDocument();
    expect(screen.getByText('Evidence files')).toBeInTheDocument();
    expect(screen.getAllByText('codex_build_brief.md').length).toBeGreaterThan(0);
    expect(screen.getAllByText('packet_review.md').length).toBeGreaterThan(0);
    expect(screen.getAllByText('blocked').length).toBeGreaterThan(0);
    expect(screen.getByText('Artifact / site_plan.md')).toBeInTheDocument();
    expect(screen.getByText('C:\\references')).toBeInTheDocument();
    expect(screen.getByText('cover.png')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /site_plan.md/i }));
    expect(onOpenFile).toHaveBeenCalledWith('site_plan.md');
    fireEvent.click(screen.getAllByRole('button', { name: /codex_build_brief.md/i })[0]!);
    expect(onOpenFile).toHaveBeenCalledWith('codex_build_brief.md');
  });
});
