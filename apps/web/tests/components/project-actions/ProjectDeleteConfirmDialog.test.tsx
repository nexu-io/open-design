// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectDeleteConfirmDialog } from '../../../src/components/project-actions/ProjectDeleteConfirmDialog';

afterEach(cleanup);

it('keeps S14 button overrides more specific than the legacy global danger rule', () => {
  const css = readFileSync('src/components/project-actions/ProjectDeleteConfirmDialog.module.css', 'utf8');
  expect(css).toMatch(/activeShareDialog:global\(\.modal-confirm\)[\s\S]*activeShareFooter:global\(\.row\)[\s\S]*:global\(button\.primary\.danger\)\.activeShareDelete/);
  expect(css).toContain('background: #EDEDF0;');
  expect(css).toContain('background: rgb(210, 59, 60);');
  expect(css).toMatch(/activeShareDelete:disabled[\s\S]*?rgb\(210, 59, 60\)/);
});

it('uses the S14 active-share confirmation button treatment and cancel never deletes', () => {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(<ProjectDeleteConfirmDialog projectName="Example" activeShareCount={1} shareReadStatus="ready" pending={false} failed={false} onCancel={onCancel} onConfirm={onConfirm} />);
  const cancel = screen.getByTestId('project-delete-confirm-cancel');
  const remove = screen.getByTestId('project-delete-confirm-accept');
  expect(cancel.className).toMatch(/activeShareCancel/);
  expect(remove.className).toMatch(/activeShareDelete/);
  expect(screen.getByTestId('project-delete-confirm-dialog').className).toMatch(/activeShareDialog/);
  fireEvent.click(cancel);
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onConfirm).not.toHaveBeenCalled();
});
