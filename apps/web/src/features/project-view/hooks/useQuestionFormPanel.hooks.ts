// Feature-local hook for the Questions panel: derives the active/preview
// question form from the latest assistant message, tracks a manually
// re-opened past form, and drives the Questions-tab auto-focus nonce. Pure
// computation over `messages`/`activeConversationId` — no transport, so it
// needs no injected port.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QuestionForm } from '../../../artifacts/question-form';
import {
  findFirstQuestionForm,
  hasUnterminatedQuestionForm,
  parsePartialQuestionForm,
} from '../../../artifacts/question-form';
import { parseSubmittedAnswers } from '../../../components/QuestionForm';
import type { QuestionFormOpenRequest } from '../../../components/AssistantMessage';
import type { ChatMessage } from '../../../types';
import { buildQuestionFormKey } from '../rules';

export interface QuestionFormPanelController {
  displayedQuestionForm: QuestionForm | null;
  displayedQuestionFormPreview: QuestionForm | null;
  displayedQuestionFormSubmittedAnswers: Record<string, string | string[]> | undefined;
  displayedQuestionFormActive: boolean;
  displayedQuestionsGenerating: boolean;
  displayedQuestionFormKey: string | null;
  focusQuestionsRequest: { nonce: number } | null;
  openQuestionsTab: (request?: QuestionFormOpenRequest) => void;
}

