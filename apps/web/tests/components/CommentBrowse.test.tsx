// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { CommentAvatarRail, CommentHoverPreview, useCommentHoverPreview } from '../../src/components/CommentBrowse';
import type { PreviewComment } from '../../src/types';
import { BoardComposerPopover } from '../../src/components/BoardComposerPopover';
const comment = (i: number): PreviewComment => ({ id: String(i), projectId:'p', conversationId:'c', filePath:'index.html', elementId:'hero', selector:'#hero', label:'Hero', text:'', htmlHint:'', position:{ x:0,y:0,width:10,height:10 }, note:`Note ${i}`, status:'open', authorDisplayName:'Alice', createdAt:i, updatedAt:i });
afterEach(() => { cleanup(); vi.useRealTimers(); });
function Rail({ count, comments = Array.from({ length:count }, (_,i)=>comment(i)), activeId = null, unreadIds = new Set(['5']), onExpand = vi.fn(), onOpen = vi.fn() }: { count: number; comments?: PreviewComment[]; activeId?: string | null; unreadIds?: ReadonlySet<string>; onExpand?: () => void; onOpen?: (comment: PreviewComment, opener?: HTMLElement) => void }) {
  const hover = useCommentHoverPreview(false);
  const ref = useRef<HTMLButtonElement>(null);
  return <><CommentAvatarRail comments={comments} activeId={activeId} unreadIds={unreadIds} toggleRef={ref} hover={hover} label={c=>c.note} moreLabel={n=>`Remaining ${n}`} renderAvatar={()=>'A'} onExpand={onExpand} onOpen={onOpen}/><CommentHoverPreview state={hover} author="Alice" /></>;
}
function CanvasPins({ count, onOpen = vi.fn(), suppressed = false, bounds }: { count: number; onOpen?: (comment: PreviewComment, opener?: HTMLElement) => void; suppressed?: boolean; bounds?: DOMRect }) {
  const hover = useCommentHoverPreview(suppressed);
  return <>{Array.from({length:count}, (_,i)=>comment(i)).map(c=><button key={c.id} type="button" aria-label={c.note}
    onMouseEnter={event=>hover.show(c,event.currentTarget)} onMouseLeave={hover.leave}
    onClick={event=>{hover.dismiss();onOpen(c,event.currentTarget);}}>Pin</button>)}<CommentHoverPreview state={hover} author="Alice" /></>;
}
it.each([[0,1,null],[1,2,null],[5,6,null],[6,7,'+1'],[15,7,'+10'],[105,7,'+99']])('H01–06: %i comments retain five avatar slots and an accessible capped count', (count, buttons, more) => {
  render(<Rail count={count}/>);
  expect(screen.getAllByRole('button')).toHaveLength(buttons);
  if (more) expect(screen.getByText(more).closest('button')).toHaveAttribute('aria-label', `Remaining ${count - 5}`);
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

it('CV08: follows the current pin on nested scroll, resize and bounds-driven React layout changes', () => {
  vi.useFakeTimers();
  const {rerender}=render(<CanvasPins count={1}/>);
  const pin=screen.getByRole('button',{name:'Note 0'});
  let rect=new DOMRect(100,100,28,28);
  vi.spyOn(pin,'getBoundingClientRect').mockImplementation(()=>rect);
  fireEvent.mouseEnter(pin); act(()=>vi.advanceTimersByTime(150));
  expect(screen.getByRole('tooltip').style.left).toBe('140px');
  rect=new DOMRect(200,150,28,28);
  fireEvent.scroll(pin);
  expect(screen.getByRole('tooltip').style.left).toBe('240px');
  expect(screen.getByRole('tooltip').style.top).toBe('150px');
  rect=new DOMRect(300,200,28,28);
  fireEvent.resize(window);
  expect(screen.getByRole('tooltip').style.left).toBe('340px');
  rect=new DOMRect(350,250,28,28);
  rerender(<CanvasPins count={1} bounds={new DOMRect(0,0,900,600)}/>);
  expect(screen.getByRole('tooltip').style.left).toBe('390px');
  expect(screen.getByRole('tooltip').style.top).toBe('250px');
});
it('CV08: observes pin and container layout and releases listeners when dismissed', () => {
  vi.useFakeTimers();
  const callbacks: ResizeObserverCallback[]=[];
  const observe=vi.fn(), disconnect=vi.fn();
  class Observer {
    constructor(callback: ResizeObserverCallback) { callbacks.push(callback); }
    observe=observe;
    unobserve=vi.fn();
    disconnect=disconnect;
  }
  vi.stubGlobal('ResizeObserver',Observer);
  try {
    render(<CanvasPins count={1}/>);
    const pin=screen.getByRole('button',{name:'Note 0'});
    let rect=new DOMRect(100,100,28,28);
    const measure=vi.spyOn(pin,'getBoundingClientRect').mockImplementation(()=>rect);
    fireEvent.mouseEnter(pin); act(()=>vi.advanceTimersByTime(150));
    expect(observe).toHaveBeenCalledWith(pin);
    expect(observe).toHaveBeenCalledWith(pin.parentElement);
    rect=new DOMRect(250,100,28,28);
    act(()=>callbacks.forEach(callback=>callback([],{} as ResizeObserver)));
    expect(screen.getByRole('tooltip').style.left).toBe('290px');
    fireEvent.click(pin);
    expect(disconnect).toHaveBeenCalled();
    measure.mockClear();
    fireEvent.scroll(window); fireEvent.resize(window);
    expect(measure).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

it('F16: hover uses the existing full read-only detail and retains its menu interaction', () => {
  vi.useFakeTimers();
  const send=vi.fn(), remove=vi.fn();
  function SharedDetail() {
    const hover=useCommentHoverPreview(false);
    const pinRef=useRef<HTMLButtonElement>(null);
    return <><button ref={pinRef} type="button" onMouseEnter={event=>hover.show(comment(0),event.currentTarget)} onFocus={event=>hover.show(comment(0),event.currentTarget)}>Saved pin</button>
      <CommentHoverPreview state={hover} author="Alice" renderDetail={saved=><BoardComposerPopover
        target={saved} existing={saved} draft={saved.note} notes={[]} sending={false} author="Alice"
        positionStyle={{position:'relative',left:0,top:0}} t={key=>key}
        onDraft={()=>undefined} onAddDraft={()=>undefined} onRemoveQueuedNote={()=>undefined}
        onClose={()=>{pinRef.current?.focus();hover.dismiss();}} onSaveComment={()=>undefined} onSendBatch={()=>send(saved.id)} onDeleteComment={remove} onRemoveMember={()=>undefined}
      />}/></>;
  }
  render(<SharedDetail/>);
  fireEvent.mouseEnter(screen.getByRole('button',{name:'Saved pin'}));
  act(()=>vi.advanceTimersByTime(150));
  expect(screen.getByTestId('comment-popover-detail')).toHaveTextContent('Note 0');
  expect(screen.queryByTestId('comment-popover-input')).toBeNull();
  const menu=screen.getByRole('button',{name:'comment.moreActions'});
  fireEvent.pointerDown(menu);
  fireEvent.mouseLeave(screen.getByTestId('comment-hover-preview'));
  act(()=>vi.advanceTimersByTime(500));
  expect(menu).toBeVisible();
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(screen.getByRole('dialog')).toBeVisible();
  fireEvent.click(screen.getByTestId('comment-add-send'));
  expect(send).toHaveBeenCalledExactlyOnceWith('0');
  fireEvent.click(screen.getByRole('button',{name:'common.delete',hidden:true}));
  expect(remove).toHaveBeenCalledExactlyOnceWith('0');
  fireEvent.click(screen.getByRole('button',{name:'common.close'}));
  act(()=>vi.advanceTimersByTime(500));
  expect(screen.getByRole('button',{name:'Saved pin'})).toHaveFocus();
  expect(screen.queryByTestId('comment-hover-preview')).toBeNull();
});

it('releases a retained hover when its source pin disconnects so other pins can open', () => {
  vi.useFakeTimers();
  function Pins({present}:{present:boolean}) {
    const hover=useCommentHoverPreview(false);
    return <>{present ? <button onMouseEnter={event=>hover.show(comment(0),event.currentTarget)}>Source pin</button> : null}
      <CommentHoverPreview state={hover} author="Alice" renderDetail={()=> <button>Card action</button>}/></>;
  }
  const {rerender}=render(<Pins present/>);
  fireEvent.mouseEnter(screen.getByRole('button',{name:'Source pin'}));
  act(()=>vi.advanceTimersByTime(150));
  fireEvent.pointerDown(screen.getByRole('button',{name:'Card action'}));
  rerender(<Pins present={false}/>);
  expect(screen.queryByTestId('comment-hover-preview')).toBeNull();
  rerender(<Pins present/>);
  fireEvent.mouseEnter(screen.getByRole('button',{name:'Source pin'}));
  act(()=>vi.advanceTimersByTime(150));
  expect(screen.getByTestId('comment-hover-preview')).toBeVisible();
});

it('F16: shared hover detail keeps Agent and deletion permission gates', () => {
  vi.useFakeTimers();
  const send=vi.fn(), remove=vi.fn();
  function ReadOnlyHover() {
    const hover=useCommentHoverPreview(false);
    return <><button onMouseEnter={event=>hover.show(comment(0),event.currentTarget)}>Other author pin</button>
      <CommentHoverPreview state={hover} author="Alice" renderDetail={saved=><BoardComposerPopover
        target={saved} existing={saved} draft={saved.note} notes={[]} sending={false} author="Alice"
        canEditComment={false} canSendToAgent={false} canDeleteComment={false}
        positionStyle={{position:'relative',left:0,top:0}} t={key=>key}
        onDraft={()=>undefined} onAddDraft={()=>undefined} onRemoveQueuedNote={()=>undefined}
        onClose={hover.dismiss} onSaveComment={()=>undefined} onSendBatch={send} onDeleteComment={remove} onRemoveMember={()=>undefined}
      />}/></>;
  }
  render(<ReadOnlyHover/>);
  fireEvent.mouseEnter(screen.getByRole('button',{name:'Other author pin'}));
  act(()=>vi.advanceTimersByTime(150));
  expect(screen.getByTestId('comment-popover-detail')).toHaveTextContent('Note 0');
  expect(screen.queryByTestId('comment-add-send')).toBeNull();
  expect(screen.queryByRole('button',{name:'common.delete',hidden:true})).toBeNull();
  expect(screen.queryByTestId('comment-popover-input')).toBeNull();
  expect(send).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});
