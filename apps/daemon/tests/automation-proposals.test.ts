import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applyAutomationProposal,
  createAutomationProposal,
  listAutomationProposals,
  rejectAutomationProposal,
} from '../src/automation-proposals.js';
import { listAllAutomationTemplates } from '../src/automation-templates.js';
import { listDesignSystems } from '../src/design-systems/index.js';
import { readMemoryEntry } from '../src/memory.js';
import { listSkills } from '../src/skills.js';

let dataDir = '';

beforeEach(async () => {
  dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-automation-proposals-'));
});

afterEach(async () => {
  await fsp.rm(dataDir, { recursive: true, force: true });
});

describe('automation evolution proposals', () => {
  it('creates a reviewable memory proposal and applies it into the memory store', async () => {
    const proposal = await createAutomationProposal(dataDir, {
      id: 'proposal-memory-1',
      title: 'Project memory from connector digest',
      summary: 'Preserve a durable project decision found by an automation.',
      targetKind: 'memory-node',
      action: 'create',
      sourcePacketIds: ['packet-1'],
      patch: {
        format: 'json',
        after: JSON.stringify({
          name: 'Connector decision',
          description: 'Decision captured from connector activity',
          type: 'project',
          body: '- Decision: keep design-system extraction behind review.',
        }),
      },
      metadata: { memoryType: 'project' },
    });

    expect(proposal.status).toBe('pending-review');

    const applied = await applyAutomationProposal(dataDir, proposal.id);

    expect(applied.proposal.status).toBe('applied');
    expect(applied.result).toMatchObject({ action: 'create' });

    const memoryId = (applied.result as { memoryId: string }).memoryId;
    const entry = await readMemoryEntry(dataDir, memoryId);
    expect(entry).toMatchObject({
      name: 'Connector decision',
      type: 'project',
    });
    expect(entry?.body).toContain('keep design-system extraction behind review');
  });

  it('rejects a pending proposal without applying it', async () => {
    const proposal = await createAutomationProposal(dataDir, {
      id: 'proposal-reject-1',
      title: 'Unwanted memory',
      summary: 'This should stay review-only.',
      targetKind: 'memory-node',
      action: 'create',
      patch: {
        format: 'markdown',
        after: '- Avoid applying this proposal.',
      },
    });

    const rejected = await rejectAutomationProposal(dataDir, proposal.id, 'not durable');

    expect(rejected.status).toBe('rejected');
    expect(rejected.metadata).toMatchObject({ rejectedReason: 'not durable' });
    expect(await listAutomationProposals(dataDir, { status: 'pending-review' })).toEqual([]);
  });

  it('applies design-system proposals into the user design-system root', async () => {
    const proposal = await createAutomationProposal(dataDir, {
      id: 'proposal-design-system-1',
      title: 'Draft design system',
      summary: 'Create a user design-system draft.',
      targetKind: 'design-system',
      action: 'create',
      targetRef: 'design-systems/acme/DESIGN.md',
      patch: {
        format: 'markdown',
        after: '# Acme Design System\n\n> Category: Self-evolved\n',
      },
    });

    const applied = await applyAutomationProposal(dataDir, proposal.id);

    expect(applied.result).toMatchObject({
      designSystemId: 'acme',
      path: 'design-systems/acme/DESIGN.md',
    });
    await expect(
      fsp.readFile(path.join(dataDir, 'design-systems', 'acme', 'DESIGN.md'), 'utf8'),
    ).resolves.toContain('Acme Design System');
    await expect(listDesignSystems(path.join(dataDir, 'design-systems'))).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'acme' })]),
    );
  });

  it('applies skill proposals into the user skill root', async () => {
    const proposal = await createAutomationProposal(dataDir, {
      id: 'proposal-skill-1',
      title: 'Draft reusable skill',
      summary: 'Create a user skill draft.',
      targetKind: 'skill',
      action: 'create',
      targetRef: 'skills/reusable-flow/SKILL.md',
      patch: {
        format: 'markdown',
        after: [
          '---',
          'name: "Reusable Flow"',
          'description: "Captured workflow"',
          '---',
          '',
          '# Reusable Flow',
        ].join('\n'),
      },
    });

    const applied = await applyAutomationProposal(dataDir, proposal.id);

    expect(applied.result).toMatchObject({
      skillSlug: 'reusable-flow',
      path: 'skills/reusable-flow/SKILL.md',
    });
    await expect(
      fsp.readFile(path.join(dataDir, 'skills', 'reusable-flow', 'SKILL.md'), 'utf8'),
    ).resolves.toContain('Reusable Flow');
    await expect(listSkills(path.join(dataDir, 'skills'))).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'Reusable Flow' })]),
    );
  });

  it('applies automation-template proposals into the user template store', async () => {
    const proposal = await createAutomationProposal(dataDir, {
      id: 'proposal-template-1',
      title: 'Draft automation template',
      summary: 'Create a user automation template.',
      targetKind: 'automation-template',
      action: 'create',
      patch: {
        format: 'json',
        after: JSON.stringify({
          id: 'daily-context',
          title: 'Daily context digest',
          description: 'Turn one trusted source into context proposals every day.',
          purpose: 'Self-evolve project context from recurring source material.',
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
        }),
      },
    });

    const applied = await applyAutomationProposal(dataDir, proposal.id);

    expect(applied.result).toMatchObject({
      automationTemplateId: 'daily-context',
      path: 'automation-templates/daily-context.json',
    });
    await expect(listAllAutomationTemplates(dataDir)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'daily-context' })]),
    );
  });

  it('guards built-in automation templates from proposal overwrite', async () => {
    const proposal = await createAutomationProposal(dataDir, {
      id: 'proposal-template-built-in-1',
      title: 'Overwrite built-in template',
      summary: 'This should remain protected.',
      targetKind: 'automation-template',
      action: 'update',
      patch: {
        format: 'json',
        after: JSON.stringify({
          id: 'extract-design-system',
          title: 'Changed',
          description: 'Changed',
          purpose: 'Changed',
          triggerKinds: ['manual'],
          sourceKinds: ['chat'],
          stages: [{ id: 'propose', kind: 'propose', title: 'Propose' }],
          outputSinks: ['memory'],
          reviewPolicy: 'always',
          tokenCompression: 'off',
        }),
      },
    });

    await expect(applyAutomationProposal(dataDir, proposal.id)).rejects.toThrow(
      'cannot overwrite built-in automation template',
    );
  });
});
