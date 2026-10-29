// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { BoardComposerPopover } from '../../src/components/BoardComposerPopover';

afterEach(cleanup);
const props: ComponentProps<typeof BoardComposerPopover> = {
  target: { filePath:'index.html', elementId:'hero', selector:'#hero', label:'Hero', text:'', htmlHint:'', position:{x:20,y:20,width:700,height:400} },
  existing:null, draft:'Preserve this draft', notes:[], sending:false,
  onDraft:vi.fn(), onAddDraft:vi.fn(), onRemoveQueuedNote:vi.fn(), onClose:vi.fn(), onSaveComment:vi.fn(), onSendBatch:vi.fn(), onRemoveMember:vi.fn(),
  t: key => key, bounds:{width:800,height:600}, markerRect:{left:400,top:200,width:28,height:28},
};
it('CV11: follows the displayed avatar rather than the target element or original point', () => {
  render(<BoardComposerPopover {...props}/>);
  expect(screen.getByTestId('comment-popover')).toHaveStyle({left:'440px',top:'200px',width:'320px'});
});
it('CV12: no nearby space hides the mounted draft and restores it when the viewport returns', () => {
  const {rerender} = render(<BoardComposerPopover {...props}/>);
  const input = screen.getByTestId('comment-popover-input');
  rerender(<BoardComposerPopover {...props} bounds={{width:200,height:150}} markerRect={{left:90,top:40,width:28,height:28}}/>);
  expect(screen.getByTestId('comment-popover')).toHaveStyle({visibility:'hidden',pointerEvents:'none'});
  expect(screen.getByTestId('comment-popover-input')).toBe(input);
  expect(input).toHaveValue('Preserve this draft');
  expect(props.onClose).not.toHaveBeenCalled();
  rerender(<BoardComposerPopover {...props}/>);
  expect(screen.getByTestId('comment-popover')).toHaveStyle({left:'440px',visibility:'visible'});
  expect(screen.getByTestId('comment-popover-input')).toBe(input);
});
it('CV18: an explicitly unavailable avatar hides the floating card', () => {
  render(<BoardComposerPopover {...props} markerRect={null}/>);
  expect(screen.getByTestId('comment-popover')).toHaveStyle({visibility:'hidden'});
});
