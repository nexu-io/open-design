// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { CommentAvatarRail, CommentHoverPreview, useCommentHoverPreview } from '../../src/components/CommentBrowse';
import type { PreviewComment } from '../../src/types';
const comment = (i: number): PreviewComment => ({ id: String(i), projectId:'p', conversationId:'c', filePath:'index.html', elementId:'hero', selector:'#hero', label:'Hero', text:'', htmlHint:'', position:{ x:0,y:0,width:10,height:10 }, note:`Note ${i}`, status:'open', authorDisplayName:'Alice', createdAt:i, updatedAt:i });
afterEach(() => { cleanup(); vi.useRealTimers(); });
function Rail({ count, comments = Array.from({ length:count }, (_,i)=>comment(i)), activeId = null, unreadIds = new Set(['5']), onExpand = vi.fn(), onOpen = vi.fn() }: { count: number; comments?: PreviewComment[]; activeId?: string | null; unreadIds?: ReadonlySet<string>; onExpand?: () => void; onOpen?: (comment: PreviewComment, opener?: HTMLElement) => void }) {
  const hover = useCommentHoverPreview(false);
  const ref = useRef<HTMLButtonElement>(null);
  return <><CommentAvatarRail comments={comments} activeId={activeId} unreadIds={unreadIds} toggleRef={ref} hover={hover} label={c=>c.note} moreLabel={n=>`Remaining ${n}`} renderAvatar={()=>'A'} onExpand={onExpand} onOpen={onOpen}/><CommentHoverPreview state={hover} author="Alice" /></>;
}
function CanvasPins({ count, onOpen = vi.fn(), suppressed = false }: { count: number; onOpen?: (comment: PreviewComment, opener?: HTMLElement) => void; suppressed?: boolean }) {
  const hover = useCommentHoverPreview(suppressed);
  return <>{Array.from({length:count}, (_,i)=>comment(i)).map(c=><button key={c.id} type="button" aria-label={c.note}
    onMouseEnter={event=>hover.show(c,event.currentTarget)} onMouseLeave={hover.leave}
    onClick={event=>{hover.dismiss();onOpen(c,event.currentTarget);}}>Pin</button>)}<CommentHoverPreview state={hover} author="Alice" /></>;
}
it.each([[0,1,null],[1,2,null],[5,6,null],[6,7,'+1'],[15,7,'+10'],[105,7,'+99']])('H01–06: %i comments retain five avatar slots and an accessible capped count', (count, buttons, more) => {
  render(<Rail count={count}/>);
  expect(screen.getAllByRole('button')).toHaveLength(buttons);
  if (more) expect(screen.getByText(more).tagName).toBe('BUTTON');
  else expect(screen.queryByText(/^\+/)).toBeNull();
  if (count===105) expect(screen.getByRole('button',{name:'Remaining 100'})).toHaveTextContent('+99');
});
it('H05/H12: both toggle and remaining count expand; avatars open their comment', () => {
  const onExpand=vi.fn(), onOpen=vi.fn(); render(<Rail count={15} onExpand={onExpand} onOpen={onOpen}/>);
  fireEvent.click(screen.getByRole('button',{name:'Remaining 10'})); expect(onExpand).toHaveBeenCalledOnce();
  const opener = screen.getByRole('button',{name:'Note 14'});
  fireEvent.click(opener); expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({id:'14'}), opener); expect(onExpand).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:'Show comments'})); expect(onExpand).toHaveBeenCalledTimes(2);
});
it('orders latest comments first independently of input order without deduplicating authors', () => {
  const comments = [comment(2),comment(6),comment(0),comment(3),comment(5),comment(1),comment(4)];
  render(<Rail count={7} comments={comments} unreadIds={new Set(['6','0'])}/>);
  const buttons = screen.getAllByRole('button');
  expect(buttons.slice(1,6).map(button=>button.getAttribute('aria-label'))).toEqual(['Note 6','Note 5','Note 4','Note 3','Note 2']);
  expect(buttons[1]!.querySelector('i')).toBeTruthy();
  expect(buttons[2]!.querySelector('i')).toBeNull();
  expect(screen.getByRole('button',{name:'Remaining 2'}).querySelector('i')).toBeTruthy();
  expect(comments.map(c=>c.id)).toEqual(['2','6','0','3','5','1','4']);
});
it('collapsed rail hover and keyboard focus do not show previews, and selected avatars keep ordinary styling', () => {
  vi.useFakeTimers(); render(<Rail count={2} activeId="1"/>);
  const selected=screen.getByRole('button',{name:'Note 1'}), ordinary=screen.getByRole('button',{name:'Note 0'});
  expect(selected).toHaveAttribute('aria-current','true');
  expect(selected.className).toBe(ordinary.className);
  fireEvent.mouseEnter(selected); act(()=>vi.advanceTimersByTime(500));
  expect(screen.queryByRole('tooltip')).toBeNull();
  act(()=>selected.focus()); act(()=>vi.advanceTimersByTime(500));
  expect(selected).toHaveFocus(); expect(screen.queryByRole('tooltip')).toBeNull();
});
it('H11: canvas draft suppresses preview; hover has 200ms leave grace and 100ms fade', () => {
  vi.useFakeTimers(); const {rerender}=render(<CanvasPins count={1}/>);
  const avatar=screen.getByRole('button',{name:'Note 0'});
  vi.spyOn(avatar,'getBoundingClientRect').mockReturnValue({left:400,right:430,top:100,bottom:130,width:30,height:30,x:400,y:100,toJSON:()=>({})});
  fireEvent.mouseEnter(avatar); expect(screen.queryByRole('tooltip')).toBeNull();
  act(()=>vi.advanceTimersByTime(150)); expect(screen.getByRole('tooltip')).toHaveTextContent('Note 0');
  fireEvent.mouseLeave(avatar); act(()=>vi.advanceTimersByTime(199)); expect(screen.getByRole('tooltip')).toBeTruthy();
  act(()=>vi.advanceTimersByTime(101)); expect(screen.queryByRole('tooltip')).toBeNull();
  rerender(<CanvasPins count={1} suppressed/>); fireEvent.mouseEnter(avatar); expect(screen.queryByRole('tooltip')).toBeNull();
});

