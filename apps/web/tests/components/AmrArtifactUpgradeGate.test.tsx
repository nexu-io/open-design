// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmrArtifactUpgradeGate } from '../../src/components/AmrArtifactUpgradeGate';
import {
  DAEMON_RUN_FINISHED_EVENT,
  type DaemonRunFinishedEventDetail,
} from '../../src/providers/daemon';
import { requestAmrArtifactUpgrade } from '../../src/runtime/amr-artifact-upgrade';

type RuntimeAwareFinishedRunDetail = DaemonRunFinishedEventDetail & {
  agentId?: string;
};

function publishFinishedRun(detail: Partial<RuntimeAwareFinishedRunDetail> = {}): void {
  const payload: RuntimeAwareFinishedRunDetail = {
    runId: detail.runId ?? 'run-1',
    projectId: detail.projectId ?? 'project-1',
    conversationId: detail.conversationId ?? 'conversation-1',
    result: detail.result ?? 'success',
    artifactCount: detail.artifactCount ?? 1,
    agentId: detail.agentId ?? 'amr',
  };
  window.dispatchEvent(new CustomEvent<DaemonRunFinishedEventDetail>(
    DAEMON_RUN_FINISHED_EVENT,
    { detail: payload },
  ));
}

function requestSend(projectId = 'project-1', conversationId = 'conversation-1') {
  return requestAmrArtifactUpgrade({ projectId, conversationId, source: 'chat_send' });
}

const BASE_PROPS = {
  cloudModelSelected: true,
  profile: 'prod',
  metricsConsent: false,
  installationId: null,
  homeVisible: false,
  activeProjectId: 'project-1',
  activeConversationId: 'conversation-1',
  activeFileName: 'live:artifact-1',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.querySelectorAll('[data-external-modal-blocker]').forEach((node) => node.remove());
});

