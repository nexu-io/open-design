import { Fragment,
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';
import { Button } from '@open-design/components';
import { tForLanguageTag, useT } from '../i18n';
import type { FormOption, QuestionForm } from '../artifacts/question-form';
import {
  formatFormAnswers,
  formOptionValueForLabel,
  normalizeHexColor,
} from '../artifacts/question-form';
import { Icon } from './Icon';

export type QuestionFormInteraction =
  | {
      element: 'step_back' | 'step_next' | 'step_skip';
      questionId: string;
      stepIndex: number;
      stepCount: number;
    };

const OPTIONAL_FORM_AUTO_CONTINUE_SECONDS = 10 * 60;

interface Props {
  form: QuestionForm;
  // Whether the user can still submit answers. The owning AssistantMessage
  // disables the form when the assistant turn is no longer the most recent
  // one (i.e. the user has already moved past it).
  interactive: boolean;
  // Pre-existing answers — when we detect a follow-up user message that
  // begins with "[form answers — <id>]", we parse it back out and pass it
  // here so the rendered form reflects what was sent.
  submittedAnswers?: Record<string, string | string[]>;
  // Embedded hosts may own submission, so the form can hide its footer and
  // report draft/readiness state outward.
  hideInternalSubmit?: boolean;
  draftAnswers?: Record<string, string | string[]>;
  onReadyChange?: (ready: boolean) => void;
  onDraftChange?: (answers: Record<string, string | string[]>) => void;
  // Fires on each real user interaction with a single question (locked forms
  // never reach it), allowing the host to track finite-choice picks.
  onAnswerChange?: (questionId: string, value: string | string[]) => void;
  onInteraction?: (interaction: QuestionFormInteraction) => void;
  onSubmit?: (
    text: string,
    answers: Record<string, string | string[]>,
    source: 'submit' | 'skip' | 'auto',
    files?: QuestionFormFileSubmission[],
  ) => void;
  submitDisabled?: boolean;
  // When enabled, the form moves on after the timeout. Any unanswered field,
  // including a required one, is submitted as "(skipped)".
  autoContinueAfterTimeout?: boolean;
}

export interface QuestionFormFileSubmission {
  questionId: string;
  questionLabel: string;
  files: File[];
}

// Lets an embedding host trigger submission.
export interface QuestionFormHandle {
  submit: () => void;
  // Submit with no answers — backs the "skip all" affordance. This is an
  // explicit user decision, so it records every question as "(skipped)" and
  // moves on even when the normal form path marks a question required.
  skipAll: () => void;
}

export const QuestionFormView = forwardRef<QuestionFormHandle, Props>(function QuestionFormView(
  {
    form,
    interactive,
    submittedAnswers,
    hideInternalSubmit = false,
    draftAnswers,
    onReadyChange,
    onDraftChange,
    onAnswerChange,
    onInteraction,
    onSubmit,
    submitDisabled = false,
    autoContinueAfterTimeout = false,
  },
  ref,
) {
  const uiT = useT();
  // Host strings inside the card follow the form's declared content language
  // (`form.lang`, set by the model alongside the localized labels) so a
  // Chinese form in an English UI doesn't mix scripts; without a resolvable
  // tag they follow the app UI locale as before.
  const t = useMemo(() => tForLanguageTag(form.lang) ?? uiT, [form.lang, uiT]);
  const initial = useMemo(
    () => buildInitialState(form, submittedAnswers, draftAnswers),
    [form, submittedAnswers, draftAnswers],
  );
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(initial);
  const [fileAnswers, setFileAnswers] = useState<Record<string, File[]>>({});
  // Question ids the user has interacted with this mount, seeded with ids
  // restored from a submitted/draft snapshot (those are prior user input).
  // "Untouched" for the streamed-default backfill below means absent here —
  // NOT "currently empty": clearing an answer is itself a touch.
  const [touched] = useState(
    () => new Set<string>(Object.keys(submittedAnswers ?? draftAnswers ?? {})),
  );
  // Finite-choice questions keep their type-in field collapsed behind a
  // host-rendered "Other" chip; this tracks which questions the user expanded
  // this mount. A question whose current answer already carries a custom
  // value (submitted history, restored draft) renders expanded without an
  // entry here — see customChoiceExpanded.
  const [otherOpen, setOtherOpen] = useState<Set<string>>(() => new Set());
  /*
   * 颜色题的 Hex 输入框、数值题的数字输入框,各自的**在编文本**。
   *
   * 它们和答案是两回事:答案任何时刻都是合法的规范值,文本则允许停在
   * 「正在敲、还不成立」的中间态。有 key 就说明用户正在这个框里打字,
   * 显示以文本为准;失焦时删掉这个 key,显示落回答案。
   *
   * 这样才做得到两件事:非法 Hex 能标错并把「下一步」按住(答案不动、
   * 不会把一个坏值提交出去),以及 1–5 的范围里想输「10」不会被第一下就吃成 1。
   */
  const [colorText, setColorText] = useState<Record<string, string>>({});
  const [rangeText, setRangeText] = useState<Record<string, string>>({});
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<Set<string>>(() => new Set());
  const [autoContinueRemaining, setAutoContinueRemaining] = useState(
    OPTIONAL_FORM_AUTO_CONTINUE_SECONDS,
  );
  const autoContinuedRef = useRef(false);
  const locked = !interactive || !onSubmit || submittedAnswers !== undefined;
  /*
   * 「已回答」是一句关于**用户做过什么**的陈述 —— 只有真的解析到提交答案才兑现。
   *
   * `locked` 说的是另一件事:这张表**现在收不了提交**。它有三种来路,其中两种
   * (不是最后一条助手消息、宿主根本不收提交)跟用户答没答过毫无关系。
   * 两句话过去共用 `locked`,于是一把锁上去就替用户宣布他答过了 ——
   * OPEND-2644 里宿主在问卷后面补发一条记忆卡,问卷一个字没答就挂上了「已回答」,
   * 连表单自带的默认选项都被当成「他确认过的答案」。
   *
   * 底部那句说明早就分好了两档(`qf.lockedSubmitted` / `qf.lockedPrev`),
   * 卡头这一枚跟上。
   */
  const answered = submittedAnswers !== undefined;
  // Submitted answers are held by the host in their original wire format.
  // Use the normalized snapshot for rendering so legacy tone values select
  // the same visual card that a new submission will send.
  const currentAnswers = submittedAnswers !== undefined ? initial : answers;
  const stepped = !locked && !hideInternalSubmit && form.questions.length > 1;
  const activeQuestion = form.questions[activeQuestionIndex];
  const isLastQuestion = activeQuestionIndex === form.questions.length - 1;
  const questionsToRender = stepped && activeQuestion ? [activeQuestion] : form.questions;
  /** 多选题勾了几行 —— 稿子把它摆在卡头右侧(`.h .n`) */
  const pickedCount = questionsToRender.reduce((sum, q) => {
    return sum + pickedCheckboxChoiceCount(
      q,
      currentAnswers[q.id],
      otherOpen.has(q.id),
    );
  }, 0);

  useEffect(() => {
    setActiveQuestionIndex(0);
    setSkippedQuestionIds(new Set());
  }, [form.id]);

  useEffect(() => {
    setActiveQuestionIndex((current) =>
      Math.min(current, Math.max(0, form.questions.length - 1)),
    );
  }, [form.questions.length]);

  function hasCustomAnswer(q: QuestionForm['questions'][number]): boolean {
    const value = currentAnswers[q.id];
    return q.type === 'checkbox'
      ? customCheckboxValue(q, value).length > 0
      : customSingleValue(q, value).length > 0;
  }

  // Whether a finite-choice question shows its custom type-in field. Locked
  // forms only ever show it when the recorded answer is a custom value.
  function customChoiceExpanded(q: QuestionForm['questions'][number]): boolean {
    if (locked) return hasCustomAnswer(q);
    return otherOpen.has(q.id) || hasCustomAnswer(q);
  }

  // Toggle the "Other" chip. Opening a single-choice question's field
  // deselects the fixed options (the user is saying "none of these");
  // collapsing discards any custom text and keeps only known option values.
  function toggleOther(q: QuestionForm['questions'][number]) {
    if (locked) return;
    const expanded = customChoiceExpanded(q);
    setOtherOpen((prev) => {
      const next = new Set(prev);
      if (expanded) next.delete(q.id);
      else next.add(q.id);
      return next;
    });
    if (expanded) {
      if (q.type === 'checkbox') {
        const current = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
        update(q.id, current.filter((entry) => questionValueIsKnown(q, entry)));
      } else {
        const current = typeof answers[q.id] === 'string' ? (answers[q.id] as string) : '';
        if (!questionValueIsKnown(q, current)) update(q.id, '');
      }
    } else if (q.type !== 'checkbox') {
      update(q.id, '');
    }
  }

  /* ── 颜色:预设色块 / 系统取色器 / Hex 输入,三条路一个落点 ───────── */

  /** 预设色块和系统取色器走这条 —— 它们只可能给出合法值,直接落地并收掉在编文本。 */
  function pickColor(q: QuestionForm['questions'][number], raw: string) {
    const canonical = normalizeHexColor(raw);
    if (!canonical) return;
    clearDraftText(setColorText, q.id);
    update(q.id, canonical);
  }

  /**
   * Hex 框在敲字。合法就同步落到答案(取色器和色块立刻跟上),
   * 不合法只留着文本 —— 答案保持上一个合法值,由 `ready` 把「下一步」按住。
   */
  function typeColor(q: QuestionForm['questions'][number], raw: string) {
    setColorText((prev) => ({ ...prev, [q.id]: raw }));
    const canonical = normalizeHexColor(raw);
    if (canonical) update(q.id, canonical);
  }

  /** 失焦:文本让位给答案。合法值收成规范形,非法值直接回滚(稿子 `hex.blur` 的行为)。 */
  function settleColor(q: QuestionForm['questions'][number]) {
    clearDraftText(setColorText, q.id);
  }

  /* ── 数值滑块:滑杆与数字输入共用一个值 ─────────────────────────── */

  function dragRange(q: QuestionForm['questions'][number], raw: string) {
    clearDraftText(setRangeText, q.id);
    update(q.id, String(clampRangeValue(Number(raw), q)));
  }

  function typeRange(q: QuestionForm['questions'][number], raw: string) {
    setRangeText((prev) => ({ ...prev, [q.id]: raw }));
    const parsed = Number(raw);
    if (raw.trim().length === 0 || !Number.isFinite(parsed)) return;
    update(q.id, String(clampRangeValue(parsed, q)));
  }

  /**
   * 失焦:只把在编文本让位给答案,显示于是从「99」跳回收好的「5」。
   *
   * 这里**不需要**再算一次 clamp —— `typeRange` 每一次可解析的输入都已经把
   * 收好的值落到答案上了,答案任何时刻都是合法的。曾经在这儿又写了一遍同样的
   * 计算:撤掉它测试全绿(说明它一次也没起过作用),留着只是给同一条规则
   * 攒第二个会漂的实现。
   */
  function settleRange(q: QuestionForm['questions'][number]) {
    clearDraftText(setRangeText, q.id);
  }

  // Picking a fixed option collapses an open (and still empty) "Other" field
  // on single-choice questions; checkbox questions keep it open since fixed
  // and custom entries coexist.
  function pickFixed(q: QuestionForm['questions'][number], value: string) {
    setOtherOpen((prev) => {
      if (!prev.has(q.id)) return prev;
      const next = new Set(prev);
      next.delete(q.id);
      return next;
    });
    update(q.id, value);
  }

  /**
   * 「自己填」—— 交付稿 `.opt.mod-own`,是选项列表里的**最后一项**,输入框**内嵌在这一项里**。
   *
   *   <div class="opt mod-own is-on is-open">
   *     <span class="box">✓</span>
   *     <span class="own">
   *       <span class="own-l">自己填</span>
   *       <textarea class="own-ta" rows="1" placeholder="用你自己的说法写 —— …"></textarea>
   *     </span>
   *   </div>
   *
   * 原来这里是「其他」两个字 + 列表**之后**另起的一块折叠输入框。三处都不对:
   * 文案(稿子全文没有「其他」)、位置(输入框不在这一项里)、以及那块折叠动画(稿子没有)。
   *
   * 与稿子唯一的形状差别:那枚勾选框用真 `<button>`(稿子是静态 `<span>`)——
   * 稿子是张不能点的图,产品里这枚必须能用键盘操作。视觉一致,可达性更好。
   */
  function renderOwnChoice(
    q: QuestionForm['questions'][number],
    value: string,
    onChangeOwn: (next: string) => void,
  ) {
    const on = customChoiceExpanded(q);
    const label = q.customLabel ?? t('qf.ownAnswer');
    // 收起态:稿子和别的选项一模一样,是 `<button class="opt mod-own">`
    if (!on) {
      return (
        <button
          type="button"
          className="qf-chip qf-chip-other"
          data-chat-scroll-anchor={`question-own:${q.id}`}
          data-chat-preserve-scroll-anchor={`question-own:${q.id}`}
          aria-pressed={false}
          disabled={locked}
          onClick={() => toggleOther(q)}
        >
          <span className="qf-chip-box"><ChipCheck /></span>
          <span className="qf-own-label">{label}</span>
        </button>
      );
    }
    // 展开态:稿子换成 `<div class="opt mod-own is-on is-open">`,输入框内嵌在这一项里
    return (
      <div
        className="qf-chip qf-chip-other qf-chip-on qf-chip-open"
        data-chat-scroll-anchor={`question-own:${q.id}`}
      >
        <button
          type="button"
          className="qf-chip-own-box"
          data-chat-preserve-scroll-anchor={`question-own:${q.id}`}
          aria-pressed
          aria-label={label}
          disabled={locked}
          onClick={() => toggleOther(q)}
        >
          <ChipCheck />
        </button>
        <span className="qf-own">
          <span className="qf-own-label">{label}</span>
          <textarea
            rows={1}
            className="qf-own-input qf-input"
            data-testid="qf-input"
            value={value}
            placeholder={q.customPlaceholder ?? t('qf.customPlaceholder')}
            disabled={locked}
            onChange={(e) => onChangeOwn(e.target.value)}
          />
        </span>
      </div>
    );
  }

  useEffect(() => {
    setFileAnswers({});
  }, [form.id]);

  // When the form streams in question-by-question, backfill state for newly
  // revealed questions without disturbing answers the user already touched.
  useEffect(() => {
    setAnswers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const q of form.questions) {
        if (next[q.id] !== undefined) {
          if (shouldAdoptStreamedDefault(q, next[q.id]!, touched)) {
            next[q.id] = recommendedValueWithinDeclaredRange(
              q,
              canonicalizeQuestionValue(q, q.defaultValue!),
            );
            changed = true;
          }
          continue;
        }
        changed = true;
        if (submittedAnswers && submittedAnswers[q.id] !== undefined) {
          next[q.id] = canonicalizeQuestionValue(
            q,
            submittedAnswers[q.id]!,
                  );
        } else if (q.defaultValue !== undefined) {
          next[q.id] = recommendedValueWithinDeclaredRange(
            q,
            canonicalizeQuestionValue(q, q.defaultValue),
          );
        } else {
          next[q.id] = emptyQuestionValue(q);
        }
      }
      return changed ? next : prev;
    });
  }, [form, submittedAnswers, touched]);

  function update(id: string, value: string | string[]) {
    if (locked) return;
    touched.add(id);
    const next = { ...answers, [id]: value };
    setAnswers(next);
    setSkippedQuestionIds((current) => {
      if (!current.has(id)) return current;
      const nextSkipped = new Set(current);
      nextSkipped.delete(id);
      return nextSkipped;
    });
    onDraftChange?.(draftSafeAnswers(form, next));
    onAnswerChange?.(id, value);
  }

  function toggleCheckbox(id: string, option: string, maxSelections?: number) {
    if (locked) return;
    const current = Array.isArray(answers[id]) ? (answers[id] as string[]) : [];
    const has = current.includes(option);
    if (!has && maxSelections !== undefined && current.length >= maxSelections) return;
    touched.add(id);
    const next = has ? current.filter((v) => v !== option) : [...current, option];
    const nextAnswers = { ...answers, [id]: next };
    setAnswers(nextAnswers);
    setSkippedQuestionIds((currentSkipped) => {
      if (!currentSkipped.has(id)) return currentSkipped;
      const nextSkipped = new Set(currentSkipped);
      nextSkipped.delete(id);
      return nextSkipped;
    });
    onDraftChange?.(draftSafeAnswers(form, nextAnswers));
    onAnswerChange?.(id, next);
  }

  function updateCheckboxCustom(q: QuestionForm['questions'][number], raw: string) {
    if (locked) return;
    const current = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
    const fixed = current.filter((entry) => questionValueIsKnown(q, entry));
    update(q.id, [...fixed, ...splitCustomEntries(raw)]);
  }

  function finalizeSubmission(
    source: 'submit' | 'skip' | 'auto',
    skippedIds: ReadonlySet<string> = skippedQuestionIds,
  ) {
    if (!onSubmit) return;
    const submittedAnswers = answersWithSkippedQuestions(form, answers, skippedIds);
    const submissionForm = form;
    const files = collectFileSubmissions(form, fileAnswers, skippedIds);
    if (files.length > 0) {
      onSubmit(formatFormAnswers(submissionForm, submittedAnswers), submittedAnswers, source, files);
    } else {
      onSubmit(formatFormAnswers(submissionForm, submittedAnswers), submittedAnswers, source);
    }
  }

  function handleSubmit() {
    if (locked || !onSubmit) return;
    // Block submit until required fields are answered and selection caps hold.
    if (!ready) return;
    finalizeSubmission('submit');
  }

  function handleSkipAll() {
    if (locked || !onSubmit) return;
    const empty: Record<string, string | string[]> = {};
    onSubmit(formatFormAnswers(form, empty), empty, 'skip');
  }

  function handleSkipCurrent() {
    if (locked || !onSubmit || !activeQuestion) return;
    onInteraction?.({
      element: 'step_skip',
      questionId: activeQuestion.id,
      stepIndex: activeQuestionIndex + 1,
      stepCount: form.questions.length,
    });
    const nextSkipped = new Set(skippedQuestionIds);
    nextSkipped.add(activeQuestion.id);
    setSkippedQuestionIds(nextSkipped);
    if (!isLastQuestion) {
      setActiveQuestionIndex((current) => current + 1);
      return;
    }
    finalizeSubmission('skip', nextSkipped);
  }

  function handlePreviousQuestion() {
    if (!activeQuestion || activeQuestionIndex === 0) return;
    onInteraction?.({
      element: 'step_back',
      questionId: activeQuestion.id,
      stepIndex: activeQuestionIndex + 1,
      stepCount: form.questions.length,
    });
    setActiveQuestionIndex((current) => Math.max(0, current - 1));
  }

  function handleNextQuestion() {
    if (!activeQuestion || isLastQuestion || !currentQuestionReady) return;
    onInteraction?.({
      element: 'step_next',
      questionId: activeQuestion.id,
      stepIndex: activeQuestionIndex + 1,
      stepCount: form.questions.length,
    });
    setActiveQuestionIndex((current) => current + 1);
  }

  // Per-question checkbox selection caps must hold.
  const withinSelectionLimits = form.questions.every((q) => {
    if (q.type !== 'checkbox' || q.maxSelections === undefined) return true;
    const v = currentAnswers[q.id];
    return !Array.isArray(v) || v.length <= q.maxSelections;
  });
  // 有选项的问题必须先有答案,不想答走旁边的「跳过」——「跳过」会把值序列化成
  // "(skipped)",让 agent 拿默认值往下走。判据来自交付稿意图澄清那五格的状态标签
  // (5-1「一个都没选 ——『下一步』置灰」/ 5-4「没写字前『下一步』仍置灰」)。
  const requiredAnswered = form.questions.every((q) => {
    if (!questionNeedsAnswer(q)) return true;
    if (skippedQuestionIds.has(q.id)) return true;
    const v = currentAnswers[q.id];
    return questionAnswerIsPresent(v);
  });
  /*
   * 稿子:「Hex 非法时『下一步』置灰」。这一条和 `required` 无关 —— 用户已经
   * 在框里写了东西,只是写得不成立;这时放行会把上一个颜色当成他的选择提交出去。
   * 判据只看**在编文本**:没在编(或编的是合法值)就不拦。
   */
  const colorTextIsInvalid = (id: string): boolean => {
    const raw = colorText[id];
    return raw !== undefined && normalizeHexColor(raw) === null;
  };
  const noColorTextPending = form.questions.every(
    (q) => q.type !== 'color' || !colorTextIsInvalid(q.id),
  );
  const ready = withinSelectionLimits && requiredAnswered && noColorTextPending;
  /* 底栏和视觉方向那一行**共用同一颗**「下一步」—— 各造一份迟早会漂 */
  const submitButton = (
    <Button
      type="button"
      size="sm"
      variant="primary"
      className="qf-primary-action"
      onClick={handleSubmit}
      disabled={submitDisabled || !ready}
      title={!submitDisabled && ready ? t('qf.submitTitle') : t('qf.submitDisabledTitle')}
    >
      {form.submitLabel ?? t('qf.submitDefault')}
    </Button>
  );
  // A manual Skip all is always available, including for required questions.
  const canSkipAll = true;
  const hasRequiredQuestions = form.questions.some((q) => q.required === true);
  // Timeout continuation shares the explicit Skip semantics: unanswered
  // questions, including required ones, are serialized as "(skipped)".
  const autoContinueEnabled =
    autoContinueAfterTimeout &&
    !locked &&
    !submitDisabled;
  const currentQuestionReady = ((): boolean => {
    if (!activeQuestion) return true;
    // 分步态下「下一步」也不许在半截的 Hex 上放行
    if (colorTextIsInvalid(activeQuestion.id)) return false;
    if (!questionNeedsAnswer(activeQuestion)) return true;
    if (skippedQuestionIds.has(activeQuestion.id)) return true;
    return questionAnswerIsPresent(currentAnswers[activeQuestion.id]);
  })();
  const autoContinueCountdown = `${Math.floor(autoContinueRemaining / 60)}:${String(
    autoContinueRemaining % 60,
  ).padStart(2, '0')}`;

  useImperativeHandle(ref, () => ({ submit: handleSubmit, skipAll: handleSkipAll }));
  useEffect(() => {
    onReadyChange?.(!locked && ready);
  }, [onReadyChange, locked, ready]);
  useEffect(() => {
    if (!autoContinueEnabled) {
      setAutoContinueRemaining(OPTIONAL_FORM_AUTO_CONTINUE_SECONDS);
      autoContinuedRef.current = false;
      return;
    }
    setAutoContinueRemaining(OPTIONAL_FORM_AUTO_CONTINUE_SECONDS);
    autoContinuedRef.current = false;
    const timer = window.setInterval(() => {
      setAutoContinueRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoContinueEnabled, form.id]);
  useEffect(() => {
    if (
      !autoContinueEnabled ||
      autoContinueRemaining > 0 ||
      autoContinuedRef.current ||
      !onSubmit
    ) {
      return;
    }
    autoContinuedRef.current = true;
    finalizeSubmission('auto');
  }, [answers, autoContinueEnabled, autoContinueRemaining, fileAnswers, form, onSubmit]);

  /*
   * 回答完就**收成一条陈述**(交付稿 #23 / #24 / #25),不再把整张表单锁住置灰。
   *
   * 我原来把这条挂成 T11「待产品拍板:收成陈述 vs 锁住表单」—— 稿子画得清清楚楚就是收成陈述,
   * 是把一个稿子已经回答的问题当成了「产品没定」。
   *
   * 判据是 **`submittedAnswers` 给了 + 不可交互**,两个条件缺一不可:
   * `submittedAnswers` 自己不够 —— 它也用来把历史答案**回填进可编辑的表单**
   * (`interactive` 为真的那条路径)。只看它就会把「回填后还能改」收成静态陈述,
   * 等于弄丢编辑能力。这是老用例
   * 「renders restored legacy visual tone answers on their matching cards」拦下来的。
   */
  if (submittedAnswers !== undefined && !interactive) {
    return (
      <AnsweredSummary
        form={form}
        answers={submittedAnswers}
        t={t}
      />
    );
  }

  return (
    <div className={`question-form${locked ? ' question-form-locked' : ''}`} data-form-id={form.id}>
      <div className="question-form-head">
        {/*
          稿子的卡头是 `.hd > svg + b` —— 图标**直接**放在头里,标题也不套包裹层。
          原来这里多包了 `span.question-form-icon` 和 `div.question-form-titles` 两层,
          逐元素比样式时两边序列从第 1 个就错开,后面全部串位。
          (图标路径逐字取自交付稿 `.hd-ic`)
        */}
        <svg className="question-form-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M18.3644 1.80762C18.6295 1.80769 18.8839 1.91312 19.0714 2.10059L21.8995 4.92871C22.29 5.31919 22.2899 5.95224 21.8995 6.34277L18.2276 10.0146C19.2826 11.3871 20.0766 12.7665 20.5108 14.0059C20.7653 14.7323 20.9135 15.4571 20.8878 16.1279C20.8618 16.8063 20.6529 17.4897 20.1319 18.0107C19.3188 18.8238 18.1404 18.8753 17.0909 18.6602C16.0059 18.4376 14.789 17.885 13.5646 17.1104L14.6339 15.4199C15.7393 16.1193 16.7271 16.5441 17.4933 16.7012C18.2945 16.8654 18.6149 16.6996 18.7179 16.5967C18.7857 16.5288 18.877 16.3822 18.8897 16.0518C18.9027 15.7134 18.8269 15.2486 18.6231 14.667C18.2955 13.732 17.6762 12.6159 16.7999 11.4424L14.8282 13.4141C14.6407 13.6016 14.3864 13.707 14.1212 13.707H11.2931C10.7408 13.707 10.2931 13.2593 10.2931 12.707V9.87891C10.2931 9.61372 10.3985 9.3594 10.586 9.17188L12.4435 7.31348C11.2356 6.6015 10.012 6.19175 8.91026 6.08594C7.51104 5.95164 6.38043 6.30526 5.63584 7.0498C4.77429 7.91135 4.43188 9.30214 4.77354 11.0107C5.11363 12.7112 6.12068 14.605 7.75791 16.2422C9.51568 18 11.5651 19.0286 13.3526 19.29L13.0636 21.2686C10.7846 20.9353 8.35467 19.669 6.34287 17.6572C4.46542 15.7798 3.24029 13.5416 2.8126 11.4033C2.38658 9.2732 2.74022 7.1173 4.22178 5.63574C5.49617 4.3614 7.27806 3.91963 9.10166 4.09473C10.6796 4.24628 12.3422 4.86047 13.8966 5.86035L17.6573 2.10059L17.7306 2.03418C17.9085 1.88844 18.1323 1.80762 18.3644 1.80762ZM12.2931 10.293V11.707H13.7071L19.7784 5.63574L18.3644 4.22168L12.2931 10.293Z" />
        </svg>
        {/* 稿子的卡头标题是 `<b>`(`.card > .h b { font-weight: inherit }`),不是 div ——
            标签不一样,逐元素比样式时从这里开始整段串位 */}
        <b className="question-form-title">{form.title}</b>
        {/*
          OPEND-2641:分步进度(`1/4`)**不在这里** —— 它跟着当前问句走,
          渲染在 `.qf-label` 的末尾(见下面 `<StepProgress />` 的调用点)。
          卡头留给卡的名字和**整卡**状态(「已选 N」/「已回答」/ 倒计时)。
          进度说的是「这一问在第几问」,那是问句的属性,不是卡的属性;
          而且卡头是 flex,进度和「已选 N」当时各写了一句 `margin-inline-start: auto`,
          一行两个 auto 把剩余空间对半分,进度停在卡头中间和计数抢位置。
        */}
        {pickedCount > 0 ? <PickedCount t={t} count={pickedCount} /> : null}
        {answered ? <span className="question-form-pill">{t('qf.answered')}</span> : null}
        {/*
          倒计时在【卡头右上】,不在底栏 —— 稿子 `729fa43ce7` 新加的那一处:
            <div class="h">…<b>先定个视觉方向</b>
              <time class="n visual-countdown" datetime="PT30S">30s</time></div>
            .card > .h .visual-countdown { color: var(--text-soft); font-weight: 400 }
          它同时带 `.n`,所以还继承 `margin-left:auto` / `tabular-nums` / `--t-cap`(12px)。
          搬上来还顺手补上了一个洞:视觉方向卡的底栏是**合并掉的**(见 `visualFootDelegated`),
          底栏不渲染 → 倒计时在那张卡上从来没出现过,而稿子恰恰是在那张卡上画的它。

          ⚠️ **一处有意偏离:显示格式**。稿子写的是 `30s`,我们保留 `M:SS`(`0:30`)。
          出处是 2026-09-02 产品裁决,原话「格式我感觉还是用 `0:30` 吧..更清晰..」。
          这是明确的产品选择,不是稿子漏改。要动它得先拿到新的裁决 ——
          `datetime` / `aria-label` 是语义属性不是显示文案,那两个照稿子的语义走。
        */}
        {autoContinueEnabled ? (
          <time
            className="qf-auto-continue"
            dateTime={`PT${autoContinueRemaining}S`}
            title={t('questions.autoSkipHint')}
            aria-label={`${t('questions.autoSkipHint')} ${autoContinueCountdown}`}
          >
            {autoContinueCountdown}
          </time>
        ) : null}
      </div>
      <div className="question-form-body">
        {questionsToRender.map((q) => {
          const value = currentAnswers[q.id];
          return (
            /*
              稿子的 `.cbody` 直接放 `.q` + `.opts`,中间没有「一个问题一个字段容器」这层。
              内距挂在子元素上(`.q` 是 10/11/8,`.opts.mod-stack` 是 0 6px 8px),不是挂在容器上。
              留着这层会让两边的元素序列从第一个问题就错位,后面全部对不上。
            */
            <Fragment key={q.id}>
              {/*
                稿子里问题就是一个 `.cbody > .q` 的普通块,不是 `<label><span>…</span></label>`。
                多包的这两层让逐元素比样式时两边从这里开始串位;而且这个 label 没有关联控件
                (每个选项自己带 label),挂着也不起作用。
              */}
              <div className="qf-label">
                {q.label}
                {q.required ? <span className="qf-required">{t('qf.required')}</span> : null}
                {/*
                  OPEND-2641:进度收在**问句这一行的末尾** —— 跟在问句文字后面,
                  也跟在「必填」角标后面。分步态下 `questionsToRender` 只有当前那一问
                  (上面 `stepped && activeQuestion ? [activeQuestion] : …`),
                  所以这里不需要再判「这一问是不是当前问」。
                */}
                {stepped ? (
                  <StepProgress index={activeQuestionIndex} total={form.questions.length} />
                ) : null}
              </div>
              {/* 一道题就是「题目 + 必填标识 + 用来作答的控件」,没有第四样。
                  模型写的那行说明(`help`)夹在题目和控件中间,把两者推开,
                  读起来像卡片自己的旁白而不是这道题的一部分(OPEND-2707)。
                  这里是**不渲染**而不是藏起来:它是卡片正文这根纵向流里的
                  一个块级兄弟,留着就还占一整行的行盒 —— 那行空白正是工单
                  要一起去掉的。`help` 仍留在解析出来的表单结构上,已有的、
                  流式进来的表单照旧原样往返。 */}
              {q.type === 'select' && q.options && questionUsesSelectMenu(q) ? (
                <SelectChoice
                  question={q}
                  options={q.options}
                  value={typeof value === 'string' ? value : ''}
                  disabled={locked}
                  t={t}
                  onPick={(next) => pickFixed(q, next)}
                  ownChoice={
                    shouldRenderCustomChoice(q)
                      ? renderOwnChoice(q, customSingleValue(q, value), (next) =>
                          update(q.id, next),
                        )
                      : null
                  }
                />
              ) : null}
              {(q.type === 'radio' || q.type === 'select') && q.options
                && !questionUsesSelectMenu(q) ? (
                <div className="qf-options" role="radiogroup" aria-label={q.label}>
                  {q.options.map((opt) => (
                    <OptionButton
                      key={opt.value}
                      option={opt}
                      role="radio"
                      on={value === opt.value}
                      disabled={locked}
                      onPick={() => pickFixed(q, opt.value)}
                    />
                  ))}
                  {shouldRenderCustomChoice(q)
                    ? renderOwnChoice(q, customSingleValue(q, value), (next) => update(q.id, next))
                    : null}
                </div>
              ) : null}
              {q.type === 'checkbox' && q.options ? (
                <div className="qf-options" role="group" aria-label={q.label}>
                  {q.options.map((opt) => {
                    const arr = Array.isArray(value) ? value : [];
                    const on = arr.includes(opt.value);
                    const maxed =
                      q.maxSelections !== undefined && !on && arr.length >= q.maxSelections;
                    return (
                      <OptionButton
                        key={opt.value}
                        option={opt}
                        role="checkbox"
                        on={on}
                        maxed={maxed}
                        disabled={locked || maxed}
                        onPick={() => toggleCheckbox(q.id, opt.value, q.maxSelections)}
                      />
                    );
                  })}
                  {shouldRenderCustomChoice(q)
                    ? renderOwnChoice(q, customCheckboxValue(q, value), (next) => updateCheckboxCustom(q, next))
                    : null}
                </div>
              ) : null}
              {q.type === 'text' ? (
                <input
                  type="text"
                  className="qf-input"
                  data-testid="qf-input"
                  value={typeof value === 'string' ? value : ''}
                  placeholder={q.placeholder}
                  disabled={locked}
                  onChange={(e) => update(q.id, e.target.value)}
                />
              ) : null}
              {q.type === 'number' ? (
                <input
                  type="number"
                  className="qf-input"
                  data-testid="qf-input"
                  value={typeof value === 'string' ? value : ''}
                  placeholder={q.placeholder}
                  min={q.min}
                  max={q.max}
                  step={q.step}
                  disabled={locked}
                  onChange={(e) => update(q.id, e.target.value)}
                />
              ) : null}
              {q.type === 'range' ? (
                <AmountChoice
                  question={q}
                  answer={typeof value === 'string' ? value : ''}
                  text={rangeText[q.id]}
                  disabled={locked}
                  onDrag={(raw) => dragRange(q, raw)}
                  onType={(raw) => typeRange(q, raw)}
                  onSettle={() => settleRange(q)}
                />
              ) : null}
              {q.type === 'date' || q.type === 'time' || q.type === 'datetime-local' ? (
                <input
                  type={q.type}
                  className="qf-input"
                  data-testid="qf-input"
                  value={typeof value === 'string' ? value : ''}
                  placeholder={q.placeholder}
                  disabled={locked}
                  onChange={(e) => update(q.id, e.target.value)}
                />
              ) : null}
              {q.type === 'color' ? (
                <ColorChoice
                  question={q}
                  color={normalizeColorInputValue(value)}
                  text={colorText[q.id]}
                  invalid={colorTextIsInvalid(q.id)}
                  disabled={locked}
                  t={t}
                  onPick={(raw) => pickColor(q, raw)}
                  onType={(raw) => typeColor(q, raw)}
                  onSettle={() => settleColor(q)}
                />
              ) : null}
              {q.type === 'url' || q.type === 'email' || q.type === 'tel' ? (
                <input
                  type={q.type}
                  className="qf-input"
                  data-testid="qf-input"
                  value={typeof value === 'string' ? value : ''}
                  placeholder={q.placeholder}
                  disabled={locked}
                  onChange={(e) => update(q.id, e.target.value)}
                />
              ) : null}
              {q.type === 'file' ? (
                <div className="qf-file-wrap">
                  <input
                    type="file"
                    className="qf-file"
                    multiple={q.multiple}
                    accept={q.accept}
                    disabled={locked}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      const names = files.map((file) => file.name);
                      setFileAnswers((current) => ({ ...current, [q.id]: files }));
                      update(q.id, q.multiple ? names : names[0] ?? '');
                    }}
                  />
                  {fileValueLabel(value) ? (
                    <div className="qf-file-summary">{fileValueLabel(value)}</div>
                  ) : null}
                </div>
              ) : null}
              {q.type === 'switch' ? (
                <label className="qf-switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={value === 'true'}
                    disabled={locked}
                    onChange={(e) => update(q.id, e.target.checked ? 'true' : 'false')}
                  />
                  <span aria-hidden />
                </label>
              ) : null}
              {q.type === 'textarea' ? (
                <textarea
                  className="qf-textarea"
                  value={typeof value === 'string' ? value : ''}
                  placeholder={q.placeholder}
                  disabled={locked}
                  rows={3}
                  onChange={(e) => update(q.id, e.target.value)}
                />
              ) : null}
            </Fragment>
          );
        })}
        {/* 稿子里底栏在 `.cbody` 里面(白底那一块):`.cbody > .foot`。
            挪到 body 外面,底栏就落在卡的面板底色上,和稿子差一层底色。 */}
        {hideInternalSubmit ? null : (
          <div className="question-form-foot" data-chat-scroll-anchor="question-footer">
            {locked ? (
              <span className="qf-locked-note">
                {submittedAnswers ? t('qf.lockedSubmitted') : t('qf.lockedPrev')}
              </span>
            ) : stepped ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-chat-preserve-scroll-anchor={
                    !isLastQuestion ? 'question-footer' : undefined
                  }
                  onClick={handleSkipCurrent}
                  disabled={submitDisabled}
                >
                  {t('questionForm.skip')}
                </Button>
                <span className="qf-submit-actions">
                  {activeQuestionIndex > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      data-chat-preserve-scroll-anchor="question-footer"
                      onClick={handlePreviousQuestion}
                      disabled={submitDisabled}
                    >
                      {t('settings.onboardingBack')}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    className="qf-primary-action"
                    data-chat-preserve-scroll-anchor={
                      !isLastQuestion ? 'question-footer' : undefined
                    }
                    onClick={
                      isLastQuestion
                        ? handleSubmit
                        : handleNextQuestion
                    }
                    disabled={
                      submitDisabled || (isLastQuestion ? !ready : !currentQuestionReady)
                    }
                    title={
                      !submitDisabled && activeQuestion?.required === true && !currentQuestionReady
                        ? t('qf.submitDisabledTitle')
                        : isLastQuestion && !submitDisabled && ready
                          ? t('qf.submitTitle')
                          : undefined
                    }
                  >
                    {isLastQuestion
                      ? form.submitLabel ?? t('qf.submitDefault')
                      : t('nextStep.title')}
                  </Button>
                </span>
              </>
            ) : null}
            {!locked && !stepped ? (
              <>
                {canSkipAll ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleSkipAll}
                    disabled={submitDisabled}
                  >
                    {t('questions.skipAll')}
                  </Button>
                ) : null}
                {/* 撑开:稿子里跳过靠左、下一步靠右,中间是空的 */}
                <span className="qf-foot-gap" />
                {submitButton}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * 勾选框里的那枚对勾 —— 稿子 `.opt .box > svg.ck`。
 *
 * 稿子里它**从来不显示**(单选 `display:none`、多选选中态也 `display:none`,
 * 其余时候 `opacity:0`):选中与否画在方框自己身上(`--tick-img` 铺底)。
 * 照抄是为了两边元素序列一一对上 —— 少一个节点,后面每一项都要串位。
 */
function ChipCheck() {
  return (
    <svg className="qf-chip-check" viewBox="0 0 24 24" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/**
 * 一个固定选项 —— 交付稿 `.opt`:
 *
 *   <button class="opt" type="button">
 *     <span class="box"><svg class="ck">…</svg></span><span>文案</span>
 *   </button>
 *
 * 原来是 `<label>` 套一枚真 `<input type=radio|checkbox>`。视觉能凑近,但**标签就不一样**,
 * 逐元素比样式时从这里开始整段串位,后面每一项都被报成差异,真差异全淹了。
 *
 * 可达性不靠原生控件靠 ARIA 补齐:外面那层 `.qf-options` 是 `radiogroup` / `group`,
 * 每一项自己声明 `role` 和 `aria-checked`,而且每一项都能 Tab 到、能用空格/回车选。
 */
/**
 * 提示词让模型把一道题的选项控制在 6–7 个以内(「太多用户选不过来」)。
 * 超过这个量就不是「读一遍再挑」而是「翻找」,该由菜单接手。
 */
const SELECT_MENU_OPTION_THRESHOLD = 7;

/**
 * 这道题该不该走「查找型单选」的菜单形态。
 *
 * ── 产品判据(2026-09-02 第二版)────────────────────────────────
 * 按**选项数量**分:单选且选项少 → 竖排列表;单选且选项多 → 菜单。
 * 多选永远是竖排列表 —— 所以这里第一条就把非 `select` 挡掉。
 * (第一版按「需不需要比较选项」分,已作废。)
 *
 * ── 两条触发路,缺一不可 ──────────────────────────────────────
 * (a) **带了新字段**:任一选项有 `group` 或 `trailingLabel`,说明模型是按新规则
 *     写的,哪怕只有三条也按菜单排 —— 分组和副标在竖排列表里没有位置放。
 * (b) **选项多于阈值**:模型没用新字段、但一口气给了十几条。线上 ElevenLabs
 *     选音色最多列 100 个音色,走的正是这一条。
 *
 * ── 为什么不是「所有 select 一律走菜单」──────────────────────
 * 历史会话里的 `select` 是在**旧规则**下写的 —— 那时它只表示「单选」,里面
 * 常常只有两三条。兼容要求原话:「旧会话里 options 没有分组信息、没有副标 ——
 * 新形态必须优雅**退化成今天的样子**」。两条都不成立就退回竖排列表,逐元素一致。
 */
function questionUsesSelectMenu(q: QuestionForm['questions'][number]): boolean {
  if (q.type !== 'select') return false;
  const options = q.options ?? [];
  if (options.length > SELECT_MENU_OPTION_THRESHOLD) return true;
  return options.some(
    (option) => option.group !== undefined || option.trailingLabel !== undefined,
  );
}

/** 一个分组:组名 + 落在这一组里的选项。没有组名的那些归到 `undefined` 这组。 */
interface SelectOptionGroup {
  label: string | undefined;
  options: FormOption[];
}

/**
 * 按**首次出现顺序**把选项分组。顺序由模型给的数组决定,我们不排序 ——
 * 「常用的排前面」是模型的编排意图,重排等于把它的判断扔掉。
 */
function groupSelectOptions(options: readonly FormOption[]): SelectOptionGroup[] {
  const groups: SelectOptionGroup[] = [];
  for (const option of options) {
    const label = option.group;
    const existing = groups.find((group) => group.label === label);
    if (existing) existing.options.push(option);
    else groups.push({ label, options: [option] });
  }
  return groups;
}

/**
 * 查找型单选(交付稿 `.opts.mod-language`,PR #7170 新增的那一档)。
 *
 * 稿子那一档是**硬编码的中文语言表**,这里只取它的形状,不取它的内容:
 * 选项、组名、副标全部来自 agent 的 `options`,host 一张表都不内置。
 * 所以类名也按能力命名(`qf-select-*`),不叫 language —— 时区、国家、字体
 * 走的是同一条路。
 *
 * 展开规则:第一组直接露出;其后每一组各收在一个开关后面,开关的字就是组名。
 * 一个例外 —— **已选中的那一项所在的组默认展开**,否则打开一张已答的表单会
 * 看不见自己选了什么(回放旧会话时尤其明显)。
 */
function SelectChoice({
  question,
  options,
  value,
  disabled,
  t,
  onPick,
  ownChoice,
}: {
  question: QuestionForm['questions'][number];
  options: readonly FormOption[];
  value: string;
  disabled: boolean;
  t: ReturnType<typeof useT>;
  onPick: (value: string) => void;
  ownChoice: ReactNode;
}) {
  const groups = useMemo(() => groupSelectOptions(options), [options]);
  const [head, ...rest] = groups;
  // 选中项所在的组一开始就是展开的 —— 这是「看得见自己选了什么」的下限,
  // 不是偏好,所以用初始值而不是 effect(effect 会先闪一帧折叠态)。
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () =>
      new Set(
        rest
          .filter((group) => group.options.some((option) => option.value === value))
          .map((group) => group.label ?? ''),
      ),
  );

  const renderOption = (option: FormOption) => (
    <button
      key={option.value}
      type="button"
      role="option"
      className="qf-select-option"
      data-value={option.value}
      aria-selected={option.value === value}
      disabled={disabled}
      title={option.description}
      onClick={() => onPick(option.value)}
    >
      <span className="qf-select-option-label">{option.label}</span>
      {option.trailingLabel ? (
        <span className="qf-select-trailing">{option.trailingLabel}</span>
      ) : null}
      <svg className="qf-select-check" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M9.55 17.65 4.2 12.3l1.4-1.4 3.95 3.95L18.4 6l1.4 1.4Z" />
      </svg>
    </button>
  );

  return (
    <div className="qf-select-field">
      <div className="qf-select-menu" role="listbox" aria-label={question.label}>
        {head?.label ? (
          <span className="qf-select-group-label">{head.label}</span>
        ) : null}
        {(head?.options ?? []).map(renderOption)}
      </div>
      {rest.map((group) => {
        const key = group.label ?? '';
        const open = openGroups.has(key);
        const listId = `qf-select-more-${question.id}-${key || 'rest'}`;
        return (
          <div key={key} className="qf-select-more">
            <button
              type="button"
              className="qf-select-more-toggle"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() =>
                setOpenGroups((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
            >
              {/*
                开关的字是 **host 文案**「更多选项」,不是模型给的组名。
                稿子那一档演的是语言表,写的是「更多语言」—— 但这个折叠器是
                **任意选项列表**的(时区、国家、字体走同一条路),把语言那一档的
                措辞焊进通用组件就错了。产品原话:「更多语言 改成 更多选项」。
                组名本身仍旧显示在展开后的列表里,模型的编排意图没有丢。
              */}
              <span>{t('qf.moreOptions')}</span>
              <span className="qf-select-more-gap" />
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="m7 10 5 5 5-5Z" />
              </svg>
            </button>
            <div
              className="qf-select-more-list"
              id={listId}
              role="group"
              aria-label={group.label}
              hidden={!open}
            >
              {group.label ? (
                <span className="qf-select-group-label">{group.label}</span>
              ) : null}
              {group.options.map(renderOption)}
            </div>
          </div>
        );
      })}
      {ownChoice ? <div className="qf-options qf-select-own">{ownChoice}</div> : null}
    </div>
  );
}

function OptionButton({
  option,
  role,
  on,
  maxed,
  disabled,
  onPick,
}: {
  option: FormOption;
  role: 'radio' | 'checkbox';
  on: boolean;
  maxed?: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      title={option.description}
      disabled={disabled === true}
      className={`qf-chip${on ? ' qf-chip-on' : ''}${maxed === true ? ' qf-chip-disabled' : ''}`}
      onClick={onPick}
    >
      <span className="qf-chip-box"><ChipCheck /></span>
      <OptionCopy option={option} />
    </button>
  );
}

function OptionCopy({ option }: { option: FormOption }) {
  return (
    <span className="qf-chip-copy">
      <span>{option.label}</span>
      {option.description ? <span className="qf-chip-desc">{option.description}</span> : null}
    </span>
  );
}

function buildInitialState(
  form: QuestionForm,
  submitted: Record<string, string | string[]> | undefined,
  draft: Record<string, string | string[]> | undefined,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const q of form.questions) {
    if (submitted && submitted[q.id] !== undefined) {
      out[q.id] = canonicalizeQuestionValue(q, submitted[q.id]!);
      continue;
    }
    if (draft && draft[q.id] !== undefined && q.type !== 'file') {
      out[q.id] = canonicalizeQuestionValue(q, draft[q.id]!);
      continue;
    }
    if (q.defaultValue !== undefined) {
      out[q.id] = recommendedValueWithinDeclaredRange(
        q,
        canonicalizeQuestionValue(q, q.defaultValue),
      );
      continue;
    }
    out[q.id] = emptyQuestionValue(q);
  }
  return out;
}

/**
 * 模型给的推荐值必须服从**模型自己在同一道题上声明的**范围(OPEND-2622)。
 *
 * 协议允许一道题同时写 `min: 1, max: 5` 和 `defaultValue: 0` —— 这两句话互相
 * 矛盾,而我们原来照单全收:数字框念模型给的 0、滑杆按物理范围停在 1,
 * 同一道题在屏幕上摆出两份真相;用户一次都没碰过它,提交出去的答案就是越界的 0。
 * 拖滑杆和敲数字两条路本来都过 `clampRangeValue`,只有「默认值进状态」这条没过。
 *
 * 收的只有**推荐值**这一份。用户自己写下的东西(提交历史、恢复的草稿)不在此列 ——
 * 「不为了拿到新样子去动已经写下的旧内容」是既有的兼容性底线,那条路仍旧原样保留。
 */
function recommendedValueWithinDeclaredRange(
  q: QuestionForm['questions'][number],
  value: string | string[],
): string | string[] {
  if (q.type !== 'range' || typeof value !== 'string') return value;
  const parsed = Number(value);
  if (value.trim().length === 0 || !Number.isFinite(parsed)) return value;
  return String(clampRangeValue(parsed, q));
}

/**
 * Whether a question that already holds a value should adopt a
 * later-arriving streamed `default`.
 *
 * The partial-JSON parser reveals a question as soon as its label lands, but
 * models are free to emit the `default` key after `options` — so the reveal
 * pass can park a question on its auto-assigned empty value before the
 * recommendation has streamed in. Invariant: a late default fills a question
 * only while (a) the user has never touched it and (b) it still holds that
 * auto-assigned empty value, so it can never clobber a real answer or an
 * intentional clear.
 */
function shouldAdoptStreamedDefault(
  q: QuestionForm['questions'][number],
  current: string | string[],
  touched: ReadonlySet<string>,
): boolean {
  if (q.defaultValue === undefined || touched.has(q.id)) return false;
  if (Array.isArray(current)) return current.length === 0;
  return current === emptyQuestionValue(q);
}

function draftSafeAnswers(
  form: QuestionForm,
  answers: Record<string, string | string[]>,
): Record<string, string | string[]> {
  const fileQuestionIds = new Set(
    form.questions.filter((q) => q.type === 'file').map((q) => q.id),
  );
  if (fileQuestionIds.size === 0) return answers;
  const out: Record<string, string | string[]> = {};
  for (const [id, value] of Object.entries(answers)) {
    if (!fileQuestionIds.has(id)) out[id] = value;
  }
  return out;
}

function answersWithSkippedQuestions(
  form: QuestionForm,
  answers: Record<string, string | string[]>,
  skippedQuestionIds: ReadonlySet<string>,
): Record<string, string | string[]> {
  if (skippedQuestionIds.size === 0) return answers;
  const submittedAnswers = { ...answers };
  for (const q of form.questions) {
    if (skippedQuestionIds.has(q.id)) {
      submittedAnswers[q.id] = emptyQuestionValue(q);
    }
  }
  return submittedAnswers;
}

function collectFileSubmissions(
  form: QuestionForm,
  fileAnswers: Record<string, File[]>,
  skippedQuestionIds: ReadonlySet<string>,
): QuestionFormFileSubmission[] {
  const out: QuestionFormFileSubmission[] = [];
  for (const q of form.questions) {
    if (q.type !== 'file' || skippedQuestionIds.has(q.id)) continue;
    const files = fileAnswers[q.id] ?? [];
    if (files.length === 0) continue;
    out.push({ questionId: q.id, questionLabel: q.label, files });
  }
  return out;
}

function emptyQuestionValue(q: QuestionForm['questions'][number]): string | string[] {
  if (q.type === 'checkbox') return [];
  if (q.type === 'switch') return 'false';
  if (q.type === 'range') return String(q.min ?? 0);
  if (q.type === 'color') return normalizeColorInputValue('');
  return '';
}

/**
 * 有选项的问题必须先有答案(稿子 5-1 / 5-3 / 5-4);自由输入不在这条规则里 ——
 * 稿子没画过那种卡,不该顺手把它也收紧。`required` 仍然独立成立。
 */
const CHOICE_QUESTION_TYPES = new Set(['radio', 'checkbox']);

/**
 * 这道题算不算「必须先有答案才放行」。
 *
 * 判据来自交付稿意图澄清那五格(5-1「一个都没选 ——「下一步」置灰」),
 * 所以有选项的问题一律必答,不看 `required`。
 */
function questionNeedsAnswer(q: QuestionForm['questions'][number]): boolean {
  return q.required === true || CHOICE_QUESTION_TYPES.has(q.type);
}

/**
 * 这道题算不算「答了」。
 *
 * 数组要**逐条** trim:多选把「自己填」的文字放进同一个数组,
 * 一个空白条目不能算一条答案(稿子 5-4:开了输入框没写字,「下一步」仍置灰)。
 */
function questionAnswerIsPresent(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => typeof entry === 'string' && entry.trim().length > 0);
  }
  return typeof value === 'string' && value.trim().length > 0;
}

function canonicalizeQuestionValue(
  q: QuestionForm['questions'][number],
  value: string | string[],
): string | string[] {
  /*
   * 值进状态只有这一个入口(提交历史 / 草稿 / 模型默认值三条路都从这儿过),
   * 所以颜色的规范化挂在这里就够了 —— 实现本身仍在 `normalizeHexColor` 一处。
   * 规范不出来的旧值**原样留着**:回放不许改写已经写下的内容。
   */
  if (q.type === 'color' && typeof value === 'string') {
    return normalizeHexColor(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => formOptionValueForLabel(q, entry));
  }
  return formOptionValueForLabel(q, value);
}

function shouldRenderCustomChoice(q: QuestionForm['questions'][number]): boolean {
  return q.allowCustom !== false;
}

function questionValueIsKnown(q: QuestionForm['questions'][number], value: string): boolean {
  return q.options?.some((option) => option.value === value || option.label === value) ?? false;
}

/**
 * 卡头数字数的是画面里勾中的选项行，不是提交协议里的数组项。
 *
 * 「自己填」无论暂时为空，还是被逗号拆成多条提交值，界面上都只有一行；恢复旧会话时
 * 重复/别名值也不能把同一行重复计算。
 */
function pickedCheckboxChoiceCount(
  q: QuestionForm['questions'][number],
  value: string | string[] | undefined,
  ownChoiceOpen: boolean,
): number {
  if (q.type !== 'checkbox' || !Array.isArray(value)) return 0;

  const fixedValues = new Set<string>();
  let hasCustomValue = false;

  for (const entry of value) {
    const normalized = entry.trim();
    if (!normalized) continue;
    if (questionValueIsKnown(q, normalized)) fixedValues.add(normalized);
    else hasCustomValue = true;
  }

  return fixedValues.size + (ownChoiceOpen || hasCustomValue ? 1 : 0);
}

function customSingleValue(
  q: QuestionForm['questions'][number],
  value: string | string[] | undefined,
): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  return questionValueIsKnown(q, value) ? '' : value;
}

function customCheckboxValue(
  q: QuestionForm['questions'][number],
  value: string | string[] | undefined,
): string {
  if (!Array.isArray(value)) return '';
  return value.filter((entry) => !questionValueIsKnown(q, entry)).join(', ');
}

function splitCustomEntries(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeColorInputValue(value: string | string[] | undefined): string {
  // 原生 `<input type="color">` 只接受 `#rrggbb`,给不出来就退回黑 —— 这是**渲染**
  // 兜底,不是答案:答案的规范化在 `normalizeHexColor` 那一处。
  return normalizeHexColor(value) ?? '#000000';
}

/** 在编文本让位给答案:删掉这道题的 key,显示重新以答案为准。 */
function clearDraftText(
  setter: (updater: (prev: Record<string, string>) => Record<string, string>) => void,
  id: string,
): void {
  setter((prev) => {
    if (!(id in prev)) return prev;
    const next = { ...prev };
    delete next[id];
    return next;
  });
}

/**
 * 交付稿那八颗预设色。
 *
 * 这里**允许**出现字面 hex —— 它们是「被选的内容」本身(用户挑的是这个颜色),
 * 不是界面用色。界面用色仍旧走产品 token,一个都没有写死在这儿。
 * 模型自己在 `options` 里给了色值时以模型的为准,这份只是缺省调色板。
 */
const DEFAULT_COLOR_PRESETS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
] as const;

function colorPresetsFor(q: QuestionForm['questions'][number]): string[] {
  const fromOptions: string[] = [];
  for (const option of q.options ?? []) {
    const canonical = normalizeHexColor(option.value);
    // 认不出来的选项直接丢掉,不拿一块黑去顶替 —— 那是在替模型编一个答案
    if (canonical && !fromOptions.includes(canonical)) fromOptions.push(canonical);
  }
  return fromOptions.length > 0 ? fromOptions : [...DEFAULT_COLOR_PRESETS];
}

/**
 * 颜色选择(交付稿 `.opts.mod-color`)——「预设色、系统取色器和 Hex 输入
 * 三条路实时同步,预览跟着更新」。
 *
 * 三条路共用**同一个**答案值,视图这一层不留第二份真相:预览色由包装层的
 * `--qf-choice-color` 驱动,色块的按下态、取色器的 value、Hex 框的显示值
 * 都从同一个 `color` 推出来。
 *
 * 色块的可读名就是它的 hex —— 稿子写的是「红色 #ef4444」那种「颜色名 + 值」,
 * 但我们没有一份 19 种语言的颜色名表,现编一份等于凭空造一套产品文案。
 * hex 本身是这颗色块**准确**的名字,不是近似。
 */
function ColorChoice({
  question,
  color,
  text,
  invalid,
  disabled,
  t,
  onPick,
  onType,
  onSettle,
}: {
  question: QuestionForm['questions'][number];
  color: string;
  text: string | undefined;
  invalid: boolean;
  disabled: boolean;
  t: ReturnType<typeof useT>;
  onPick: (raw: string) => void;
  onType: (raw: string) => void;
  onSettle: () => void;
}) {
  const presets = colorPresetsFor(question);
  const nativeId = `qf-color-native-${question.id}`;
  const errorId = `qf-color-error-${question.id}`;
  return (
    <div
      className="qf-color-field"
      style={{ '--qf-choice-color': color } as CSSProperties}
    >
      <fieldset className="qf-color-preset-field">
        <legend className="qf-color-legend">{t('qf.colorPresets')}</legend>
        <div className="qf-color-presets">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              className="qf-color-swatch"
              data-color={preset}
              aria-label={preset}
              aria-pressed={preset === color}
              disabled={disabled}
              style={{ '--qf-swatch': preset } as CSSProperties}
              onClick={() => onPick(preset)}
            />
          ))}
        </div>
      </fieldset>
      <div className="qf-color-custom-field">
        <label className="qf-color-legend" htmlFor={nativeId}>
          {t('qf.colorCustom')}
        </label>
        <div className="qf-color-custom">
          <input
            id={nativeId}
            type="color"
            className="qf-color"
            value={color}
            disabled={disabled}
            aria-label={t('qf.colorPickerLabel')}
            onChange={(e) => onPick(e.target.value)}
          />
          <input
            type="text"
            className="qf-color-hex"
            value={text ?? color}
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            disabled={disabled}
            aria-label={t('qf.colorHexLabel')}
            aria-invalid={invalid}
            {...(invalid ? { 'aria-describedby': errorId } : {})}
            onChange={(e) => onType(e.target.value)}
            onBlur={onSettle}
          />
        </div>
      </div>
      {invalid ? (
        <div className="qf-color-error" id={errorId} role="alert">
          {t('qf.colorInvalid')}
        </div>
      ) : null}
      <div className="qf-color-preview">{t('qf.colorPreview')}</div>
    </div>
  );
}

