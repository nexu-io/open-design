// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../src/i18n';
import { ReactModulePointer } from '../../../src/features/file-viewer/components/ReactModulePointer';

afterEach(cleanup);

describe('ReactModulePointer', () => {
  it('lists every referencing HTML entry', () => {
    render(
      <I18nProvider initial="en">
        <ReactModulePointer entries={['index.html', 'page-2.html']} onOpenEntry={() => {}} />
      </I18nProvider>,
    );
    expect(screen.getByText('index.html')).toBeTruthy();
    expect(screen.getByText('page-2.html')).toBeTruthy();
  });

  it('calls onOpenEntry with the clicked entry name', () => {
    const onOpenEntry = vi.fn();
    render(
      <I18nProvider initial="en">
        <ReactModulePointer entries={['index.html']} onOpenEntry={onOpenEntry} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText('index.html'));
    expect(onOpenEntry).toHaveBeenCalledWith('index.html');
  });

  it('disables entry buttons when no onOpenEntry handler is given', () => {
    render(
      <I18nProvider initial="en">
        <ReactModulePointer entries={['index.html']} />
      </I18nProvider>,
    );
    expect(screen.getByText('index.html').closest('button')).toBeDisabled();
  });
});
