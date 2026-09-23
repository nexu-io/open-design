// @vitest-environment jsdom

/** G16 removes inline authorization controls from the failure card. The
 * existing Settings continuation still proves account, mount and Workspace
 * identity before automatically retrying once. Drive status through the real
 * fetchVelaLoginStatus boundary; do not revive a removed pill callback.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { forwardRef, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../src/types';
import type { VelaLoginStatus } from '../../src/providers/daemon';
import type { AmrAuthRetryContinuation } from '../../src/runtime/amr-auth-retry-continuation';

const fetchVelaLoginStatusMock = vi.hoisted(() => vi.fn());
const translate = (key: string) => key;
vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));
vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => <div data-testid={`assistant-${message.id}`}>{message.content}</div>,
}));
vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));
vi.mock('../../src/providers/daemon', () => ({ fetchVelaLoginStatus: fetchVelaLoginStatusMock }));

const signedOut: VelaLoginStatus = { loggedIn: false, profile: 'prod', user: null, configPath: '' };
beforeEach(() => {
  // Only the actual status polling interval is virtual. waitFor's completion
  // checks use real timers, and status responses settle through real promises.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  fetchVelaLoginStatusMock.mockReset().mockResolvedValue(signedOut);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

function amrAuthFailedMessage(): ChatMessage {
  return {
    id: 'msg-amr-auth',
    role: 'assistant',
    content: 'Partial work before AMR demanded sign-in.',
    createdAt: 1,
    runId: 'run-amr-auth',
    runStatus: 'failed',
    agentId: 'amr',
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: 'AMR sign-in is required.',
        code: 'AMR_AUTH_REQUIRED',
      },
    ],
  };
}

function localAgentAuthFailedMessage(): ChatMessage {
  return {
    ...amrAuthFailedMessage(),
    id: 'msg-local-auth',
    runId: 'run-local-auth',
    agentId: 'codex',
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: 'Codex authorization expired.',
        code: 'AGENT_AUTH_REQUIRED',
      },
    ],
  };
}

function chatElement(
  onRetry: (m: ChatMessage) => void,
  props: Partial<ComponentProps<typeof ChatPane>> = {},
) {
  return (
    <ChatPane
      messages={[amrAuthFailedMessage()]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={onRetry}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{
        agentId: 'amr',
        agentCliEnv: {},
        installationId: 'install-123',
        telemetry: { metrics: true },
      } as unknown as AppConfig}
      {...props}
    />
  );
}

const signedIn: VelaLoginStatus = {
  loggedIn: true,
  profile: 'prod',
  user: { id: 'account-a', email: 'account-a@example.com', plan: 'free' },
  configPath: '',
};


function renderChat(onRetry: (m: ChatMessage) => void, props: Partial<ComponentProps<typeof ChatPane>> = {}) {
  return render(chatElement(onRetry, props));
}

const authority = 'workspace-a:personal:member-a:owner:active:active:true:true';
function continuation(overrides: Partial<AmrAuthRetryContinuation> = {}): AmrAuthRetryContinuation {
  return { projectId: 'project-1', conversationId: 'conv-1', assistantId: 'msg-amr-auth',
    workspaceIdentityKey: authority, originMountId: 'mount-origin', accountIdAtArm: null,
    createdAtMs: Date.now(), ...overrides };
}
function onceConsumer() {
  let available = true;
  return vi.fn((_candidate: AmrAuthRetryContinuation) => { if (!available) return false; available = false; return true; });
}
async function settleInitialStatus() {
  await waitFor(() => expect(fetchVelaLoginStatusMock).toHaveBeenCalled());
  const reads = fetchVelaLoginStatusMock.mock.results.map((result) => result.value as Promise<VelaLoginStatus | null>);
  await act(async () => { await Promise.all(reads); });
}
function pendingStatusRead() {
  let resolve!: (status: VelaLoginStatus | null) => void;
  const promise = new Promise<VelaLoginStatus | null>((done) => { resolve = done; });
  return { promise, resolve };
}
async function observeStatus(status: VelaLoginStatus) {
  fetchVelaLoginStatusMock.mockResolvedValue(status);
  const before = fetchVelaLoginStatusMock.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(fetchVelaLoginStatusMock.mock.calls.length).toBeGreaterThan(before);
}

describe('ChatPane fixed Cloud actions and existing Settings auth continuation', () => {
  it('renders fixed Cloud actions without an inline authorize pill', async () => {
    const onRetry = vi.fn();
    const onArm = vi.fn();
    renderChat(onRetry, { onArmAmrAuthRetryContinuation: onArm });
    await settleInitialStatus();
    const card = screen.getByTestId('chat-run-error-card');
    expect(within(card).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
      'chat.runError.contactSupportCta', 'chat.runError.exportLogsCta', 'promptTemplates.retry',
    ]);
    expect(screen.queryByTestId('amr-login-pill')).toBeNull();
    expect(screen.queryByText('chat.amrError.authorizeCta')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'promptTemplates.retry' }));
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-amr-auth' }), 'manual_retry');
    expect(onArm).not.toHaveBeenCalled();
  });

  it('consumes an externally armed intent once only after an exact fresh mount', async () => {
    fetchVelaLoginStatusMock.mockResolvedValue(signedIn);
    const onRetry = vi.fn();
    const onConsume = onceConsumer();
    const pending = continuation();
    const props = { amrAuthRetryContinuation: pending, amrAuthRetryWorkspaceIdentityKey: authority,
      onConsumeAmrAuthRetryContinuation: onConsume };
    renderChat(onRetry, { ...props, amrAuthRetryMountId: 'mount-origin' });
    await settleInitialStatus();
    await observeStatus(signedIn);
    expect(onConsume).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
    cleanup();
    const freshRead = pendingStatusRead();
    fetchVelaLoginStatusMock.mockReturnValue(freshRead.promise);
    renderChat(onRetry, { ...props, amrAuthRetryMountId: 'mount-fresh' });
    await act(async () => { freshRead.resolve(signedIn); await freshRead.promise; });
    expect(onRetry).toHaveBeenCalledTimes(1);
    await observeStatus(signedIn);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-amr-auth' }), 'authorize_and_retry');
    expect(onConsume.mock.calls.every(([candidate]) => candidate === pending)).toBe(true);
  });

  it('waits for the signed-in status to carry the correct account id', async () => {
    fetchVelaLoginStatusMock.mockResolvedValue({ ...signedIn, user: null });
    const onRetry = vi.fn();
    const onConsume = onceConsumer();
    renderChat(onRetry, {
      amrAuthRetryContinuation: continuation({ accountIdAtArm: 'account-a' }),
      amrAuthRetryMountId: 'mount-fresh', amrAuthRetryWorkspaceIdentityKey: authority,
      onConsumeAmrAuthRetryContinuation: onConsume,
    });
    await settleInitialStatus();
    expect(onConsume).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
    await observeStatus({ ...signedIn, user: { ...signedIn.user!, id: 'another-account' } });
    expect(onConsume).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
    await observeStatus(signedIn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('consumes a Settings handoff on a fresh exact mount even without an inline AMR failure', async () => {
    const freshRead = pendingStatusRead();
    fetchVelaLoginStatusMock.mockReturnValue(freshRead.promise);
    const onRetry = vi.fn();
    const onConsume = onceConsumer();
    renderChat(onRetry, {
      messages: [localAgentAuthFailedMessage()],
      amrAuthRetryContinuation: continuation({ assistantId: 'msg-local-auth' }),
      amrAuthRetryMountId: 'mount-after-settings', amrAuthRetryWorkspaceIdentityKey: authority,
      onConsumeAmrAuthRetryContinuation: onConsume,
    });
    await act(async () => { freshRead.resolve(signedIn); await freshRead.promise; });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-local-auth' }), 'switch_runtime_retry');
    expect(onConsume).toHaveBeenCalledTimes(1);
  });

  it('requires an observed login attempt and personal adoption before same-mount retry', async () => {
    fetchVelaLoginStatusMock.mockResolvedValue(signedIn);
    const onRetry = vi.fn();
    const onConsume = onceConsumer();
    const pending = continuation({ workspaceIdentityKey: 'none', originMountId: 'mount-local' });
    const props: Partial<ComponentProps<typeof ChatPane>> = {
      amrAuthRetryContinuation: pending, amrAuthRetryMountId: 'mount-local',
      amrAuthRetryWorkspaceIdentityKey: 'none', onConsumeAmrAuthRetryContinuation: onConsume,
    };
    const view = renderChat(onRetry, props);
    await settleInitialStatus();
    expect(onRetry).not.toHaveBeenCalled();
    view.rerender(chatElement(onRetry, {
      ...props,
      amrAuthRetryWorkspaceIdentityKey: 'personal-a:personal:member-personal-a:owner:active:active:true:true',
      amrAuthRetryPersonalAdoptionWitness: {
        workspaceIdentityKey: 'personal-a:personal:member-personal-a:owner:active:active:true:true',
        workspaceId: 'personal-a', workspaceMemberId: 'member-personal-a',
        workspaceType: 'personal', memberStatus: 'active',
      },
    }));
    await observeStatus(signedIn);
    expect(onRetry).not.toHaveBeenCalled();
    await observeStatus(signedOut);
    await observeStatus(signedIn);
    expect(onRetry).not.toHaveBeenCalled();
    await observeStatus({ ...signedOut, loginInFlight: true });
    await observeStatus(signedIn);
    await observeStatus(signedIn);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onConsume).toHaveBeenCalled();
  });

  it('does not consume a live continuation while the observed status is signed out', async () => {
    fetchVelaLoginStatusMock.mockResolvedValue({ ...signedOut, loginInFlight: true });
    const onRetry = vi.fn();
    const onConsume = onceConsumer();
    renderChat(onRetry, {
      amrAuthRetryContinuation: continuation(), amrAuthRetryMountId: 'mount-fresh',
      amrAuthRetryWorkspaceIdentityKey: authority, onConsumeAmrAuthRetryContinuation: onConsume,
    });
    await settleInitialStatus();
    await observeStatus({ ...signedOut, loginInFlight: true });
    expect(onConsume).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('does not auto-retry an initially signed-in status without an explicit continuation', async () => {
    fetchVelaLoginStatusMock.mockResolvedValue(signedIn);
    const onRetry = vi.fn();
    renderChat(onRetry);
    await settleInitialStatus();
    await observeStatus(signedIn);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
