// Stand-in daemon for the agent-process specs (run with `node --import tsx`).
//
// It spawns ONE agent through the daemon's real chat-run spawn path
// (`spawnAgentProcess`), reports the agent's PID on stdout, and then either
// waits to be killed by the spec (SIGKILL / SIGABRT — no JavaScript runs) or
// aborts itself, which is how the 2026-09-14 daemon died (V8 OOM -> abort).
import { spawnAgentProcess } from '../../src/runtimes/agent-process.js';
import { fixturePrompt } from './agent-process-fixtures.js';

export type AgentProcessFixtureConfig = {
  agentScript: string;
  runDir: string;
  runId: string;
  env: Record<string, string>;
  /** Deliver a prompt of this many bytes on stdin; omitted = no stdin. */
  promptBytes?: number;
  /** Call process.abort() this long after the spawn. */
  abortAfterMs?: number;
};

const rawConfig = process.env.OD_AGENT_PROCESS_FIXTURE_CONFIG;
if (rawConfig) {
  const config = JSON.parse(rawConfig) as AgentProcessFixtureConfig;
  const prompt = typeof config.promptBytes === 'number' ? fixturePrompt(config.promptBytes) : null;
  const agentEnv: NodeJS.ProcessEnv = { ...process.env, ...config.env };
  delete agentEnv.OD_AGENT_PROCESS_FIXTURE_CONFIG;
  const { child } = spawnAgentProcess({
    command: process.execPath,
    args: [config.agentScript],
    env: agentEnv,
    cwd: config.runDir,
    stdin: prompt === null ? 'ignore' : { prompt },
    runDir: config.runDir,
    runId: config.runId,
  });
  // Drain the agent's output pipes like the daemon does.
  child.stdout?.resume();
  child.stderr?.resume();
  // Printed once spawnAgentProcess has returned, i.e. once the agent is on record.
  process.stdout.write(`${JSON.stringify({ daemonPid: process.pid, agentPid: child.pid })}\n`);
  if (typeof config.abortAfterMs === 'number') {
    setTimeout(() => process.abort(), config.abortAfterMs);
  }
  setInterval(() => {}, 1_000);
}