export function useQuestionFormPanel(
  messages: ChatMessage[],
  activeConversationId: string | null,
  currentConversationStreaming: boolean,
  projectId: string,
): QuestionFormPanelController {
  // Only surface the most recent assistant turn's question form, and
  // only while it's the most recent turn and the user hasn't answered yet
  // (an answer arrives as a following "[form answers …]" user message).
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant') return i;
    }
    return -1;
  }, [messages]);
  const lastAssistantContent =
    lastAssistantIndex >= 0 ? messages[lastAssistantIndex]?.content ?? '' : '';
  const lastAssistantMessageId =
    lastAssistantIndex >= 0 ? messages[lastAssistantIndex]?.id ?? null : null;
  const questionForm: QuestionForm | null = useMemo(
    () => findFirstQuestionForm(lastAssistantContent)?.form ?? null,
    [lastAssistantContent],
  );
  const questionFormSubmittedAnswers = useMemo(() => {
    if (!questionForm) return undefined;
    for (let i = lastAssistantIndex + 1; i < messages.length; i++) {
      const m = messages[i];
      if (m?.role !== 'user') continue;
      const parsed = parseSubmittedAnswers(questionForm, m.content ?? '');
      if (parsed) return parsed;
    }
    return undefined;
  }, [questionForm, lastAssistantIndex, messages]);
  const questionsGenerating =
    currentConversationStreaming && hasUnterminatedQuestionForm(lastAssistantContent);
  // While the form is still streaming, parse it tolerantly so the Questions tab
  // can show a frame (title) immediately and fill questions in as they arrive.
  const questionFormPreview = useMemo(
    () => (questionsGenerating ? parsePartialQuestionForm(lastAssistantContent) : null),
    [questionsGenerating, lastAssistantContent],
  );
  // The active (latest, unanswered) form stays editable the whole time it's on
  // screen — while it streams in AND while the turn is still busy — so it never
  // flickers between the locked (grey) and interactive (accent) styles.
  // Submission is gated separately by the panel via `submitDisabled`/generating.
  const questionFormActive =
    (!!questionForm || questionsGenerating) && questionFormSubmittedAnswers === undefined;
  // Mirror `questionFormActive`'s unanswered gate: once the user answers, the
  // Questions tab closes, so the auto-focus nonce must not treat an answered
  // form as a freshly appeared one.
  const hasQuestions =
    Boolean(questionForm || questionsGenerating) && questionFormSubmittedAnswers === undefined;
  // Stable identity for the current form occurrence, used to remember that its
  // one-by-one reveal already played. Keyed on the conversation + the hosting
  // assistant message id (not the message index, and NOT the parsed form id —
  // see buildQuestionFormKey). The assistant message id is allocated once and
  // kept in place across the streaming→persisted swap (same `assistantId`
  // throughout), so it survives the brief unmount/re-focus of the Questions tab
  // without replaying the animation, yet differs for every distinct form
  // occurrence (each lives in its own assistant message).
  const questionFormKey = useMemo(
    () =>
      buildQuestionFormKey(
        activeConversationId,
        lastAssistantMessageId,
        Boolean(questionForm ?? questionFormPreview),
      ),
    [activeConversationId, lastAssistantMessageId, questionForm, questionFormPreview],
  );

  // Release #3661: let a past question form be manually re-opened in the
  // Questions panel. Layered on top of main's stable questionFormKey (#3644) —
  // the `displayed*` values fall back to the live form when nothing is manually
  // pinned, so both fixes coexist.
  const [manualQuestionFormRequest, setManualQuestionFormRequest] =
    useState<QuestionFormOpenRequest | null>(null);
  useEffect(() => {
    setManualQuestionFormRequest(null);
  }, [projectId, activeConversationId]);
  useEffect(() => {
    if (hasQuestions && questionFormKey) setManualQuestionFormRequest(null);
  }, [hasQuestions, questionFormKey]);
  const displayedQuestionForm = manualQuestionFormRequest?.form ?? questionForm;
  const displayedQuestionFormPreview = manualQuestionFormRequest ? null : questionFormPreview;
  const displayedQuestionFormSubmittedAnswers =
    manualQuestionFormRequest?.submittedAnswers ?? questionFormSubmittedAnswers;
  const displayedQuestionFormActive = manualQuestionFormRequest ? false : questionFormActive;
  const displayedQuestionsGenerating = manualQuestionFormRequest ? false : questionsGenerating;
  const displayedQuestionFormKey = manualQuestionFormRequest
    ? `${activeConversationId ?? 'conversation'}:${manualQuestionFormRequest.messageId}:${manualQuestionFormRequest.form.id}:manual`
    : questionFormKey;

  // Auto-switch the workspace to the Questions tab when a new discovery form
  // first appears, and let the chat banner re-focus it on click. The nonce
  // bump is what FileWorkspace listens to.
  const [questionsFocusNonce, setQuestionsFocusNonce] = useState(0);
  const prevHasQuestionsRef = useRef(false);
  useEffect(() => {
    if (hasQuestions && !prevHasQuestionsRef.current) {
      setQuestionsFocusNonce((n) => n + 1);
    }
    prevHasQuestionsRef.current = hasQuestions;
  }, [hasQuestions]);
  const focusQuestionsRequest = useMemo(
    () => (questionsFocusNonce > 0 ? { nonce: questionsFocusNonce } : null),
    [questionsFocusNonce],
  );
  const submittedAnswersForQuestionFormRequest = useCallback((request: QuestionFormOpenRequest) => {
    const assistantIndex = messages.findIndex((m) => m.id === request.messageId);
    if (assistantIndex < 0) return null;
    for (let i = assistantIndex + 1; i < messages.length; i++) {
      const m = messages[i];
      if (!m) continue;
      if (m.role === 'assistant') break;
      if (m.role !== 'user') continue;
      const parsed = parseSubmittedAnswers(request.form, m.content ?? '');
      if (parsed) return parsed;
    }
    return null;
  }, [messages]);
  const openQuestionsTab = useCallback((request?: QuestionFormOpenRequest) => {
    if (request) {
      const opensCurrentLiveForm =
        request.messageId === lastAssistantMessageId
        && questionForm?.id === request.form.id
        && questionFormSubmittedAnswers === undefined;
      if (opensCurrentLiveForm) {
        setManualQuestionFormRequest(null);
      } else {
        setManualQuestionFormRequest({
          ...request,
          submittedAnswers:
            request.submittedAnswers ?? submittedAnswersForQuestionFormRequest(request) ?? undefined,
        });
      }
    }
    setQuestionsFocusNonce((n) => n + 1);
  }, [
    lastAssistantMessageId,
    questionForm,
    questionFormSubmittedAnswers,
    submittedAnswersForQuestionFormRequest,
  ]);

  return {
    displayedQuestionForm,
    displayedQuestionFormPreview,
    displayedQuestionFormSubmittedAnswers,
    displayedQuestionFormActive,
    displayedQuestionsGenerating,
    displayedQuestionFormKey,
    focusQuestionsRequest,
    openQuestionsTab,
  };
}
