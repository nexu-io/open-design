// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CollabProvider, type CollabContextValue } from '../../src/collab/collab-context';
import { FileViewer } from '../../src/components/FileViewer';
import type { PreviewComment, ProjectFile } from '../../src/types';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('does not persist lost anchors before this preview reports its targets (OPEND-3516)', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  const onLostAnchors = vi.fn();
  const collab: CollabContextValue = {
    workspaceContext: null, workspaceContextLoading: false, enabled: true,
    member: null, present: [], publishedVersion: 1, syncState: 'synced', viewerOnly: false,
    writerAuthority: 'allowed', isOwner: true, isEffectiveOwner: true, isSharedNonOwner: false,
    ownerDisplayName: null, ownerRole: null, downloadPending: false,
    reportChange() {}, requestPublish() {}, refreshPresence() {}, checkStatusNow() {}, onLostAnchors,
  };
  const file: ProjectFile = { name: 'index.html', path: 'index.html', type: 'file', size: 100,
    mtime: 1, kind: 'html', mime: 'text/html' };
  const comment: PreviewComment = {
    id: 'synthetic-comment', projectId: 'p', conversationId: 'c', filePath: 'index.html',
    elementId: 'hero', selector: '[data-od-id="hero"]', label: 'Hero', text: 'Hero',
    htmlHint: '<h2 data-od-id="hero">Hero</h2>', position: { x: 30, y: 400, width: 100, height: 40 },
    note: 'Synthetic review', status: 'open', createdAt: 1, updatedAt: 1,
  };
  const tree = (html: string) => <CollabProvider value={collab}>
    <FileViewer projectId="p" projectKind="prototype" file={file} liveHtml={html} previewComments={[comment]} />
  </CollabProvider>;
  const view = render(tree('<html><body><h2 data-od-id="hero">Hero</h2></body></html>'));
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  expect(onLostAnchors).not.toHaveBeenCalled();
  const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
  await act(async () => { window.dispatchEvent(new MessageEvent('message', {
    source: frame.contentWindow,
    data: { type: 'od:comment-targets', targets: [{ ...comment, position: { x: 20, y: 60, width: 100, height: 40 } }] },
  })); });
  expect(onLostAnchors).not.toHaveBeenCalled();
  view.rerender(tree('<html><body><h2 data-od-id="hero">Updated Hero</h2></body></html>'));
  expect(onLostAnchors).not.toHaveBeenCalled();
  // A ready, actually empty target report is different from not having a report yet.
  await act(async () => { window.dispatchEvent(new MessageEvent('message', {
    source: frame.contentWindow, data: { type: 'od:comment-targets', targets: [] },
  })); });
  expect(onLostAnchors).toHaveBeenCalledOnce();
});

it('OPEND-3604 only acknowledges displayed rows after a successful load, including older delayed arrivals', async () => {
  const writes: Array<{filePath:string;commentIds:string[]}> = [];
  const seen = new Set<string>();
  vi.stubGlobal('fetch',vi.fn(async (input,init) => {
    if (String(input).includes('/comments/read')) {
      if (init?.method === 'PUT') {const body=JSON.parse(String(init.body));writes.push(body);for(const id of body.commentIds)seen.add(id);}
      return Response.json({projectId:'p',filePath:'a.html',seenCommentIds:[...seen]});
    }
    return Response.json({});
  }));
  const file: ProjectFile = {name:'a.html',path:'a.html',type:'file',size:1,mtime:1,kind:'html',mime:'text/html'};
  const a: PreviewComment = {id:'a',projectId:'p',conversationId:'c',filePath:'a.html',elementId:'h',selector:'h2',label:'h2',text:'',htmlHint:'',position:{x:1,y:1,width:10,height:10},note:'Visible review',status:'open',createdAt:200,updatedAt:200};
  const other = {...a,id:'other',filePath:'b.html',createdAt:50};
  const tree = (state:'loading'|'error'|'success', comments:PreviewComment[]) => <FileViewer projectId="p" projectKind="prototype" file={file} liveHtml="<h2>Fixture</h2>" previewComments={comments} previewCommentsState={state}/>;
  const view=render(tree('loading',[a,other]));
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,35));});expect(writes).toEqual([]);
  view.rerender(tree('error',[a,other]));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,35));});expect(writes).toEqual([]);
  view.rerender(tree('success',[a,other]));
  await waitFor(()=>expect(writes).toHaveLength(1));expect(writes[0]).toMatchObject({filePath:'a.html',commentIds:['a']});
  view.rerender(tree('success',[a,other,{...a,id:'late',createdAt:10}]));
  await waitFor(()=>expect(writes).toHaveLength(2));expect(writes[1]?.commentIds).toEqual(['late']);
});
