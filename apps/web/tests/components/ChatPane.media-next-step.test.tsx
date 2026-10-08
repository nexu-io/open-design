// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import { I18nProvider } from '../../src/i18n';
import type { AppConfig, ChatMessage } from '../../src/types';

afterEach(cleanup);

// OPEND-2776 body + both screenshots: Codex succeeded, delivered this PNG,
// emitted artifact_focus, and displayed 图片已生成 without any next_steps.
// No raw run attachment was supplied; the remaining timestamps/IDs are fixture data.
function deliveredImage(): ChatMessage {
  return {
    id: 'media-delivery', role: 'assistant', content: '图片已生成',
    agentId: 'codex', agentName: 'Codex', createdAt: 1000,
    runId: '90a2c168-3c87-41a5-b16b-e2b099c13aed', runStatus: 'succeeded',
    startedAt: 1000, endedAt: 157000,
    producedFiles: [{ name: 'casual-fashion-grid.png', path: 'casual-fashion-grid.png',
      kind: 'image', mime: 'image/png', size: 4_600_000, mtime: 157000 }],
    events: [
      { kind: 'text', text: '图片已生成' },
      { kind: 'artifact_focus', show: ['casual-fashion-grid.png'], open: 'casual-fashion-grid.png' },
    ],
  } as ChatMessage;
}

function renderChat(message: ChatMessage, onSend = vi.fn(), projectFiles: Parameters<typeof ChatPane>[0]['projectFiles'] = []) {
  return render(<I18nProvider initial="zh-CN"><ChatPane
    messages={[message]} streaming={false} error={null}
    projectId="media-project" projectFiles={projectFiles}
    onEnsureProject={async () => 'media-project'} onSend={onSend}
    onStop={vi.fn()} onRetry={vi.fn()}
    conversations={[{ projectId: 'media-project', id: 'media-conversation', title: 'Casual Fashion Grid', createdAt: 1, updatedAt: 1 }]}
    activeConversationId="media-conversation"
    onSelectConversation={vi.fn()} onDeleteConversation={vi.fn()}
    config={{ agentId: 'codex', agentCliEnv: {} } as unknown as AppConfig}
  /></I18nProvider>);
}

test.each(['live-complete', 'history'])('successful media without next_steps has three usable actions: %s', async source => {
  const message = deliveredImage();
  const onSend = vi.fn();
  renderChat(source === 'history' ? JSON.parse(JSON.stringify(message)) as ChatMessage : message, onSend);
  const actions = screen.getByTestId('next-step-suggestions');
  expect(within(actions).getAllByRole('button')).toHaveLength(3);
  for (const label of ['继续优化', '生成变体/换一批', '调整风格/构图']) {
    fireEvent.click(within(actions).getByRole('button', { name: label }));
    await waitFor(() => expect(screen.getByRole('combobox').textContent).toContain(label));
    expect(screen.getByRole('combobox').textContent).toContain('casual-fashion-grid.png');
  }
  expect(onSend).not.toHaveBeenCalled();
});

test('structured suggestions take precedence without extra media fallback rows', async () => {
  const message = deliveredImage();
  const suggestions = ['保留姿势并改成蓝色背景', '换成横向四宫格', '保留服装并调整光线'];
  message.events?.push({ kind: 'next_steps', suggestions });
  const onSend = vi.fn();
  renderChat(message, onSend);
  expect(within(screen.getByTestId('next-step-suggestions')).getAllByRole('button')).toHaveLength(3);
  fireEvent.click(screen.getByText(suggestions[0]!));
  expect(onSend).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole('combobox').textContent).toContain(suggestions[0]));
});

test.each(['failed', 'canceled', 'running'] as const)('does not promise successful media actions for %s', runStatus => {
  renderChat({ ...deliveredImage(), runStatus });
  expect(screen.queryByTestId('next-step-suggestions')).toBeNull();
});

test('does not add success actions when the physical run succeeded but its task was blocked', () => {
  renderChat({ ...deliveredImage(), strategyTaskBlocked: true });
  expect(screen.queryByTestId('next-step-suggestions')).toBeNull();
});

test('keeps existing agent suggestions unchanged when the host blocked the task', async () => {
  const message = { ...deliveredImage(), strategyTaskBlocked: true };
  const suggestion = '确认图片的授权来源';
  message.events?.push({ kind: 'next_steps', suggestions: [suggestion] });
  const onSend = vi.fn();
  renderChat(message, onSend);
  const actions = screen.getByTestId('next-step-suggestions');
  expect(within(actions).getAllByRole('button')).toHaveLength(1);
  fireEvent.click(within(actions).getByRole('button', { name: suggestion }));
  await waitFor(() => expect(screen.getByRole('combobox').textContent).toContain(suggestion));
  expect(screen.getByRole('combobox').textContent).not.toContain('casual-fashion-grid.png');
  expect(onSend).not.toHaveBeenCalled();
});

test('old project images and attachments do not become this turn’s generated image', () => {
  const message = deliveredImage();
  const oldFiles = message.producedFiles ?? [];
  message.producedFiles = [];
  message.attachments = [{ name: 'manual.png', path: 'manual.png', kind: 'image', size: 100 }];
  renderChat(message, vi.fn(), oldFiles);
  expect(screen.queryByTestId('next-step-suggestions')).toBeNull();
});

test.each([
  ['video.mp4', 'video', 'video/mp4'],
  ['audio.mp3', 'audio', 'audio/mpeg'],
  ['notes.md', 'markdown', 'text/markdown'],
])('does not extend image fallback to %s', (name, kind, mime) => {
  const message = deliveredImage();
  message.producedFiles = [{ name, path: name, kind, mime, size: 100, mtime: 157000 }] as ChatMessage['producedFiles'];
  message.events = [{ kind: 'text', text: 'Done' }];
  renderChat(message);
  expect(screen.queryByTestId('next-step-suggestions')).toBeNull();
});

test('does not treat a website’s supporting image as an image-only delivery', () => {
  const message = deliveredImage();
  message.producedFiles?.push({ name: 'index.html', path: 'index.html', kind: 'html', mime: 'text/html', size: 100, mtime: 157000 });
  message.events = [{ kind: 'text', text: 'Done' }];
  renderChat(message);
  expect(screen.queryByTestId('next-step-suggestions')).toBeNull();
});

test('does not offer image actions for an empty output file', () => {
  const message = deliveredImage();
  message.producedFiles![0]!.size = 0;
  renderChat(message);
  expect(screen.queryByTestId('next-step-suggestions')).toBeNull();
});
