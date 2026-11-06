import type { AgentCompanionSetupResponse } from '@open-design/contracts';

export async function installDeepSeekHarnessCompanion(): Promise<AgentCompanionSetupResponse> {
  const response = await fetch('/api/agents/deepseek-harness/companion/install', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) {
    let message = `Daemon responded with ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      if (payload.error?.message) message = payload.error.message;
    } catch {
      // Keep the stable HTTP fallback when the daemon did not return JSON.
    }
    throw new Error(message);
  }
  return (await response.json()) as AgentCompanionSetupResponse;
}
