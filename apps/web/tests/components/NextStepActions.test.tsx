// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NextStepActions } from '../../src/components/NextStepActions';
import { en } from '../../src/i18n/locales/en';
import type { SkillSummary } from '../../src/types';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function skill(id: string, name: string): SkillSummary {
  return {
    id,
    name,
    description: `${name} skill`,
    triggers: [],
    mode: 'prototype',
    surface: 'web',
    previewType: 'html',
    designSystemRequired: false,
    defaultFor: [],
    upstream: '',
    hasBody: true,
    examplePrompt: '',
    aggregatesExamples: false,
  } as SkillSummary;
}

const AUTO_MATCH_TITLE = en['chat.designToolbox.action.auto-match.title'];
const VISUAL_POLISH_TITLE = en['chat.designToolbox.action.visual-polish.title'];

function renderActions(overrides: Partial<Parameters<typeof NextStepActions>[0]> = {}) {
  const handlers = {
    onShare: vi.fn(),
    onDownload: vi.fn(),
    onToolboxAction: vi.fn(),
    onPickSkill: vi.fn(),
    onShareToOpenDesign: vi.fn(),
  };
  render(
    <NextStepActions
      fileName="landing.html"
      onShare={handlers.onShare}
      onDownload={handlers.onDownload}
      onToolboxAction={handlers.onToolboxAction}
      onPickSkill={handlers.onPickSkill}
      onShareToOpenDesign={handlers.onShareToOpenDesign}
      skills={[skill('creative-director', 'Creative Director'), skill('gsap-performance', 'GSAP Performance')]}
      toolboxSkillNames={{ 'auto-match': 'creative-director', 'visual-polish': 'impeccable-design-polish' }}
      {...overrides}
    />,
  );
  return handlers;
}

describe('NextStepActions', () => {
  it('renders the two featured rows and More', () => {
    renderActions();
    expect(screen.getByText(AUTO_MATCH_TITLE)).toBeTruthy();
    expect(screen.getByText(VISUAL_POLISH_TITLE)).toBeTruthy();
    expect(screen.getByTestId('next-step-toolbox-more')).toBeTruthy();
  });

  it('seeds the composer with the action id (no auto-send) when a featured row is clicked', () => {
    const h = renderActions();
    fireEvent.click(screen.getByTestId('next-step-toolbox-action-visual-polish'));
    expect(h.onToolboxAction).toHaveBeenCalledWith('visual-polish');
  });

  it('reveals the matched @skill in the featured-row hover detail', () => {
    renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-action-auto-match'));
    expect(screen.getByText('@creative-director')).toBeTruthy();
  });

  it('opens the More menu with Design toolbox + Share on hover', () => {
    renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    const menu = screen.getByTestId('next-step-more-menu');
    expect(menu).toBeTruthy();
    expect(screen.getByTestId('next-step-more-skills')).toBeTruthy();
    expect(screen.getByTestId('next-step-more-share')).toBeTruthy();
  });

  it('cascades into the full skill list and applies a picked skill', () => {
    const h = renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-skills'));
    expect(screen.getByTestId('next-step-skills-list')).toBeTruthy();
    fireEvent.click(screen.getByText('GSAP Performance'));
    expect(h.onPickSkill).toHaveBeenCalledWith('gsap-performance');
  });

  it('cascades into Share / Download / Contribute and routes each action', () => {
    const h = renderActions();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-share'));
    expect(screen.getByTestId('next-step-share-menu')).toBeTruthy();

    fireEvent.click(screen.getByTestId('next-step-share-share'));
    expect(h.onShare).toHaveBeenCalledWith('landing.html');

    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-share'));
    fireEvent.click(screen.getByTestId('next-step-share-download'));
    expect(h.onDownload).toHaveBeenCalledWith('landing.html');

    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-share'));
    fireEvent.click(screen.getByTestId('next-step-share-contribute'));
    expect(h.onShareToOpenDesign).toHaveBeenCalledTimes(1);
  });

  it('hides the toolbox rows when no toolbox handler is wired', () => {
    renderActions({ onToolboxAction: undefined });
    expect(screen.queryByTestId('next-step-toolbox-action-auto-match')).toBeNull();
  });
});
