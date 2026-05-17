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
						const cover = projectCover(p, coverByProject[p.id] ?? null);
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

function projectCover(
	project: Project,
	override: { kind: "html" | "image" | "video"; name: string } | null,
): {
	kind: "image" | "video" | "html" | "fallback";
	src?: string;
	style: CSSProperties;
	initial: string;
} {
	let h = 0;
	for (let i = 0; i < project.id.length; i++) {
		h = (h * 31 + project.id.charCodeAt(i)) >>> 0;
	}
	const hue = h % 360;
	const hue2 = (hue + 38) % 360;
	const style: CSSProperties = {
		background: `radial-gradient(circle at 30% 28%, hsl(${hue} 70% 78% / 0.55), transparent 42%), linear-gradient(135deg, hsl(${hue} 65% 88%), hsl(${hue2} 70% 90%))`,
	};
	const trimmed = project.name.trim();
	const initial = (trimmed ? Array.from(trimmed)[0]! : "?").toUpperCase();
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
