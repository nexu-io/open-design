// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../src/i18n';
import { TextViewerView } from '../../../src/features/file-viewer/components/TextViewerView';

afterEach(cleanup);

describe('TextViewerView', () => {
  it('shows the loading state while text is null', () => {
    render(
      <I18nProvider initial="en">
        <TextViewerView
          text={null}
          displayText={null}
          lineCount={0}
          copied={false}
          onReload={() => {}}
          onCopy={() => {}}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('renders gutter-numbered lines when there is more than one line', () => {
    const { container } = render(
      <I18nProvider initial="en">
        <TextViewerView
          text={'a\nb'}
          displayText={'a\nb'}
          lineCount={2}
          copied={false}
          onReload={() => {}}
          onCopy={() => {}}
        />
      </I18nProvider>,
    );
    expect(container.querySelector('code.gutter')?.textContent).toBe('1\n2');
  });

  it('renders plain source when lineCount is 0', () => {
    const { container } = render(
      <I18nProvider initial="en">
        <TextViewerView
          text={''}
          displayText={''}
          lineCount={0}
          copied={false}
          onReload={() => {}}
          onCopy={() => {}}
        />
      </I18nProvider>,
    );
    expect(container.querySelector('pre.viewer-source')).toBeTruthy();
    expect(container.querySelector('code.gutter')).toBeNull();
  });

  it('shows the copied label when copied is true', () => {
    render(
      <I18nProvider initial="en">
        <TextViewerView
          text={'x'}
          displayText={'x'}
          lineCount={1}
          copied
          onReload={() => {}}
          onCopy={() => {}}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('Copied!')).toBeTruthy();
  });

  it('calls onCopy and onReload from their buttons', () => {
    const onCopy = vi.fn();
    const onReload = vi.fn();
    render(
      <I18nProvider initial="en">
        <TextViewerView
          text={'x'}
          displayText={'x'}
          lineCount={1}
          copied={false}
          onReload={onReload}
          onCopy={onCopy}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTitle('Copy file contents'));
    expect(onCopy).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Reload from disk'));
    expect(onReload).toHaveBeenCalled();
  });
});