describe('AmrArtifactUpgradeGate', () => {
  it('pauses the first later Send in an artifact session until the user decides', async () => {
    render(<AmrArtifactUpgradeGate {...BASE_PROPS} plan="free" planResolved />);

    act(() => publishFinishedRun());
    expect(screen.queryByTestId('amr-artifact-upgrade-dialog')).toBeNull();

    let settled = false;
    const decision = requestSend().then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();

    expect(settled).toBe(false);
    await waitFor(() => expect(screen.getByTestId('amr-artifact-upgrade-dialog')).toBeTruthy());

    fireEvent.click(screen.getByTestId('amr-artifact-upgrade-later'));
    await expect(decision).resolves.toBe('proceed');
  });

  it('proceeds immediately for a Send in another conversation', async () => {
    render(<AmrArtifactUpgradeGate {...BASE_PROPS} plan="free" planResolved />);

    act(() => publishFinishedRun());

    await expect(requestSend('project-1', 'conversation-2')).resolves.toBe('proceed');
    expect(screen.queryByTestId('amr-artifact-upgrade-dialog')).toBeNull();
  });

  it('does not prompt a Free-plan user after Kimi creates an artifact', async () => {
    render(<AmrArtifactUpgradeGate {...BASE_PROPS} plan="free" planResolved />);

    act(() => publishFinishedRun({ agentId: 'kimi' }));

    await expect(requestSend()).resolves.toBe('proceed');
    expect(screen.queryByTestId('amr-artifact-upgrade-dialog')).toBeNull();
  });

  it.each(['local CLI', 'BYOK'])('does not prompt when the selected model uses %s', async () => {
    const onHomeOfferChange = vi.fn();
    const view = render(
      <AmrArtifactUpgradeGate
        {...BASE_PROPS}
        cloudModelSelected={false}
        plan="free"
        planResolved
        onHomeOfferChange={onHomeOfferChange}
      />,
    );

    act(() => publishFinishedRun());
    await expect(requestSend()).resolves.toBe('proceed');
    expect(screen.queryByTestId('amr-artifact-upgrade-dialog')).toBeNull();

    view.rerender(
      <AmrArtifactUpgradeGate
        {...BASE_PROPS}
        activeProjectId={null}
        activeConversationId={null}
        activeFileName={null}
        cloudModelSelected={false}
        homeVisible
        plan="free"
        planResolved
        onHomeOfferChange={onHomeOfferChange}
      />,
    );
    await waitFor(() => expect(onHomeOfferChange).toHaveBeenCalledWith(null));
    expect(onHomeOfferChange).not.toHaveBeenCalledWith(expect.objectContaining({
      sessionKey: JSON.stringify(['project-1', 'conversation-1']),
    }));
  });

  it('releases a paused Send if the selected model switches away from Cloud', async () => {
    const view = render(
      <AmrArtifactUpgradeGate {...BASE_PROPS} plan="free" planResolved />,
    );

    act(() => publishFinishedRun());
    const decision = requestSend();
    await waitFor(() => expect(screen.getByTestId('amr-artifact-upgrade-dialog')).toBeTruthy());

    view.rerender(
      <AmrArtifactUpgradeGate
        {...BASE_PROPS}
        cloudModelSelected={false}
        plan="free"
        planResolved
      />,
    );

    await expect(decision).resolves.toBe('proceed');
    await waitFor(() => expect(screen.queryByTestId('amr-artifact-upgrade-dialog')).toBeNull());
  });

  it('does not prompt the same session again after the first decision', async () => {
    render(<AmrArtifactUpgradeGate {...BASE_PROPS} plan="free" planResolved />);

    act(() => publishFinishedRun());
    const firstDecision = requestSend();
    await waitFor(() => expect(screen.getByTestId('amr-artifact-upgrade-dialog')).toBeTruthy());

    fireEvent.click(screen.getByTestId('amr-artifact-upgrade-later'));
    await expect(firstDecision).resolves.toBe('proceed');
    await waitFor(() => expect(screen.queryByTestId('amr-artifact-upgrade-dialog')).toBeNull());

    await expect(requestSend()).resolves.toBe('proceed');
    expect(screen.queryByTestId('amr-artifact-upgrade-dialog')).toBeNull();
  });

  it('requests one non-blocking Home offer for each newly eligible session', async () => {
    const onHomeOfferChange = vi.fn();
    const view = render(
      <AmrArtifactUpgradeGate
        {...BASE_PROPS}
        plan="free"
        planResolved
        onHomeOfferChange={onHomeOfferChange}
      />,
    );

    act(() => publishFinishedRun());
    view.rerender(
      <AmrArtifactUpgradeGate
        {...BASE_PROPS}
        activeProjectId={null}
        activeConversationId={null}
        activeFileName={null}
        homeVisible
        plan="free"
        planResolved
        onHomeOfferChange={onHomeOfferChange}
      />,
    );

    await waitFor(() => expect(onHomeOfferChange).toHaveBeenCalledWith({
      sessionKey: JSON.stringify(['project-1', 'conversation-1']),
      projectId: 'project-1',
      conversationId: 'conversation-1',
      fileName: 'live:artifact-1',
    }));
    expect(screen.queryByTestId('amr-artifact-upgrade-dialog')).toBeNull();

    view.rerender(
      <AmrArtifactUpgradeGate
        {...BASE_PROPS}
        activeProjectId={null}
        activeConversationId={null}
        activeFileName={null}
        homeVisible
        plan="free"
        planResolved
        onHomeOfferChange={onHomeOfferChange}
      />,
    );
    expect(onHomeOfferChange).toHaveBeenCalledTimes(1);

    view.rerender(
      <AmrArtifactUpgradeGate
        {...BASE_PROPS}
        activeConversationId="conversation-2"
        activeFileName="live:artifact-2"
        homeVisible={false}
        plan="free"
        planResolved
        onHomeOfferChange={onHomeOfferChange}
      />,
    );
    act(() => publishFinishedRun({
      runId: 'run-2',
      conversationId: 'conversation-2',
    }));
    view.rerender(
      <AmrArtifactUpgradeGate
        {...BASE_PROPS}
        activeProjectId={null}
        activeConversationId={null}
        activeFileName={null}
        homeVisible
        plan="free"
        planResolved
        onHomeOfferChange={onHomeOfferChange}
      />,
    );

    await waitFor(() => expect(onHomeOfferChange).toHaveBeenLastCalledWith({
      sessionKey: JSON.stringify(['project-1', 'conversation-2']),
      projectId: 'project-1',
      conversationId: 'conversation-2',
      fileName: 'live:artifact-2',
    }));
    expect(onHomeOfferChange).toHaveBeenCalledTimes(2);
  });

  it('fails open while the plan is unavailable, then prompts after Free resolves', async () => {
    const view = render(
      <AmrArtifactUpgradeGate {...BASE_PROPS} plan={null} planResolved={false} />,
    );

    act(() => publishFinishedRun());
    await expect(requestSend()).resolves.toBe('proceed');
    expect(screen.queryByTestId('amr-artifact-upgrade-dialog')).toBeNull();

    view.rerender(<AmrArtifactUpgradeGate {...BASE_PROPS} plan="free" planResolved />);
    const freeDecision = requestSend();
    await waitFor(() => expect(screen.getByTestId('amr-artifact-upgrade-dialog')).toBeTruthy());
    fireEvent.click(screen.getByTestId('amr-artifact-upgrade-later'));
    await expect(freeDecision).resolves.toBe('proceed');
  });

  it('proceeds immediately for paid plans and runs without an artifact', async () => {
    const view = render(<AmrArtifactUpgradeGate {...BASE_PROPS} plan="plus" planResolved />);

    act(() => publishFinishedRun());
    await expect(requestSend()).resolves.toBe('proceed');

    view.rerender(<AmrArtifactUpgradeGate {...BASE_PROPS} plan="free" planResolved />);
    act(() => publishFinishedRun({
      runId: 'run-2',
      conversationId: 'conversation-2',
      artifactCount: 0,
    }));
    await expect(requestSend('project-1', 'conversation-2')).resolves.toBe('proceed');
    expect(screen.queryByTestId('amr-artifact-upgrade-dialog')).toBeNull();
  });

  it('cancels a paused Send when plans, close, Escape, or the backdrop is chosen', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<AmrArtifactUpgradeGate {...BASE_PROPS} plan="free" planResolved />);

    act(() => publishFinishedRun());
    const decision = requestSend();
    await waitFor(() => expect(screen.getByTestId('amr-artifact-upgrade-dialog')).toBeTruthy());

    fireEvent.click(screen.getByTestId('amr-artifact-upgrade-plans'));
    await expect(decision).resolves.toBe('cancel');
    expect(screen.queryByTestId('amr-artifact-upgrade-dialog')).toBeNull();
  });

  it('does not stack behind an existing modal or delay the Send', async () => {
    const blocker = document.createElement('div');
    blocker.setAttribute('role', 'dialog');
    blocker.setAttribute('aria-modal', 'true');
    blocker.setAttribute('data-external-modal-blocker', 'true');
    document.body.appendChild(blocker);
    render(<AmrArtifactUpgradeGate {...BASE_PROPS} plan="free" planResolved />);

    act(() => publishFinishedRun());

    await expect(requestSend()).resolves.toBe('proceed');
    expect(screen.queryByTestId('amr-artifact-upgrade-dialog')).toBeNull();
    blocker.remove();
  });

  it('cancels an unresolved paused Send if the Gate unmounts', async () => {
    const view = render(<AmrArtifactUpgradeGate {...BASE_PROPS} plan="free" planResolved />);

    act(() => publishFinishedRun());
    const decision = requestSend();
    await waitFor(() => expect(screen.getByTestId('amr-artifact-upgrade-dialog')).toBeTruthy());

    view.unmount();
    await expect(decision).resolves.toBe('cancel');
  });

  // Acceptance #40: a Team Pro account finished a generation and Home showed the
  // free-user upsell banner. Every team-namespaced plan id is paid, so neither
  // the Home offer nor the Send interception may fire for one.
  it.each(['team', 'team_basic', 'team_plus', 'team_pro', 'team_max'])(
    'offers no free-tier upsell on the %s plan',
    async (plan) => {
      const onHomeOfferChange = vi.fn();
      const view = render(
        <AmrArtifactUpgradeGate
          {...BASE_PROPS}
          plan={plan}
          planResolved
          onHomeOfferChange={onHomeOfferChange}
        />,
      );

      act(() => publishFinishedRun());
      view.rerender(
        <AmrArtifactUpgradeGate
          {...BASE_PROPS}
          activeProjectId={null}
          activeConversationId={null}
          activeFileName={null}
          homeVisible
          plan={plan}
          planResolved
          onHomeOfferChange={onHomeOfferChange}
        />,
      );

      // The paid path clears any standing offer instead of publishing one.
      await waitFor(() => expect(onHomeOfferChange).toHaveBeenCalledWith(null));
      expect(onHomeOfferChange).not.toHaveBeenCalledWith(expect.objectContaining({
        sessionKey: JSON.stringify(['project-1', 'conversation-1']),
      }));

      await expect(requestSend()).resolves.toBe('proceed');
      expect(screen.queryByTestId('amr-artifact-upgrade-dialog')).toBeNull();
    },
  );
});
