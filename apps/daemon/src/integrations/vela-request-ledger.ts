import { createHash } from 'node:crypto';
import type { GenerationRequestLedger, GenerationRequestReceipt } from '@open-design/contracts';
import { runVelaCommand, velaWorkspaceCommandOptions } from './vela-command.js';
import { openDesignAmrRunAttempt } from '../runtimes/env.js';

type ObjectValue = Record<string, unknown>;
const object = (v: unknown): ObjectValue | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as ObjectValue : null;
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const values = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const strings = (v: unknown): string[] => values(v).filter((item): item is string => typeof item === 'string' && item.length > 0);
const choice = <T extends string>(v: unknown, allowed: readonly T[]): T | null => typeof v === 'string' && allowed.includes(v as T) ? v as T : null;
const terminalStatuses = ['succeeded', 'failed', 'canceled', 'rejected'] as const;
const digest = (v: string): string => createHash('sha256').update(v).digest('hex');

export interface LedgerRunFacts {
  id: string;
  agentId: string | null;
  status: string;
  createdAt: number;
  terminalAt?: number | null;
  workspaceScope?: { workspaceId: string | null } | null;
  analyticsTelemetry?: { startRequestedAt?: number };
  executionSourceReceipt?: { sourceSha: string | null; incompleteReason?: string | null } | null;
  cumulativeRetryAttemptCount?: number;
  retryAttemptCount?: number;
  manualResumeAttemptCount?: number;
}

function emptyReceipt(run: LedgerRunFacts, reason: string): GenerationRequestLedger {
  const started = number(run.analyticsTelemetry?.startRequestedAt);
  const ended = number(run.terminalAt);
  return {
    schemaVersion: 'generation-request-ledger-v1', sourceRunId: run.id,
    requests: [], complete: false, captureComplete: false, requestInventoryComplete: false,
    includesAuxiliary: false, includesFailures: false, includesProviderRetries: false, watermark: null,
    identity: { sourceSha: run.executionSourceReceipt?.sourceSha ?? null, promptSha256: null,
      promptHashSemantics: 'ordered_forwarded_request_bodies_v1', requestedModel: null, actualModel: null, runtimeVersion: null },
    observedModelRoutes: [], observedGatewayRuntimeVersions: [],
    executionDurationMs: started !== null && ended !== null && ended >= started ? ended - started : null,
    queueDurationMs: started !== null && started >= run.createdAt ? started - run.createdAt : null,
    retryWaitMs: null,
    incompleteReasons: [reason],
  };
}

