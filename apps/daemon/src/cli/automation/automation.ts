// @ts-nocheck
/** @module cli/automation/automation
 * Implements the od automation command dispatcher for routine/workflow management (list, get, create, update, run, delete, pause, resume, crystallize-run).
 * Also handles templates, source ingestion/packets, and proposals (self-evolution suggestions).
 * Collaborators: cliDaemonBaseUrl from core; readPromptFromFlags, readMemoryBodyFromFlags from core; schedule parsing.
 */
import { cliDaemonBaseUrl, parseFlags, positionalArgs, readMemoryBodyFromFlags, readPromptFromFlags, structuredHttpFailure, surfaceFetchError } from '../core/index.js';

// `od automation …` mirrors the Automations tab. Same surface, same
// /api/routines store. The CLI form is the embeddability contract:
// external agents (hermes-agent, openclaw, etc.) can drive Open Design
// automations headlessly without going through the web UI.
/**
 * @internal Whitelist of string flags for automation subcommands (--name, --prompt, --schedule, --target, --skill, --plugin, etc.).
 */
const AUTOMATION_STRING_FLAGS = new Set([
  'daemon-url', 'name', 'prompt', 'prompt-file', 'schedule', 'target',
  'project', 'skill', 'agent', 'limit', 'plugin', 'mcp', 'connector',
  'status', 'reason', 'template', 'source-kind', 'source-ref', 'title',
  'body', 'body-file', 'compression', 'sensitivity', 'account',
  'candidate-sinks', 'memory-type',
]);

/**
 * @internal Whitelist of boolean flags (--help, --json, --disabled, --enabled).
 */
const AUTOMATION_BOOLEAN_FLAGS = new Set([
  'help', 'h', 'json', 'disabled', 'enabled',
]);

/**
 * @internal Maps day names (sun/sunday, mon/monday, etc.) to 0-6 weekday numbers.
 * Used by parseScheduleFlag to normalize weekly schedule specs.
 */
const AUTOMATION_WEEKDAY_TOKENS = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

/**
 * @internal Parses --schedule flag into typed schedule object (hourly, daily, weekdays, or weekly).
 * Forms: hourly:<minute> | daily:HH:MM[:TZ] | weekdays:HH:MM[:TZ] | weekly:DAY:HH:MM[:TZ]
 * Exits 2 on parse error.
 */
