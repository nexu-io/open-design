// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMockOpenDesignHost } from "@open-design/host/testing";
import type { OpenDesignHostDownloadResult } from "@open-design/host";
import { resetWorkspaceAccountGeneration } from "../../src/collab/workspace-identity";
import { resetConsumedActionRequestsForTests } from "../../src/runtime/action-request";
import { FileViewer } from "../../src/components/FileViewer";
import type { ProjectFile } from "../../src/types";

const seam = vi.hoisted(() => ({ exportHtml: vi.fn(), fallbackPdf: vi.fn(), imageSnapshot: vi.fn(), guideInput: vi.fn(), track: vi.fn() }));
vi.mock("../../src/analytics/provider", () => ({
  useAnalytics: () => ({ track: seam.track, newRequestId: () => 'request-guide' }),
}));
vi.mock("../../src/runtime/exports", async () => ({
	...(await vi.importActual("../../src/runtime/exports")),
	exportProjectAsHtml: seam.exportHtml,
	exportAsPdf: seam.fallbackPdf,
  exportProjectImageDataUrl: seam.imageSnapshot,
}));
// Observe the input but run the real guide hook and its account-scoped storage/clock.
vi.mock("../../src/components/share/useAfterExportShareGuide", async () => {
	const actual = await vi.importActual<
		typeof import("../../src/components/share/useAfterExportShareGuide")
	>("../../src/components/share/useAfterExportShareGuide");
	return {
		...actual,
		useAfterExportShareGuide: (
			input: Parameters<typeof actual.useAfterExportShareGuide>[0],
		) => {
			seam.guideInput(input);
			return actual.useAfterExportShareGuide(input);
		},
	};
});

const file: ProjectFile = {
	name: "index.html",
	path: "index.html",
	type: "file",
	size: 100,
	mtime: 1,
	kind: "html",
	mime: "text/html",
	artifactManifest: {
		version: 1,
		kind: "html",
		title: "Page",
		entry: "index.html",
		renderer: "html",
		exports: ["html"],
	},
};
const request = vi.fn<typeof fetch>();
const account = {
	loggedIn: true,
	profile: "test",
	configPath: "",
	user: { id: "p1-account", email: "fixture@example.invalid" },
};
const history = {
	projectId: "project-guide",
	bindingExists: false,
	hasEverShared: false,
	publications: [],
};

beforeEach(() => {
	vi.clearAllMocks();
  resetConsumedActionRequestsForTests();
	window.localStorage.clear();
	resetWorkspaceAccountGeneration();
	request.mockImplementation(async (input) => {
		const url = String(input);
		if (url.startsWith("/api/integrations/vela/status"))
			return Response.json(account);
		if (url === "/api/projects/project-guide/share-state")
			return Response.json(history);
		if (url === "/api/projects/project-guide/export/pdf")
			return Response.json({ ok: true });
		return Response.json({ deployments: [] });
	});
	vi.stubGlobal("fetch", request);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	window.localStorage.clear();
	resetWorkspaceAccountGeneration();
});

async function readyViewer(fromArtifactCard = false) {
	const view = render(
		<FileViewer
			projectId="project-guide"
			projectKind="prototype"
			file={file}
			liveHtml="<html><body>Hello</body></html>"
			downloadRequest={fromArtifactCard ? { nonce: 1 } : null}
		/>,
	);
	await waitFor(() =>
		expect(seam.guideInput).toHaveBeenCalledWith(
			expect.objectContaining({
				appUserId: "p1-account",
				hasEverShared: false,
				enabled: true,
			}),
		),
	);
	return view;
}
async function exportHtml(format: 'html' | 'pdf' = 'html') {
	fireEvent.click(await screen.findByRole("button", { name: /^Export$/ }));
	fireEvent.click(
		await screen.findByRole("menuitem", { name: format === 'pdf' ? /Export as PDF/i : /Export as standalone HTML/i }),
	);
}

