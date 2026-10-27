type Counters = { input: number; output: number; total: number; modelCalls: number };
type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};

/** Per-call last usage, deduplicated by cumulative provider counters within an explicit Turn. */
export function createCodexTurnUsage() {
  let turnId = '';
  let invalid = false;
  let previousTotal = -1;
  let result: Counters = { input: 0, output: 0, total: 0, modelCalls: 0 };
  const seen = new Set<string>();
  return {
    start(id: string) { turnId = id; invalid = !id; previousTotal = -1; seen.clear(); result = { input: 0, output: 0, total: 0, modelCalls: 0 }; },
    add(id: string, tokenUsage: unknown): Counters | null {
      const usage = row(tokenUsage); const total = row(usage.total); const last = row(usage.last);
      const counters = [last.inputTokens, last.outputTokens, last.totalTokens, total.totalTokens];
      if (!turnId || id !== turnId || counters.some(v => typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)) invalid = true;
      if (Number(total.totalTokens) < previousTotal) invalid = true;
      if (invalid) return null;
      const fingerprint = JSON.stringify([total.inputTokens, total.outputTokens, total.totalTokens]);
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        result.input += Number(last.inputTokens); result.output += Number(last.outputTokens); result.total += Number(last.totalTokens); result.modelCalls += 1;
      }
      previousTotal = Number(total.totalTokens);
      return { ...result };
    },
  };
}

export function codexTurnUsageFromEvents(events: Array<{ event: string; data: unknown }>): Counters | null {
  let result: Counters | null = null;
  for (const event of events) {
    const data = row(event.data);
    if (event.event !== 'agent' || data.type !== 'usage' || !('evaluationTurnUsage' in data)) continue;
    const usage = row(data.evaluationTurnUsage);
    result = ['input', 'output', 'total', 'modelCalls'].every(key => typeof usage[key] === 'number' && Number.isSafeInteger(usage[key]) && Number(usage[key]) >= 0)
      ? usage as Counters : null;
  }
  return result;
}