function parseScheduleFlag(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error(
      '--schedule is required. Forms: hourly:<minute> | daily:HH:MM[:TZ] | weekdays:HH:MM[:TZ] | weekly:DAY:HH:MM[:TZ]',
    );
  }
  const parts = raw.split(':');
  const kind = parts[0];
  if (kind === 'hourly') {
    const minute = Number(parts[1]);
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
      throw new Error('--schedule hourly requires :<minute>, 0-59');
    }
    return { kind: 'hourly', minute };
  }
  if (kind === 'daily' || kind === 'weekdays') {
    if (parts.length < 3) {
      throw new Error(`--schedule ${kind} requires :HH:MM[:TZ]`);
    }
    const hh = parts[1];
    const mm = parts[2];
    const time = `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
    if (!/^[0-2]\d:[0-5]\d$/.test(time)) {
      throw new Error(`--schedule ${kind} time must be HH:MM (24h)`);
    }
    const timezone = parts.slice(3).join(':') || 'UTC';
    return { kind, time, timezone };
  }
  if (kind === 'weekly') {
    if (parts.length < 4) {
      throw new Error('--schedule weekly requires :DAY:HH:MM[:TZ] (DAY is 0-6 or sun/mon/...)');
    }
    const dayToken = String(parts[1]).toLowerCase();
    let weekday;
    if (/^[0-6]$/.test(dayToken)) {
      weekday = Number(dayToken);
    } else if (AUTOMATION_WEEKDAY_TOKENS[dayToken] !== undefined) {
      weekday = AUTOMATION_WEEKDAY_TOKENS[dayToken];
    } else {
      throw new Error(`--schedule weekly day must be 0-6 or sun..sat (got "${parts[1]}")`);
    }
    const time = `${parts[2].padStart(2, '0')}:${parts[3].padStart(2, '0')}`;
    if (!/^[0-2]\d:[0-5]\d$/.test(time)) {
      throw new Error('--schedule weekly time must be HH:MM (24h)');
    }
    const timezone = parts.slice(4).join(':') || 'UTC';
    return { kind: 'weekly', weekday, time, timezone };
  }
  throw new Error(`--schedule kind must be hourly|daily|weekdays|weekly (got "${kind}")`);
}

/**
 * @internal Parses --target flag into {mode, projectId?}.
 * Forms: 'new-project' | 'reuse=<id>' | 'reuse:<id>' | implicit reuse if --project given.
 * Exits 2 on parse error.
 */
function parseAutomationTarget(flags) {
  const raw = flags.target;
  if (raw == null) {
    if (flags.project) return { mode: 'reuse', projectId: String(flags.project) };
    return { mode: 'create_each_run' };
  }
  const value = String(raw);
  if (
    value === 'worktree' ||
    value === 'new-project' ||
    value === 'create-each-run' ||
    value === 'create_each_run'
  ) {
    return { mode: 'create_each_run' };
  }
  if (value === 'reuse') {
    if (!flags.project) {
      throw new Error('--target reuse needs --project <id>');
    }
    return { mode: 'reuse', projectId: String(flags.project) };
  }
  const eq = value.indexOf('=');
  if ((value.startsWith('reuse=') || value.startsWith('reuse:')) && eq > 0) {
    const projectId = value.slice(eq + 1).trim();
    if (!projectId) throw new Error('--target reuse=<projectId> needs a non-empty id');
    return { mode: 'reuse', projectId };
  }
  throw new Error(
    `--target must be "new-project" or "reuse=<projectId>" (got "${value}")`,
  );
}

/**
 * @internal Formats schedule object for display (hourly:00, daily:09:00:UTC, etc.).
 */
function describeAutomationScheduleForCli(schedule) {
  if (!schedule) return '-';
  if (schedule.kind === 'hourly') {
    return `hourly:${String(schedule.minute).padStart(2, '0')}`;
  }
  if (schedule.kind === 'weekly') {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    return `weekly:${days[schedule.weekday] ?? schedule.weekday}:${schedule.time}:${schedule.timezone}`;
  }
  return `${schedule.kind}:${schedule.time}:${schedule.timezone}`;
}

/**
 * @internal Formats target object for display ('reuse=<id>' or 'new-project').
 */
function describeAutomationTargetForCli(target) {
  if (!target) return '-';
  if (target.mode === 'reuse') return `reuse=${target.projectId}`;
  return 'new-project';
}

/**
 * @internal Splits comma-separated IDs, trims, filters empty, dedupes.
 */
function splitAutomationIds(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return [];
  const seen = new Set();
  const out = [];
  for (const part of value.split(',')) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * @internal Builds context object from --skill, --plugin, --mcp, --connector flags (comma-separated).
 * Returns null if no IDs provided.
 */
function automationContextFromFlags(flags) {
  const skillIds = splitAutomationIds(flags.skill);
  const pluginIds = splitAutomationIds(flags.plugin);
  const mcpServerIds = splitAutomationIds(flags.mcp);
  const connectorIds = splitAutomationIds(flags.connector);
  const context = {
    ...(skillIds.length > 0 ? { skillIds } : {}),
    ...(pluginIds.length > 0 ? { pluginIds } : {}),
    ...(mcpServerIds.length > 0 ? { mcpServerIds } : {}),
    ...(connectorIds.length > 0 ? { connectorIds } : {}),
  };
  return Object.keys(context).length > 0 ? context : null;
}

/**
 * @internal Formats automation routine as tab-separated row (id, name, schedule, target, status, nextRun).
 */
function formatAutomationRow(r) {
  const next = r.nextRunAt
    ? new Date(r.nextRunAt).toISOString()
    : (r.enabled ? '-' : 'paused');
  return [
    r.id,
    r.name,
    describeAutomationScheduleForCli(r.schedule),
    describeAutomationTargetForCli(r.target),
    r.enabled ? 'enabled' : 'paused',
    next,
  ].join('\t');
}

/**
 * @internal Prints full help for all od automation subcommands and schedule formats.
 */
function printAutomationHelp() {
  console.log(`Usage:
  od automation template list                                List built-in automation templates.
  od automation template get <id>                            Print one built-in automation template.
  od automation source ingest --source-kind <kind> --title <title>
                              [--source-ref <ref>] [--template <id>]
                              [--body <markdown> | --body-file <path|->]
                              [--connector <id>] [--compression off|balanced|aggressive]
                              [--json]
  od automation source list [--limit 20] [--json]             List ingested source packets.
  od automation source get <id> [--json]                      Print one source packet.
  od automation proposal list [--status pending-review]       List self-evolution proposals.
  od automation proposal get <id>                             Print one proposal.
  od automation proposal apply <id>                           Apply a reviewable proposal.
  od automation proposal reject <id> [--reason "<why>"]       Reject a reviewable proposal.
  od automation list                                         List automations.
  od automation get <id>                                     Print one automation.
  od automation create --name "<title>" --prompt "<text>"
                       --schedule <spec>
                       [--target new-project|reuse=<projectId>]
                       [--disabled] [--json]
                       [--prompt-file <path|->] (alternative to --prompt)
                       [--skill <id>[,<id>]] [--plugin <id>[,<id>]]
                       [--mcp <id>[,<id>]] [--connector <id>[,<id>]]
                       [--agent <id>]
  od automation update <id> [--name ...] [--prompt ...]
                            [--schedule ...] [--target ...]
                            [--skill ...] [--plugin ...] [--mcp ...]
                            [--connector ...] [--enabled|--disabled]
                            Patch fields.
  od automation run <id>                                       Trigger a manual run; prints projectId/conversationId.
  od automation runs <id> [--limit 10]                         Print run history.
  od automation crystallize-run <routineId> <runId> [--json]    Turn a succeeded run into skill/memory proposals.
  od automation pause <id>                                     Mark disabled.
  od automation resume <id>                                    Mark enabled.
  od automation delete <id>                                    Remove the automation (history retained).

Schedule formats:
  hourly:<minute>                    Every hour at :MM.
  daily:HH:MM[:TZ]                   Daily at HH:MM in TZ (default UTC).
  weekdays:HH:MM[:TZ]                Mon-Fri at HH:MM.
  weekly:DAY:HH:MM[:TZ]              DAY = 0-6 or sun|mon|...|sat.

Output:
  Plain text: tab-separated rows for list, human-readable lines for get / runs.
  --json     Raw JSON for any subcommand.
  Designed so external agents (hermes-agent, openclaw, scripted jobs)
  can drive the full automation lifecycle headlessly.

Common options:
  --daemon-url <url>   Open Design daemon HTTP base.`);
}

/**
 * Main dispatcher for `od automation` subcommands (template, source/ingest, proposal, list, get, runs, create, update, run, delete, pause, resume, crystallize-run).
 * Source/proposal are self-evolution surfaces; template/source/proposal are read-only discovery.
 */
export async function runAutomation(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    printAutomationHelp();
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  let flags;
  try {
    flags = parseFlags(rest, {
      string: AUTOMATION_STRING_FLAGS,
      boolean: AUTOMATION_BOOLEAN_FLAGS,
    });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);

  const writeJson = (data) =>
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');

  const positionalArgs = (values) => {
    const out = [];
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (!value) continue;
      if (value.startsWith('--')) {
        const eq = value.indexOf('=');
        const key = eq >= 0 ? value.slice(2, eq) : value.slice(2);
        if (eq < 0 && AUTOMATION_STRING_FLAGS.has(key)) i++;
        continue;
      }
      out.push(value);
    }
    return out;
  };

  const requireId = (label) => {
    const id = positionalArgs(rest)[0];
    if (!id) {
      console.error(`Usage: od automation ${label} <id>`);
      process.exit(2);
    }
    return id;
  };

  const readAutomationIngestBody = async () => {
    const direct = await readMemoryBodyFromFlags(flags);
    if (typeof direct === 'string') return direct;
    return await readPromptFromFlags(flags);
  };

  switch (sub) {
    case 'template':
    case 'templates': {
      const parts = positionalArgs(rest);
      const action = parts[0] ?? 'list';
      if (action === 'list') {
        let resp;
        try {
          resp = await fetch(`${base}/api/automation-templates`);
        } catch (err) {
          surfaceFetchError(err, base);
          process.exit(3);
        }
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        if (flags.json) return writeJson(data);
        const templates = data.templates ?? [];
        if (templates.length === 0) {
          console.log('No automation templates available.');
          return;
        }
        console.log('# id\ttitle\ttriggers\tsources\toutputs\tcompression\treview');
        for (const template of templates) {
          console.log([
            template.id,
            template.title,
            (template.triggerKinds ?? []).join(','),
            (template.sourceKinds ?? []).join(','),
            (template.outputSinks ?? []).join(','),
            template.tokenCompression,
            template.reviewPolicy,
          ].join('\t'));
        }
        return;
      }
      if (action === 'get') {
        const id = parts[1];
        if (!id) {
          console.error('Usage: od automation template get <id>');
          process.exit(2);
        }
        let resp;
        try {
          resp = await fetch(`${base}/api/automation-templates/${encodeURIComponent(id)}`);
        } catch (err) {
          surfaceFetchError(err, base);
          process.exit(3);
        }
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        return writeJson(flags.json ? data : (data.template ?? data));
      }
      console.error(`unknown subcommand: od automation template ${action}`);
      printAutomationHelp();
      process.exit(2);
    }
    case 'ingest':
    case 'source':
    case 'sources': {
      const parts = positionalArgs(rest);
      const action = sub === 'ingest' ? 'ingest' : (parts[0] ?? 'list');
      if (action === 'ingest') {
        const sourceKind = flags['source-kind'] ?? (sub === 'ingest' ? parts[0] : parts[1]);
        if (!sourceKind) {
          console.error('Usage: od automation source ingest --source-kind <kind> --body-file <path|->');
          process.exit(2);
        }
        const bodyMarkdown = await readAutomationIngestBody();
        if (!bodyMarkdown) {
          console.error('--body, --body-file, --prompt, or --prompt-file is required');
          process.exit(2);
        }
        const candidateSinks = typeof flags['candidate-sinks'] === 'string'
          ? flags['candidate-sinks'].split(',').map((item) => item.trim()).filter(Boolean)
          : undefined;
        let resp;
        try {
          resp = await fetch(`${base}/api/automation-ingestions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              templateId: flags.template,
              sourceKind,
              sourceRef: flags['source-ref'],
              title: flags.title ?? flags.name,
              bodyMarkdown,
              projectId: flags.project,
              connectorId: flags.connector,
              accountLabel: flags.account,
              sensitivity: flags.sensitivity,
              tokenCompression: flags.compression,
              candidateSinks,
              memoryType: flags['memory-type'],
            }),
          });
        } catch (err) {
          surfaceFetchError(err, base);
          process.exit(3);
        }
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        if (flags.json) return writeJson(data);
        console.log(`[automation source] ingested ${data.packet?.id}`);
        console.log(`compression: ${data.compressionReport?.status ?? 'unknown'} (${data.compressionReport?.beforeTokens ?? 0} -> ${data.compressionReport?.afterTokens ?? 0} tokens)`);
        const proposals = data.proposals ?? [];
        if (proposals.length > 0) {
          console.log('# proposals');
          for (const proposal of proposals) {
            console.log([
              proposal.id,
              proposal.targetKind,
              proposal.action,
              proposal.status,
              proposal.title,
            ].join('\t'));
          }
        }
        return;
      }
      if (action === 'list') {
        const query = flags.limit ? `?limit=${encodeURIComponent(String(flags.limit))}` : '';
        let resp;
        try {
          resp = await fetch(`${base}/api/automation-source-packets${query}`);
        } catch (err) {
          surfaceFetchError(err, base);
          process.exit(3);
        }
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        if (flags.json) return writeJson(data);
        const packets = data.packets ?? [];
        if (packets.length === 0) {
          console.log('No automation source packets.');
          return;
        }
        console.log('# id\tkind\tcapturedAt\ttokens\ttitle');
        for (const packet of packets) {
          console.log([
            packet.id,
            packet.sourceKind,
            packet.capturedAt,
            packet.tokenStats?.originalTokens ?? 0,
            packet.title,
          ].join('\t'));
        }
        return;
      }
      if (action === 'get') {
        const id = parts[1];
        if (!id) {
          console.error('Usage: od automation source get <id>');
          process.exit(2);
        }
        let resp;
        try {
          resp = await fetch(`${base}/api/automation-source-packets/${encodeURIComponent(id)}`);
        } catch (err) {
          surfaceFetchError(err, base);
          process.exit(3);
        }
        if (!resp.ok) return structuredHttpFailure(resp);
        return writeJson(await resp.json());
      }
      console.error(`unknown subcommand: od automation source ${action}`);
      printAutomationHelp();
      process.exit(2);
    }
    case 'proposal':
    case 'proposals': {
      const parts = positionalArgs(rest);
      const action = parts[0] ?? 'list';
      if (action === 'list') {
        const query = flags.status ? `?status=${encodeURIComponent(String(flags.status))}` : '';
        let resp;
        try {
          resp = await fetch(`${base}/api/automation-proposals${query}`);
        } catch (err) {
          surfaceFetchError(err, base);
          process.exit(3);
        }
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        if (flags.json) return writeJson(data);
        const proposals = data.proposals ?? [];
        if (proposals.length === 0) {
          console.log('No automation proposals.');
          return;
        }
        console.log('# id\tstatus\ttarget\taction\tupdatedAt\ttitle');
        for (const proposal of proposals) {
          console.log([
            proposal.id,
            proposal.status,
            proposal.targetKind,
            proposal.action,
            proposal.updatedAt,
            proposal.title,
          ].join('\t'));
        }
        return;
      }
      if (action === 'get') {
        const id = parts[1];
        if (!id) {
          console.error('Usage: od automation proposal get <id>');
          process.exit(2);
        }
        let resp;
        try {
          resp = await fetch(`${base}/api/automation-proposals/${encodeURIComponent(id)}`);
        } catch (err) {
          surfaceFetchError(err, base);
          process.exit(3);
        }
        if (!resp.ok) return structuredHttpFailure(resp);
        return writeJson(await resp.json());
      }
      if (action === 'apply' || action === 'reject') {
        const id = parts[1];
        if (!id) {
          console.error(`Usage: od automation proposal ${action} <id>`);
          process.exit(2);
        }
        let resp;
        try {
          resp = await fetch(
            `${base}/api/automation-proposals/${encodeURIComponent(id)}/${action}`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: action === 'reject'
                ? JSON.stringify({ reason: flags.reason ?? '' })
                : '{}',
            },
          );
        } catch (err) {
          surfaceFetchError(err, base);
          process.exit(3);
        }
        if (!resp.ok) return structuredHttpFailure(resp);
        const data = await resp.json();
        if (flags.json) return writeJson(data);
        console.log(`[automation proposal] ${action === 'apply' ? 'applied' : 'rejected'} ${data.proposal?.id ?? id}`);
        return;
      }
      console.error(`unknown subcommand: od automation proposal ${action}`);
      printAutomationHelp();
      process.exit(2);
    }
    case 'list': {
      let resp;
      try {
        resp = await fetch(`${base}/api/routines`);
      } catch (err) {
        surfaceFetchError(err, base);
        process.exit(3);
      }
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return writeJson(data);
      const routines = data.routines ?? [];
      if (routines.length === 0) {
        console.log('No automations. Create one with `od automation create --name "..." --prompt "..." --schedule daily:09:00`.');
        return;
      }
      console.log('# id\tname\tschedule\ttarget\tstatus\tnextRun');
      for (const r of routines) console.log(formatAutomationRow(r));
      return;
    }
    case 'get': {
      const id = requireId('get');
      let resp;
      try {
        resp = await fetch(`${base}/api/routines/${encodeURIComponent(id)}`);
      } catch (err) {
        surfaceFetchError(err, base);
        process.exit(3);
      }
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return writeJson(data);
      writeJson(data.routine ?? data);
      return;
    }
    case 'runs': {
      const id = requireId('runs');
      const limit = Number(flags.limit) > 0 ? Number(flags.limit) : 20;
      let resp;
      try {
        resp = await fetch(
          `${base}/api/routines/${encodeURIComponent(id)}/runs?limit=${limit}`,
        );
      } catch (err) {
        surfaceFetchError(err, base);
        process.exit(3);
      }
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return writeJson(data);
      const runs = data.runs ?? [];
      if (runs.length === 0) {
        console.log(`No runs yet for ${id}.`);
        return;
      }
      console.log('# runId\tstatus\ttrigger\tstartedAt\tprojectId\tconversationId');
      for (const r of runs) {
        console.log([
          r.id,
          r.status,
          r.trigger,
          new Date(r.startedAt).toISOString(),
          r.projectId,
          r.conversationId,
        ].join('\t'));
      }
      return;
    }
    case 'crystallize-run': {
      const parts = positionalArgs(rest);
      const routineId = parts[0];
      const runId = parts[1];
      if (!routineId || !runId) {
        console.error('Usage: od automation crystallize-run <routineId> <runId> [--json]');
        process.exit(2);
      }
      let resp;
      try {
        resp = await fetch(
          `${base}/api/routines/${encodeURIComponent(routineId)}/runs/${encodeURIComponent(runId)}/crystallize`,
          { method: 'POST' },
        );
      } catch (err) {
        surfaceFetchError(err, base);
        process.exit(3);
      }
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      if (flags.json) return writeJson(data);
      console.log(`[automation] crystallized ${runId}`);
      console.log(`sourcePacket\t${data.packet?.id ?? ''}`);
      console.log(`compression\t${data.compressionReport?.status ?? 'unknown'}\t${data.compressionReport?.beforeTokens ?? 0}->${data.compressionReport?.afterTokens ?? 0}`);
      const proposals = data.proposals ?? [];
      if (proposals.length > 0) {
        console.log('# proposals');
        for (const proposal of proposals) {
          console.log([
            proposal.id,
            proposal.targetKind,
            proposal.action,
            proposal.status,
            proposal.title,
          ].join('\t'));
        }
      }
      return;
    }
    case 'create': {
      const name = typeof flags.name === 'string' ? flags.name.trim() : '';
      if (!name) {
        console.error('--name is required');
        process.exit(2);
      }
      const prompt = (await readPromptFromFlags(flags)) || '';
      if (!prompt.trim()) {
        console.error('--prompt or --prompt-file is required');
        process.exit(2);
      }
      let schedule;
      let target;
      try {
        schedule = parseScheduleFlag(flags.schedule);
        target = parseAutomationTarget(flags);
      } catch (err) {
        console.error(err.message);
        process.exit(2);
      }
      const body = {
        name,
        prompt: prompt.trim(),
        schedule,
        target,
        enabled: !flags.disabled,
      };
      const context = automationContextFromFlags(flags);
      const skillIds = splitAutomationIds(flags.skill);
      if (skillIds.length > 0) body.skillId = skillIds[0];
      if (context) body.context = context;
      if (flags.agent) body.agentId = String(flags.agent);
      let resp;
      try {
        resp = await fetch(`${base}/api/routines`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (err) {
        surfaceFetchError(err, base);
        process.exit(3);
      }
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error(`POST /api/routines failed: ${resp.status} ${JSON.stringify(data)}`);
        process.exit(1);
      }
      if (flags.json) return writeJson(data);
      console.log(`[automation] created ${data.routine?.id}`);
      console.log(formatAutomationRow(data.routine));
      return;
    }
    case 'update': {
      const id = requireId('update');
      const patch = {};
      if (typeof flags.name === 'string') patch.name = flags.name.trim();
      const promptPatch = await readPromptFromFlags(flags);
      if (promptPatch != null) patch.prompt = promptPatch.trim();
      if (flags.schedule) {
        try {
          patch.schedule = parseScheduleFlag(flags.schedule);
        } catch (err) {
          console.error(err.message);
          process.exit(2);
        }
      }
      if (flags.target || flags.project) {
        try {
          patch.target = parseAutomationTarget(flags);
        } catch (err) {
          console.error(err.message);
          process.exit(2);
        }
      }
      if (flags.disabled) patch.enabled = false;
      if (flags.enabled) patch.enabled = true;
      const context = automationContextFromFlags(flags);
      if (context) {
        const skillIds = splitAutomationIds(flags.skill);
        if (skillIds.length > 0) patch.skillId = skillIds[0];
        patch.context = context;
      }
      if (Object.keys(patch).length === 0) {
        console.error('update needs at least one of --name --prompt(--prompt-file) --schedule --target --skill --plugin --mcp --connector --enabled --disabled');
        process.exit(2);
      }
      let resp;
      try {
        resp = await fetch(`${base}/api/routines/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
      } catch (err) {
        surfaceFetchError(err, base);
        process.exit(3);
      }
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error(`PATCH /api/routines/${id} failed: ${resp.status} ${JSON.stringify(data)}`);
        process.exit(1);
      }
      if (flags.json) return writeJson(data);
      console.log(`[automation] updated ${id}`);
      console.log(formatAutomationRow(data.routine));
      return;
    }
    case 'pause':
    case 'resume': {
      const id = requireId(sub);
      const enabled = sub === 'resume';
      let resp;
      try {
        resp = await fetch(`${base}/api/routines/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled }),
        });
      } catch (err) {
        surfaceFetchError(err, base);
        process.exit(3);
      }
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error(`PATCH /api/routines/${id} failed: ${resp.status} ${JSON.stringify(data)}`);
        process.exit(1);
      }
      if (flags.json) return writeJson(data);
      console.log(`[automation] ${sub}d ${id}`);
      return;
    }
    case 'run': {
      const id = requireId('run');
      let resp;
      try {
        resp = await fetch(`${base}/api/routines/${encodeURIComponent(id)}/run`, {
          method: 'POST',
        });
      } catch (err) {
        surfaceFetchError(err, base);
        process.exit(3);
      }
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok && resp.status !== 202) {
        console.error(`POST /api/routines/${id}/run failed: ${resp.status} ${JSON.stringify(data)}`);
        process.exit(1);
      }
      if (flags.json) return writeJson(data);
      console.log(`[automation] triggered ${id}`);
      if (data.projectId) console.log(`projectId\t${data.projectId}`);
      if (data.conversationId) console.log(`conversationId\t${data.conversationId}`);
      if (data.agentRunId) console.log(`agentRunId\t${data.agentRunId}`);
      return;
    }
    case 'delete': {
      const id = requireId('delete');
      let resp;
      try {
        resp = await fetch(`${base}/api/routines/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
      } catch (err) {
        surfaceFetchError(err, base);
        process.exit(3);
      }
      if (!resp.ok) return structuredHttpFailure(resp);
      if (flags.json) return writeJson({ ok: true, id });
      console.log(`[automation] deleted ${id}`);
      return;
    }
    default:
      console.error(`unknown subcommand: od automation ${sub}`);
      printAutomationHelp();
      process.exit(2);
  }
}
