// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { AnnotationHoverPopover, BoardComposerPopover } from '../../src/components/BoardComposerPopover';
import styles from '../../src/components/CommentComposer.module.css';
import { TooltipLayer } from '../../src/components/TooltipLayer';

afterEach(cleanup);
const props: ComponentProps<typeof BoardComposerPopover> = {
  target:{filePath:'index.html',elementId:'hero',selector:'#hero',label:'Hero',text:'',htmlHint:'',position:{x:80,y:100,width:200,height:80}},
  existing:null,draft:'Keep this draft',notes:[],sending:false,
  onDraft:vi.fn(),onAddDraft:vi.fn(),onRemoveQueuedNote:vi.fn(),onClose:vi.fn(),onSaveComment:vi.fn(),onSendBatch:vi.fn(),onRemoveMember:vi.fn(),
  t:key=>key,markerRect:{left:100,top:100,width:28,height:28},bounds:{width:800,height:600},
};
it('draft mounts no header, retired handle, view-all entry, or legacy skin DOM', () => {
  render(<BoardComposerPopover {...props}/>);
  const dialog=screen.getByRole('dialog',{name:'chat.comments.comment: Hero'});
  expect(dialog.className).toBe(styles.popover);
  expect(dialog.querySelector(`.${styles.header}`)).toBeNull();
  expect(screen.queryByLabelText('Move comment box')).toBeNull();
  expect(screen.queryByTestId('comment-popover-view-all')).toBeNull();
  expect(dialog.querySelector('[class*="comment-popover"]')).toBeNull();
  expect(screen.getByTestId('comment-popover-input')).toHaveValue('Keep this draft');
  fireEvent.click(screen.getByTestId('comment-popover-save'));
  expect(props.onSaveComment).toHaveBeenCalledOnce();
});
it('detail mounts its real author, menu and close while keeping the old controls absent', () => {
  const close=vi.fn();
  render(<BoardComposerPopover {...props} onClose={close} locationNotice="Position may have changed" author={<span>Alice</span>} existing={{...props.target,id:'comment-1',projectId:'project',conversationId:'conversation',note:'Read only detail',status:'open',createdAt:1,updatedAt:1}}/>);
  expect(screen.getByText('Alice')).toBeTruthy();
  const notice=screen.getByRole('status');
  expect(notice).toHaveTextContent('Position may have changed');
  expect(screen.getByTestId('comment-popover-detail').compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(notice).toHaveClass(styles.locationNotice!);
  expect(notice.querySelector('svg')).toHaveAttribute('aria-hidden','true');
  expect(screen.getByLabelText('comment.moreActions')).toBeTruthy();
  expect(screen.queryByLabelText('Move comment box')).toBeNull();
  expect(screen.queryByTestId('comment-popover-view-all')).toBeNull();
  expect(screen.queryByTestId('comment-popover-input')).toBeNull();
  expect(screen.getByTestId('comment-popover-detail')).toHaveTextContent('Read only detail');
  fireEvent.click(screen.getByLabelText('common.close'));
  expect(close).toHaveBeenCalledOnce();
});
const savedComment = {...props.target,id:'comment-1',projectId:'project',conversationId:'conversation',note:'Read only detail',status:'open' as const,createdAt:1,updatedAt:1};
const labels: Record<string, string> = {
  'chat.comments.sendToChat':'Send to Agent',
  'chat.annotationQueue':'Queue',
  'chat.comments.sending':'Sending…',
};
const translate: typeof props.t = key => labels[key] ?? key;
it('exposes the saved comment send action in the header and keeps delete in the menu', () => {
  const send=vi.fn();
  const remove=vi.fn();
  render(<BoardComposerPopover {...props} existing={savedComment} onSendBatch={send} onDeleteComment={remove} t={translate}/>);
  const button=screen.getByRole('button',{name:'Send to Agent'});
  const menu=screen.getByRole('menu',{hidden:true});
  expect(button).toHaveAttribute('title','Send to Agent');
  expect(button.parentElement).toHaveClass(styles.header!);
  expect(button.querySelector('svg')).not.toBeNull();
  expect(menu.contains(button)).toBe(false);
  fireEvent.click(button);
  expect(send).toHaveBeenCalledOnce();
  const deleteButton=screen.getByRole('button',{name:'common.delete',hidden:true});
  expect(menu.contains(deleteButton)).toBe(true);
  fireEvent.click(deleteButton);
  expect(remove).toHaveBeenCalledWith(savedComment.id);
});
it.each([
  {canSendToAgent:false},
  {allowSendToChat:false},
])('keeps the saved comment send permission gates: %j', gates => {
  render(<BoardComposerPopover {...props} {...gates} existing={savedComment} t={translate}/>);
  expect(screen.queryByTestId('comment-add-send')).toBeNull();
});
it.each([
  {state:{queueOnSend:true},label:'Queue',disabled:false,title:'Queue'},
  {state:{queueOnSend:true,sending:true},label:'Sending…',disabled:true,title:'Sending…'},
  {state:{sendDisabled:true,sendDisabledReason:'Agent unavailable'},label:'Send to Agent',disabled:true,title:'Agent unavailable'},
  {state:{draft:''},label:'Send to Agent',disabled:true,title:'Send to Agent'},
])('preserves saved comment send state: $label / $title', ({state,label,disabled,title}) => {
  const send=vi.fn();
  render(<BoardComposerPopover {...props} {...state} existing={savedComment} onSendBatch={send} t={translate}/>);
  const button=screen.getByRole('button',{name:label});
  expect(button).toHaveProperty('disabled',disabled);
  expect(button).toHaveAttribute('title',title);
  fireEvent.click(button);
  expect(send).toHaveBeenCalledTimes(disabled ? 0 : 1);
});
it('exposes draft pod send while keeping add-note in the menu', () => {
  const addNote=vi.fn();
  render(<BoardComposerPopover {...props} target={{...props.target,selectionKind:'pod'}} onAddDraft={addNote}/>);
  const menu=screen.getByRole('menu',{hidden:true});
  expect(menu.contains(screen.getByTestId('comment-add-send'))).toBe(false);
  const add=screen.getByTestId('comment-popover-add-note');
  expect(menu.contains(add)).toBe(true);
  fireEvent.click(add);
  expect(addNote).toHaveBeenCalledOnce();
});
it('the independent annotation hover retains its existing global surface', () => {
  render(<AnnotationHoverPopover target={{...props.target,style:{color:'#f00'}}} scale={1} bounds={{width:800,height:600}}/>);
  expect(screen.getByTestId('annotation-hover-popover')).toHaveClass('comment-popover','annotation-hover-popover');
  expect(screen.getByTestId('annotation-hover-style-summary')).toHaveTextContent('Color');
});

it.each([false,true])('shows the Agent tooltip on pointer hover and keyboard focus (detail=%s)', detail => {
  render(<><BoardComposerPopover {...props} existing={detail ? savedComment : null} queueOnSend t={translate}/><TooltipLayer/></>);
  const button=screen.getByTestId('comment-add-send');
  expect(button).toHaveAccessibleName('Queue');
  expect(button).toHaveAttribute('data-tooltip-placement','top');
  fireEvent.pointerOver(button);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Send to Agent');
  fireEvent.pointerOut(button);
  fireEvent.keyDown(document,{key:'Tab'});
  fireEvent.focusIn(button);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Send to Agent');
});
it('retains the disabled Agent reason in the shared tooltip', () => {
  render(<><BoardComposerPopover {...props} sendDisabled sendDisabledReason="Agent unavailable" t={translate}/><TooltipLayer/></>);
  const button=screen.getByTestId('comment-add-send');
  expect(button).toBeDisabled();
  fireEvent.pointerOver(button);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Agent unavailable');
});
it('keeps the sending state on the disabled primary button with its in-place loader', () => {
  render(<BoardComposerPopover {...props} sending/>);
  const button=screen.getByTestId('comment-popover-save');
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('data-sending','true');
  expect(button.querySelector(`.${styles.spinner}`)).not.toBeNull();
  expect(screen.getByTestId('comment-popover-input')).toHaveAttribute('readonly');
});
