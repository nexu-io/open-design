import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  automationTemplateIdFromRoutinePrompt,
  ingestRoutineConnectorEvolution,
} from '../src/automation-routine-evolution.js';
import { listAutomationSourcePackets } from '../src/automation-ingestions.js';

describe('automation routine evolution', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-routine-evolution-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses automation template ids from routine prompts', () => {
    expect(automationTemplateIdFromRoutinePrompt('Use Automation template "extract-design-system".')).toBe(
      'extract-design-system',
    );
    expect(automationTemplateIdFromRoutinePrompt('Plain routine prompt')).toBeNull();
  });

  it('ingests successful connector-backed routine runs into reviewable proposals', async () => {
    const result = await ingestRoutineConnectorEvolution(tempDir, {
      routine: {
        id: 'routine-1',
        name: 'Design intelligence digest',
        prompt: [
          'Use Automation template "extract-design-system".',
          'Summarize Figma and GitHub activity into reusable design guidance.',
        ].join('\n'),
      },
      runId: 'routine-run-1',
      trigger: 'scheduled',
      status: 'succeeded',
      projectId: 'proj-1',
      conversationId: 'conv-1',
      agentRunId: 'agent-run-1',
      summary: 'Found repeated card density and color-token feedback across connector updates.',
      connectorIds: ['figma', 'github', 'figma'],
      messages: [
        { role: 'user', content: 'Check connector updates.' },
        { role: 'assistant', content: 'Figma comments repeat compact controls. GitHub PRs repeat color-token drift.' },
      ],
    });

    expect(result?.packet).toMatchObject({
      sourceKind: 'connector',
      sourceRef: 'routine-run:routine-run-1',
      title: 'Design intelligence digest connector run',
      capabilityHints: ['connector:figma'],
    });
    expect(result?.packet.metadata).toMatchObject({
      routineId: 'routine-1',
      routineRunId: 'routine-run-1',
      agentRunId: 'agent-run-1',
      trigger: 'scheduled',
      connectorIds: ['figma', 'github'],
      templateId: 'extract-design-system',
    });
    expect(result?.packet.bodyMarkdown).toContain('Connectors: figma, github');
    expect(result?.packet.bodyMarkdown).toContain('Figma comments repeat compact controls.');
    expect(result?.proposals.map((proposal) => proposal.targetKind).sort()).toEqual([
      'design-system',
      'memory-node',
    ]);

    const packets = await listAutomationSourcePackets(tempDir);
    expect(packets).toHaveLength(1);
    expect(packets[0]?.id).toBe(result?.packet.id);
  });

  it('skips failed runs and routines without connector context', async () => {
    const base = {
      routine: { id: 'routine-1', name: 'Daily digest', prompt: 'Summarize activity.' },
      runId: 'routine-run-1',
      trigger: 'manual' as const,
      projectId: 'proj-1',
      conversationId: 'conv-1',
      agentRunId: 'agent-run-1',
      summary: 'No-op',
      messages: [],
    };
    await expect(ingestRoutineConnectorEvolution(tempDir, {
      ...base,
      status: 'failed',
      connectorIds: ['github'],
    })).resolves.toBeNull();
    await expect(ingestRoutineConnectorEvolution(tempDir, {
      ...base,
      status: 'succeeded',
      connectorIds: [],
    })).resolves.toBeNull();
  });
});
