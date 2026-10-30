// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';
vi.mock('../../src/comments/validate-save-target',()=>({validateCommentSaveTarget:async(_frame:unknown,target:unknown)=>target}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
beforeEach(() => {
 const original = HTMLElement.prototype.getBoundingClientRect;
 vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
  if (this.matches('.viewer-body, .comment-preview-canvas')) return new DOMRect(0, 0, 900, 700);
  if (this.matches('.comment-saved-marker, .comment-active-pin')) {
   return new DOMRect(Number.parseFloat(this.style.left), Number.parseFloat(this.style.top), 28, 28);
  }
  return original.call(this);
 });
});
const file:ProjectFile={name:'browse.html',path:'browse.html',type:'file',size:10,mtime:1,kind:'html',mime:'text/html'};
it('A01/D05/H11: browsing preserves the draft, C skips inputs and closing the picker reuses two-click protection',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({})));
 render(<FileViewer projectId="p" projectKind="prototype" file={file} liveHtml="<html><body><h1 data-od-id='title'>Title</h1></body></html>" onSavePreviewComment={async()=>null}/>);
 fireEvent.click(screen.getByTestId('comment-panel-toggle'));
 expect(screen.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed','false');
 fireEvent.click(screen.getByTestId('board-mode-toggle'));
 const frame=screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
 await act(async()=>{window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,data:{type:'od:comment-target',filePath:file.name,elementId:'title',selector:'[data-od-id="title"]',label:'Title',text:'Title',htmlHint:'<h1>',selectionKind:'element',position:{x:20,y:40,width:200,height:80},hoverPoint:{x:40,y:50}}}));});
 const input=screen.getByTestId('comment-popover-input');fireEvent.change(input,{target:{value:'Keep this draft'}});
 fireEvent.keyDown(input,{key:'c'});expect(input).toHaveValue('Keep this draft');
 fireEvent.click(screen.getByTestId('comment-panel-toggle'));expect(screen.getByTestId('comment-popover-input')).toHaveValue('Keep this draft');
 fireEvent.keyDown(window,{key:'c'});expect(screen.getByRole('status')).toHaveTextContent(/unsent|未发送/i);expect(screen.getByTestId('comment-popover-input')).toHaveValue('Keep this draft');
 fireEvent.keyDown(window,{key:'c'});expect(screen.queryByTestId('comment-popover-input')).toBeNull();
});
it('only the current preview iframe can invoke the C entry',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({})));
 render(<FileViewer projectId="p" projectKind="prototype" file={file} liveHtml="<html><body><h1>Title</h1></body></html>"/>);
 await act(async()=>{window.dispatchEvent(new MessageEvent('message',{source:window,data:{type:'od:comment-shortcut'}}));});
 expect(screen.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed','false');
 const frame=screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
 await act(async()=>{window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,data:{type:'od:comment-shortcut'}}));});
 expect(screen.getByTestId('board-mode-toggle')).toHaveAttribute('aria-pressed','true');
});
it('discarding a failed draft clears its error before the next draft',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({})));
 render(<FileViewer projectId="p" projectKind="prototype" file={file} liveHtml="<html><body><h1>Title</h1></body></html>" onSavePreviewComment={async()=>null}/>);
 const pick=async()=>{const frame=screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;await act(async()=>window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,data:{type:'od:comment-target',filePath:file.name,elementId:'title',selector:'h1',label:'Title',text:'',htmlHint:'',position:{x:10,y:10,width:100,height:40}}})));};
 fireEvent.click(screen.getByTestId('board-mode-toggle'));await pick();
 fireEvent.change(screen.getByTestId('comment-popover-input'),{target:{value:'Failed draft'}});
 await act(async()=>fireEvent.click(screen.getByTestId('comment-popover-save')));
 expect(screen.getByRole('alert')).toHaveTextContent(/Could not save comment|失败/i);
 fireEvent.keyDown(window,{key:'c'});fireEvent.keyDown(window,{key:'c'});fireEvent.keyDown(window,{key:'c'});await pick();
 expect(screen.queryByRole('alert')).toBeNull();
 expect(screen.getByTestId('comment-popover-input')).toHaveValue('');
});