/*
 * 协议没给 min / max / step 时的兜底,取值**跟着 `<input type="range">` 的
 * HTML 默认走**(0 / 100 / 1)。这三个数不能自己另定一套:滑杆是原生控件,
 * 它照 HTML 默认把自己钉在 0–100;数字框那边若按「没有上界」放行,
 * 敲一个 500 进去就会出现「答案是 500、滑杆停在 100」的两份真相。
 */
const RANGE_FALLBACK_MIN = 0;
const RANGE_FALLBACK_MAX = 100;
const RANGE_FALLBACK_STEP = 1;

function rangeBounds(q: QuestionForm['questions'][number]): {
  min: number;
  max: number;
  step: number;
} {
  return {
    min: Number.isFinite(q.min) ? (q.min as number) : RANGE_FALLBACK_MIN,
    max: Number.isFinite(q.max) ? (q.max as number) : RANGE_FALLBACK_MAX,
    step:
      Number.isFinite(q.step) && (q.step as number) > 0
        ? (q.step as number)
        : RANGE_FALLBACK_STEP,
  };
}

/** 把一个数收进 `[min, max]` 并吸附到最近的 step 档。 */
function clampRangeValue(raw: number, q: QuestionForm['questions'][number]): number {
  const { min, max, step: stride } = rangeBounds(q);
  const snapped = min + Math.round((raw - min) / stride) * stride;
  const bounded = Math.min(max, Math.max(min, snapped));
  // step 是小数时(0.1 一档)会攒出 0.30000000000000004 这种尾巴,按 step 的
  // 小数位收一次 —— 这个数是要作为**文本**发回给模型的
  const decimals = (String(stride).split('.')[1] ?? '').length;
  return Number(bounded.toFixed(decimals));
}

