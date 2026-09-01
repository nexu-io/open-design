import { describe, expect, it } from 'vitest';
import {
  OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1,
  OD_NEXT_REQUEST_TURN_SCHEMA_V1,
  parseOdNextPromptBundleV1,
  parseOdNextRequestTurnV1,
  serializeOdNextPromptBundleV1,
  serializeOdNextRequestTurnV1,
} from '../src/index.js';

describe('OD Next canonical Prompt Bundle v1', () => {
  const input = {
    systemPrompt: 'Core & recipe\r\nwith ]]> and <closing> text',
    userPrompt: 'Build “控制台” 🚀',
    taskConfig: '',
    context: 'Prior transcript\n<linked-dir:1>/assets/logo.svg',
  };

  it('emits one deterministic root and the fixed four-block order', () => {
    const serialized = serializeOdNextPromptBundleV1(input);
    expect(serialized).toBe(serializeOdNextPromptBundleV1(input));
    expect(serialized.startsWith(
      '<open_design_prompt_bundle schema="' + OD_NEXT_PROMPT_BUNDLE_SCHEMA_V1 + '">',
    )).toBe(true);
    expect(serialized.endsWith('</open_design_prompt_bundle>')).toBe(true);
    expect(serialized.indexOf('<system_prompt>')).toBeLessThan(serialized.indexOf('<user_prompt>'));
    expect(serialized.indexOf('<user_prompt>')).toBeLessThan(serialized.indexOf('<task_config>'));
    expect(serialized.indexOf('<task_config>')).toBeLessThan(serialized.indexOf('<context>'));
    expect(serialized).toContain(']]]]><![CDATA[>');
    expect(parseOdNextPromptBundleV1(serialized)).toEqual({
      ...input,
      systemPrompt: input.systemPrompt.replace('\r\n', '\n'),
    });
  });

  it('uses one unique encoding for empty optional block content', () => {
    const serialized = serializeOdNextPromptBundleV1({
      systemPrompt: 'system',
      userPrompt: '',
      taskConfig: '',
      context: '',
    });
    expect(serialized.match(/<!\[CDATA\[\]\]>/g)).toHaveLength(3);
    expect(() => parseOdNextPromptBundleV1(
      serialized.replace(
        '<task_config>\n    <![CDATA[]]>\n  </task_config>',
        '<task_config/>',
      ),
    )).toThrow(/Non-canonical XML/);
  });

  it('keeps user-authored XML-like and workflow words opaque', () => {
    const userPrompt = '<available_skills>critique checklist</available_skills>\n<judge/>';
    const serialized = serializeOdNextPromptBundleV1({
      systemPrompt: 'system',
      userPrompt,
      taskConfig: '',
      context: '',
    });
    expect(parseOdNextPromptBundleV1(serialized).userPrompt).toBe(userPrompt);
  });

  it('rejects outer bytes, unknown/duplicate/reordered blocks, and invalid XML text', () => {
    const serialized = serializeOdNextPromptBundleV1({
      systemPrompt: 'system',
      userPrompt: 'request',
      taskConfig: '',
      context: '',
    });
    expect(() => parseOdNextPromptBundleV1(' ' + serialized)).toThrow(/Non-canonical XML/);
    expect(() => parseOdNextPromptBundleV1(serialized + '\n')).toThrow(/outside its root/);
    expect(() => parseOdNextPromptBundleV1(
      serialized.replace('<user_prompt>', '<available_skills>'),
    )).toThrow(/Non-canonical XML/);
    expect(() => parseOdNextPromptBundleV1(
      serialized.replace('</context>', '</context>\n  <context><![CDATA[again]]></context>'),
    )).toThrow();
    const userBlock = serialized.match(/  <user_prompt>[\s\S]*?  <\/user_prompt>\n/)?.[0] ?? '';
    const taskBlock = serialized.match(/  <task_config>[\s\S]*?  <\/task_config>\n/)?.[0] ?? '';
    expect(() => parseOdNextPromptBundleV1(
      serialized.replace(userBlock + taskBlock, taskBlock + userBlock),
    )).toThrow(/Non-canonical XML/);
    expect(() => serializeOdNextPromptBundleV1({
      systemPrompt: 'system' + String.fromCharCode(0),
      userPrompt: 'request',
      taskConfig: '',
      context: '',
    })).toThrow(/XML 1.0/);
  });
});

describe('OD Next canonical request Turn v1', () => {
  it.each(['clarification', 'contract_repair', 'production'] as const)(
    'round-trips the existing %s stage with versioned identity attributes',
    (stage) => {
      const input = {
        taskExecutionId: 'task<&"\'id',
        stage,
        taskRunIndex: 2,
        payload: 'stage payload ]]> safely',
      };
      const serialized = serializeOdNextRequestTurnV1(input);
      expect(serialized).toContain('schema="' + OD_NEXT_REQUEST_TURN_SCHEMA_V1 + '"');
      expect(serialized).toContain('stage="' + stage + '" task_run_index="2"');
      expect(parseOdNextRequestTurnV1(serialized)).toEqual(input);
    },
  );

  it('rejects request/generic stages, malformed identity, noncanonical index, and extra XML', () => {
    expect(() => serializeOdNextRequestTurnV1({
      taskExecutionId: 'task',
      stage: 'request' as never,
      taskRunIndex: 0,
      payload: '',
    })).toThrow(/existing continuation stages/);
    expect(() => serializeOdNextRequestTurnV1({
      taskExecutionId: 'task',
      stage: 'production',
      taskRunIndex: 0,
      payload: '',
    })).toThrow(/positive safe integer/);
    expect(() => serializeOdNextRequestTurnV1({
      taskExecutionId: '',
      stage: 'production',
      taskRunIndex: 1,
      payload: '',
    })).toThrow(/must not be empty/);
    const serialized = serializeOdNextRequestTurnV1({
      taskExecutionId: 'task',
      stage: 'production',
      taskRunIndex: 1,
      payload: '',
    });
    expect(() => parseOdNextRequestTurnV1(
      serialized.replace('task_run_index="1"', 'task_run_index="01"'),
    )).toThrow(/canonical positive integer/);
    expect(() => parseOdNextRequestTurnV1(
      serialized.replace('task_run_index="1"', 'task_run_index="0"'),
    )).toThrow(/canonical positive integer/);
    expect(() => parseOdNextRequestTurnV1(serialized + '\n<judge/>')).toThrow(/outside its root/);
  });
});
