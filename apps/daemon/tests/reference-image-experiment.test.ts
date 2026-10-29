import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  INCLUDE_REFERENCE_IMAGE,
  REFERENCE_CASE_PROMPT,
  REFERENCE_DIRECTION,
  REFERENCE_IMAGE_SHA256,
  referenceImageExperimentInput,
} from '../src/media/reference-image-experiment.js';
import { stageAmrImagePaths } from '../src/media/amr-image-staging.js';
import {
  buildOdNextTaskConfigurationV1,
  createOdNextTaskInputSnapshot,
  loadOdNextTaskInputSnapshot,
  removeOdNextTaskInputSnapshot,
} from '../src/strategies/od-next/task-input-snapshot.js';

const roots: string[] = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-pilot-'));
  roots.push(root);
  return {
    root,
    projectName: 'eval-OD-EVAL-022',
    requestBody: { message: REFERENCE_CASE_PROMPT, currentPrompt: REFERENCE_CASE_PROMPT },
    uploadRoot: path.join(root, 'uploads'),
    isContinuation: false,
  };
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('reference-image pilot inputs', () => {
  it('adds the same direction without changing the requirements, with stable retry identity', () => {
    const f = fixture();
    const result = referenceImageExperimentInput(f)!;
    expect(result.message).toBe(`${REFERENCE_CASE_PROMPT}\n\n${REFERENCE_DIRECTION}`);
    expect(result.currentPrompt).toBe(result.message);
    expect(referenceImageExperimentInput(f)).toEqual(result);
    expect(result.imagePaths?.length ?? 0).toBe(INCLUDE_REFERENCE_IMAGE ? 1 : 0);
  });

  it('leaves other projects, changed prompts, followups and clarification untouched', () => {
    const f = fixture();
    expect(referenceImageExperimentInput({ ...f, projectName: 'my-portfolio' })).toBeNull();
    expect(referenceImageExperimentInput({ ...f, projectName: 'eval-OD-EVAL-002' })).toBeNull();
    expect(referenceImageExperimentInput({ ...f, isContinuation: true })).toBeNull();
    expect(referenceImageExperimentInput({ ...f, requestBody: { message: 'change hero' } })).toBeNull();
    expect(referenceImageExperimentInput({ ...f, requestBody: { ...f.requestBody, currentPrompt: '' } })).toBeNull();
    expect(fs.existsSync(f.uploadRoot)).toBe(false);
  });

  it('rejects contamination by pre-existing images', () => {
    const f = fixture();
    expect(() => referenceImageExperimentInput({
      ...f, requestBody: { ...f.requestBody, imagePaths: ['unexpected.jpg'] },
    })).toThrow(/existing images/);
  });

  it.skipIf(!INCLUDE_REFERENCE_IMAGE)('delivers identical reference bytes through both real image pipelines', async () => {
    const f = fixture();
    const projectRoot = path.join(f.root, 'project');
    const snapshotsRoot = path.join(f.root, 'snapshots');
    fs.mkdirSync(projectRoot);
    const result = referenceImageExperimentInput(f)!;
    const legacy = await stageAmrImagePaths(projectRoot, result.imagePaths!, f.uploadRoot);
    expect(legacy).toHaveLength(1);
    const descriptor = createOdNextTaskInputSnapshot({
      snapshotsRoot, projectRoot, uploadRoot: f.uploadRoot,
      taskExecutionId: 'odnext_reference_pilot',
      taskConfiguration: buildOdNextTaskConfigurationV1({
        taskType: 'prototype', locale: 'zh_CN', selectedAgentId: 'amr',
        sessionMode: 'design', mediaExecution: { mode: 'enabled' },
      }),
      imagePaths: result.imagePaths!,
    });
    try {
      fs.unlinkSync(result.imagePaths![0]!);
      const loaded = loadOdNextTaskInputSnapshot(descriptor, snapshotsRoot);
      expect(loaded.imagePaths).toHaveLength(1);
      for (const image of [...legacy, ...loaded.imagePaths]) {
        expect(createHash('sha256').update(fs.readFileSync(image)).digest('hex')).toBe(REFERENCE_IMAGE_SHA256);
      }
      expect(loaded.requestInputText).toContain('"kind":"image"');
    } finally {
      removeOdNextTaskInputSnapshot(descriptor, snapshotsRoot);
    }
  });
});