/**
 * 数值滑块(交付稿 `.opts.mod-slider`)——「上方数字可直接编辑并与滑杆双向同步,
 * 不展示刻度点」。
 *
 * 两处**如实的偏差**,都是因为协议里没有对应字段(审计文档 §8 待决项 3):
 *  · 稿子数字后面那个「档」字是单位,我们没有单位 schema —— 整个不渲染,不臆造;
 *  · 稿子的端点是「1 · 疏朗 / 5 · 紧凑」,带着文案;我们只渲染 `min` / `max`
 *    两个数,那是协议里真有的东西。
 *
 * 旧数据不改写:历史里存着的越界标量(比如 1–5 的题里存了 7)在数字框里
 * **照原样念**,只有滑杆按物理范围收着显示。要改写得等用户自己动一下。
 */
function AmountChoice({
  question,
  answer,
  text,
  disabled,
  onDrag,
  onType,
  onSettle,
}: {
  question: QuestionForm['questions'][number];
  answer: string;
  text: string | undefined;
  disabled: boolean;
  onDrag: (raw: string) => void;
  onType: (raw: string) => void;
  onSettle: () => void;
}) {
  const { min, max } = rangeBounds(question);
  const parsed = Number(answer);
  const settled = answer.trim().length > 0 && Number.isFinite(parsed)
    ? clampRangeValue(parsed, question)
    : min;
  const readout = text ?? (answer.trim().length > 0 ? answer : String(settled));
  const pct = max > min ? ((settled - min) / (max - min)) * 100 : 0;
  return (
    <div
      className="qf-amount"
      style={{ '--qf-range-pct': `${pct}%` } as CSSProperties}
    >
      <div className="qf-amount-readout">
        <input
          type="number"
          className="qf-amount-value"
          value={readout}
          min={question.min}
          max={question.max}
          step={question.step}
          inputMode="numeric"
          aria-label={question.label}
          disabled={disabled}
          onChange={(e) => onType(e.target.value)}
          onBlur={onSettle}
        />
      </div>
      {/* 轨道里只放滑杆本身 —— 这一版稿子把上一版的 `.amount-stop` 光点整排删掉了 */}
      <div className="qf-amount-rail">
        <input
          type="range"
          className="qf-range"
          value={String(settled)}
          min={question.min}
          max={question.max}
          step={question.step}
          aria-label={question.label}
          disabled={disabled}
          onChange={(e) => onDrag(e.target.value)}
        />
      </div>
      <div className="qf-amount-limits" aria-hidden>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

/**
 * 多选计数(交付稿 `.selection-count` = `.count-label` + `.count-value`)。
 * 「已选」退后一档、数字保留原色,所以 DOM 上必须是两个元素。
 *
 * **不拿两个 key 前后拼**:`en` 是「2 picked」、`zh-CN` 是「已选 2」、
 * `ko` 是「2개 선택」(数字后面直接接字,中间没有空格)—— 拼接得钦定一种语序
 * 和一个分隔符,那三条里至少两条会错。
 *
 * 做法是把**同一条完整译文**按 `{count}` 的落点切开:切出来的两段天然就是
 * 这门语言自己的语序,空格也照译文原样留在段里。因此拼回去与整条译文逐字相等。
 */
/** 一个绝不会出现在任何译文里的哨兵,用来标记 `{count}` 的落点。 */
const PICKED_COUNT_SLOT = '\u0000';
/**
 * 分步表单「这一问是第几问」的行内进度(`1/4`)。
 *
 * 不变量:它**属于当前问句**,所以渲染在 `.qf-label` 的末尾,不在卡头里
 * (OPEND-2641)。卡头只留卡的名字和整卡状态 —— 「已选 N」是整张卡的状态,
 * 进度不是;两个都挂在卡头上时,它们会抢同一条 `margin-inline-start: auto`。
 *
 * 可读名字保留 `第几 / 共几` 的念法(`1 / 4`),显示文本仍是紧凑的 `1/4`。
 */
function StepProgress({ index, total }: { index: number; total: number }) {
  return (
    <span className="qf-step-progress" aria-label={`${index + 1} / ${total}`}>
      {index + 1}/{total}
    </span>
  );
}

function PickedCount({ t, count }: { t: ReturnType<typeof useT>; count: number }) {
  const rendered = t('qf.picked', { count: PICKED_COUNT_SLOT });
  const at = rendered.indexOf(PICKED_COUNT_SLOT);
  if (at === -1) {
    // 译文里没有 `{count}` 落点(译错了)。宁可整条照念,也不自己找地方插数字。
    return <span className="qf-picked">{t('qf.picked', { count })}</span>;
  }
  const before = rendered.slice(0, at);
  const after = rendered.slice(at + PICKED_COUNT_SLOT.length);
  return (
    <span className="qf-picked">
      {before ? <span className="qf-picked-label">{before}</span> : null}
      <span className="qf-picked-value">{count}</span>
      {after ? <span className="qf-picked-label">{after}</span> : null}
    </span>
  );
}

function fileValueLabel(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'string' ? value : '';
}

/**
 * Reverse of formatFormAnswers — when we render an old assistant message
 * that contained a form, look at the next user message in the conversation
 * to see if the form was already answered. If so, return the answers map
 * so the form renders in the locked "answered" state with the user's
 * picks visible.
 */
export function parseSubmittedAnswers(
  form: QuestionForm,
  userMessageContent: string,
): Record<string, string | string[]> | null {
  const lines = userMessageContent.split('\n').map((l) => l.trim());
  if (lines.length === 0) return null;
  const header = lines[0] ?? '';
  // We accept any "form answers" header so the agent can paraphrase.
  if (!/^\[form answers/i.test(header)) return null;
  const answers: Record<string, string | string[]> = {};
  const labelToId = new Map<string, string>();
  for (const q of form.questions) labelToId.set(q.label.toLowerCase(), q.id);
  const uploadSummaryIndex = lines.findIndex((line) => /^\[uploaded design files\]$/i.test(line));
  const answerLines = uploadSummaryIndex === -1 ? lines : lines.slice(0, uploadSummaryIndex);
  for (let i = 1; i < answerLines.length; i++) {
    const line = answerLines[i] ?? '';
    const m = /^[-*]\s*([^:]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const labelKey = m[1]!.trim().toLowerCase();
    const value = m[2]!.trim();
    const id = labelToId.get(labelKey);
    if (!id) continue;
    const q = form.questions.find((x) => x.id === id);
    if (!q) continue;
    if (q.type === 'checkbox') {
      answers[id] = value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.toLowerCase() !== '(skipped)')
        .map((s) => formOptionValueForLabel(q, parseSubmittedOptionToken(s)));
    } else {
      answers[id] = value.toLowerCase() === '(skipped)' ? '' : formOptionValueForLabel(q, parseSubmittedOptionToken(value));
    }
  }
  return Object.keys(answers).length > 0 ? answers : null;
}

function parseSubmittedOptionToken(raw: string): string {
  const match = /\s+\[value:\s*([^\]]+)\]\s*$/i.exec(raw);
  if (!match) return raw.trim();
  const valuePayload = match[1]!.trim();
  // A short-lived direction-card answer format carried Host metadata inside
  // the value token: `[value: host-id; foundation: …; guidance: …]`. Preserve
  // replay for answers created with that build while keeping the canonical
  // format's final `[value: host-id]` token machine-readable.
  const foundationOffset = valuePayload.search(/;\s*foundation\s*:/i);
  return (foundationOffset >= 0 ? valuePayload.slice(0, foundationOffset) : valuePayload).trim();
}

/**
 * 「已确认」陈述块 —— 交付稿 `.answered` 的 1:1 实现。
 *
 *   <div class="answered">
 *     <div class="k">已确认</div>
 *     <div class="ab"><span class="ak">商品卡</span><b>沿用列表页那张…</b></div>   ← 单值
 *     <ul class="al"><li><span class="ak">页面</span><b>商品详情页</b></li>…</ul>  ← 多值
 *   </div>
 *
 * **一处如实的偏差**:稿子里 `.ak` 是个很短的名词(「商品卡」/「页面」/「视觉方向」),
 * 而问题本身的文字是「设置页要不要沿用列表页的商品卡组件?」—— 也就是说稿子用的是
 * **另一个更短的字段**,我们的表单模型里没有它。这里先用问题的 `label`,
 * 结构与稿子一致、来源待产品定(见规格 §13 的待决项)。不臆造一个缩写规则。
 */
function AnsweredSummary({
  form,
  answers,
  t,
}: {
  form: QuestionForm;
  answers: Record<string, string | string[]>;
  t: ReturnType<typeof useT>;
}) {
  // This locked-form renderer follows design frame #24: each checkbox value
  // gets its own `.al li`. Conversation replay keeps its pre-existing compact
  // one-row-per-question shape from FormBlock.
  const summary = summarizeQuestionFormAnswers(
    form,
    answers,
    true,
    t('qf.answeredSkipped'),
  );
  const flat = summary.items;
  const single = flat.length === 1;

  if (flat.length === 0) return null;

  return (
    <div className="answered">
      <div className="k">{t('qf.answeredConfirmed')}</div>
      {single ? (
        <div className={`ab${isShortValueAnswer(flat[0]!) ? ' mod-value' : ''}`}>
          <span className="ak">{flat[0]!.label}</span>
          <AnsweredValue item={flat[0]!} />
        </div>
      ) : flat.length > 0 ? (
        <ul className="al">
          {flat.map((item) => (
            <li key={`${item.label}-${item.value}`}>
              <span className="ak">{item.label}</span>
              <AnsweredValue item={item} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * 一条已确认答案的值。稿子里颜色那一条是
 * `<span class="color-answer" style="--answer-color:#3b82f6"><i></i><b>#3b82f6</b></span>`
 * —— 色块 + 规范化后的 Hex。规范不出来的旧值(历史里存着一句话)按纯文本念,
 * **不给它编一块颜色**。
 */
/**
 * 稿子把「短答案」单拎出来做行内垂直居中(`.answered .ab.mod-value`,
 * `361b78253e:components.css:2084-2086`,规则上方的注释原文是
 * 「**颜色和数值**的短答案行内部垂直居中;卡片位置及其它回答的排版不变」)。
 * 示例页里正好并排两格:主题色(`chat-panel-next.html:5078`)和版面密度(`:5087`,
 * `<div class="ab mod-value"><span class="ak">版面密度</span><b>2 档</b></div>`)。
 *
 * 判据因此是**答案本身是不是一个值** —— 色值或数字 —— 而不是「这一格有没有色块」。
 * 按色块判会把数值那一半漏掉:它没有色块,却同样是一个跟标签并排的短值。
 */
export function isShortValueAnswer(item: QuestionFormAnsweredSummary['items'][number]): boolean {
  return item.swatch !== undefined || item.numeric === true;
}

/**
 * 一条已确认答案的值,**唯一**的一处画法。
 *
 * 导出是判据的一部分,不是顺手:「已确认」这块有两个渲染方 —— 这里的
 * {@link AnsweredSummary},和 `AssistantMessage` 里 `FormBlock` 的历史回放块。
 * 产线上用户看到的是**后者**(`submittedAnswers` 这个 prop 没有产线调用点),
 * 所以只要两边各写各的 `<b>{value}</b>`,给一边加的东西就到不了用户屏幕上 ——
 * OPEND-2579 修的色块正是这么丢的,复测成了 OPEND-2642。
 * 两边都从这里取值,那条缝就不存在了。
 */
export function AnsweredValue({ item }: { item: QuestionFormAnsweredSummary['items'][number] }) {
  if (!item.swatch) return <b>{item.value}</b>;
  return (
    <span
      className="color-answer"
      style={{ '--answer-color': item.swatch } as CSSProperties}
    >
      <i aria-hidden />
      <b>{item.value}</b>
    </span>
  );
}

export interface QuestionFormAnsweredSummary {
  /**
   * `swatch` 是色值(那一格要画一块真颜色);`numeric` 标的是「这条答案本身就是
   * 一个数」。两者一起构成稿子说的「短答案」——见 {@link isShortValueAnswer}。
   */
  items: Array<{ label: string; value: string; swatch?: string; numeric?: true }>;
}

/**
 * Build the design's compact "Confirmed" rows from either the just-submitted
 * snapshot or a later replay. `splitMultiValueItems` preserves the locked-form
 * design's one-row-per-checkbox-value layout; the replay path keeps its
 * established one-row-per-question summary.
 *
 * `skippedLabel` 是「已跳过」的本地化说法(`qf.answeredSkipped`)。给了它,
 * **提交过但没有值**的题就照 `formatFormAnswers` 写给模型的 `(skipped)` 念出来,
 * 而不是整行吞掉 —— 收口必须和发出去的那份文本说同一件事。不给就保持旧行为。
 *
 * 「提交过但没有值」和「压根没这道题」是两档,只有前者算跳过:
 * 回放时标签没对上、或表单还在流式长出来,那道题根本不在 `answers` 里,
 * 那时不许替用户宣布「已跳过」。
 */
export function summarizeQuestionFormAnswers(
  form: QuestionForm,
  answers: Record<string, string | string[]>,
  splitMultiValueItems = false,
  skippedLabel?: string,
): QuestionFormAnsweredSummary {
  const items: QuestionFormAnsweredSummary['items'] = [];

  const readable = (question: QuestionForm['questions'][number], value: string): string => {
    const option = question.options?.find(
      (candidate) => candidate.value === value || candidate.label === value,
    );
    return option?.label ?? value;
  };

  for (const question of form.questions) {
    const raw = answers[question.id];
    const values = (Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [])
      .filter((value) => value.trim().length > 0);
    if (values.length === 0) {
      // 这道题**提交过**(键在),只是没有值 —— `formatFormAnswers` 给模型
      // 写的正是 `- <题目>: (skipped)`,收口照着念。`raw === undefined`
      // 是另一档(根本没提交过),继续跳过。
      if (skippedLabel !== undefined && raw !== undefined) {
        items.push({ label: question.label, value: skippedLabel });
      }
      continue;
    }

    /*
     * 颜色单独走一条 —— 它要带一块真色块回去。规范化仍旧只有
     * `normalizeHexColor` 那一处;这里只是把它接到「已确认」这条渲染路上,
     * 且**不改写**存下来的原文:规范不出来就照原样念,不装成一块颜色。
     */
    if (question.type === 'color') {
      for (const raw of values) {
        const canonical = normalizeHexColor(raw);
        items.push(
          canonical
            ? { label: question.label, value: canonical, swatch: canonical }
            : { label: question.label, value: raw },
        );
      }
      continue;
    }

    const readableValues = values.map((value) => readable(question, value));
    // 滑块和数字框答出来的是一个标量,和颜色同属稿子说的「短答案」(见
    // `isShortValueAnswer`)。跳过那一档不在这里 —— 它念的是「已跳过」,是句话不是值。
    const numeric = question.type === 'range' || question.type === 'number';
    if (splitMultiValueItems) {
      for (const value of readableValues) {
        items.push({ label: question.label, value, ...(numeric ? { numeric: true } : {}) });
      }
    } else if (readableValues.length > 0) {
      items.push({
        label: question.label,
        value: readableValues.join(', '),
        ...(numeric ? { numeric: true } : {}),
      });
    }
  }

  return { items };
}
