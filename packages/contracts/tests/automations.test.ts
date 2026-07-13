import { describe, expect, it } from 'vitest';

import {
  exampleAutomationContentPacket,
  exampleAutomationEvolutionProposal,
  exampleAutomationSourceIngestionResponse,
  exampleAutomationTemplate,
  exampleMemoryTreeNode,
} from '../src/examples';

describe('automation self-evolution contracts', () => {
  it('represents one source packet flowing into memory and design-system proposals', () => {
    expect(exampleAutomationTemplate.outputSinks).toEqual(['design-system', 'memory']);
    expect(exampleAutomationContentPacket.candidateSinks).toEqual(['memory', 'design-system']);
    expect(exampleAutomationEvolutionProposal.sourcePacketIds).toContain(exampleAutomationContentPacket.id);
    expect(exampleMemoryTreeNode.sourcePacketIds).toContain(exampleAutomationContentPacket.id);
    expect(exampleMemoryTreeNode.proposalIds).toContain(exampleAutomationEvolutionProposal.id);
  });

  it('keeps review and compression explicit before a proposal can be applied', () => {
    expect(exampleAutomationTemplate.reviewPolicy).toBe('always');
    expect(exampleAutomationTemplate.tokenCompression).toBe('balanced');
    expect(exampleAutomationEvolutionProposal.status).toBe('pending-review');
    expect(exampleAutomationEvolutionProposal.compressionReport).toMatchObject({
      mode: 'balanced',
      status: 'applied',
      preservedSourcePacketId: exampleAutomationContentPacket.id,
    });
  });

  it('models fast ingestion as packet plus generated proposals', () => {
    expect(exampleAutomationSourceIngestionResponse.packet.id).toBe(
      exampleAutomationContentPacket.id,
    );
    expect(exampleAutomationSourceIngestionResponse.proposals[0]?.sourcePacketIds).toContain(
      exampleAutomationContentPacket.id,
    );
  });
});
