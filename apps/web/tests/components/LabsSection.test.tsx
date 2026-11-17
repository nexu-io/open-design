// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LabsSection } from '../../src/components/LabsSection';
import type { LabsExperimentProps } from '../../src/components/labs-experiments';
import { I18nProvider } from '../../src/i18n';

// Registry entries are exercised through real test components, without product demo switches.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('renders no empty Labs page or retired OD Next switch', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const { container } = render(<I18nProvider initial="en"><LabsSection /></I18nProvider>);
  expect(container).toBeEmptyDOMElement();
  expect(fetch).not.toHaveBeenCalled();
});

it('renders registered experiments in order and forwards their autosave controller', () => {
  const autosave = { claim: vi.fn(), settle: vi.fn() };
  const received: LabsExperimentProps[] = [];
  const experiments = ['First', 'Second'].map((id) => ({
    id,
    Component: (props: LabsExperimentProps) => {
      received.push(props);
      return <input type="checkbox" role="switch" aria-label={id} />;
    },
  }));
  render(<I18nProvider initial="en"><LabsSection experiments={experiments} autosave={autosave} /></I18nProvider>);
  expect(screen.getAllByRole('switch').map((element) => element.getAttribute('aria-label'))).toEqual(['First', 'Second']);
  expect(received.every((props) => props.autosave === autosave)).toBe(true);
  expect(document.querySelector('.settings-section')).not.toBeNull();
});
