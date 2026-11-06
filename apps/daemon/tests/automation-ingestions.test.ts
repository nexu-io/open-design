import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getAutomationSourcePacket,
  ingestAutomationSource,
  listAutomationSourcePackets,
} from '../src/automation-ingestions.js';
import {
  applyAutomationProposal,
  listAutomationProposals,
} from '../src/automation-proposals.js';
import { buildMemoryTree, readMemoryEntry } from '../src/memory.js';

let dataDir = '';

beforeEach(async () => {
  dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-automation-ingestions-'));
});

afterEach(async () => {
  await fsp.rm(dataDir, { recursive: true, force: true });
});

describe('automation source ingestion', () => {
  it('persists a connector source packet and creates an applyable memory proposal', async () => {
    const result = await ingestAutomationSource(dataDir, {
      templateId: 'connector-digest-design-context',
      sourceKind: 'connector',
      sourceRef: 'slack://C123/1710000000.000',
      connectorId: 'slack',
      accountLabel: 'Design Ops',
      title: 'Design review decision',
      bodyMarkdown: 'Decision: keep design-system extraction behind human review.',
      tokenCompression: 'off',
    });

    expect(result.packet).toMatchObject({
      sourceKind: 'connector',
      title: 'Design review decision',
      sourceRef: 'slack://C123/1710000000.000',
      candidateSinks: ['memory', 'artifact'],
    });
    expect(result.packet.capabilityHints).toEqual(['connector:slack']);
    expect(result.compressionReport).toMatchObject({
      mode: 'off',
      status: 'skipped',
      preservedSourcePacketId: result.packet.id,
    });
    expect(await getAutomationSourcePacket(dataDir, result.packet.id)).toMatchObject({
      id: result.packet.id,
    });

    const proposals = await listAutomationProposals(dataDir, { status: 'pending-review' });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      targetKind: 'memory-node',
      sourcePacketIds: [result.packet.id],
      compressionReport: {
        preservedSourcePacketId: result.packet.id,
      },
    });

    const applied = await applyAutomationProposal(dataDir, proposals[0]!.id);
    const memoryId = (applied.result as { memoryId: string }).memoryId;
    const entry = await readMemoryEntry(dataDir, memoryId);
    expect(entry?.body).toContain('keep design-system extraction behind human review');
    const tree = await buildMemoryTree(dataDir);
    expect(tree.find((node) => node.id === memoryId)).toMatchObject({
      sourcePacketIds: [result.packet.id],
      proposalIds: [proposals[0]!.id],
    });
  });

  it('uses design-system templates to draft design-system and memory proposals with compression evidence', async () => {
    const longBody = `# Brand notes\n\n${'Primary action color #335CFF. Use dense product dashboards. '.repeat(400)}`;
    const result = await ingestAutomationSource(dataDir, {
      templateId: 'extract-design-system',
      sourceKind: 'repo',
      sourceRef: 'https://github.com/acme/design',
      title: 'Acme brand notes',
      bodyMarkdown: longBody,
      tokenCompression: 'aggressive',
    });

    expect(result.compressionReport.status).toBe('applied');
    expect(result.compressionReport.afterTokens).toBeLessThan(
      result.compressionReport.beforeTokens,
    );
    expect(result.proposals.map((proposal) => proposal.targetKind).sort()).toEqual([
      'design-system',
      'memory-node',
    ]);
    expect(result.proposals.find((proposal) => proposal.targetKind === 'design-system')?.patch.after)
      .toContain('Acme brand notes Design System');

    const packets = await listAutomationSourcePackets(dataDir);
    expect(packets.map((packet) => packet.id)).toContain(result.packet.id);
  });
});