it('CV13/14: cancels a short hover, switches immediately and cancels closing on re-entry', () => {
  vi.useFakeTimers(); render(<CanvasPins count={2}/>);
  const first = screen.getByRole('button', {name:'Note 0'}), second = screen.getByRole('button', {name:'Note 1'});
  fireEvent.mouseEnter(first); act(()=>vi.advanceTimersByTime(149));
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.mouseLeave(first); act(()=>vi.advanceTimersByTime(200));
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.mouseEnter(first); act(()=>vi.advanceTimersByTime(150));
  expect(screen.getByRole('tooltip').className).toContain('entering');
  fireEvent.mouseLeave(first); fireEvent.mouseEnter(second);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Note 1');
  expect(screen.getByRole('tooltip').className).toContain('switching');
  fireEvent.mouseLeave(second); act(()=>vi.advanceTimersByTime(200));
  expect(screen.getByRole('tooltip').className).toContain('closing');
  fireEvent.mouseEnter(screen.getByRole('tooltip')); act(()=>vi.advanceTimersByTime(100));
  expect(screen.getByRole('tooltip')).toHaveTextContent('Note 1');
});
it('CV14: clicking a pin clears pending entry and old leave timers', () => {
  vi.useFakeTimers(); const onOpen = vi.fn(); render(<CanvasPins count={2} onOpen={onOpen}/>);
  const first = screen.getByRole('button',{name:'Note 0'}), second = screen.getByRole('button',{name:'Note 1'});
  fireEvent.mouseEnter(first); fireEvent.click(first); act(()=>vi.advanceTimersByTime(500));
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.mouseEnter(first); act(()=>vi.advanceTimersByTime(150)); fireEvent.mouseLeave(first);
  fireEvent.click(second); act(()=>vi.advanceTimersByTime(500));
  expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({id:'1'}), second);
  expect(screen.queryByRole('tooltip')).toBeNull();
});
it('CV27: reduced motion displays and hides directly', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({matches:true})));
  render(<CanvasPins count={1}/>);
  const avatar = screen.getByRole('button', {name:'Note 0'});
  fireEvent.mouseEnter(avatar); expect(screen.getByRole('tooltip')).toBeTruthy();
  fireEvent.mouseLeave(avatar); expect(screen.queryByRole('tooltip')).toBeNull();
  vi.unstubAllGlobals();
});
