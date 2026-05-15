import path from 'node:path';
import os from 'node:os';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import {
  buildOrbitPrompt,
  buildOrbitSystemPrompt,
  OrbitService,
  renderOrbitTemplateSystemPrompt,
  type OrbitRunHandler,
  type OrbitTemplateSelection,
} from '../src/orbit.js';

function formatExpectedLocalOrbitPromptTimestamp(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const timeZoneName = new Intl.DateTimeFormat(undefined, { timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}${timeZoneName ? ` (${timeZoneName})` : ''}`;
}

describe('buildOrbitPrompt', () => {
  it('keeps the user-visible Orbit prompt concise', () => {
    const template: OrbitTemplateSelection = {
      id: 'orbit-general',
      name: 'orbit-general',
      examplePrompt: 'Render the editorial bento dashboard.',
      dir: path.join('/repo', 'skills', 'orbit-general'),
      body: 'Open and mirror the shipped `example.html` before writing output. Use exclusively the canvas tokens.',
      designSystemRequired: false,
    };

    const now = new Date('2026-05-06T15:32:52.361Z');
    const start = new Date(now.getTime() - 24 * 60 * 60_000);
    const prompt = buildOrbitPrompt(now, template);

    expect(prompt).toContain('Create today\'s Orbit daily digest as a Live Artifact.');
    expect(prompt).toContain(
      `Use my connected work data from ${formatExpectedLocalOrbitPromptTimestamp(start)} through ${formatExpectedLocalOrbitPromptTimestamp(now)}.`,
    );
    expect(prompt).not.toContain('2026-05-05T15:32:52.361Z');
    expect(prompt).toContain('Use the selected Orbit template: orbit-general.');
    expect(prompt).not.toContain('DAILY DIGEST CONNECTOR CURATION IS REQUIRED WHEN SUPPORTED');
    expect(prompt).not.toContain('Selected template example prompt:');
    expect(prompt).not.toContain('Render the editorial bento dashboard.');
  });
});

describe('buildOrbitSystemPrompt', () => {
  it('embeds selected Orbit template instructions and staged side-file guidance', () => {
    const template: OrbitTemplateSelection = {
      id: 'orbit-general',
      name: 'orbit-general',
      examplePrompt: 'Render the editorial bento dashboard.',
      dir: path.join('/repo', 'skills', 'orbit-general'),
      body: 'Open and mirror the shipped `example.html` before writing output. Use exclusively the canvas tokens.',
      designSystemRequired: false,
    };

    const prompt = buildOrbitSystemPrompt(new Date('2026-05-06T15:32:52.361Z'), template);

    expect(prompt).toContain('Skill id: orbit-general');
    expect(prompt).toContain('Staged root: .od-skills/orbit-general/');
    expect(prompt).toContain('read ".od-skills/orbit-general/SKILL.md"');
    expect(prompt).toContain('".od-skills/orbit-general/example.html"');
    expect(prompt).toContain('visual/domain guidance');
    expect(prompt).not.toContain('Selected template skill instructions:');
    expect(prompt).toContain('Selected template example prompt:');
    expect(prompt).toContain('Render the editorial bento dashboard.');
  });

  it('prioritizes curated daily digest connector discovery before fallback listing', () => {
    const prompt = buildOrbitSystemPrompt(new Date('2026-05-06T15:32:52.361Z'));

    expect(prompt).toContain('DAILY DIGEST CONNECTOR CURATION IS REQUIRED WHEN SUPPORTED');
    expect(prompt).toContain('tools connectors list --use-case personal_daily_digest --format compact');
    expect(prompt).toContain('do not stop just because `--use-case` is unsupported');
  });

  it('renders the selected template skill body as authoritative run instructions', () => {
    const template: OrbitTemplateSelection = {
      id: 'orbit-general',
      name: 'orbit-general',
      examplePrompt: 'Render the editorial bento dashboard.',
      dir: path.join('/repo', 'skills', 'orbit-general'),
      body: 'Open and mirror the shipped `example.html` before writing output. Use exclusively the canvas tokens.',
      designSystemRequired: false,
    };

    const prompt = renderOrbitTemplateSystemPrompt(template);

    expect(prompt).toContain('Selected Orbit template skill — orbit-general');
    expect(prompt).toContain('Treat it as authoritative');
    expect(prompt).toContain('must not override the selected template');
    expect(prompt).toContain('opts out of external design-system injection');
    expect(prompt).toContain('Do not apply the workspace design system');
    expect(prompt).toContain('Open and mirror the shipped `example.html`');
    expect(prompt).toContain('Use exclusively the canvas tokens.');
  });
});

describe('OrbitService', () => {
  it('passes concise user prompt and detailed system prompt to the run handler', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-test-'));
    try {
      const service = new OrbitService(dataDir);
      const captured: { request?: Parameters<OrbitRunHandler>[0] } = {};
      service.setRunHandler(async (request) => {
        captured.request = request;
        return {
          projectId: 'project-1',
          agentRunId: 'agent-1',
          completion: Promise.resolve({
            agentRunId: 'agent-1',
            status: 'succeeded',
          }),
        };
      });

      await service.start('manual');

      expect(captured.request?.prompt).toContain(
        'Create today\'s Orbit daily digest as a Live Artifact.',
      );
      expect(captured.request?.prompt).not.toContain(
        'DAILY DIGEST CONNECTOR CURATION IS REQUIRED WHEN SUPPORTED',
      );
      expect(captured.request?.systemPrompt).toContain(
        'DAILY DIGEST CONNECTOR CURATION IS REQUIRED WHEN SUPPORTED',
      );
      let status = await service.status();
      for (let attempt = 0; attempt < 10 && !status.lastRun; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        status = await service.status();
      }
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('preserves the default template when config omits the field', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-test-'));
    try {
      const service = new OrbitService(dataDir);

      service.configure({ enabled: true, time: '08:00' });

      await expect(service.status()).resolves.toMatchObject({
        config: { templateSkillId: 'orbit-general' },
      });
      service.stop();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('falls back to the default time when config has an out-of-range time', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-test-'));
    try {
      const service = new OrbitService(dataDir);

      service.configure({ enabled: true, time: '24:99' });

      await expect(service.status()).resolves.toMatchObject({
        config: { time: '08:00' },
      });
      service.stop();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('treats a malformed activity summary file as missing state', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-test-'));
    try {
      await mkdir(path.join(dataDir, 'orbit'), { recursive: true });
      await writeFile(path.join(dataDir, 'orbit', 'activity-summary.json'), '{not json', 'utf8');

      const service = new OrbitService(dataDir);

      await expect(service.status()).resolves.toMatchObject({
        lastRun: null,
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('reschedules after an early scheduled start rejection', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 6, 7, 59, 0, 0));
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-test-'));
    try {
      const service = new OrbitService(dataDir);
      service.setRunHandler(async () => {
        throw new Error('agent unavailable');
      });
      service.configure({ enabled: true, time: '08:00' });
      const firstNextRunAt = (await service.status()).nextRunAt;
      expect(firstNextRunAt).not.toBeNull();

      await vi.advanceTimersByTimeAsync(Date.parse(firstNextRunAt!) - Date.now());

      const secondNextRunAt = (await service.status()).nextRunAt;
      expect(secondNextRunAt).not.toBeNull();
      expect(secondNextRunAt).not.toBe(firstNextRunAt);
      expect(Date.parse(secondNextRunAt!)).toBeGreaterThan(Date.parse(firstNextRunAt!));
      service.stop();
    } finally {
      vi.useRealTimers();
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('does not report the fired schedule time as nextRunAt while a scheduled run is in flight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 6, 7, 59, 0, 0));
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-test-'));
    try {
      const completion = new Promise<never>(() => {});
      const service = new OrbitService(dataDir);
      service.setRunHandler(async () => ({
        projectId: 'project-1',
        agentRunId: 'agent-1',
        completion,
      }));
      service.configure({ enabled: true, time: '08:00' });
      const firstNextRunAt = (await service.status()).nextRunAt;
      expect(firstNextRunAt).not.toBeNull();

      await vi.advanceTimersByTimeAsync(Date.parse(firstNextRunAt!) - Date.now());

      await expect(service.status()).resolves.toMatchObject({
        running: true,
        nextRunAt: null,
      });
      service.stop();
    } finally {
      vi.useRealTimers();
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('sets connectorsChecked to the summed connector outcomes', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-test-'));
    try {
      const service = new OrbitService(dataDir);
      service.setRunHandler(async () => ({
        projectId: 'project-1',
        agentRunId: 'agent-1',
        completion: Promise.resolve({
          agentRunId: 'agent-1',
          status: 'succeeded',
        }),
      }));

      await service.start('manual');
      let status = await service.status();
      for (let attempt = 0; attempt < 10 && !status.lastRun; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        status = await service.status();
      }

      expect(status.lastRun).not.toBeNull();
      expect(status.lastRun?.connectorsSucceeded).toBe(1);
      expect(status.lastRun?.connectorsFailed).toBe(0);
      expect(status.lastRun?.connectorsSkipped).toBe(0);
      expect(status.lastRun?.connectorsChecked).toBe(1);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('persists failed Orbit agent summaries in the last-run receipt markdown', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-test-'));
    try {
      const service = new OrbitService(dataDir);
      service.setRunHandler(async () => ({
        projectId: 'project-1',
        agentRunId: 'agent-1',
        completion: Promise.resolve({
          agentRunId: 'agent-1',
          status: 'failed',
          summary:
            'Agent succeeded but did not register a live artifact for this Orbit run.\n\nGitHub auth failed, so I did not create a daily digest artifact.',
        }),
      }));

      await service.start('manual');
      let status = await service.status();
      for (let attempt = 0; attempt < 10 && (status.running || !status.lastRun); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        status = await service.status();
      }

      expect(status.lastRun).not.toBeNull();
      expect(status.running).toBe(false);
      expect(status.lastRun?.connectorsSucceeded).toBe(0);
      expect(status.lastRun?.connectorsFailed).toBe(1);
      expect(status.lastRun?.markdown).toContain(
        'Agent succeeded but did not register a live artifact for this Orbit run.',
      );
      expect(status.lastRun?.markdown).toContain(
        'GitHub auth failed, so I did not create a daily digest artifact.',
      );
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('tracks the most recent run per template alongside the global last run', async () => {
    vi.useFakeTimers();
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-test-'));
    try {
      const service = new OrbitService(dataDir);
      let runCount = 0;
      service.setTemplateResolver(async (skillId) => ({
        id: skillId,
        name: skillId,
        examplePrompt: `${skillId} prompt`,
        dir: path.join('/repo', 'skills', skillId),
        body: `${skillId} body`,
        designSystemRequired: false,
      }));
      service.setRunHandler(async (request) => {
        runCount += 1;
        return {
          projectId: `project-${runCount}`,
          agentRunId: `agent-${runCount}`,
          completion: Promise.resolve({
            agentRunId: `agent-${runCount}`,
            status: 'succeeded',
          }),
        };
      });

      service.configure({ enabled: false, time: '08:00', templateSkillId: 'orbit-general' });
      vi.setSystemTime(new Date('2026-05-06T08:00:00.000Z'));
      await service.start('manual');
      let status = await service.status();
      for (
        let attempt = 0;
        attempt < 10 && (status.running || status.lastRunsByTemplate['orbit-general']?.agentRunId !== 'agent-1');
        attempt += 1
      ) {
        await vi.advanceTimersByTimeAsync(1);
        status = await service.status();
      }

      service.configure({ enabled: false, time: '08:00', templateSkillId: 'orbit-editorial' });
      vi.setSystemTime(new Date('2026-05-06T09:00:00.000Z'));
      await service.start('manual');
      for (
        let attempt = 0;
        attempt < 10 && (status.running || status.lastRunsByTemplate['orbit-editorial']?.agentRunId !== 'agent-2');
        attempt += 1
      ) {
        await vi.advanceTimersByTimeAsync(1);
        status = await service.status();
      }

      service.configure({ enabled: false, time: '08:00', templateSkillId: 'orbit-general' });
      vi.setSystemTime(new Date('2026-05-06T10:00:00.000Z'));
      await service.start('manual');
      for (
        let attempt = 0;
        attempt < 10 && (status.running || status.lastRunsByTemplate['orbit-general']?.agentRunId !== 'agent-3');
        attempt += 1
      ) {
        await vi.advanceTimersByTimeAsync(1);
        status = await service.status();
      }

      status = await service.status();

      expect(status.lastRun).toMatchObject({
        agentRunId: 'agent-3',
        templateSkillId: 'orbit-general',
      });
      expect(status.lastRunsByTemplate).toMatchObject({
        'orbit-general': {
          agentRunId: 'agent-3',
          templateSkillId: 'orbit-general',
        },
        'orbit-editorial': {
          agentRunId: 'agent-2',
          templateSkillId: 'orbit-editorial',
        },
      });
    } finally {
      vi.useRealTimers();
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('pins the configured template id at run start when template resolution falls back to null', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'orbit-test-'));
    try {
      const service = new OrbitService(dataDir);
      let resolveCompletion!: (value: {
        agentRunId: string;
        status: 'succeeded';
      }) => void;
      const completion = new Promise<{
        agentRunId: string;
        status: 'succeeded';
      }>((resolve) => {
        resolveCompletion = resolve;
      });
      service.setTemplateResolver(async () => null);
      service.setRunHandler(async () => ({
        projectId: 'project-1',
        agentRunId: 'agent-1',
        completion,
      }));

      service.configure({ enabled: false, time: '08:00', templateSkillId: 'orbit-general' });
      await service.start('manual');

      service.configure({ enabled: false, time: '08:00', templateSkillId: 'orbit-editorial' });
      resolveCompletion({
        agentRunId: 'agent-1',
        status: 'succeeded',
      });

      let status = await service.status();
      for (
        let attempt = 0;
        attempt < 10 && (status.running || status.lastRun?.agentRunId !== 'agent-1');
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        status = await service.status();
      }

      expect(status.lastRun).toMatchObject({
        agentRunId: 'agent-1',
        templateSkillId: 'orbit-general',
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
