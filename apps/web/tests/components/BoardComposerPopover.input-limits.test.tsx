// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BoardComposerPopover } from '../../src/components/BoardComposerPopover';
import type { PreviewCommentSnapshot } from '../../src/comments';
import type { PreviewComment } from '../../src/types';
const target: PreviewCommentSnapshot={filePath:'index.html',elementId:'hero',selector:'#hero',label:'Hero',text:'',htmlHint:'',selectionKind:'element',position:{x:0,y:0,width:10,height:10}};
function mount(draft:string, extra:Partial<React.ComponentProps<typeof BoardComposerPopover>>={}) {
 const onSaveComment=vi.fn(), onSendBatch=vi.fn();
 render(<BoardComposerPopover target={target} existing={null} draft={draft} notes={[]} onDraft={()=>{}} onAddDraft={()=>{}} onRemoveQueuedNote={()=>{}} onClose={()=>{}} onSaveComment={onSaveComment} onSendBatch={onSendBatch} onRemoveMember={()=>{}} sending={false} t={((key:string, params?:Record<string,number>)=>key === 'comment.overLimit' ? `已超出 ${params?.count} 字，请精简后发送` : key) as never} {...extra}/>);
 return {onSaveComment,onSendBatch};
}
afterEach(cleanup);
it.each(['element', 'pod'] as const)('CV22: ignores repeated Enter for %s while preserving normal Enter', (selectionKind) => {
 const {onSaveComment,onSendBatch}=mount('Keep my note',{target:{...target,selectionKind}});
 const input=screen.getByTestId('comment-popover-input');
 fireEvent.keyDown(input,{key:'Enter',repeat:true});
 expect(onSaveComment).not.toHaveBeenCalled();
 expect(onSendBatch).not.toHaveBeenCalled();
 fireEvent.keyDown(input,{key:'Enter'});
 fireEvent.keyDown(input,{key:'Enter',repeat:true});
 expect(onSaveComment).toHaveBeenCalledTimes(selectionKind === 'element' ? 1 : 0);
 expect(onSendBatch).toHaveBeenCalledTimes(selectionKind === 'pod' ? 1 : 0);
});
it('D10: permits 400 trimmed graphemes including composed emoji without a counter',()=>{
 const {onSaveComment}=mount(`  ${'👨‍👩‍👧‍👦'.repeat(400)}  `); expect(screen.queryByRole('alert')).toBeNull();
 fireEvent.keyDown(screen.getByTestId('comment-popover-input'),{key:'Enter'}); expect(onSaveComment).toHaveBeenCalledOnce();
});
it('D10: keeps 401 graphemes and blocks Enter, save and Agent',()=>{
 const {onSaveComment,onSendBatch}=mount('字'.repeat(401)); expect(screen.getByTestId('comment-popover-input')).toHaveValue('字'.repeat(401)); expect(screen.getByRole('alert')).toHaveTextContent('已超出 1 字，请精简后发送'); expect(screen.getByRole('alert')).toHaveTextContent('401 / 400'); expect(screen.getByTestId('comment-popover-input')).toHaveAttribute('aria-invalid','true');
 expect(screen.getByTestId('comment-popover-save')).toBeDisabled(); expect(screen.getByTestId('comment-add-send')).toBeDisabled();
 fireEvent.keyDown(screen.getByTestId('comment-popover-input'),{key:'Enter'}); expect(onSaveComment).not.toHaveBeenCalled(); expect(onSendBatch).not.toHaveBeenCalled();
});
it('D03/D04: sending is read-only and failure retains content with a retry action',()=>{
 mount('Keep my note',{sending:true,saveError:true}); expect(screen.getByTestId('comment-popover-input')).toHaveAttribute('readonly'); expect(screen.getByTestId('comment-popover-input')).toHaveValue('Keep my note'); expect(screen.getByRole('alert')).toHaveTextContent('comment.saveFailed');
});
it('D06: a historical long saved note is read-only and still sendable to Agent',()=>{
 const existing:PreviewComment={...target,id:'saved',projectId:'p',conversationId:'c',note:'字'.repeat(450),status:'open',createdAt:1,updatedAt:1};
 mount(existing.note,{existing,canEditComment:false}); expect(screen.queryByTestId('comment-popover-input')).toBeNull(); expect(screen.queryByTestId('comment-popover-save')).toBeNull(); expect(screen.getByTestId('comment-add-send')).not.toBeDisabled(); expect(screen.queryByRole('alert')).toBeNull();
});
it('saved Pod detail cannot remove members or display a previous draft error',()=>{
 const pod={...target,selectionKind:'pod' as const,memberCount:1,podMembers:[{...target,elementId:'member'}]};
 const existing:PreviewComment={...pod,id:'saved',projectId:'p',conversationId:'c',note:'Saved pod',status:'open',createdAt:1,updatedAt:1};
 const remove=vi.fn();
 mount(existing.note,{target:pod,existing,canEditComment:false,saveError:true,onRemoveMember:remove});
 expect(document.querySelector('.board-pod-chip-remove')).toBeNull();
 expect(screen.queryByRole('alert')).toBeNull();
 expect(screen.getByTestId('comment-popover-detail')).toHaveTextContent('Saved pod');
});
