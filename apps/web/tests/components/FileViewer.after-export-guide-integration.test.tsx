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
import { resetWorkspaceAccountGeneration } from "../../src/collab/workspace-identity";
import { FileViewer } from "../../src/components/FileViewer";
import type { ProjectFile } from "../../src/types";

const seam = vi.hoisted(() => ({ exportHtml: vi.fn(), guideInput: vi.fn() }));
vi.mock("../../src/runtime/exports", async () => ({
	...(await vi.importActual("../../src/runtime/exports")),
	exportProjectAsHtml: seam.exportHtml,
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
	window.localStorage.clear();
	resetWorkspaceAccountGeneration();
	request.mockImplementation(async (input) => {
		const url = String(input);
		if (url.startsWith("/api/integrations/vela/status"))
			return Response.json(account);
		if (url === "/api/projects/project-guide/share-state")
			return Response.json(history);
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

async function readyViewer() {
	const view = render(
		<FileViewer
			projectId="project-guide"
			projectKind="prototype"
			file={file}
			liveHtml="<html><body>Hello</body></html>"
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
async function exportHtml() {
	fireEvent.click(await screen.findByRole("button", { name: /^Export$/ }));
	fireEvent.click(
		await screen.findByRole("menuitem", { name: /Export as standalone HTML/i }),
	);
}

describe("Owner P1 real FileViewer export-to-share chain", () => {
	it("offers no guide until the real daemon HTML export downloads, then opens the Share tab", async () => {
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
		seam.exportHtml.mockResolvedValue(undefined);
		const view = await readyViewer();
		await exportHtml();
		const first = await screen.findByRole("status", {
			name: "Share the link, invite feedback",
		});
		// Guide close is time-driven; clicking its Share action dismisses only this instance.
		fireEvent.click(within(first).getByRole("button", { name: "Try sharing" }));
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		await exportHtml();
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
		await exportHtml();
		await act(async () => {
			await Promise.resolve();
		});
		expect(
			screen.queryByRole("status", { name: "Share the link, invite feedback" }),
		).toBeNull();
	});

	it("automatically closes only the current guide after ten seconds and reoffers after a new success", async () => {
		seam.exportHtml.mockResolvedValue(undefined);
		await readyViewer();
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		fireEvent.click(screen.getByRole("button", { name: /^Export$/ }));
		await act(async () => {
			fireEvent.click(
				screen.getByRole("menuitem", { name: /Export as standalone HTML/i }),
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
		await exportHtml();
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
				await screen.findByText("export failed");
			} else {
				await waitFor(() =>
					expect(screen.queryByText(/Exporting/i)).toBeNull(),
				);
			}
			expect(
				screen.queryByRole("status", { name: "Share the link, invite feedback" }),
			).toBeNull();
		},
	);
});
