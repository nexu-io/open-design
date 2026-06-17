// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AutomationEvolutionProposal,
  AutomationTemplate as ContractAutomationTemplate,
} from '@open-design/contracts';

import { TasksView } from '../../src/components/TasksView';

const originalFetch = globalThis.fetch;

const daemonTemplate: ContractAutomationTemplate = {
  id: 'extract-design-system',
  title: 'Extract design system',
  description: 'Draft a DESIGN.md from brand docs, screenshots, repos, connectors, websites, or strong artifacts.',
  purpose: 'Make the design-system tree evolve from real source material and successful outputs.',
  triggerKinds: ['manual', 'connector', 'project-event'],
  sourceKinds: ['upload', 'url', 'repo', 'connector', 'artifact'],
  stages: [
    { id: 'ingest', kind: 'ingest', title: 'Capture design source' },
    { id: 'compress', kind: 'compress', title: 'Compact source context' },
    { id: 'agent-run', kind: 'agent-run', title: 'Draft DESIGN.md' },
    { id: 'propose', kind: 'propose', title: 'Create design-system proposal' },
  ],
  outputSinks: ['design-system', 'memory'],
  reviewPolicy: 'always',
  tokenCompression: 'balanced',
  tags: ['design-system', 'self-evolution'],
};

const memoryProposal: AutomationEvolutionProposal = {
  id: 'proposal-memory-1',
  title: 'Project memory from connector digest',
  summary: 'Preserve a durable project decision found by an automation.',
  targetKind: 'memory-node',
  action: 'create',
  status: 'pending-review',
  reviewPolicy: 'always',
  createdAt: '2026-05-18T00:00:00.000Z',
  updatedAt: '2026-05-18T00:00:00.000Z',
  sourcePacketIds: ['packet-1'],
  patch: {
    format: 'markdown',
    after: '- Decision: keep design-system extraction behind review.',
    diffSummary: 'Adds one project memory node.',
  },
};

