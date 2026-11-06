import { describe, expect, it } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  getAutomationTemplate,
  listAllAutomationTemplates,
  listAutomationTemplates,
  upsertUserAutomationTemplate,
} from '../src/automation-templates.js';

describe('automation templates catalog', () => {
  it('exposes self-evolution templates for memory, design systems, skills, connectors, and compression', () => {
    const templates = listAutomationTemplates();
    const ids = templates.map((template) => template.id);

    expect(ids).toEqual(expect.arrayContaining([
      'ingest-source-memory-tree',
      'extract-design-system',
      'crystallize-run-into-skill',
      'connector-digest-design-context',
      'compress-project-context',
      'promote-artifact-style',
    ]));

    expect(templates.some((template) => template.outputSinks.includes('memory'))).toBe(true);
    expect(templates.some((template) => template.outputSinks.includes('design-system'))).toBe(true);
    expect(templates.some((template) => template.outputSinks.includes('skill'))).toBe(true);
    expect(templates.some((template) => template.sourceKinds.includes('connector'))).toBe(true);
    expect(templates.some((template) => template.tokenCompression === 'aggressive')).toBe(true);
  });

  it('fetches one template by id', () => {
    expect(getAutomationTemplate('extract-design-system')).toMatchObject({
      id: 'extract-design-system',
      outputSinks: ['design-system', 'memory'],
      reviewPolicy: 'always',
      tokenCompression: 'balanced',
    });
    expect(getAutomationTemplate('missing')).toBeNull();
  });

  it('includes reviewed user templates after proposal apply', async () => {
    const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-automation-templates-'));
    try {
      await upsertUserAutomationTemplate(dataDir, {
        id: 'reviewed-context-digest',
        title: 'Reviewed context digest',
        description: 'A reviewed automation template persisted under runtime data.',
        purpose: 'Let accepted automation patterns become reusable templates.',
        triggerKinds: ['schedule'],
        sourceKinds: ['connector'],
        stages: [
          { id: 'ingest', kind: 'ingest', title: 'Capture source' },
          { id: 'propose', kind: 'propose', title: 'Create proposals' },
        ],
        outputSinks: ['memory', 'automation-template'],
        reviewPolicy: 'always',
        tokenCompression: 'balanced',
        tags: ['self-evolution'],
      });

      await expect(listAllAutomationTemplates(dataDir)).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'reviewed-context-digest' })]),
      );
    } finally {
      await fsp.rm(dataDir, { recursive: true, force: true });
    }
  });
});