describe("Owner P1 real FileViewer export-to-share chain", () => {
  it.each((['pdf', 'html', 'zip', 'image'] as const).flatMap(format => (['completed', 'cancelled', 'interrupted'] as const).map(state => ({format, state}))))('desktop $format waits for native $state', async ({ format, state }) => {
    const actual = await vi.importActual<typeof import('../../src/runtime/exports')>('../../src/runtime/exports');
    seam.exportHtml.mockImplementation(actual.exportProjectAsHtml);
    seam.imageSnapshot.mockResolvedValue({ ok: true, snapshot: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', w: 1, h: 1 } });
    let notify!: (result: OpenDesignHostDownloadResult) => void;
    const unsubscribe = vi.fn();
    const restoreHost = installMockOpenDesignHost({ host: { downloads: {
      subscribe: listener => { notify = listener; return unsubscribe; },
    } } });
    const OriginalURL = URL;
    vi.stubGlobal('URL', Object.assign(class extends OriginalURL {}, {
      createObjectURL: () => 'blob:default-pdf-proof', revokeObjectURL: vi.fn(),
    }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const regularRequest = request.getMockImplementation()!;
    request.mockImplementation((input, init) => ['/api/projects/project-guide/export/pdf-image', '/api/projects/project-guide/export/html', '/api/projects/project-guide/archive'].includes(String(input))
      ? Promise.resolve(new Response('pdf bytes', { headers: { 'content-type': 'application/pdf' } }))
      : regularRequest(input, init));
    try {
      await readyViewer();
      if (format === 'image') {
        fireEvent.click(await screen.findByRole('button', { name: /^Export$/ }));
        fireEvent.click(await screen.findByRole('menuitem', { name: /Export as image/i }));
        fireEvent.click(await screen.findByRole('button', { name: /^Save$/ }));
      } else if (format === 'zip') {
        fireEvent.click(await screen.findByRole('button', { name: /^Export$/ }));
        fireEvent.click(await screen.findByRole('menuitem', { name: /zip/i }));
      } else await exportHtml(format);
      await waitFor(() => expect(notify).toBeTypeOf('function'));
      expect(screen.queryByRole('status', { name: 'Share the link, invite feedback' })).toBeNull();
      await act(async () => notify({ url: 'blob:another-export', state: 'completed' }));
      expect(screen.queryByRole('status', { name: 'Share the link, invite feedback' })).toBeNull();
      await act(async () => notify({ url: 'blob:default-pdf-proof', state }));
      if (state === 'completed') {
        expect(await screen.findByRole('status', { name: 'Share the link, invite feedback' })).toBeVisible();
      } else {
        expect(screen.queryByRole('status', { name: 'Share the link, invite feedback' })).toBeNull();
        expect(screen.queryByText('Export complete')).toBeNull();
      }
      expect(unsubscribe).toHaveBeenCalledOnce();
    } finally { restoreHost(); }
  });

  it.each(['disabled', 'enabled', 'throws', 'pending'] as const)(
    'observes the actual guide without changing export or preference behavior: %s', async mode => {
      seam.track.mockImplementation((_event, props) => {
        if (props.area !== 'share_guide') return;
        if (mode === 'throws') throw new Error('measurement unavailable');
        if (mode === 'pending') return new Promise<void>(() => {});
      });
      await readyViewer();
      await exportHtml('pdf');
      const guide = await screen.findByRole('status', { name: 'Share the link, invite feedback' });
      fireEvent.click(within(guide).getByRole('button', { name: "Don't show again" }));
      expect(screen.queryByRole('status', { name: 'Share the link, invite feedback' })).toBeNull();
      expect(window.localStorage.getItem('od:after-export-share-guide:v1:p1-account')).toBe('1');
      const events = seam.track.mock.calls.filter(([, props]) => props.area === 'share_guide');
      expect(events).toEqual([
        ['surface_view', expect.objectContaining({ page_name: 'artifact', project_id: 'project-guide', project_kind: 'prototype' }), undefined],
        ['ui_click', expect.objectContaining({ element: 'never_show_again', project_id: 'project-guide' }), undefined],
      ]);
      expect(events.every(([, props]) => typeof props.artifact_id === 'string')).toBe(true);
      const nativeExports = request.mock.calls.filter(([input]) => String(input) === '/api/projects/project-guide/export/pdf');
      expect(nativeExports).toHaveLength(1);
      expect(nativeExports[0]?.[1]).toMatchObject({ method: 'POST' });
    },
  );
	it.each((['toolbar', 'artifact-card'] as const).flatMap(entry =>
    (['never-shared', 'shared', '503', 'rejection', 'invalid'] as const).map(outcome => ({ entry, outcome })),
  ))("settles a saved PDF completion from $entry after focus history $outcome", async ({ entry, outcome }) => {
		await readyViewer(entry === 'artifact-card');
		let finishSave!: (response: Response) => void;
		let finishHistory!: (response: Response) => void;
    let rejectHistory!: (error: Error) => void;
		const regularRequest = request.getMockImplementation()!;
		request.mockImplementation((input, init) => {
			if (String(input) === "/api/projects/project-guide/export/pdf") {
				return new Promise<Response>(resolve => { finishSave = resolve; });
			}
			if (String(input) === "/api/projects/project-guide/share-state") {
				return new Promise<Response>((resolve, reject) => { finishHistory = resolve; rejectHistory = reject; });
			}
			return regularRequest(input, init);
		});
		if (entry === 'toolbar') fireEvent.click(screen.getByRole("button", { name: /^Export$/ }));
		fireEvent.click(await screen.findByRole("menuitem", { name: /Export as PDF/i }));
		await waitFor(() => expect(finishSave).toBeTypeOf("function"));
		fireEvent(window, new Event("focus"));
		await waitFor(() => expect(seam.guideInput).toHaveBeenLastCalledWith(expect.objectContaining({ hasEverShared: null })));
		await act(async () => { finishSave(Response.json({ ok: true })); });
		expect(screen.queryByRole("status", { name: "Share the link, invite feedback" })).toBeNull();
		await act(async () => {
      if (outcome === 'rejection') rejectHistory(new Error('history unavailable'));
      else finishHistory(outcome === '503' ? new Response(null, { status: 503 }) : Response.json(
        outcome === 'invalid' ? {} : outcome === 'shared'
          ? { ...history, bindingExists: true, hasEverShared: true, publications: [{ sourceFilePath: 'index.html', slug: 'stopped-page', status: 'stopped' }] }
          : history,
      ));
    });
    expect(seam.guideInput).toHaveBeenLastCalledWith(expect.objectContaining({
      historyLoading: false, historyError: !['never-shared', 'shared'].includes(outcome),
    }));
    if (outcome === 'shared') {
      expect(screen.queryByRole('status', { name: 'Share the link, invite feedback' })).toBeNull();
    } else {
      const guide = screen.getByRole('status', { name: 'Share the link, invite feedback' });
      expect(guide).toBeVisible();
      expect(seam.track.mock.calls.filter(([event, props]) => event === 'surface_view' && props.area === 'share_guide')).toHaveLength(1);
      fireEvent.click(within(guide).getByRole('button', { name: "Don't show again" }));
      fireEvent(window, new Event('focus'));
      await act(async () => finishHistory(Response.json(history)));
      expect(screen.queryByRole('status', { name: 'Share the link, invite feedback' })).toBeNull();
      expect(seam.track.mock.calls.filter(([event, props]) => event === 'surface_view' && props.area === 'share_guide')).toHaveLength(1);
    }
	});
  it.each(['success', 'cancelled', 'failed'] as const)('history already errored requires a confirmed %s export', async outcome => {
    await readyViewer();
    const regularRequest = request.getMockImplementation()!;
    request.mockImplementation((input, init) => String(input) === '/api/projects/project-guide/share-state'
      ? Promise.resolve(new Response(null, { status: 503 })) : regularRequest(input, init));
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(seam.guideInput).toHaveBeenLastCalledWith(expect.objectContaining({ historyLoading: false, hasEverShared: null })));
    if (outcome === 'success') await exportHtml('pdf');
    else {
      seam.exportHtml.mockImplementation(() => outcome === 'cancelled' ? Promise.resolve('cancelled') : Promise.reject(new Error('save failed')));
      await exportHtml();
    }
    await waitFor(() => expect(screen.queryByText(/Exporting/i)).toBeNull());
    expect(seam.guideInput).toHaveBeenLastCalledWith(expect.objectContaining({ historyError: true }));
    expect(screen.queryByRole('status', { name: 'Share the link, invite feedback' }) !== null).toBe(outcome === 'success');
  });
	it.each([{ ok: true, canceled: true }, { ok: false, error: 'save failed' }, {}])("does not offer a guide for native PDF result %j", async body => {
		const regularRequest = request.getMockImplementation()!;
		request.mockImplementation((input, init) => String(input) === '/api/projects/project-guide/export/pdf'
			? Promise.resolve(Response.json(body)) : regularRequest(input, init));
		await readyViewer();
		await exportHtml('pdf');
		await waitFor(() => expect(screen.queryByText(/Exporting/i)).toBeNull());
		expect(screen.queryByRole('status', { name: 'Share the link, invite feedback' })).toBeNull();
		if ('canceled' in body) {
			expect(seam.fallbackPdf).not.toHaveBeenCalled();
			expect(screen.queryByText('Export complete')).toBeNull();
		} else expect(seam.fallbackPdf).toHaveBeenCalledOnce();
	});
	it("does not equate HTML download initiation with saving, then opens Share after a saved PDF", async () => {
		const actual = await vi.importActual<
			typeof import("../../src/runtime/exports")
		>("../../src/runtime/exports");
		seam.exportHtml.mockImplementation(actual.exportProjectAsHtml);
		const download = { blob: null as Blob | null };
		const OriginalURL = URL;
		vi.stubGlobal(
			"URL",
			Object.assign(class extends OriginalURL {}, {
				createObjectURL: (blob: Blob) => {
					download.blob = blob;
					return "blob:export-proof";
				},
				revokeObjectURL: vi.fn(),
			}),
		);
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
		let finishExport!: (response: Response) => void;
		const regularRequest = request.getMockImplementation();
		if (!regularRequest) throw new Error("missing P1 HTTP fixture");
		request.mockImplementation((input, init) =>
			String(input) === "/api/projects/project-guide/export/html"
				? new Promise<Response>((resolve) => {
						finishExport = resolve;
					})
				: regularRequest(input, init),
		);
		await readyViewer();
		expect(
			screen.queryByRole("status", { name: "Share the link, invite feedback" }),
		).toBeNull();
		await exportHtml();
		await waitFor(() =>
			expect(request).toHaveBeenCalledWith(
				"/api/projects/project-guide/export/html",
				expect.objectContaining({ method: "POST" }),
			),
		);
		expect(
			screen.queryByRole("status", { name: "Share the link, invite feedback" }),
		).toBeNull();
		await act(async () => {
			finishExport(
				new Response("<!doctype html><h1>downloaded</h1>", {
					status: 200,
					headers: { "content-type": "text/html" },
				}),
			);
		});
		expect(screen.queryByRole("status", { name: "Share the link, invite feedback" })).toBeNull();
		await exportHtml('pdf');
		const guide = await screen.findByRole("status", {
			name: "Share the link, invite feedback",
		});
		if (!download.blob) throw new Error("real HTML export did not download");
		expect(await download.blob.text()).toContain("downloaded");
		expect(within(guide).getByRole("button", { name: "Try sharing" })).toBeEnabled();
		fireEvent.click(within(guide).getByRole("button", { name: "Try sharing" }));
		expect(
			screen.queryByRole("status", { name: "Share the link, invite feedback" }),
		).toBeNull();
		expect(
			await screen.findByRole("button", { name: "More sharing options" }),
		).toBeVisible();
	});

	it("dismisses only this guide, offers it after the next success, then persists Never show again", async () => {
		const view = await readyViewer();
		await exportHtml('pdf');
		const first = await screen.findByRole("status", {
			name: "Share the link, invite feedback",
		});
		// Guide close is time-driven; clicking its Share action dismisses only this instance.
		fireEvent.click(within(first).getByRole("button", { name: "Try sharing" }));
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		await exportHtml('pdf');
		const again = await screen.findByRole("status", {
			name: "Share the link, invite feedback",
		});
		fireEvent.click(
			within(again).getByRole("button", { name: "Don't show again" }),
		);
		expect(
			screen.queryByRole("status", { name: "Share the link, invite feedback" }),
		).toBeNull();
		expect(
			window.localStorage.getItem("od:after-export-share-guide:v1:p1-account"),
		).toBe("1");
		view.unmount();
		await readyViewer();
		await exportHtml('pdf');
		await act(async () => {
			await Promise.resolve();
		});
		expect(
			screen.queryByRole("status", { name: "Share the link, invite feedback" }),
		).toBeNull();
	});

	it("automatically closes only the current guide after ten seconds and reoffers after a new success", async () => {
		await readyViewer();
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		fireEvent.click(screen.getByRole("button", { name: /^Export$/ }));
		await act(async () => {
			fireEvent.click(
				screen.getByRole("menuitem", { name: /Export as PDF/i }),
			);
			await Promise.resolve();
		});
		expect(
			screen.getByRole("status", { name: "Share the link, invite feedback" }),
		).toBeVisible();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(10_000);
		});
		expect(
			screen.queryByRole("status", { name: "Share the link, invite feedback" }),
		).toBeNull();
		vi.useRealTimers();
		await exportHtml('pdf');
		expect(
			await screen.findByRole("status", { name: "Share the link, invite feedback" }),
		).toBeVisible();
	});

	it.each(["cancelled", "failed"] as const)(
		"never offers the guide after completed %s export",
		async (outcome) => {
			let finish!: (result: string) => void;
			let fail!: (error: Error) => void;
			seam.exportHtml.mockImplementation(
				() =>
					new Promise((resolve, reject) => {
						finish = resolve;
						fail = reject;
					}),
			);
			await readyViewer();
			await exportHtml();
			expect(
				screen.queryByRole("status", { name: "Share the link, invite feedback" }),
			).toBeNull();
			await act(async () => {
				if (outcome === "cancelled") finish("cancelled");
				else fail(new Error("export failed"));
			});
			if (outcome === "failed") {
				expect(await screen.findByText("Export failed")).toBeVisible();
				expect(screen.getByText("This export did not complete. Please try again.")).toBeVisible();
				expect(screen.queryByText("export failed")).toBeNull();
			} else {
				await waitFor(() =>
					expect(screen.queryByText(/Exporting/i)).toBeNull(),
				);
			}
			expect(screen.queryByText("Export complete")).toBeNull();
			expect(
				screen.queryByRole("status", { name: "Share the link, invite feedback" }),
			).toBeNull();
		},
	);
});
