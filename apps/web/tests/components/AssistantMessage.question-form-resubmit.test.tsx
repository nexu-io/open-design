// @vitest-environment jsdom

/**
 * One question form occurrence answers exactly once.
 *
 * The inline `<question-form>` submit lock used to live only in a ref owned by
 * the mounted `FormBlock`. Leaving the project (or any remount: a refresh, a
 * conversation switch, a virtualized row recycling) rebuilt that ref as
 * "never submitted", so the same occurrence could be answered a second time
 * while the first answer was still being persisted or was still draining from
 * the busy-conversation queue. That produced two identical user answers and
 * two assistant runs for one logical task — duplicate model calls, duplicate
 * billing, and a split reply with a mid-turn action bar.
 *
 * The lock is therefore keyed on the form occurrence
 * (project + conversation + assistant message + form id) and survives the
 * remount; only an explicit submit failure re-opens it.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
});
afterEach(() => {
  cleanup();
  restoreSessionStorage();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const FORM = [
  '<question-form id="travel_app_brief" title="Quick brief">',
  JSON.stringify({
    questions: [{ id: 'audience', label: 'Audience', type: 'text' }],
  }),
  '</question-form>',
].join('\n');

// The lock is keyed on the form occurrence and deliberately outlives the
// component, so each test needs its own occurrence rather than a shared one a
// reset would have to undo — the same way two real forms never collide.
let occurrence = 0;
beforeEach(() => {
  occurrence += 1;
});

function formMessage(): ChatMessage {
  return {
    id: `msg-form-${occurrence}`,
    role: 'assistant',
    content: FORM,
    startedAt: 1700000000,
    endedAt: 1700000005,
    events: [{ kind: 'text', text: FORM }],
  } as ChatMessage;
}

function renderForm(onSubmitQuestionForm: (text: string) => unknown): HTMLElement {
  const { container } = render(
    <AssistantMessage
      message={formMessage()}
      streaming={false}
      projectId="proj-1"
      conversationId="conv-1"
      isLast
      onSubmitQuestionForm={onSubmitQuestionForm as never}
    />,
  );
  return container;
}

/**
 * Make every session-storage access throw, as a denied-storage context does.
 *
 * jsdom's `sessionStorage` is a host object whose methods `vi.spyOn` does not
 * intercept, so the accessor itself has to be replaced; `restoreSessionStorage`
 * puts the real one back for the suite's own teardown.
 */
let realSessionStorage: PropertyDescriptor | undefined;
function denySessionStorage(): void {
  realSessionStorage =
    Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'sessionStorage');
  const deny = () => {
    throw new Error('storage denied');
  };
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: { clear: () => {}, getItem: deny, removeItem: deny, setItem: deny },
  });
}
function restoreSessionStorage(): void {
  if (!realSessionStorage) return;
  Object.defineProperty(window, 'sessionStorage', realSessionStorage);
  realSessionStorage = undefined;
}

function answerAndSend(container: HTMLElement, value: string): void {
  const input = container.querySelector('.qf-input');
  if (!(input instanceof HTMLInputElement)) throw new Error('expected audience input');
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Send answers' }));
}

describe('inline question form resubmission', () => {
  it('stays locked after the component remounts with the answer not yet in history', async () => {
    const onSubmit = vi.fn(async () => true);

    answerAndSend(renderForm(onSubmit), 'Designers');
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    // Leaving the project unmounts the chat; coming back remounts the same
    // form occurrence while the answer has not surfaced in history yet.
    cleanup();
    const container = renderForm(onSubmit);

    const send = screen.getByRole('button', { name: 'Send answers' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    answerAndSend(container, 'Designers');
    await Promise.resolve();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('stays locked across a remount that happens while the submit is still in flight', async () => {
    // The reported sequence: the answer is handed to the host, the host is
    // still awaiting its pre-run gate (or parking the send in a busy
    // conversation's queue), and the user leaves the project in that window.
    // A lock written only once the host settles is not yet written here, so
    // the remount would rebuild the form as "never submitted".
    let settleSubmit: ((accepted: boolean) => void) | null = null;
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          settleSubmit = resolve;
        }),
    );

    answerAndSend(renderForm(onSubmit), 'Designers');
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(settleSubmit).not.toBeNull();

    cleanup();
    const container = renderForm(onSubmit);

    const send = screen.getByRole('button', { name: 'Send answers' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    answerAndSend(container, 'Designers');
    await Promise.resolve();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // The host finally accepts the send it had been holding; the form is
    // still the one that already answered.
    settleSubmit!(true);
    await vi.waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Send answers' }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
  });

  it('stays locked across an in-flight remount when storage is denied', async () => {
    // Private windows and embedded contexts refuse session storage. That may
    // cost the lock its survival across a reload, but not its survival across
    // a remount — otherwise the duplicate submit is simply back for those
    // users.
    denySessionStorage();
    let settleSubmit: ((accepted: boolean) => void) | null = null;
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          settleSubmit = resolve;
        }),
    );

    answerAndSend(renderForm(onSubmit), 'Designers');
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    cleanup();
    const container = renderForm(onSubmit);

    expect(
      (screen.getByRole('button', { name: 'Send answers' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    answerAndSend(container, 'Designers');
    await Promise.resolve();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // A refusal still hands the form back, storage or no storage.
    settleSubmit!(false);
    await vi.waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Send answers' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });

  it('re-opens the form when the submission explicitly failed', async () => {
    const onSubmit = vi.fn(async () => false);

    answerAndSend(renderForm(onSubmit), 'Designers');
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    cleanup();
    const container = renderForm(onSubmit);
    answerAndSend(container, 'Designers');
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  });

  it('re-opens the form when an in-flight submit is refused after the remount', async () => {
    // The mirror of the in-flight case: the host held the answer, the user
    // left and came back, and only then did the host refuse it. An explicit
    // refusal is the one thing that hands the form back to the user, so it
    // has to reach the occurrence lock even though the component that made
    // the call is gone.
    let settleSubmit: ((accepted: boolean) => void) | null = null;
    const deferredSubmit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          settleSubmit = resolve;
        }),
    );

    answerAndSend(renderForm(deferredSubmit), 'Designers');
    await vi.waitFor(() => expect(deferredSubmit).toHaveBeenCalledTimes(1));

    cleanup();
    renderForm(deferredSubmit);

    settleSubmit!(false);
    await vi.waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Send answers' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );

    cleanup();
    const retried = vi.fn(async () => true);
    const container = renderForm(retried);
    answerAndSend(container, 'Designers');
    await vi.waitFor(() => expect(retried).toHaveBeenCalledTimes(1));
  });
});
