import { describe, expect, it } from 'vitest';
import type { ProjectFileVersion } from '@open-design/contracts';

import {
  artifactExportOriginProps,
  artifactVersionContentDigest,
  matchingArtifactVersionId,
} from '../../src/artifacts/version-origin';

function version(overrides: Partial<ProjectFileVersion> = {}): ProjectFileVersion {
  return {
    id: 'version-1',
    fileName: 'index.html',
    version: 1,
    label: 'Version 1',
    createdAt: 1,
    source: 'ai',
    prompt: null,
    size: 1,
    mime: 'text/html; charset=utf-8',
    kind: 'html',
    current: true,
    ...overrides,
  };
}

describe('artifact export version origin', () => {
  it('emits matched Plugin origin only when the exact UTF-8 digest agrees', async () => {
    const content = '<html><body>你好 Open Design</body></html>';
    const contentDigest = await artifactVersionContentDigest(content);
    await expect(artifactExportOriginProps(content, version({
      contentDigest,
      origin: {
        entrySurface: 'external_mcp',
        externalPluginId: 'open-design',
        pluginWorkflowId: 'workflow-1',
        runId: 'run-1',
      },
    }))).resolves.toEqual({
      entry_surface: 'open_design_ui',
      artifact_origin_status: 'matched',
      artifact_version_id: 'version-1',
      origin_entry_surface: 'external_mcp',
      origin_external_plugin_id: 'open-design',
      origin_plugin_workflow_id: 'workflow-1',
      origin_run_id: 'run-1',
    });
  });

  it('does not attach origin when current bytes drift from the selected version', async () => {
    const contentDigest = await artifactVersionContentDigest('<html>before</html>');
    await expect(artifactExportOriginProps('<html>after</html>', version({
      contentDigest,
      origin: {
        entrySurface: 'external_mcp',
        externalPluginId: 'open-design',
        pluginWorkflowId: 'workflow-1',
        runId: 'run-1',
      },
    }))).resolves.toEqual({
      entry_surface: 'open_design_ui',
      artifact_origin_status: 'digest_mismatch',
      origin_entry_surface: 'unknown',
    });
  });

  it('keeps v1 and invalid origins explicitly unknown', async () => {
    await expect(artifactExportOriginProps('<html>legacy</html>', version())).resolves.toEqual({
      entry_surface: 'open_design_ui',
      artifact_origin_status: 'unknown',
      origin_entry_surface: 'unknown',
    });

    const content = '<html>unsafe</html>';
    const contentDigest = await artifactVersionContentDigest(content);
    await expect(artifactExportOriginProps(content, version({
      contentDigest,
      origin: {
        entrySurface: 'external_mcp',
        externalPluginId: 'third-party-plugin',
        pluginWorkflowId: 'workflow-1',
        runId: 'run-1',
      },
    }))).resolves.toEqual({
      entry_surface: 'open_design_ui',
      artifact_origin_status: 'invalid_origin',
      artifact_version_id: 'version-1',
      origin_entry_surface: 'unknown',
    });
  });

  it('reports a missing version without guessing the latest run or session', async () => {
    await expect(artifactExportOriginProps('<html>unversioned</html>', null)).resolves.toEqual({
      entry_surface: 'open_design_ui',
      artifact_origin_status: 'missing_version',
      origin_entry_surface: 'unknown',
    });
  });

  it('returns an explicit parent id only when the exact pre-edit bytes match', async () => {
    const content = '<html><body>parent bytes</body></html>';
    const contentDigest = await artifactVersionContentDigest(content);
    const parent = version({ contentDigest });

    await expect(matchingArtifactVersionId(content, parent)).resolves.toBe(parent.id);
    await expect(matchingArtifactVersionId(`${content}\n`, parent)).resolves.toBeUndefined();
    await expect(matchingArtifactVersionId(content, version())).resolves.toBeUndefined();
  });
});