/** A closed gateway page cannot establish the inventory of outbound caller requests. */
export function normalizeVelaRequestLedger(raw: unknown, run: LedgerRunFacts): GenerationRequestLedger {
  const receipt = emptyReceipt(run, '');
  const data = object(raw);
  const reasons = new Set<string>();
  if (!data || data.version !== 'vela-request-ledger-v1' || data.openDesignRunId !== run.id || !Array.isArray(data.requests) || data.nextCursor !== null) {
    receipt.incompleteReasons = ['invalid_vela_ledger_identity_or_pagination'];
    return receipt;
  }
  for (const reason of strings(data.incompleteReasons)) reasons.add(reason);
  const gateways = new Map<string, ObjectValue>();
  let recordsValid = strings(data.incompleteReasons).length === 0, usageComplete = true;
  for (const rawRequest of data.requests) {
    const request = object(rawRequest);
    const id = text(request?.requestId);
    if (!request || !id || request.openDesignRunId !== run.id || gateways.has(id) || !Array.isArray(request.attempts)) {
      recordsValid = false; reasons.add('invalid_or_duplicate_gateway_request'); continue;
    }
    gateways.set(id, request);
    if (request.captureComplete !== true || strings(request.incompleteReasons).length || !terminalStatuses.includes(request.status as typeof terminalStatuses[number])) {
      recordsValid = false; reasons.add('gateway_capture_incomplete');
    }
    for (const reason of strings(request.incompleteReasons)) reasons.add(reason);
    const attemptIds = new Set<string>();
    // A pre-provider rejection is still an observed request. Its unknown usage
    // stays null; absence of an attempt is not proof of a zero-token request.
    const attempts = request.attempts.length ? request.attempts : [null];
    for (const rawAttempt of attempts) {
      const attempt = object(rawAttempt);
      const attemptId = text(attempt?.attemptId);
      if (!attemptId || attemptIds.has(attemptId)) { recordsValid = false; reasons.add('provider_attempt_identity_missing_or_duplicate'); }
      if (attemptId) attemptIds.add(attemptId);
      const row: GenerationRequestReceipt = {
        requestId: JSON.stringify([id, attemptId]), gatewayRequestId: id, callerRequestId: text(request.callerRequestId),
        attemptId, runAttempt: text(request.openDesignRunAttempt),
        role: choice(attempt?.role ?? request.role, ['generation', 'repair', 'retry', 'auxiliary']),
        status: choice(attempt?.status ?? request.status, [...terminalStatuses, 'running']),
        inputTokens: number(attempt?.inputTokens), inputSemantics: choice(attempt?.inputSemantics, ['includes_cache', 'excludes_cache']),
        cacheReadTokens: number(attempt?.cacheReadTokens), cacheWriteTokens: number(attempt?.cacheWriteTokens),
        outputTokens: number(attempt?.outputTokens), outputSemantics: choice(attempt?.outputSemantics, ['includes_reasoning', 'excludes_reasoning']),
        reasoningTokens: number(attempt?.reasoningTokens), requestedModel: text(request.requestedModel), actualModel: text(attempt?.actualModel),
        provider: text(attempt?.provider), runtimeVersion: text(request.runtimeVersion),
        startedAt: text(attempt?.startedAt ?? request.startedAt), completedAt: text(attempt?.completedAt ?? request.completedAt), durationMs: number(attempt?.durationMs),
      };
      receipt.requests.push(row);
      if (!row.role || !row.status || !terminalStatuses.includes(row.status as typeof terminalStatuses[number])) { recordsValid = false; reasons.add('provider_attempt_not_terminal_or_unclassified'); }
      if (row.inputTokens === null || row.outputTokens === null || !row.inputSemantics || !row.outputSemantics
        || (row.inputSemantics === 'excludes_cache' && (row.cacheReadTokens === null || row.cacheWriteTokens === null))
        || (row.outputSemantics === 'excludes_reasoning' && row.reasoningTokens === null)) {
        usageComplete = false; reasons.add('provider_usage_incomplete');
      }
    }
  }
  if (!gateways.size) { recordsValid = false; reasons.add('no_gateway_requests_observed'); }

  const inventory = object(data.callerInventory);
  let inventoryValid = inventory?.version === 'vela-caller-inventory-v1' && inventory.openDesignRunId === run.id
    && inventory.complete === true && strings(inventory.incompleteReasons).length === 0 && data.runInventoryComplete === true && Array.isArray(inventory.producers) && inventory.producers.length > 0;
  const seenCallers = new Set<string>(), seenGateways = new Set<string>(), seenProducers = new Set<string>(), seenRunAttempts = new Set<string>();
  const bodyHashes: Array<{ startedAt: string; callerRequestId: string; sha256: string }> = [];
  for (const rawProducer of values(inventory?.producers)) {
    const producer = object(rawProducer);
    const producerId = text(producer?.producerId);
    if (!producer || !producerId || seenProducers.has(producerId) || producer.openDesignRunId !== run.id || producer.closed !== true || strings(producer.incompleteReasons).length || !Array.isArray(producer.requests)
      || typeof producer.runAttempt !== 'string' || !/^\d+$/.test(producer.runAttempt)) { inventoryValid = false; continue; }
    seenProducers.add(producerId);
    seenRunAttempts.add(producer.runAttempt);
    for (const rawCaller of producer.requests) {
      const caller = object(rawCaller);
      const callerId = text(caller?.callerRequestId), gatewayId = text(caller?.gatewayRequestId);
      const gateway = gatewayId ? gateways.get(gatewayId) : null;
      if (!caller || !callerId || !gatewayId || !gateway || seenCallers.has(callerId) || seenGateways.has(gatewayId)
        || gateway.callerRequestId !== callerId || gateway.openDesignRunAttempt !== producer.runAttempt
        || !terminalStatuses.includes(caller.status as typeof terminalStatuses[number])) { inventoryValid = false; continue; }
      seenCallers.add(callerId); seenGateways.add(gatewayId);
      if (typeof caller.requestBodySha256 === 'string' && /^[a-f0-9]{64}$/.test(caller.requestBodySha256) && text(caller.startedAt)) {
        bodyHashes.push({ startedAt: caller.startedAt as string, callerRequestId: callerId, sha256: caller.requestBodySha256 });
      }
    }
  }
  const expectedIds = strings(inventory?.expectedGatewayRequestIds);
  if (seenGateways.size !== gateways.size || !seenGateways.size || expectedIds.length !== gateways.size || new Set(expectedIds).size !== expectedIds.length || expectedIds.some(id => !seenGateways.has(id))) inventoryValid = false;
  const lastAttempt = openDesignAmrRunAttempt(run);
  if (seenRunAttempts.size !== lastAttempt + 1 || [...seenRunAttempts].some(attempt => Number(attempt) > lastAttempt)) {
    inventoryValid = false; reasons.add('host_run_attempt_inventory_mismatch');
  }
  if (!['succeeded', 'failed', 'canceled'].includes(run.status)) { inventoryValid = false; reasons.add('run_not_terminal'); }
  if (!inventoryValid) reasons.add('caller_request_inventory_incomplete');
  if (inventoryValid && bodyHashes.length === seenCallers.size) {
    bodyHashes.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.callerRequestId.localeCompare(b.callerRequestId));
    receipt.identity.promptSha256 = digest(JSON.stringify(bodyHashes.map(row => row.sha256)));
  } else reasons.add('forwarded_request_body_hashes_incomplete');
  const uniqueObserved = (key: 'requestedModel' | 'actualModel' | 'runtimeVersion'): string | null => {
    // A retry of an auxiliary request is still part of the auxiliary model
    // route. Its physical role must not change the primary model identity.
    const mainRequests = receipt.requests.filter(row => gateways.get(row.gatewayRequestId)?.role !== 'auxiliary');
    const observed = new Set(mainRequests.map(row => row[key]));
    return mainRequests.length && observed.size === 1 ? [...observed][0] ?? null : null;
  };
  receipt.identity.requestedModel = uniqueObserved('requestedModel');
  receipt.identity.actualModel = uniqueObserved('actualModel');
  receipt.identity.runtimeVersion = uniqueObserved('runtimeVersion');
  receipt.observedGatewayRuntimeVersions = [...new Set([...gateways.values()].map(request => text(request.runtimeVersion)).filter((version): version is string => version !== null))].sort();
  if ([...gateways.values()].some(request => !text(request.runtimeVersion)) || receipt.observedGatewayRuntimeVersions.length !== 1) {
    receipt.identity.runtimeVersion = null;
    reasons.add('gateway_runtime_identity_incomplete_or_mixed');
  }
  const routes = new Map<string, { requestedModel: string; actualModel: string }>();
  for (const request of receipt.requests) {
    if (!request.requestedModel || !request.actualModel) {
      receipt.identity.actualModel = null;
      reasons.add('request_model_identity_incomplete');
      continue;
    }
    const route = { requestedModel: request.requestedModel, actualModel: request.actualModel };
    routes.set(JSON.stringify(route), route);
  }
  receipt.observedModelRoutes = [...routes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, route]) => route);
  if (!receipt.identity.sourceSha) reasons.add('executed_source_identity_unavailable');
  if (run.executionSourceReceipt?.incompleteReason) reasons.add(run.executionSourceReceipt.incompleteReason);
  if (!receipt.identity.actualModel) reasons.add('actual_model_identity_unavailable_or_mixed');
  if (!receipt.identity.runtimeVersion) reasons.add('executed_runtime_version_unavailable_or_mixed');
  if (receipt.executionDurationMs === null) reasons.add('execution_timing_unavailable');
  reasons.add('retry_wait_not_observed');
  receipt.captureComplete = data.captureComplete === true && recordsValid;
  receipt.requestInventoryComplete = inventoryValid;
  receipt.includesAuxiliary = inventoryValid;
  receipt.includesFailures = inventoryValid;
  receipt.includesProviderRetries = inventoryValid && recordsValid;
  receipt.complete = inventoryValid && receipt.captureComplete && usageComplete;
  receipt.watermark = receipt.complete && text(data.watermark)
    ? JSON.stringify({ gatewayWatermark: data.watermark, callerInventorySha256: digest(JSON.stringify(inventory)) }) : null;
  receipt.incompleteReasons = [...reasons];
  return receipt;
}

/** Ledger outages add diagnostics to the status response, never hide Run status. */
export async function readRunRequestLedger(run: LedgerRunFacts, dataDir: string): Promise<GenerationRequestLedger> {
  if (run.agentId !== 'amr') return emptyReceipt(run, 'runtime_request_ledger_not_supported');
  if (!['succeeded', 'failed', 'canceled'].includes(run.status)) return emptyReceipt(run, 'run_not_terminal');
  try {
    const stdout = await runVelaCommand(['request-ledger', 'get', '--open-design-run-id', run.id, '--json'], {
      ...velaWorkspaceCommandOptions(run.workspaceScope?.workspaceId),
      env: { ...process.env, OD_DATA_DIR: dataDir }, timeoutMs: 10_000, maxBuffer: 16 * 1024 * 1024,
    });
    return normalizeVelaRequestLedger(JSON.parse(stdout), run);
  } catch {
    // CLI stderr/stdout can contain account details; expose a stable diagnosis.
    return emptyReceipt(run, 'vela_request_ledger_unavailable');
  }
}
