// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DesignSystemProjectLoading } from '../../../src/features/file-workspace/components/DesignSystemProjectLoading';

afterEach(cleanup);

describe('DesignSystemProjectLoading', () => {
  it('renders the kicker/title/subtitle copy', () => {
    render(
      <DesignSystemProjectLoading
        kicker="Design System"
        title="Creating your design system"
        subtitle="Hang tight"
        progressLabel="Loading"
      />,
    );
    expect(screen.getByText('Design System')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Creating your design system' })).toBeInTheDocument();
    expect(screen.getByText('Hang tight')).toBeInTheDocument();
  });

  it('renders an indeterminate progressbar when progress is omitted', () => {
    render(
      <DesignSystemProjectLoading kicker="k" title="t" subtitle="s" progressLabel="Loading" />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-label', 'Loading');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).not.toHaveAttribute('aria-valuemin');
  });

  it('clamps and rounds a determinate progress value', () => {
    render(
      <DesignSystemProjectLoading kicker="k" title="t" subtitle="s" progress={142.6} progressLabel="Loading" />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps a negative progress value to 0', () => {
    render(
      <DesignSystemProjectLoading kicker="k" title="t" subtitle="s" progress={-5} progressLabel="Loading" />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});
