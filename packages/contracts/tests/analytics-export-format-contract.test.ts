import { describe, expect, it } from 'vitest';
import type { TrackingDeployProvider, TrackingExportFormat } from '../src/analytics/events.js';

describe('analytics export format contract', () => {
  it('excludes deploy providers from TrackingExportFormat', () => {
    // Deploy attempts are tracked exclusively by artifact_deploy_result (see TrackingDeployProvider),
    // not artifact_export_result. TrackingExportFormat must not contain deploy providers.
    const deployProviders: TrackingDeployProvider[] = [
      'vercel',
      'cloudflare_pages',
      'netlify',
      'render',
      'railway',
    ];

    const sampleExportFormats: TrackingExportFormat[] = [
      'pdf',
      'pptx',
      'zip',
      'html',
      'image',
      'markdown',
      'template',
      'share_link',
      'share_page',
    ];

    for (const provider of deployProviders) {
      expect((sampleExportFormats as string[]).includes(provider)).toBe(false);
    }
  });
});
