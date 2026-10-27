/** Synthetic wire fixtures based on Vela 0.0.35's compaction integrity regression.
 * These exercise the real bridge, not OpenCode's actual model/compaction loop.
 */
export type RuntimeScenario = 'complete' | 'incomplete' | 'incomplete-outstanding' | 'write-stall' | 'write-disconnect' | 'write-missing-terminal' | 'unknown-error';
export function continuationFrames(userMessageId: string, scenario: RuntimeScenario) {
  const sessionID = 'oc-contract-session';
  const assistantId = 'assistant-continuation';
  const message = (info: Record<string, unknown>) => ({ type: 'message.updated', properties: { info: { sessionID, ...info } } });
  const part = (value: Record<string, unknown>) => ({ type: 'message.part.updated', properties: { sessionID, part: { sessionID, messageID: assistantId, ...value } } });
  if (scenario === 'unknown-error') return [{ type: 'session.error', properties: { sessionID, error: { name: 'UnknownContractError', data: { message: 'unknown runtime failure' } } } }];
  if (scenario === 'write-stall' || scenario === 'write-disconnect' || scenario === 'write-missing-terminal') return [
    message({ id: userMessageId, role: 'user' }),
    message({ id: assistantId, role: 'assistant', parentID: userMessageId }),
    part({ id: 'write-part', type: 'tool', callID: 'write-once', tool: 'write', state: { status: scenario === 'write-missing-terminal' ? 'completed' : 'running', input: { filePath: 'result.txt', content: 'fixture' }, output: 'written', time: { start: 1, end: 2 } } }),
  ];
  const frames = [
    message({ id: userMessageId, role: 'user' }),
    message({ id: 'assistant-initial', role: 'assistant', parentID: userMessageId }),
    part({ id: 'compact', messageID: userMessageId, type: 'compaction', auto: true }),
    message({ id: 'assistant-summary', role: 'assistant', parentID: userMessageId, summary: true, finish: 'stop' }),
    { type: 'session.compacted', properties: { sessionID } },
    message({ id: 'user-continuation', role: 'user' }),
    message({ id: assistantId, role: 'assistant', parentID: 'user-continuation' }),
    part({ id: 'tool-step', type: 'step-finish', reason: 'tool-calls' }),
    part({ id: 'write-part', type: 'tool', callID: 'write-once', tool: 'write', state: { status: 'completed', input: { filePath: 'result.txt', content: 'fixture' }, output: 'written', time: { start: 1, end: 2 } } }),
    message({ id: assistantId, role: 'assistant', finish: 'tool-calls', time: { completed: 2 } }),
  ];
  if (scenario === 'incomplete-outstanding') frames.push(part({ id: 'unknown-write', type: 'tool', callID: 'write-unknown', tool: 'write', state: { status: 'running', input: { filePath: 'unknown.txt' }, time: { start: 3 } } }));
  if (scenario === 'complete') frames.push(
    part({ id: 'final-start', type: 'step-start' }),
    part({ id: 'final-text', type: 'text', text: 'Contract fixture completed.' }),
    part({ id: 'final-stop', type: 'step-finish', reason: 'stop' }),
  );
  frames.push({ type: 'session.idle', properties: { sessionID } });
  return frames;
}
