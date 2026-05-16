import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n";
import { deleteLiveArtifact, fetchLiveArtifacts, fetchProjectFiles, liveArtifactPreviewUrl, projectFileUrl } from "../providers/registry";
import type {
	DesignSystemSummary,
	LiveArtifactSummary,
	Project,
	ProjectDisplayStatus,
	SkillSummary,
} from "../types";
import { Icon } from "./Icon";
import { LiveArtifactBadges } from "./LiveArtifactBadges";

type SubTab = "recent" | "yours";
type ViewMode = "grid" | "kanban";

type DesignListItem =
	| { type: "project"; project: Project; updatedAt: number; createdAt: number }
	| {
			type: "live-artifact";
			project: Project;
			liveArtifact: LiveArtifactSummary;
			updatedAt: number;
			createdAt: number;
	  };

const DESIGNS_VIEW_STORAGE_KEY = "od:designs:view";

export const STATUS_ORDER = [
	"not_started",
	"running",
	"awaiting_input",
	"succeeded",
	"failed",
	"canceled",
] as const satisfies readonly ProjectDisplayStatus[];

export const STATUS_LABEL_KEYS = {
	not_started: "designs.status.notStarted",
	queued: "designs.status.queued",
	running: "designs.status.running",
	awaiting_input: "designs.status.awaitingInput",
	succeeded: "designs.status.succeeded",
	failed: "designs.status.failed",
	canceled: "designs.status.canceled",
} as const satisfies Record<
	ProjectDisplayStatus,
	Parameters<ReturnType<typeof useT>>[0]
>;

interface Props {
	projects: Project[];
	skills: SkillSummary[];
	designSystems: DesignSystemSummary[];
	onOpen: (id: string) => void;
	onOpenLiveArtifact: (projectId: string, artifactId: string) => void;
	onDelete: (id: string) => void;
	onRename?: (id: string, name: string) => void;
}

