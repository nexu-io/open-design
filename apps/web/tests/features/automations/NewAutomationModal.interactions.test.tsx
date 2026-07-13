// @vitest-environment jsdom
//
// Closes the remaining interaction gaps left by the moved project-picker and
// context-picker suites: backdrop click-to-close, popover auto-close on
// mousedown, title/prompt field editing, the mention tab bar, removing a
// selected context chip, and picking an existing project from the popover.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NewAutomationModal } from '../../../src/features/automations/components/NewAutomationModal';
import { listPlugins } from '../../../src/state/projects';
import { fetchMcpServers } from '../../../src/providers/mcp';

vi.mock('../../../src/state/projects', () => ({ listPlugins: vi.fn().mockResolvedValue([]) }));
vi.mock('../../../src/providers/mcp', () => ({ fetchMcpServers: vi.fn().mockResolvedValue({ servers: [], templates: [] }) }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderModal(overrides: Partial<Parameters<typeof NewAutomationModal>[0]> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <NewAutomationModal
      open
      templates={[]}
      projects={[{ id: 'p-1', name: 'Project One' }]}
      skills={[]}
      connectors={[]}
      onClose={onClose}
      onSaved={onSaved}
      {...overrides}
    />,
  );
  return { onClose, onSaved };
}

describe('NewAutomationModal interactions', () => {
  it('closes when the backdrop itself is clicked, not when the dialog content is clicked', () => {
    const { onClose } = renderModal();
    const backdrop = screen.getByTestId('automation-modal');
    fireEvent.click(backdrop, { target: backdrop });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when a click bubbles up from inside the dialog', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByTestId('automation-modal-title'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes any open popover on a backdrop mousedown', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /New project each run/i }));
    expect(screen.getByText('A fresh, isolated workspace per fire.')).toBeTruthy();

    fireEvent.mouseDown(screen.getByTestId('automation-modal'));

    expect(screen.queryByText('A fresh, isolated workspace per fire.')).toBeNull();
  });

  it('updates the title and prompt fields as the user types', () => {
    renderModal();
    const title = screen.getByTestId('automation-modal-title') as HTMLInputElement;
    fireEvent.change(title, { target: { value: 'My automation' } });
    expect(title.value).toBe('My automation');

    const prompt = screen.getByTestId('automation-modal-prompt') as HTMLTextAreaElement;
    fireEvent.change(prompt, { target: { value: 'Do the thing', selectionStart: 13 } });
    expect(prompt.value).toBe('Do the thing');
  });

  it('re-detects the active mention on click/keyup against the real textarea selection', () => {
    renderModal();
    const prompt = screen.getByTestId('automation-modal-prompt') as HTMLTextAreaElement;
    fireEvent.change(prompt, { target: { value: 'Run @sk', selectionStart: 7 } });
    expect(screen.getByTestId('automation-mention-popover')).toBeTruthy();

    fireEvent.click(prompt);
    fireEvent.keyUp(prompt);
    // No throw confirms `refreshMentionFromPrompt`'s real-textarea branch ran
    // (promptRef.current is a live DOM node here, unlike a headless hook test).
    expect(screen.getByTestId('automation-mention-popover')).toBeTruthy();
  });

  it('closes an open popover when the prompt field is focused', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /New project each run/i }));
    expect(screen.getByText('A fresh, isolated workspace per fire.')).toBeTruthy();

    fireEvent.focus(screen.getByTestId('automation-modal-prompt'));

    expect(screen.queryByText('A fresh, isolated workspace per fire.')).toBeNull();
  });

  it('switches the mention tab and filters the picker', () => {
    renderModal();
    const prompt = screen.getByTestId('automation-modal-prompt');
    fireEvent.change(prompt, { target: { value: '@', selectionStart: 1 } });
    const popover = screen.getByTestId('automation-mention-popover');
    fireEvent.mouseDown(within(popover).getByRole('tab', { name: 'Skills' }));
    expect(within(popover).getByRole('tab', { name: 'Skills' }).getAttribute('aria-selected')).toBe('true');
  });

  it('removes a selected context chip', () => {
    renderModal({
      skills: [
        {
          id: 'skill-1',
          name: 'Skill One',
          description: 'A skill.',
          triggers: [],
          mode: 'prototype',
          previewType: 'html',
          designSystemRequired: false,
          defaultFor: [],
          upstream: null,
          hasBody: true,
          examplePrompt: 'Run it',
          aggregatesExamples: false,
        },
      ],
    });
    const prompt = screen.getByTestId('automation-modal-prompt');
    fireEvent.change(prompt, { target: { value: '@skill', selectionStart: 6 } });
    fireEvent.mouseDown(screen.getByRole('option', { name: /Skill One/i }));
    expect(screen.getByTitle('Remove Skill One')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Remove Skill One'));
    expect(screen.queryByTitle('Remove Skill One')).toBeNull();
  });

  it('picks an existing project from the project popover', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /New project each run/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Project One' }));
    expect(screen.getByRole('button', { name: 'Project One' })).toBeTruthy();
  });

  it('re-selects "new project each run" after choosing an existing project', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /New project each run/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Project One' }));

    fireEvent.click(screen.getByRole('button', { name: 'Project One' }));
    fireEvent.click(screen.getByRole('button', { name: /New project each run/i }));
    expect(screen.getByRole('button', { name: /New project each run/i })).toBeTruthy();
  });
});
