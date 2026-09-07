import type { AppliedStrategyBindingV2, OpenDesignPlanContractV2 } from '@open-design/contracts';
import type Database from 'better-sqlite3';

import { readSkillDiscoveryState } from '../../skill-discovery/state.js';
import type { StrategyTaskExecutionRecord } from '../task-store.js';

/** Validate Agent declarations against product-owned, committed load receipts. */
export function validateOdNextSkillDecision(
  db: Database.Database,
  task: StrategyTaskExecutionRecord,
  binding: AppliedStrategyBindingV2,
  plan: OpenDesignPlanContractV2,
): string[] {
  if (!binding.discoveryCatalogRevision) {
    return plan.skillDecision ? ['od_next_skill_decision_unexpected'] : [];
  }
  const decision = plan.skillDecision;
  if (!decision) return ['od_next_skill_decision_missing'];
  const state = readSkillDiscoveryState(db, task.conversationId);
  const runIds = new Set(task.runs.map((run) => run.runId));
  if (!state || state.projectId !== task.projectId || state.activeRunId !== task.latestRunId
    || state.catalogRevision !== binding.discoveryCatalogRevision
    || decision.catalogRevision !== binding.discoveryCatalogRevision
    || !['resolved_skill', 'resolved_none'].includes(state.status)
    || !state.lastResolution || !runIds.has(state.lastResolution.runId)) {
    return ['od_next_skill_decision_scope_mismatch'];
  }
  const active = [...(state.activePrimary ? [state.activePrimary] : []), ...state.activeAuxiliaries];
  if (active.some((skill) => !runIds.has(skill.runId)
    || skill.catalogRevision !== binding.discoveryCatalogRevision)) {
    return ['od_next_skill_decision_receipt_scope_mismatch'];
  }
  const planning = task.inputStage !== 'production';
  if (decision.primarySkillId !== (state.activePrimary?.id ?? null)
    || (planning && (!equalIds(decision.auxiliarySkillIds, state.activeAuxiliaries.map((skill) => skill.id))
    || decision.skills.length !== active.length
    || active.some((skill) => !decision.skills.some((declared) => (
      declared.id === skill.id && declared.role === skill.role
      && declared.contentDigest === skill.contentDigest
      && declared.candidateDigest === skill.candidateDigest
    )))))) {
    return ['od_next_skill_decision_receipt_mismatch'];
  }
  if (!planning) {
    // A frozen Plan records planning-time reads. Later auxiliary exploration
    // is legal, but cannot fabricate or erase the receipts that justified it.
    const receipts = db.prepare(`SELECT run_id AS runId, payload_json AS payload
      FROM skill_discovery_events WHERE conversation_id = ? AND kind IN ('load','reuse','replace')`)
      .all(task.conversationId) as Array<{ runId: string; payload: string }>;
    const history = receipts.filter((row) => runIds.has(row.runId)).map((row) => JSON.parse(row.payload));
    if (decision.skills.some((skill) => !history.some((receipt) => (
      receipt.catalogRevision === decision.catalogRevision
      && receipt.id === skill.id && receipt.role === skill.role
      && receipt.contentDigest === skill.contentDigest && receipt.candidateDigest === skill.candidateDigest
    )))) return ['od_next_skill_decision_receipt_mismatch'];
  }
  if (state.activePrimary) {
    const profile = binding.selectionMode === 'agent-discovery'
      ? binding.availableTaskProfiles.find((item) => item.taskType === state.activePrimary?.id)
      : binding.selectedTaskProfile;
    if (!profile || profile.taskType !== state.activePrimary.id
      || state.activePrimary.contentDigest !== `sha256:${profile.sha256}`
      || plan.taskProfile.taskType !== profile.taskType
      || plan.taskProfile.taskProfileVersion !== profile.version) {
      return ['od_next_plan_task_profile_mismatch'];
    }
  } else if (binding.selectionMode !== 'agent-discovery'
    || plan.taskProfile.taskType !== 'generic'
    || plan.taskProfile.taskProfileVersion !== binding.genericProfileVersion) {
    return ['od_next_plan_task_profile_mismatch'];
  }
  return [];
}

export function validateOdNextAnsweredDecision(
  db: Database.Database,
  task: StrategyTaskExecutionRecord,
  binding: AppliedStrategyBindingV2,
): string[] {
  const state = readSkillDiscoveryState(db, task.conversationId);
  const runIds = new Set(task.runs.map((run) => run.runId));
  if (binding.selectionMode !== 'agent-discovery'
    || task.inputStage !== 'request'
    || !state || state.projectId !== task.projectId || state.activeRunId !== task.latestRunId
    || state.catalogRevision !== binding.discoveryCatalogRevision
    || state.status !== 'resolved_none' || state.activePrimary !== null
    || state.lastResolution?.kind !== 'none'
    || !runIds.has(state.lastResolution.runId)
    || state.activeAuxiliaries.some((skill) => !runIds.has(skill.runId)
      || skill.catalogRevision !== binding.discoveryCatalogRevision)) {
    return ['od_next_answered_decision_invalid'];
  }
  return [];
}

/** Direct Edit has no Plan: the Agent's committed native load is its declaration. */
export function validateOdNextDirectEditDecision(
  db: Database.Database,
  task: StrategyTaskExecutionRecord,
  binding: AppliedStrategyBindingV2,
): string[] {
  if (!binding.discoveryCatalogRevision) return [];
  const state = readSkillDiscoveryState(db, task.conversationId);
  const runIds = new Set(task.runs.map((run) => run.runId));
  if (!state || state.projectId !== task.projectId || state.activeRunId !== task.latestRunId
    || state.catalogRevision !== binding.discoveryCatalogRevision
    || state.status !== 'resolved_skill' || !state.activePrimary
    || !state.lastResolution || !runIds.has(state.lastResolution.runId)
    || [state.activePrimary, ...state.activeAuxiliaries].some((skill) => !runIds.has(skill.runId)
      || skill.catalogRevision !== binding.discoveryCatalogRevision)) {
    return ['od_next_direct_edit_decision_invalid'];
  }
  const profile = binding.selectionMode === 'agent-discovery'
    ? binding.availableTaskProfiles.find((item) => item.taskType === state.activePrimary?.id)
    : binding.selectedTaskProfile;
  return !profile || profile.taskType !== state.activePrimary.id
    || state.activePrimary.contentDigest !== `sha256:${profile.sha256}`
    ? ['od_next_plan_task_profile_mismatch'] : [];
}

function equalIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}