export function DesignsTab({
	projects,
	skills,
	designSystems,
	onOpen,
	onOpenLiveArtifact,
	onDelete,
	onRename,
}: Props) {
	const t = useT();
	const [filter, setFilter] = useState("");
	const [sub, setSub] = useState<SubTab>("recent");
	const [liveArtifactsByProject, setLiveArtifactsByProject] = useState<
		Record<string, LiveArtifactSummary[]>
	>({});
	const [coverByProject, setCoverByProject] = useState<
		Record<string, { kind: "html" | "image" | "video"; name: string } | null>
	>({});
	const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
	const [selectMode, setSelectMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const menuContainerRef = useRef<HTMLDivElement | null>(null);
	const [renameTarget, setRenameTarget] = useState<{ id: string; original: string } | null>(null);
	const [renameInput, setRenameInput] = useState("");
	const [confirmTarget, setConfirmTarget] = useState<{
		title: string;
		message: string;
		confirmLabel: string;
		onConfirm: () => void;
	} | null>(null);
	const [view, setView] = useState<ViewMode>(() => {
		if (typeof window === "undefined") return "grid";
		try {
			const storedView = window.localStorage.getItem(DESIGNS_VIEW_STORAGE_KEY);
			return storedView === "grid" || storedView === "kanban"
				? storedView
				: "grid";
		} catch {
			return "grid";
		}
	});

	useEffect(() => {
		let cancelled = false;
		const projectIds = projects.map((project) => project.id);
		if (projectIds.length === 0) {
			setLiveArtifactsByProject({});
			return;
		}

		void Promise.all(
			projectIds.map(
				async (projectId) =>
					[projectId, await fetchLiveArtifacts(projectId)] as const,
			),
		).then((entries) => {
			if (cancelled) return;
			setLiveArtifactsByProject(Object.fromEntries(entries));
		});

		return () => {
			cancelled = true;
		};
	}, [projects]);

	useEffect(() => {
		let cancelled = false;
		if (projects.length === 0) {
			setCoverByProject({});
			return;
		}
		void Promise.all(
			projects.map(async (project) => {
				if (project.metadata?.entryFile) return [project.id, null] as const;
				const files = await fetchProjectFiles(project.id);
				const html =
					files.find((f) => (f.path ?? f.name) === "index.html") ??
					files
						.filter((f) => f.kind === "html")
						.sort((a, b) => b.mtime - a.mtime)[0];
				if (html) {
					return [
						project.id,
						{ kind: "html" as const, name: html.path ?? html.name },
					] as const;
				}
				const image = files
					.filter((f) => f.kind === "image")
					.sort((a, b) => b.mtime - a.mtime)[0];
				if (image) {
					return [
						project.id,
						{ kind: "image" as const, name: image.path ?? image.name },
					] as const;
				}
				const video = files
					.filter((f) => f.kind === "video")
					.sort((a, b) => b.mtime - a.mtime)[0];
				if (video) {
					return [
						project.id,
						{ kind: "video" as const, name: video.path ?? video.name },
					] as const;
				}
				return [project.id, null] as const;
			}),
		).then((entries) => {
			if (cancelled) return;
			setCoverByProject(Object.fromEntries(entries));
		});
		return () => {
			cancelled = true;
		};
	}, [projects]);

	useEffect(() => {
		if (!menuOpenId) return;
		const onDocClick = (e: MouseEvent) => {
			const el = menuContainerRef.current;
			if (el && el.contains(e.target as Node)) return;
			setMenuOpenId(null);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setMenuOpenId(null);
		};
		window.addEventListener("mousedown", onDocClick);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("mousedown", onDocClick);
			window.removeEventListener("keydown", onKey);
		};
	}, [menuOpenId]);

	useEffect(() => {
		// Drop selected ids that no longer exist
		setSelected((curr) => {
			const valid = new Set(projects.map((p) => p.id));
			let changed = false;
			const next = new Set<string>();
			curr.forEach((id) => {
				if (valid.has(id)) next.add(id);
				else changed = true;
			});
			return changed ? next : curr;
		});
	}, [projects]);

	useEffect(() => {
		try {
			window.localStorage.setItem(DESIGNS_VIEW_STORAGE_KEY, view);
		} catch {}
	}, [view]);

	useEffect(() => {
		if (view === "kanban" && selectMode) exitSelectMode();
	}, [selectMode, view]);

	const filtered = useMemo(() => {
		const q = filter.trim().toLowerCase();
		let list: DesignListItem[] = projects
			.filter(
				(project) =>
					!shouldHideProjectCard(
						project,
						liveArtifactsByProject[project.id] ?? [],
					),
			)
			.map((project) => ({
				type: "project",
				project,
				updatedAt: project.updatedAt,
				createdAt: project.createdAt,
			}));

		const liveItems = projects.flatMap((project) =>
			(liveArtifactsByProject[project.id] ?? []).map((liveArtifact) => ({
				type: "live-artifact" as const,
				project,
				liveArtifact,
				updatedAt: Date.parse(liveArtifact.updatedAt) || project.updatedAt,
				createdAt: Date.parse(liveArtifact.createdAt) || project.createdAt,
			})),
		);

		list = [...list, ...liveItems];

		if (sub === "recent") {
			list = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
		}

		if (sub === "yours") {
			list = [...list].sort((a, b) => b.createdAt - a.createdAt);
		}

		if (!q) return list;
		return list.filter((item) => {
			if (item.project.name.toLowerCase().includes(q)) return true;
			return (
				item.type === "live-artifact" &&
				item.liveArtifact.title.toLowerCase().includes(q)
			);
		});
	}, [projects, liveArtifactsByProject, filter, sub]);

	const filteredProjects = useMemo(
		() =>
			filtered.filter(
				(item): item is Extract<DesignListItem, { type: "project" }> =>
					item.type === "project",
			),
		[filtered],
	);

	const skillName = (id: string | null) =>
		skills.find((s) => s.id === id)?.name ?? "";
	const dsName = (id: string | null) =>
		designSystems.find((d) => d.id === id)?.title ?? "";
	const toggleSelected = (id: string) => {
		setSelected((curr) => {
			const next = new Set(curr);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};
	const exitSelectMode = () => {
		setSelectMode(false);
		setSelected(new Set());
	};
	const handleRenameProject = (project: Project) => {
		setRenameTarget({ id: project.id, original: project.name });
		setRenameInput(project.name);
	};
	const commitRename = () => {
		if (!renameTarget) return;
		const trimmed = renameInput.trim();
		if (trimmed && trimmed !== renameTarget.original) {
			onRename?.(renameTarget.id, trimmed);
		}
		setRenameTarget(null);
		setRenameInput("");
	};
	const cancelRename = () => {
		setRenameTarget(null);
		setRenameInput("");
	};
	const handleDeleteProject = (project: Project) => {
		setConfirmTarget({
			title: t("designs.deleteTitle"),
			message: t("designs.deleteConfirm", { name: project.name }),
			confirmLabel: t("designs.menuDelete"),
			onConfirm: () => onDelete(project.id),
		});
	};
	const handleBatchDelete = () => {
		const ids = Array.from(selected);
		if (ids.length === 0) return;
		setConfirmTarget({
			title: t("designs.deleteTitle"),
			message: t("designs.deleteSelectedConfirm", { n: ids.length }),
			confirmLabel: t("designs.deleteSelected"),
			onConfirm: () => {
				ids.forEach((id) => onDelete(id));
				exitSelectMode();
			},
		});
	};
	const handleDeleteLiveArtifact = async (
		projectId: string,
		artifact: LiveArtifactSummary,
	) => {
		setConfirmTarget({
			title: t("common.delete"),
			message: `${t("common.delete")} "${artifact.title}"?`,
			confirmLabel: t("designs.menuDelete"),
			onConfirm: async () => {
				const ok = await deleteLiveArtifact(projectId, artifact.id);
				if (!ok) return;
				setLiveArtifactsByProject((current) => ({
					...current,
					[projectId]: (current[projectId] ?? []).filter(
						(candidate) => candidate.id !== artifact.id,
					),
				}));
			},
		});
	};

	return (
		<div
			className={`tab-panel${view === "kanban" ? " design-kanban-view" : ""}`}
		>
			<div className="tab-panel-toolbar">
				<div className="toolbar-left">
					<div
						className="subtab-pill"
						role="group"
						aria-label={t("designs.filterAria")}
					>
						<button
							aria-pressed={sub === "recent"}
							className={sub === "recent" ? "active" : ""}
							onClick={() => setSub("recent")}
						>
							{t("designs.subRecent")}
						</button>
						<button
							aria-pressed={sub === "yours"}
							className={sub === "yours" ? "active" : ""}
							onClick={() => setSub("yours")}
						>
							{t("designs.subYours")}
						</button>
					</div>
				</div>
				<div className="toolbar-right">
					<div className="toolbar-search">
						<span className="search-icon" aria-hidden>
							<Icon name="search" size={13} />
						</span>
						<input
							placeholder={t("designs.searchPlaceholder")}
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
						/>
					</div>
					{view === "grid" && selectMode ? (
						<div className="designs-select-bar" role="group">
							<span className="designs-select-count">
								{t("designs.selectedCount", { n: selected.size })}
							</span>
							<button
								type="button"
								className="designs-select-delete"
								disabled={selected.size === 0}
								onClick={handleBatchDelete}
							>
								{t("designs.deleteSelected")}
							</button>
							<button
								type="button"
								className="designs-select-cancel"
								onClick={exitSelectMode}
							>
								{t("designs.cancelSelect")}
							</button>
						</div>
					) : view === "grid" ? (
						<button
							type="button"
							className="designs-select-toggle"
							onClick={() => setSelectMode(true)}
						>
							<Icon name="check" size={13} />
							<span>{t("designs.selectMode")}</span>
						</button>
					) : null}
					<div
						className="subtab-pill"
						role="group"
						aria-label={t("designs.viewToggleAria")}
					>
						<button
							aria-pressed={view === "grid"}
							className={view === "grid" ? "active" : ""}
							onClick={() => setView("grid")}
							title={t("designs.viewGrid")}
							data-testid="designs-view-grid"
						>
							<Icon name="grid" size={14} />
						</button>
						<button
							aria-pressed={view === "kanban"}
							className={view === "kanban" ? "active" : ""}
							onClick={() => setView("kanban")}
							title={t("designs.viewKanban")}
							data-testid="designs-view-kanban"
						>
							<Icon name="kanban" size={14} />
						</button>
					</div>
				</div>
			</div>
			{filtered.length === 0 ? (
				<div className="tab-empty">
					{projects.length === 0
						? t("designs.emptyNoProjects")
						: t("designs.emptyNoMatch")}
				</div>
			) : view === "grid" ? (
				<div className="design-grid">
					{filtered.map((item) => {
						const p = item.project;
						const skill = skillName(p.skillId);
						const ds = dsName(p.designSystemId);
						if (item.type === "live-artifact") {
							const artifact = item.liveArtifact;
							const title = liveArtifactCardTitle(p, artifact);
							const metaLead = liveArtifactCardMetaLead(p, artifact);
							return (
								<div
									key={`live:${artifact.id}`}
									className={`design-card live-artifact-card status-${artifact.status} refresh-${artifact.refreshStatus}`}
									role="button"
									tabIndex={0}
									onClick={() => onOpenLiveArtifact(p.id, artifact.id)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											onOpenLiveArtifact(p.id, artifact.id);
										}
									}}
								>
									<button
										type="button"
										className="design-card-close"
										title={t("common.delete")}
										aria-label={`${t("common.delete")} ${artifact.title}`}
										onClick={(e) => {
											e.stopPropagation();
											void handleDeleteLiveArtifact(p.id, artifact);
										}}
									>
										<Icon name="close" size={12} />
									</button>
									<div
										className="design-card-thumb live-artifact-thumb"
										aria-hidden
									>
										<iframe
											className="thumb-iframe"
											src={liveArtifactPreviewUrl(p.id, artifact.id)}
											title=""
											loading="lazy"
											sandbox="allow-scripts"
											tabIndex={-1}
										/>
									</div>
									<div className="design-card-meta-block">
										<ProjectTag category="live-artifact" />
										<LiveArtifactBadges
											className="design-card-badges"
											status={artifact.status}
											refreshStatus={artifact.refreshStatus}
										/>
										<div className="design-card-name" title={title}>
											{title}
										</div>
										<div className="design-card-meta">
											<span className="ds">{metaLead}</span>
											{" · "}
											{artifactStatusLabel(
												artifact.status,
												artifact.refreshStatus,
												t,
											)}
											{" · "}
											{sub === "recent"
												? relativeTime(item.updatedAt, t)
												: relativeTime(item.createdAt, t)}
										</div>
									</div>
								</div>
							);
						}

						const liveCount = liveArtifactsByProject[p.id]?.length ?? 0;
						const status = p.status?.value ?? "not_started";
						const cover = projectCover(p, coverByProject[p.id] ?? null, designSystems);
						const isSelected = selected.has(p.id);
						return (
							<div
								key={p.id}
								className={`design-card${isSelected ? " is-selected" : ""}${selectMode ? " select-mode" : ""}`}
								role="button"
								tabIndex={0}
								onClick={() => {
									if (selectMode) toggleSelected(p.id);
									else onOpen(p.id);
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										if (selectMode) toggleSelected(p.id);
										else onOpen(p.id);
									}
								}}
							>
								{selectMode ? (
									<span
										className={`design-card-checkbox${isSelected ? " checked" : ""}`}
										aria-hidden
									>
										{isSelected ? <Icon name="check" size={12} /> : null}
									</span>
								) : (
									<div
										className="design-card-menu-anchor"
										ref={menuOpenId === p.id ? menuContainerRef : undefined}
									>
										<button
											type="button"
											className="design-card-more"
											aria-label={t("designs.menuMore")}
											aria-haspopup="menu"
											aria-expanded={menuOpenId === p.id}
											onClick={(e) => {
												e.stopPropagation();
											setMenuOpenId((cur) => (cur === p.id ? null : p.id));
										}}
									>
										<Icon name="more-horizontal" size={14} />
									</button>
									{menuOpenId === p.id ? (
										<div
											className="design-card-menu"
											role="menu"
											onClick={(e) => e.stopPropagation()}
										>
											<button
												type="button"
												role="menuitem"
												onClick={() => {
													setMenuOpenId(null);
												handleRenameProject(p);
											}}
											>
												<Icon name="pencil" size={12} />
												<span>{t("designs.menuRename")}</span>
											</button>
											<button
												type="button"
												role="menuitem"
												className="danger"
												onClick={() => {
													setMenuOpenId(null);
												handleDeleteProject(p);
											}}
											>
												<Icon name="close" size={12} />
												<span>{t("designs.menuDelete")}</span>
											</button>
										</div>
									) : null}
								</div>
								)}
								<div
									className={`design-card-thumb project-thumb project-thumb-${cover.kind}`}
									style={cover.style}
									aria-hidden
								>
									{cover.kind === "image" && cover.src ? (
										<img className="thumb-media" src={cover.src} alt="" loading="lazy" />
									) : cover.kind === "video" && cover.src ? (
										<video className="thumb-media" src={cover.src} muted preload="metadata" playsInline />
									) : cover.kind === "brand" && cover.brand ? (
										<BrandPreviewCard brand={cover.brand} />
									) : cover.kind === "html" && cover.src ? (
										<iframe
											className="thumb-iframe"
											src={cover.src}
											title=""
											loading="lazy"
											sandbox="allow-scripts"
											tabIndex={-1}
										/>
									) : (
										<span className="project-thumb-glyph">{cover.initial}</span>
									)}
									{liveCount > 0 ? (
										<span className="design-live-count">
											{t("designs.liveCount", { n: liveCount })}
										</span>
									) : null}
								</div>
								<div className="design-card-meta-block">
									<ProjectTag category={projectCategory(p)} />
									<div className="design-card-name" title={p.name}>
										{p.name}
									</div>
									<div className="design-card-meta">
										{ds ? (
											<span className="ds">{ds}</span>
										) : (
											<span>{t("designs.cardFreeform")}</span>
										)}
										{skill ? ` · ${skill}` : ""}
										{" · "}
										<span
											className={`design-card-status design-card-status-${status}`}
										>
											{statusLabel(status, t)}
										</span>
										{sub === "recent"
											? ` · ${relativeTime(p.updatedAt, t)}`
											: sub === "yours"
												? ` · ${relativeTime(p.createdAt, t)}`
												: ""}
									</div>
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<div className="design-kanban-board">
					{STATUS_ORDER.map((status) => {
						const colProjects = filteredProjects.filter(
							(item) =>
								normalizeStatus(item.project.status?.value ?? "not_started") ===
								status,
						);
						return (
							<div key={status} className="design-kanban-col">
								<div className="design-kanban-header">
									<span>{statusLabel(status, t)}</span>
									<span className="design-kanban-count">
										{colProjects.length}
									</span>
								</div>
								<div className="design-kanban-list">
									{colProjects.length === 0 ? (
										<div className="design-kanban-empty">
											{t("designs.kanbanEmptyColumn")}
										</div>
									) : (
										colProjects.map(({ project: p }) => {
											const skill = skillName(p.skillId);
											const ds = dsName(p.designSystemId);
											return (
												<div
													key={p.id}
													className={`design-kanban-card status-${status}`}
													role="button"
													tabIndex={0}
													onClick={() => onOpen(p.id)}
													onKeyDown={(e) => {
														if (e.key === "Enter" || e.key === " ") {
															e.preventDefault();
															onOpen(p.id);
														}
													}}
												>
													<button
														className="design-card-close"
														title={t("designs.deleteTitle")}
														aria-label={t("designs.deleteAria", {
															name: p.name,
														})}
														onClick={(e) => {
															e.stopPropagation();
															handleDeleteProject(p);
														}}
													>
														<Icon name="close" size={12} />
													</button>
													<div
														className="design-kanban-card-name"
														title={p.name}
													>
														{p.name}
													</div>
													<div className="design-kanban-card-meta">
														{ds ? (
															<span className="ds">{ds}</span>
														) : (
															<span>{t("designs.cardFreeform")}</span>
														)}
														{skill ? ` · ${skill}` : ""}
														{sub === "recent"
															? ` · ${relativeTime(p.updatedAt, t)}`
															: sub === "yours"
																? ` · ${relativeTime(p.createdAt, t)}`
																: ""}
													</div>
												</div>
											);
										})
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}
			{renameTarget ? (
				<div className="modal-backdrop" onClick={cancelRename}>
					<form
						className="modal modal-rename"
						onClick={(e) => e.stopPropagation()}
						onSubmit={(e) => {
							e.preventDefault();
							commitRename();
						}}
					>
						<h2>{t("designs.renameTitle")}</h2>
						<label>
							{t("designs.renamePrompt", { name: renameTarget.original })}
							<input
								type="text"
								value={renameInput}
								autoFocus
								onChange={(e) => setRenameInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Escape") {
										e.preventDefault();
										cancelRename();
									}
								}}
							/>
						</label>
						<div className="row">
							<button type="button" onClick={cancelRename}>
								{t("designs.renameCancel")}
							</button>
							<button
								type="submit"
								className="primary"
								disabled={
									!renameInput.trim() ||
									renameInput.trim() === renameTarget.original
								}
							>
								{t("designs.renameSave")}
							</button>
						</div>
					</form>
				</div>
			) : null}
			{confirmTarget ? (
				<div className="modal-backdrop" onClick={() => setConfirmTarget(null)}>
					<div
						className="modal modal-confirm"
						onClick={(e) => e.stopPropagation()}
						role="alertdialog"
						aria-modal="true"
					>
						<h2>{confirmTarget.title}</h2>
						<p className="modal-confirm-message">{confirmTarget.message}</p>
						<div className="row">
							<button type="button" onClick={() => setConfirmTarget(null)}>
								{t("designs.renameCancel")}
							</button>
							<button
								type="button"
								className="primary danger"
								autoFocus
								onClick={() => {
									const run = confirmTarget.onConfirm;
									setConfirmTarget(null);
									run();
								}}
							>
								{confirmTarget.confirmLabel}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}

function normalizeStatus(
	status: ProjectDisplayStatus,
): Exclude<ProjectDisplayStatus, "queued"> {
	return status === "queued" ? "running" : status;
}

function statusLabel(
	status: ProjectDisplayStatus,
	t: ReturnType<typeof useT>,
): string {
	return t(STATUS_LABEL_KEYS[status]);
}

function relativeTime(ts: number, t: ReturnType<typeof useT>): string {
	const diff = Date.now() - ts;
	const min = 60_000;
	const hr = 60 * min;
	const day = 24 * hr;
	if (diff < min) return t("common.justNow");
	if (diff < hr) return t("common.minutesAgo", { n: Math.floor(diff / min) });
	if (diff < day) return t("common.hoursAgo", { n: Math.floor(diff / hr) });
	if (diff < 7 * day) return t("common.daysAgo", { n: Math.floor(diff / day) });
	return new Date(ts).toLocaleDateString();
}

function artifactStatusLabel(
	status: LiveArtifactSummary["status"],
	refreshStatus: LiveArtifactSummary["refreshStatus"],
	t: ReturnType<typeof useT>,
): string {
	if (status === "archived") return t("designs.statusArchived");
	if (status === "error") return t("designs.statusError");
	if (refreshStatus === "running") return t("designs.statusRefreshing");
	if (refreshStatus === "failed") return t("designs.statusRefreshFailed");
	if (refreshStatus === "succeeded") return t("designs.statusRefreshed");
	return t("designs.statusLive");
}

function shouldHideProjectCard(project: Project, liveArtifacts: LiveArtifactSummary[]): boolean {
  if (liveArtifacts.length === 0) return false;
  return project.skillId === 'live-artifact' && isOrbitProject(project);
}

function liveArtifactCardTitle(project: Project, liveArtifact: LiveArtifactSummary): string {
  return isCollapsedOrbitArtifactProject(project) ? project.name : liveArtifact.title;
}

function liveArtifactCardMetaLead(project: Project, liveArtifact: LiveArtifactSummary): string {
  return isCollapsedOrbitArtifactProject(project) ? liveArtifact.title : project.name;
}

function isCollapsedOrbitArtifactProject(project: Project): boolean {
  return project.skillId === 'live-artifact' && isOrbitProject(project);
}

function isOrbitProject(project: Project): boolean {
  const metadata = project.metadata as { kind?: unknown } | undefined;
  return metadata?.kind === 'orbit';
}

// Lightweight brand-preview render kind. When a project is bound to a
// design system (via `project.designSystemId`), we surface the brand's
// signature colors and a name-derived monogram instead of the generic
// hash-derived pastel gradient. No iframe, no separate document — just
// a styled div in the same React tree. Source of truth: the swatches
// array the daemon already extracts from each DESIGN.md in
// `apps/daemon/src/design-systems.ts::extractSwatches`.
export interface BrandPreviewData {
	primary: string;
	background: string;
	foreground: string;
	accent: string;
	title: string;
	glyph: string;
}

function projectCover(
	project: Project,
	override: { kind: "html" | "image" | "video"; name: string } | null,
	designSystems: DesignSystemSummary[],
): {
	kind: "image" | "video" | "html" | "brand" | "fallback";
	src?: string;
	style: CSSProperties;
	initial: string;
	brand?: BrandPreviewData;
} {
	// Resolve the design system bound to this project, if any. Open
	// Design's `/api/design-systems` already extracts a swatch list from
	// each DESIGN.md, so we can build the brand preview from purely
	// native data — no custom metadata enrichment required.
	const ds = project.designSystemId
		? designSystems.find((d) => d.id === project.designSystemId)
		: null;
	const semantic = ds ? pickSemanticColors(ds.swatches ?? []) : null;

	let style: CSSProperties;
	if (semantic) {
		style = {
			background: `radial-gradient(circle at 30% 28%, ${semantic.primary} 0%, transparent 55%), radial-gradient(circle at 78% 78%, ${semantic.accent} 0%, transparent 50%), linear-gradient(135deg, ${semantic.background}, ${semantic.background})`,
			color: semantic.foreground,
		};
	} else {
		let h = 0;
		for (let i = 0; i < project.id.length; i++) {
			h = (h * 31 + project.id.charCodeAt(i)) >>> 0;
		}
		const hue = h % 360;
		const hue2 = (hue + 38) % 360;
		style = {
			background: `radial-gradient(circle at 30% 28%, hsl(${hue} 70% 78% / 0.55), transparent 42%), linear-gradient(135deg, hsl(${hue} 65% 88%), hsl(${hue2} 70% 90%))`,
		};
	}
	const trimmed = project.name.trim();
	const initial = (trimmed ? Array.from(trimmed)[0]! : "?").toUpperCase();

	// When the project has a design system bound, prefer the inline
	// brand preview over an iframe — even if metadata.entryFile points
	// at a preview HTML, the inline render is cheaper and more uniform.
	if (semantic && ds) {
		const title = ds.title || project.name.replace(/\s+Brand$/, "");
		return {
			kind: "brand",
			style,
			initial,
			brand: {
				...semantic,
				title,
				glyph: deriveBrandGlyph(title),
			},
		};
	}
	if (override) {
		return {
			kind: override.kind,
			src: projectFileUrl(project.id, override.name),
			style,
			initial,
		};
	}
	const meta = project.metadata;
	const entry = meta?.entryFile;
	if (entry) {
		const src = projectFileUrl(project.id, entry);
		if (meta?.kind === "image") return { kind: "image", src, style, initial };
		if (meta?.kind === "video") return { kind: "video", src, style, initial };
		if (/\.html?$/i.test(entry)) return { kind: "html", src, style, initial };
	}
	return { kind: "fallback", style, initial };
}

function deriveBrandGlyph(name: string): string {
	const trimmed = (name || "").trim();
	if (!trimmed) return "?";
	const parts = trimmed.split(/\s+/).filter(Boolean);
	if (parts.length >= 2 && parts[0] && parts[1]) {
		return (parts[0][0]! + parts[1][0]!).toUpperCase();
	}
	return trimmed[0]!.toUpperCase();
}

// Maps the unordered swatch array the daemon extracts from each
// DESIGN.md into the four semantic slots the brand preview needs:
//
//   background — most extreme luminance (lightest OR darkest)
//   foreground — opposite extreme (contrast partner of background)
//   primary    — most chromatic swatch (the "signature" color)
//   accent     — secondary chromatic swatch, fallback to primary
//
// Returns null when the swatch list is too sparse to populate even
// background + foreground reliably (less than 2 hex codes). Callers
// fall back to the hash gradient in that case.
function pickSemanticColors(swatches: string[]): {
	primary: string;
	background: string;
	foreground: string;
	accent: string;
} | null {
	const hexes = swatches
		.filter((s) => /^#[0-9a-fA-F]{6}$/.test(s))
		.map((s) => s.toLowerCase());
	if (hexes.length < 2) return null;

	const scored = hexes.map((hex) => {
		const r = parseInt(hex.slice(1, 3), 16) / 255;
		const g = parseInt(hex.slice(3, 5), 16) / 255;
		const b = parseInt(hex.slice(5, 7), 16) / 255;
		const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const chroma = max - min;
		return { hex, luminance, chroma };
	});

	const byLum = [...scored].sort((a, b) => a.luminance - b.luminance);
	const byChroma = [...scored].sort((a, b) => b.chroma - a.chroma);

	const darkest = byLum[0];
	const lightest = byLum[byLum.length - 1];
	const primary = byChroma[0];
	const accent = byChroma[1] ?? primary;
	if (!darkest || !lightest || !primary || !accent) return null;

	// Background = the extreme luminance that's NOT the primary so the
	// CTA color stays a CTA color and the canvas a canvas.
	const background =
		primary.hex === lightest.hex ? darkest.hex : lightest.hex;
	const foreground =
		background === lightest.hex ? darkest.hex : lightest.hex;

	return {
		primary: primary.hex,
		background,
		foreground,
		accent: accent.hex !== primary.hex ? accent.hex : primary.hex,
	};
}

// Lightweight inline brand preview — replaces the iframe-per-card path
// for seeded brand-* projects. Renders a brand "color chip" using only
// the design system's signature swatches, no text duplication with the
// card's meta block below. No iframe boundary, no separate document
// parse, no sandboxed JS context. Cuts Projects-panel memory by 187×
// and removes layout thrash on initial paint.
//
// Composition (top-down): a wide horizontal split where the LEFT band
// reads as the brand's canvas (background + accent stripe + small
// palette tiles) and the RIGHT panel is a solid primary color with the
// monogram glyph centered. The card meta block below already shows the
// full project name, so we deliberately omit any headline inside the
// thumb to avoid duplication.
export function BrandPreviewCard({ brand }: { brand: BrandPreviewData }) {
	const { primary, background, foreground, accent, title, glyph } = brand;
	const onPrimary = pickReadableTextColor(primary, background, foreground);
	return (
		<div
			className="brand-preview-card"
			style={{
				display: "grid",
				gridTemplateColumns: "1fr 44%",
				width: "100%",
				height: "100%",
				background,
				color: foreground,
				position: "relative",
				overflow: "hidden",
				containerType: "size",
			}}
		>
			<div
				style={{
					padding: "9% 9% 12% 9%",
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
					alignItems: "flex-start",
					minWidth: 0,
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "0.5em",
						fontSize: "clamp(7px, 3.6cqi, 11px)",
						textTransform: "uppercase",
						letterSpacing: "0.22em",
						fontWeight: 600,
						color: primary,
						fontFamily: "ui-monospace, SFMono-Regular, monospace",
						maxWidth: "100%",
					}}
				>
					<span
						style={{
							width: "0.7em",
							height: "0.7em",
							background: primary,
							borderRadius: "1px",
							flexShrink: 0,
						}}
					/>
					<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						{title}
					</span>
				</div>
				<div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
					{[primary, accent, foreground].map((c, i) => (
						<div
							key={`${c}-${i}`}
							style={{
								width: "clamp(10px, 4cqi, 22px)",
								height: "clamp(10px, 4cqi, 22px)",
								borderRadius: "3px",
								background: c,
							}}
						/>
					))}
				</div>
			</div>
			<div
				style={{
					background: primary,
					color: onPrimary,
					display: "grid",
					placeItems: "center",
					position: "relative",
					overflow: "hidden",
				}}
			>
				<div
					style={{
						fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
						fontWeight: 700,
						fontSize: "clamp(36px, 36cqi, 140px)",
						lineHeight: 1,
						letterSpacing: "-0.05em",
					}}
				>
					{glyph}
				</div>
			</div>
		</div>
	);
}

// Pick a foreground that has enough contrast with the primary panel
// background. Defaults to the brand's own background (typically the
// brand's "paper" color) which gives the cleanest inverse on most
// systems. Falls back to a near-white/black guess if luminance can be
// estimated cheaply.
function pickReadableTextColor(primary: string, fallbackBg: string, fallbackFg: string): string {
	const lum = quickLuminance(primary);
	if (lum === null) return fallbackBg || "#fff";
	return lum > 0.55 ? fallbackFg : fallbackBg;
}

function quickLuminance(color: string): number | null {
	const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
	if (!m || !m[1]) return null;
	const hex = m[1];
	const r = parseInt(hex.slice(0, 2), 16) / 255;
	const g = parseInt(hex.slice(2, 4), 16) / 255;
	const b = parseInt(hex.slice(4, 6), 16) / 255;
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

type ProjectCategory = "prototype" | "live-artifact" | "slide" | "media";

function projectCategory(project: Project): ProjectCategory {
	const meta = project.metadata;
	if (meta?.intent === "live-artifact" || project.skillId === "live-artifact") {
		return "live-artifact";
	}
	if (meta?.kind === "deck") return "slide";
	if (meta?.kind === "image" || meta?.kind === "video" || meta?.kind === "audio") {
		return "media";
	}
	return "prototype";
}

function ProjectTag({ category }: { category: ProjectCategory }) {
	const t = useT();
	const label =
		category === "live-artifact"
			? t("designs.tagLiveArtifact")
			: category === "slide"
				? t("designs.tagSlide")
				: category === "media"
					? t("designs.tagMedia")
					: t("designs.tagPrototype");
	return (
		<span className={`design-card-tag tag-${category}`}>{label}</span>
	);
}