describe('TasksView automation templates', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows daemon automation templates and seeds the create modal', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ templates: [daemonTemplate] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/plugins' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ plugins: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/mcp/servers' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ servers: [], templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<TasksView />);

    const templateCard = await screen.findByRole('button', { name: /Extract design system/i });
    fireEvent.click(templateCard);

    await waitFor(() => {
      expect((screen.getByLabelText('Automation title') as HTMLInputElement).value).toBe(
        'Extract design system',
      );
    });
    const prompt = screen.getByTestId('automation-modal-prompt') as HTMLTextAreaElement;
    expect(prompt.value).toContain('Use Automation template "extract-design-system".');
    expect(prompt.value).toContain('Outputs: design-system, memory.');
  });

  it('shows pending evolution proposals and applies them through the review gate', async () => {
    let proposals = [memoryProposal];
    const applyCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-proposals?status=pending-review' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ proposals }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-proposals/proposal-memory-1/apply' && init?.method === 'POST') {
        applyCalls.push(url);
        proposals = [];
        return new Response(JSON.stringify({
          proposal: { ...memoryProposal, status: 'applied' },
          result: { memoryId: 'project_connector_decision' },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<TasksView />);

    expect(await screen.findByText('Evolution proposals')).toBeTruthy();
    expect(screen.getByText('Project memory from connector digest')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Apply/i }));

    await waitFor(() => {
      expect(applyCalls).toEqual(['/api/automation-proposals/proposal-memory-1/apply']);
      expect(screen.queryByText('Project memory from connector digest')).toBeNull();
    });
  });

  it('crystallizes a successful automation run into reviewable proposals', async () => {
    const crystallizeCalls: string[] = [];
    let proposals: AutomationEvolutionProposal[] = [];
    let packets = [] as Array<{
      id: string;
      sourceKind: string;
      title: string;
      capturedAt: string;
      tokenStats: { originalTokens: number };
    }>;
    const routine = {
      id: 'routine-1',
      name: 'Artifact polish loop',
      prompt: 'Review generated artifacts and extract durable layout guidance.',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      context: {},
      enabled: true,
      nextRunAt: null,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const run = {
      id: 'run-succeeded-1',
      routineId: 'routine-1',
      trigger: 'manual',
      status: 'succeeded',
      projectId: 'proj-1',
      conversationId: 'conv-1',
      agentRunId: 'agent-run-1',
      startedAt: Date.now() - 1_000,
      completedAt: Date.now(),
      summary: 'Promote compact controls and repeatable QA steps.',
      error: null,
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines: [routine] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-proposals?status=pending-review' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ proposals }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-source-packets?limit=3' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ packets }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1/runs?limit=10' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ runs: [run] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (
        url === '/api/routines/routine-1/runs/run-succeeded-1/crystallize' &&
        init?.method === 'POST'
      ) {
        crystallizeCalls.push(url);
        const packet = {
          id: 'packet-run-1',
          sourceKind: 'chat',
          sourceRef: 'routine-run:run-succeeded-1',
          title: 'Artifact polish loop run',
          capturedAt: '2026-05-18T00:00:00.000Z',
          bodyMarkdown: 'Promote compact controls and repeatable QA steps.',
          provenance: [],
          attachments: [],
          sensitivity: 'workspace',
          capabilityHints: [],
          tokenStats: { originalTokens: 12 },
          candidateSinks: ['skill', 'memory'],
        };
        proposals = [{
          ...memoryProposal,
          id: 'proposal-skill-1',
          title: 'Skill: Artifact polish loop run',
          targetKind: 'skill',
          sourcePacketIds: ['packet-run-1'],
        }];
        packets = [packet];
        return new Response(JSON.stringify({
          routineId: 'routine-1',
          runId: 'run-succeeded-1',
          packet,
          compressionReport: {
            mode: 'balanced',
            status: 'skipped',
            beforeTokens: 12,
            afterTokens: 12,
            summary: 'Already compact',
            preservedSourcePacketId: 'packet-run-1',
          },
          proposals,
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<TasksView />);

    fireEvent.click(await screen.findByRole('button', { name: /History/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Crystallize/i }));

    await waitFor(() => {
      expect(crystallizeCalls).toEqual([
        '/api/routines/routine-1/runs/run-succeeded-1/crystallize',
      ]);
      expect(screen.getByText('Skill: Artifact polish loop run')).toBeTruthy();
    });
  });

  it('keeps crystallize proposals visible when the follow-up proposal refresh fails', async () => {
    let proposalRefreshes = 0;
    const routine = {
      id: 'routine-1',
      name: 'Artifact polish loop',
      prompt: 'Review generated artifacts and extract durable layout guidance.',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      context: {},
      enabled: true,
      nextRunAt: null,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const run = {
      id: 'run-succeeded-1',
      routineId: 'routine-1',
      trigger: 'manual',
      status: 'succeeded',
      projectId: 'proj-1',
      conversationId: 'conv-1',
      agentRunId: 'agent-run-1',
      startedAt: Date.now() - 1_000,
      completedAt: Date.now(),
      summary: 'Promote compact controls and repeatable QA steps.',
      error: null,
    };
    const crystallizedProposal = {
      ...memoryProposal,
      id: 'proposal-skill-1',
      title: 'Skill: Artifact polish loop run',
      targetKind: 'skill' as const,
      sourcePacketIds: ['packet-run-1'],
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines: [routine] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-proposals?status=pending-review' && (!init || init.method === undefined)) {
        proposalRefreshes += 1;
        if (proposalRefreshes > 1) {
          throw new TypeError('Failed to fetch');
        }
        return new Response(JSON.stringify({ proposals: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1/runs?limit=10' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ runs: [run] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (
        url === '/api/routines/routine-1/runs/run-succeeded-1/crystallize' &&
        init?.method === 'POST'
      ) {
        return new Response(JSON.stringify({
          routineId: 'routine-1',
          runId: 'run-succeeded-1',
          packet: {
            id: 'packet-run-1',
            sourceKind: 'chat',
            sourceRef: 'routine-run:run-succeeded-1',
            title: 'Artifact polish loop run',
            capturedAt: '2026-05-18T00:00:00.000Z',
            bodyMarkdown: 'Promote compact controls and repeatable QA steps.',
            provenance: [],
            attachments: [],
            sensitivity: 'workspace',
            capabilityHints: [],
            tokenStats: { originalTokens: 12 },
            candidateSinks: ['skill', 'memory'],
          },
          compressionReport: {
            mode: 'balanced',
            status: 'skipped',
            beforeTokens: 12,
            afterTokens: 12,
            summary: 'Already compact',
            preservedSourcePacketId: 'packet-run-1',
          },
          proposals: [crystallizedProposal],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<TasksView />);

    fireEvent.click(await screen.findByRole('button', { name: /History/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Crystallize/i }));

    expect(await screen.findByText('Skill: Artifact polish loop run')).toBeTruthy();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Crystallize created proposals, but Automations could not refresh the proposal list.',
    );
  });

  it('surfaces crystallize transport failures', async () => {
    const routine = {
      id: 'routine-1',
      name: 'Artifact polish loop',
      prompt: 'Review generated artifacts and extract durable layout guidance.',
      schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
      target: { mode: 'create_each_run' },
      skillId: null,
      agentId: null,
      context: {},
      enabled: true,
      nextRunAt: null,
      lastRun: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const run = {
      id: 'run-succeeded-1',
      routineId: 'routine-1',
      trigger: 'manual',
      status: 'succeeded',
      projectId: 'proj-1',
      conversationId: 'conv-1',
      agentRunId: 'agent-run-1',
      startedAt: Date.now() - 1_000,
      completedAt: Date.now(),
      summary: 'Promote compact controls and repeatable QA steps.',
      error: null,
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === '/api/routines' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ routines: [routine] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/projects' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ projects: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/automation-proposals?status=pending-review' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ proposals: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/routines/routine-1/runs?limit=10' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ runs: [run] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (
        url === '/api/routines/routine-1/runs/run-succeeded-1/crystallize' &&
        init?.method === 'POST'
      ) {
        throw new TypeError('Failed to fetch');
      }
      return new Response(JSON.stringify({}), { status: 404 });
    }) as typeof fetch;

    render(<TasksView />);

    fireEvent.click(await screen.findByRole('button', { name: /History/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Crystallize/i }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Crystallize failed: Failed to fetch',
    );
  });
});
