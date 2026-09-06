import { renderArtifactFocusInstruction } from '../api/artifact-focus-marker.js';
import { renderDoneMarker } from '../api/done-marker.js';
import { renderNextStepMarkerExample } from '../api/next-step-marker.js';

export type ChatTurnHostProtocolPolicy =
  | 'ordinary'
  | 'od_next_request'
  | 'od_next_production';

export interface ChatTurnHostProtocolInstructions {
  doneMarker: string;
  nextSteps: string;
  artifactFocus: string;
  text: string;
}

function odNextStageGate(policy: ChatTurnHostProtocolPolicy): string {
  if (policy === 'od_next_request') {
    return [
      'OD Next host handoff gate:',
      'Use the three keyed host protocols below only when this request-stage response declares route=direct_edit, inputStage=request, and outcome=completed.',
      'For full_plan, plan_ready, clarification_required, blocked, failed, or canceled responses, omit all three protocols.',
    ].join('\n');
  }
  if (policy === 'od_next_production') {
    return [
      'OD Next host handoff gate:',
      'Use the three keyed host protocols below only when this production-stage response declares inputStage=production and outcome=completed.',
      'For blocked, failed, or canceled responses, omit all three protocols.',
    ].join('\n');
  }
  return '';
}

/**
 * Render the keyed, per-turn protocol that hands a completed model turn back to
 * the chat host. The nonce keeps this text out of every cache-stable prompt
 * head; callers inject it into the request/continuation slice only.
 */
export function renderChatTurnHostProtocolInstructions(
  key: string,
  policy: ChatTurnHostProtocolPolicy = 'ordinary',
): ChatTurnHostProtocolInstructions {
  if (!key) {
    return { doneMarker: '', nextSteps: '', artifactFocus: '', text: '' };
  }

  const doneMarker = [
    'Turn completion marker:',
    `This turn's key is ${key}.`,
    'When you finish working and are about to write the part the user actually reads — your answer, summary, or delivery note — emit exactly one marker immediately before it:',
    renderDoneMarker(key),
    'Everything before the marker is filed as working narration into a collapsed execution log; everything after it is shown to the user directly. Emit it at most once, and only when the work is done.',
    'The key is different every turn: copy the one above verbatim, never reuse an earlier one, and never invent one.',
    'Skip the marker when you are ending the turn with a <question-form> or an <artifact> block — those already close the working phase on their own.',
    'The marker is protocol, not prose: do not mention it, do not explain it, and do not wrap it in a code fence (a fenced marker is deliberately ignored).',
  ].join('\n');
  const nextSteps = [
    'Follow-up suggestions:',
    'As the very last thing in this turn — after your summary, delivery note, or <artifact> block — emit exactly three self-closing follow-up markers:',
    renderNextStepMarkerExample(key, [
      'Add an orders list page',
      'Switch the product cards to a two-column layout',
      'Add a dark mode',
    ]),
    'Rules: exactly three markers, one suggestion in each value attribute, no bullets, no numbering, no trailing punctuation, and no paired opening/closing tag.',
    'Each line is a concrete next action on what THIS turn actually produced, worded so the user could send it verbatim as their next message — not a topic, not a question, not an offer of help.',
    'Write them in the language the user is speaking, and keep each under 120 characters.',
    `This turn's key is ${key}: copy it verbatim, never reuse an earlier one, and never invent one.`,
    'Skip all three markers when the turn produced nothing to iterate on — a greeting, a plain answer, a turn ending in a <question-form> — or when you have no useful suggestion. Omitting them is fine; padding them with filler is not.',
    'The markers are protocol, not prose: do not mention them, do not explain them, and do not wrap them in a code fence.',
  ].join('\n');
  const artifactFocus = renderArtifactFocusInstruction(key);
  const text = [
    odNextStageGate(policy),
    doneMarker,
    nextSteps,
    artifactFocus,
  ].filter(Boolean).join('\n\n---\n\n');

  return { doneMarker, nextSteps, artifactFocus, text };
}
