// Build the user-request payload sent to an agent runtime. This boundary owns
// transcript omission for resumable sessions and the form-answer transition
// that prevents follow-up turns from re-asking an already submitted form.

export const FORM_ANSWERS_HEADER_RE = /^\s*\[form answers\s+(?:\u2014|-)\s*([^\]\r\n]+)\]/i;

export type ChatUserRequestOptions = {
  skipTranscript?: boolean | undefined;
};

export function telemetryPromptFromRunRequest(
  message: string,
  currentPrompt: unknown,
): string {
  return typeof currentPrompt === 'string' ? currentPrompt : message;
}

function formAnswerTransitionForCurrentPrompt(currentPrompt: unknown): string | null {
  if (typeof currentPrompt !== 'string') return null;
  const trimmed = currentPrompt.trim();
  if (!trimmed) return null;
  const match = FORM_ANSWERS_HEADER_RE.exec(trimmed);
  if (!match) return null;
  const rawFormId = (match[1] || 'form').trim() || 'form';
  const formId = rawFormId.replace(/[^\w.-]/g, '') || 'form';
  const lines = [
    '## Latest user turn - form answers submitted',
    trimmed,
    '',
    // Keep the wording in lock-step with the system prompt overrides. The
    // user-request transition is deliberately explicit for weaker agents.
    `The user has answered the ${formId} form. Do not emit another ${formId} form.`,
  ];
  if (formId.toLowerCase() === 'discovery' || formId.toLowerCase() === 'task-type') {
    lines.push(
      'Continue with RULE 2 / RULE 3 now. For Branch B answers, build now instead of asking another brief.',
    );
  } else {
    lines.push(
      'Treat these form answers as the active user turn instead of replaying the transcript as a fresh request.',
    );
  }
  return lines.join('\n');
}

export function composeChatUserRequestForAgent(
  message: string,
  currentPrompt: unknown,
  options: ChatUserRequestOptions = {},
): string {
  // Resumable adapters retain their upstream session history. Sending the
  // rendered transcript again duplicates context and can replay old form
  // markup, so only the latest user turn is sent when requested.
  const skip = options.skipTranscript === true;
  const bodySource = skip ? currentPrompt : message;
  const body =
    typeof bodySource === 'string' && bodySource.trim()
      ? bodySource
      : '(No extra typed instruction.)';
  const transition = formAnswerTransitionForCurrentPrompt(currentPrompt);
  if (!transition) return body;
  if (skip) {
    return [transition, body].join('\n\n');
  }
  return [transition, '## Full conversation transcript', body].join('\n\n');
}
