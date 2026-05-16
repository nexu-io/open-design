#!/usr/bin/env python3
# ruff: noqa: E402
"""last30days v3.0.0 CLI."""

from __future__ import annotations

import argparse
import atexit
import json
import os
import re
import signal
import sys
import threading
from pathlib import Path

MIN_PYTHON = (3, 12)


def ensure_supported_python(version_info: tuple[int, int, int] | object | None = None) -> None:
    if version_info is None:
        version_info = sys.version_info
    major, minor, micro = tuple(version_info[:3])
    if (major, minor) >= MIN_PYTHON:
        return
    sys.stderr.write(
        "last30days v3 requires Python 3.12+.\n"
        f"Detected Python {major}.{minor}.{micro}.\n"
        "Install and use python3.12 or python3.13, then rerun this command.\n"
    )
    raise SystemExit(1)


ensure_supported_python()

if os.name == "nt":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

from lib import env, html_render, pipeline, render, schema, ui

_child_pids: set[int] = set()
_child_pids_lock = threading.Lock()


def register_child_pid(pid: int) -> None:
    with _child_pids_lock:
        _child_pids.add(pid)


def unregister_child_pid(pid: int) -> None:
    with _child_pids_lock:
        _child_pids.discard(pid)


def _cleanup_children() -> None:
    with _child_pids_lock:
        pids = list(_child_pids)
    for pid in pids:
        try:
            os.killpg(os.getpgid(pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            continue


atexit.register(_cleanup_children)


def parse_search_flag(raw: str) -> list[str]:
    sources = []
    for source in raw.split(","):
        source = source.strip().lower()
        if not source:
            continue
        normalized = pipeline.SEARCH_ALIAS.get(source, source)
        if normalized not in pipeline.MOCK_AVAILABLE_SOURCES:
            raise SystemExit(f"Unknown search source: {source}")
        if normalized not in sources:
            sources.append(normalized)
    if not sources:
        raise SystemExit("--search requires at least one source.")
    return sources


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "last30days"


def save_output(
    report: schema.Report,
    emit: str,
    save_dir: str,
    suffix: str = "",
    synthesis_md: str | None = None,
) -> Path:
    from datetime import datetime
    path = Path(save_dir).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    slug = slugify(report.topic)
    extension = "json" if emit == "json" else "html" if emit == "html" else "md"
    raw_label = "raw-html" if emit == "html" else "raw"
    suffix_part = f"-{suffix}" if suffix else ""
    out_path = path / f"{slug}-{raw_label}{suffix_part}.{extension}"
    if out_path.exists():
        out_path = path / f"{slug}-{raw_label}{suffix_part}-{datetime.now().strftime('%Y-%m-%d')}.{extension}"
    # Markdown saves keep the complete debug artifact. JSON and HTML preserve
    # their requested wire format so file extensions match their content.
    if emit in {"json", "html"}:
        content = emit_output(report, emit, synthesis_md=synthesis_md)
    else:
        content = render.render_full(report)
    out_path.write_text(content, encoding="utf-8")
    return out_path


def emit_output(
    report: schema.Report,
    emit: str,
    fun_level: str = "medium",
    save_path: str | None = None,
    synthesis_md: str | None = None,
) -> str:
    if emit == "json":
        return json.dumps(schema.to_dict(report), indent=2, sort_keys=True)
    if emit == "html":
        return html_render.render_html(
            report, fun_level=fun_level, save_path=save_path, synthesis_md=synthesis_md,
        )
    if emit in {"compact", "md"}:
        return render.render_compact(report, fun_level=fun_level, save_path=save_path)
    if emit == "context":
        return render.render_context(report)
    raise SystemExit(f"Unsupported emit mode: {emit}")


def emit_comparison_output(
    entity_reports: list[tuple[str, schema.Report]],
    emit: str,
    fun_level: str = "medium",
    save_path: str | None = None,
    synthesis_md: str | None = None,
) -> str:
    if emit == "json":
        payload = {
            "comparison": True,
            "entities": [label for label, _ in entity_reports],
            "reports": [
                {"entity": label, "report": schema.to_dict(report)}
                for label, report in entity_reports
            ],
        }
        return json.dumps(payload, indent=2, sort_keys=True)
    if emit == "html":
        return html_render.render_html_comparison(
            entity_reports,
            fun_level=fun_level,
            save_path=save_path,
            synthesis_md=synthesis_md,
        )
    if emit in {"compact", "md"}:
        return render.render_comparison_multi(
            entity_reports, fun_level=fun_level, save_path=save_path,
        )
    if emit == "context":
        return render.render_comparison_multi_context(entity_reports)
    raise SystemExit(f"Unsupported emit mode: {emit}")


def compute_save_path_display(save_dir: str, topic: str, suffix: str, emit: str) -> str:
    """Compute the user-friendly save path string that will be shown in the footer.

    Uses ~ when the saved file is under the user's home directory; otherwise
    returns the absolute path.
    """
    from pathlib import Path as _Path
    path = _Path(save_dir).expanduser().resolve()
    slug = slugify(topic)
    extension = "json" if emit == "json" else "html" if emit == "html" else "md"
    raw_label = "raw-html" if emit == "html" else "raw"
    suffix_part = f"-{suffix}" if suffix else ""
    raw = path / f"{slug}-{raw_label}{suffix_part}.{extension}"
    try:
        home = _Path.home().resolve()
        relative = raw.relative_to(home)
        return f"~/{relative}"
    except ValueError:
        return str(raw)


def read_synthesis_file(path: str) -> str:
    try:
        return Path(path).expanduser().read_text(encoding="utf-8")
    except OSError as exc:
        sys.stderr.write(f"[last30days] Cannot read --synthesis-file: {exc}\n")
        raise SystemExit(2)


def persist_report(report: schema.Report) -> dict[str, int]:
    import store

    store.init_db()
    topic_row = store.add_topic(report.topic)
    topic_id = topic_row["id"]
    source_mode = ",".join(sorted(report.items_by_source)) or "v3"
    run_id = store.record_run(topic_id, source_mode=source_mode, status="running")
    try:
        findings = store.findings_from_report(report)
        counts = store.store_findings(run_id, topic_id, findings)
        store.update_run(
            run_id,
            status="completed",
            findings_new=counts["new"],
            findings_updated=counts["updated"],
        )
        return counts
    except Exception as exc:
        store.update_run(run_id, status="failed", error_message=str(exc)[:500])
        raise


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Research a topic across live social, market, and grounded web sources.")
    parser.add_argument("topic", nargs="*", help="Research topic")
    parser.add_argument("--emit", default="compact", choices=["compact", "json", "context", "md", "html"])
    parser.add_argument("--search", help="Comma-separated source list")
    parser.add_argument("--quick", action="store_true", help="Lower-latency retrieval profile")
    parser.add_argument("--deep", action="store_true", help="Higher-recall retrieval profile")
    parser.add_argument("--debug", action="store_true", help="Enable HTTP debug logging")
    parser.add_argument("--mock", action="store_true", help="Use mock retrieval fixtures")
    parser.add_argument("--diagnose", action="store_true", help="Print provider and source availability")
    parser.add_argument("--save-dir", help="Optional directory for saving the rendered output")
    parser.add_argument("--synthesis-file", help="Markdown synthesis to embed in --emit=html output")
    parser.add_argument("--store", action="store_true", help="Persist ranked findings to the SQLite research store")
    parser.add_argument("--x-handle", help="X handle for targeted supplemental search")
    parser.add_argument("--x-related", help="Comma-separated related X handles (searched with lower weight)")
    parser.add_argument("--web-backend", default="auto",
                        choices=["auto", "brave", "exa", "serper", "parallel", "none"],
                        help="Web search backend (default: auto, tries Brave then Exa then Serper then Parallel)")
    parser.add_argument("--deep-research", action="store_true",
                        help="Use Perplexity Deep Research (~$0.90/query) for in-depth analysis. Requires OPENROUTER_API_KEY.")
    parser.add_argument("--plan", help="JSON query plan (skips internal LLM planner). Can be a JSON string or a file path.")
    parser.add_argument("--save-suffix", help="Suffix for saved output filename (e.g., 'gemini' → kanye-west-raw-gemini.md)")
    parser.add_argument("--subreddits", help="Comma-separated subreddit names to search (e.g., SaaS,Entrepreneur)")
    parser.add_argument("--tiktok-hashtags", help="Comma-separated TikTok hashtags without # (e.g., tella,screenrecording)")
    parser.add_argument("--tiktok-creators", help="Comma-separated TikTok creator handles (e.g., TellaHQ,taborplace)")
    parser.add_argument("--ig-creators", help="Comma-separated Instagram creator handles (e.g., tella.tv,laborstories)")
    parser.add_argument(
        "--days",
        "--lookback-days",
        dest="lookback_days",
        type=int,
        default=30,
        help="Number of days to look back for research (default: 30, watchlist uses 90)",
    )
    parser.add_argument("--auto-resolve", action="store_true",
                        help="Use web search to discover subreddits/handles before planning (for platforms without WebSearch)")
    parser.add_argument("--github-user", help="GitHub username for person-mode search (e.g., steipete)")
    parser.add_argument("--github-repo", help="Comma-separated owner/repo for project-mode search (e.g., openclaw/openclaw,paperclipai/paperclip)")
    parser.add_argument(
        "--competitors",
        nargs="?",
        const=2,
        type=int,
        default=None,
        metavar="N",
        help="Auto-discover N competitor entities and fan out last30days across all of them as a comparison (default N=2 → 3-way: original + 2 peers; range 1..6). Use --competitors-list to override discovery.",
    )
    parser.add_argument(
        "--competitors-list",
        dest="competitors_list",
        help="Comma-separated competitor entities to skip discovery (e.g., 'Anthropic,xAI,Google Gemini'). Implies --competitors.",
    )
    parser.add_argument(
        "--polymarket-keywords",
        dest="polymarket_keywords",
        help=(
            "Comma-separated keywords that Polymarket market titles must match "
            "to be included. Use for ambiguous single-token topics like 'Warriors' "
            "(nba,gsw,golden-state) to filter out Glasgow Warriors rugby, Honor "
            "of Kings Rogue Warriors, etc. When omitted, Polymarket returns all "
            "matching markets — so expect cross-entity noise on generic topics."
        ),
    )
    parser.add_argument(
        "--competitors-plan",
        dest="competitors_plan",
        help=(
            "JSON mapping of per-entity Step 0.55 targeting for competitor / vs-mode "
            "sub-runs. Schema: {entity_name: {x_handle?, x_related?, subreddits?, "
            "github_user?, github_repos?, context?}}. Accepts inline JSON or a file "
            "path. Implies --competitors. Preferred over --competitors-list when the "
            "hosting model has already resolved per-entity handles and subs."
        ),
    )
    return parser


def parse_competitors_plan(raw: str | None) -> dict[str, dict]:
    """Parse a --competitors-plan argument into a {entity_name_lower: plan_entry} dict.

    Accepts inline JSON or a file path (matches --plan). Returns {} on None/empty.
    Validation: top-level must be a dict; each value must be a dict. Unknown fields
    in entry values log a warning but do not abort. Invalid JSON or non-dict shape
    raises SystemExit(2) with a clear stderr message.
    """
    if not raw:
        return {}
    plan_str = raw
    if os.path.isfile(plan_str):
        try:
            plan_str = open(plan_str).read()
        except OSError as exc:
            sys.stderr.write(f"[CompetitorsPlan] Cannot read plan file: {exc}\n")
            raise SystemExit(2)
    try:
        parsed = json.loads(plan_str)
    except json.JSONDecodeError as exc:
        sys.stderr.write(f"[CompetitorsPlan] Invalid JSON: {exc}\n")
        raise SystemExit(2)
    if not isinstance(parsed, dict):
        sys.stderr.write(
            f"[CompetitorsPlan] Top-level must be a dict of "
            f"{{entity: {{targeting}}}}, got {type(parsed).__name__}\n"
        )
        raise SystemExit(2)
    known_fields = {
        "x_handle", "x_related", "subreddits",
        "github_user", "github_repos", "context",
    }
    normalized: dict[str, dict] = {}
    for entity, entry in parsed.items():
        if not isinstance(entry, dict):
            sys.stderr.write(
                f"[CompetitorsPlan] Entry for {entity!r} must be a dict, "
                f"got {type(entry).__name__}; skipping.\n"
            )
            continue
        unknown = set(entry.keys()) - known_fields
        if unknown:
            sys.stderr.write(
                f"[CompetitorsPlan] Unknown fields in {entity!r}: "
                f"{sorted(unknown)}; ignoring.\n"
            )
        normalized[entity.strip().lower()] = {
            k: v for k, v in entry.items() if k in known_fields
        }
    return normalized


def subrun_kwargs_for(
    entity: str,
    plan_entry: dict,
    *,
    resolved: dict,
) -> dict:
    """Build an explicit per-entity kwargs dict for pipeline.run().

    Plan values win over auto_resolve values. Returns keys for all per-entity
    targeting flags so callers never fall through to closure defaults.

    This helper is the single source of truth for sub-run kwargs — main-topic
    flags can only leak if a caller bypasses it.
    """
    def _choose(plan_key: str, resolved_key: str | None = None):
        if plan_key in plan_entry and plan_entry[plan_key]:
            return plan_entry[plan_key]
        if resolved_key is not None and resolved.get(resolved_key):
            return resolved[resolved_key]
        return None

    x_handle = _choose("x_handle", "x_handle")
    if isinstance(x_handle, str):
        x_handle = x_handle.lstrip("@") or None

    subreddits = _choose("subreddits", "subreddits")
    if isinstance(subreddits, list):
        subreddits = [s.strip().lstrip("r/") for s in subreddits if s.strip()] or None

    x_related = plan_entry.get("x_related")
    if isinstance(x_related, list):
        x_related = [h.strip().lstrip("@") for h in x_related if h.strip()] or None
    else:
        x_related = None

    github_user = _choose("github_user", "github_user")
    if isinstance(github_user, str):
        github_user = github_user.lstrip("@").lower() or None

    github_repos = _choose("github_repos", "github_repos")
    if isinstance(github_repos, list):
        github_repos = [r.strip() for r in github_repos if r.strip() and "/" in r.strip()] or None

    context = plan_entry.get("context") or resolved.get("context") or ""

    return {
        "x_handle": x_handle,
        "x_related": x_related,
        "subreddits": subreddits,
        "github_user": github_user,
        "github_repos": github_repos,
        "_context": context,
    }


COMPETITORS_MIN = 1
COMPETITORS_MAX = 6
COMPETITORS_DEFAULT = 2


def resolve_competitors_args(args: argparse.Namespace) -> tuple[bool, int, list[str]]:
    """Normalize --competitors / --competitors-list into (enabled, count, explicit_list).

    - (False, 0, []) when neither flag is set.
    - An explicit list always wins; count is derived from list length.
    - A numeric count outside [1, 6] is clamped with a stderr warning.
    - count <= 0 (explicit) raises SystemExit(2).
    """
    explicit_list: list[str] = []
    list_flag_provided = args.competitors_list is not None
    if list_flag_provided:
        explicit_list = [
            entity.strip()
            for entity in args.competitors_list.split(",")
            if entity.strip()
        ]
        if not explicit_list:
            sys.stderr.write("[Competitors] --competitors-list is empty.\n")
            raise SystemExit(2)

    competitors_flag = args.competitors
    list_present = bool(explicit_list)
    flag_present = competitors_flag is not None

    if not list_present and not flag_present:
        return False, 0, []

    if list_present:
        count = len(explicit_list)
        if flag_present and competitors_flag != count:
            sys.stderr.write(
                f"[Competitors] --competitors={competitors_flag} ignored; using "
                f"{count} entries from --competitors-list.\n"
            )
        if count > COMPETITORS_MAX:
            sys.stderr.write(
                f"[Competitors] --competitors-list has {count} entries, clamping to {COMPETITORS_MAX}.\n"
            )
            explicit_list = explicit_list[:COMPETITORS_MAX]
            count = COMPETITORS_MAX
        return True, count, explicit_list

    # flag_present, no explicit list
    count = competitors_flag
    if count < COMPETITORS_MIN:
        sys.stderr.write(
            f"[Competitors] --competitors must be >= {COMPETITORS_MIN} (got {count}).\n"
        )
        raise SystemExit(2)
    if count > COMPETITORS_MAX:
        sys.stderr.write(
            f"[Competitors] --competitors={count} exceeds max {COMPETITORS_MAX}; clamping.\n"
        )
        count = COMPETITORS_MAX
    return True, count, []


def _missing_sources_for_promo(diag: dict[str, object]) -> str | None:
    available = set(diag.get("available_sources") or [])
    missing = []
    if "reddit" not in available:
        missing.append("reddit")
    if "x" not in available:
        missing.append("x")
    if "grounding" not in available:
        missing.append("web")
    if not missing:
        return None
    if "reddit" in missing and "x" in missing:
        return "both"
    return missing[0]


def _show_runtime_ui(
    report: schema.Report,
    progress: ui.ProgressDisplay,
    diag: dict[str, object],
    suppress_web_promo: bool = False,
) -> None:
    counts = {source: len(items) for source, items in report.items_by_source.items()}
    display_sources = list(
        dict.fromkeys(
            [
                *report.query_plan.source_weights.keys(),
                *report.items_by_source.keys(),
                *report.errors_by_source.keys(),
            ]
        )
    )
    progress.end_processing()
    progress.show_complete(
        source_counts=counts,
        display_sources=display_sources,
    )
    promo = _missing_sources_for_promo(diag)
    # The `web` promo nudges users to set BRAVE_API_KEY / SERPER_API_KEY, which
    # is wrong advice when a hosting reasoning model (Claude Code, Codex,
    # Hermes, Gemini) is driving — those already have WebSearch and can
    # pre-resolve Step 0.55 themselves. Suppress the web promo when a hosting
    # model signal is present (--plan or --competitors-plan was passed).
    if promo:
        if suppress_web_promo and promo == "web":
            return
        if suppress_web_promo and promo == "both":
            # "both" means reddit + web both missing; still nudge reddit but
            # skip the web line. show_promo has a per-source variant.
            progress.show_promo("reddit", diag=diag)
            return
        progress.show_promo(promo, diag=diag)


def main() -> int:
    parser = build_parser()
    # Use parse_known_args so setup sub-flags (--device-auth, --github,
    # --openclaw) pass through without argparse hard-exiting.
    args, extra_argv = parser.parse_known_args()
    if args.debug:
        os.environ["LAST30DAYS_DEBUG"] = "1"

    config = env.get_config()

    # Handle setup subcommand
    topic = " ".join(args.topic).strip()
    if topic.lower() == "setup":
        from lib import setup_wizard
        if "--openclaw" in extra_argv:
            results = setup_wizard.run_openclaw_setup(config)
            print(json.dumps(results))
            return 0
        if "--github" in extra_argv:
            results = setup_wizard.run_github_auth()
            print(json.dumps(results))
            return 0
        if "--device-auth" in extra_argv:
            results = setup_wizard.run_full_device_auth()
            print(json.dumps(results))
            return 0
        sys.stderr.write("Running auto-setup...\n")
        results = setup_wizard.run_auto_setup(config)
        from_browser = "auto"
        if results.get("cookies_found"):
            first_browser = next(iter(results["cookies_found"].values()))
            from_browser = first_browser
        setup_wizard.write_setup_config(env.CONFIG_FILE, from_browser=from_browser)
        results["env_written"] = True
        sys.stderr.write(setup_wizard.get_setup_status_text(results) + "\n")
        return 0

    requested_sources = parse_search_flag(args.search) if args.search else None
    diag = pipeline.diagnose(config, requested_sources)

    if args.diagnose:
        print(json.dumps(diag, indent=2, sort_keys=True))
        return 0

    if not topic:
        parser.print_usage(sys.stderr)
        return 2

    synthesis_md = None
    if args.synthesis_file:
        if args.emit == "html":
            synthesis_md = read_synthesis_file(args.synthesis_file)
        else:
            sys.stderr.write("[last30days] Warning: --synthesis-file is only used with --emit=html; ignoring.\n")

    if not os.environ.get("LAST30DAYS_SKIP_PREFLIGHT"):
        from lib import preflight
        refuse_msg = preflight.check_class_1_trap(topic)
        if refuse_msg:
            sys.stderr.write(refuse_msg)
            return 2

    progress = ui.ProgressDisplay(topic, show_banner=True)
    progress.start_processing()

    depth = "deep" if args.deep else "quick" if args.quick else "default"
    try:
        x_related = [h.strip() for h in args.x_related.split(",") if h.strip()] if args.x_related else None
        subreddits = [s.strip().lstrip("r/") for s in args.subreddits.split(",") if s.strip()] if args.subreddits else None
        tiktok_hashtags = [h.strip().lstrip("#") for h in args.tiktok_hashtags.split(",") if h.strip()] if args.tiktok_hashtags else None
        tiktok_creators = [c.strip().lstrip("@") for c in args.tiktok_creators.split(",") if c.strip()] if args.tiktok_creators else None
        ig_creators = [c.strip().lstrip("@") for c in args.ig_creators.split(",") if c.strip()] if args.ig_creators else None
        # Parse external plan if provided via --plan flag
        external_plan = None
        if args.plan:
            import json as _json
            plan_str = args.plan
            if os.path.isfile(plan_str):
                plan_str = open(plan_str).read()
            try:
                external_plan = _json.loads(plan_str)
            except _json.JSONDecodeError as exc:
                sys.stderr.write(f"[Planner] Invalid --plan JSON: {exc}\n")

        # Auto-resolve: use web search to discover subreddits/handles before planning.
        # This is the engine-side equivalent of SKILL.md Steps 0.55/0.75 for platforms
        # without WebSearch (OpenClaw, Codex, raw CLI).
        if args.auto_resolve and not external_plan:
            from lib import resolve
            resolution = resolve.auto_resolve(topic, config)
            if resolution.get("subreddits") and not subreddits:
                subreddits = resolution["subreddits"]
                sys.stderr.write(f"[AutoResolve] Subreddits: {', '.join(subreddits)}\n")
            if resolution.get("x_handle") and not args.x_handle:
                args.x_handle = resolution["x_handle"]
                sys.stderr.write(f"[AutoResolve] X handle: @{args.x_handle}\n")
            if resolution.get("github_user") and not args.github_user:
                args.github_user = resolution["github_user"]
                sys.stderr.write(f"[AutoResolve] GitHub user: @{args.github_user}\n")
            if resolution.get("github_repos") and not args.github_repo:
                args.github_repo = ",".join(resolution["github_repos"])
                sys.stderr.write(f"[AutoResolve] GitHub repos: {args.github_repo}\n")
            if resolution.get("context"):
                # Inject context into external_plan metadata for the planner to use
                if not external_plan:
                    external_plan = None  # planner will use its own, but with context
                # Store context for the planner prompt injection
                config["_auto_resolve_context"] = resolution["context"]
                sys.stderr.write(f"[AutoResolve] Context: {resolution['context'][:80]}...\n")

        github_user = args.github_user.lstrip("@").lower() if args.github_user else None
        github_repos = [r.strip() for r in args.github_repo.split(",") if r.strip() and "/" in r.strip()] if args.github_repo else None

        # --deep-research: auto-enable perplexity source and set deep flag
        if args.deep_research:
            if not config.get("OPENROUTER_API_KEY"):
                print("Error: --deep-research requires OPENROUTER_API_KEY", file=sys.stderr)
                sys.exit(1)
            config["_deep_research"] = True
            # Auto-enable perplexity in INCLUDE_SOURCES
            include = config.get("INCLUDE_SOURCES") or ""
            if "perplexity" not in include.lower():
                config["INCLUDE_SOURCES"] = f"{include},perplexity" if include else "perplexity"

        comp_enabled, comp_count, comp_explicit = resolve_competitors_args(args)
        comp_plan = parse_competitors_plan(args.competitors_plan)

        # Polymarket disambiguation: if user passed --polymarket-keywords,
        # store on config so the polymarket adapter can filter matches.
        if args.polymarket_keywords:
            keywords = [
                k.strip().lower()
                for k in args.polymarket_keywords.split(",")
                if k.strip()
            ]
            if keywords:
                config["_polymarket_keywords"] = keywords

        # vs-mode: if the topic string contains " vs " / " versus " and the
        # planner can split it into >=2 entities, route through the same
        # N-pass fanout path as --competitors. The first entity becomes the
        # main topic; remaining entities become the competitor list. User's
        # outer --x-handle / --subreddits apply to the first entity unless
        # --competitors-plan covers it.
        from lib import planner as _planner
        vs_entities = _planner._comparison_entities(topic)
        if len(vs_entities) >= 2 and not comp_enabled:
            topic = vs_entities[0]
            comp_enabled = True
            comp_count = len(vs_entities) - 1
            comp_explicit = vs_entities[1:]
            sys.stderr.write(
                f"[Competitors] vs-mode: routing to N-pass fanout: "
                f"{' vs '.join(vs_entities)}\n"
            )

        def _main_runner() -> schema.Report:
            r = pipeline.run(
                topic=topic,
                config=config,
                depth=depth,
                requested_sources=requested_sources,
                mock=args.mock,
                x_handle=args.x_handle,
                x_related=x_related,
                web_backend=args.web_backend,
                external_plan=external_plan,
                subreddits=subreddits,
                tiktok_hashtags=tiktok_hashtags,
                tiktok_creators=tiktok_creators,
                ig_creators=ig_creators,
                lookback_days=args.lookback_days,
                github_user=github_user,
                github_repos=github_repos,
            )
            r.artifacts["resolved"] = {
                "entity": topic,
                "x_handle": (args.x_handle or "").lstrip("@"),
                "subreddits": list(subreddits or []),
                "github_user": (github_user or ""),
                "github_repos": list(github_repos or []),
                "context": config.get("_auto_resolve_context", "") or "",
            }
            return r

        if comp_enabled:
            from lib import competitors as competitors_mod
            from lib import fanout, resolve as resolve_mod

            if comp_explicit:
                discovered = comp_explicit
            else:
                if not resolve_mod._has_backend(config) and not args.mock:
                    sys.stderr.write(
                        "[Competitors] Cannot auto-discover peers without help.\n"
                        "\n"
                        "RECOMMENDED PATH (hosting reasoning models — Claude Code, Codex, "
                        "Hermes, Gemini, any agent with a WebSearch tool): YOU have "
                        "WebSearch. Use it to run full Step 0.55 per entity, then invoke "
                        "the engine with a vs-topic plus --competitors-plan:\n"
                        "  1. WebSearch for '{topic} competitors' or '{topic} alternatives'.\n"
                        "  2. For each peer, WebSearch for handles/subs/github (Step 0.55).\n"
                        "  3. Re-invoke: /last30days '{topic} vs {peer1} vs {peer2}' "
                        "--competitors-plan '{\"Peer1\":{\"x_handle\":\"h1\",\"subreddits\":"
                        "[\"s1\"],...},\"Peer2\":{...}}'.\n"
                        "See SKILL.md 'Competitor mode' for the full protocol.\n"
                        "\n"
                        "HEADLESS / CRON PATH (no hosting model available): set "
                        "BRAVE_API_KEY / EXA_API_KEY / SERPER_API_KEY / PARALLEL_API_KEY / "
                        "OPENROUTER_API_KEY and re-run.\n"
                        "\n"
                        "MINIMUM ESCAPE HATCH: pass --competitors-list 'A,B,C' to skip "
                        "discovery. Without --competitors-plan, peer sub-runs fall back to "
                        "planner defaults and produce visibly thinner data than the main.\n"
                    )
                    return 2
                discovered = competitors_mod.discover_competitors(
                    topic, comp_count, config, lookback_days=args.lookback_days,
                )
                if not discovered:
                    sys.stderr.write(
                        f"[Competitors] No peers discovered for {topic!r}; aborting "
                        "comparison run. Pass --competitors-list to override.\n"
                    )
                    return 2

            sys.stderr.write(
                f"[Competitors] Comparing: {topic} vs " + " vs ".join(discovered) + "\n"
            )

            def _competitor_runner(entity: str) -> schema.Report:
                # Deep-copy config so per-entity auto_resolve context does not
                # leak across sub-runs. Each sub-run writes its own
                # `_auto_resolve_context` into its local config copy.
                entity_config = dict(config)
                plan_entry = comp_plan.get(entity.strip().lower(), {})
                resolved = {
                    "entity": entity,
                    "x_handle": "",
                    "subreddits": [],
                    "github_user": "",
                    "github_repos": [],
                    "context": "",
                }
                # Skip engine-internal auto_resolve when the hosting model
                # pre-resolved via --competitors-plan (saves a redundant
                # round-trip and makes per-entity Step 0.55 purely
                # hosting-model-driven).
                plan_covers_fully = bool(plan_entry.get("x_handle")) and bool(
                    plan_entry.get("subreddits")
                )
                if (
                    not args.mock
                    and not plan_covers_fully
                    and resolve_mod._has_backend(entity_config)
                ):
                    try:
                        r = resolve_mod.auto_resolve(entity, entity_config)
                    except Exception as exc:
                        sys.stderr.write(
                            f"[Competitors] auto_resolve failed for {entity!r}: "
                            f"{type(exc).__name__}: {exc}\n"
                        )
                        r = {}
                    resolved["x_handle"] = r.get("x_handle", "") or ""
                    resolved["subreddits"] = list(r.get("subreddits") or [])
                    resolved["github_user"] = r.get("github_user", "") or ""
                    resolved["github_repos"] = list(r.get("github_repos") or [])
                    resolved["context"] = r.get("context", "") or ""
                kwargs = subrun_kwargs_for(entity, plan_entry, resolved=resolved)
                # Record effective per-entity targeting for the Resolved block.
                resolved_effective = {
                    "entity": entity,
                    "x_handle": kwargs["x_handle"] or "",
                    "subreddits": kwargs["subreddits"] or [],
                    "github_user": kwargs["github_user"] or "",
                    "github_repos": kwargs["github_repos"] or [],
                    "context": kwargs["_context"],
                }
                if kwargs["_context"]:
                    entity_config["_auto_resolve_context"] = kwargs["_context"]
                sys.stderr.write(
                    f"[Competitors] {entity}: "
                    f"x=@{resolved_effective['x_handle'] or '-'} "
                    f"subs={len(resolved_effective['subreddits'])} "
                    f"gh={resolved_effective['github_user'] or '-'} "
                    f"({'plan' if plan_entry else 'auto'})\n"
                )
                report = pipeline.run(
                    topic=entity,
                    config=entity_config,
                    depth=depth,
                    requested_sources=requested_sources,
                    mock=args.mock,
                    x_handle=kwargs["x_handle"],
                    x_related=kwargs["x_related"],
                    subreddits=kwargs["subreddits"],
                    github_user=kwargs["github_user"],
                    github_repos=kwargs["github_repos"],
                    web_backend=args.web_backend,
                    lookback_days=args.lookback_days,
                    internal_subrun=True,
                )
                report.artifacts["resolved"] = resolved_effective
                return report

            entity_reports = fanout.run_competitor_fanout(
                main_topic=topic,
                main_runner=_main_runner,
                competitors=discovered,
                competitor_runner=_competitor_runner,
            )
            if len(entity_reports) < 2:
                progress.end_processing()
                sys.stderr.write(
                    f"[Competitors] Fewer than 2 sub-runs survived ({len(entity_reports)}); "
                    "cannot render a comparison. Re-run without --competitors or check the "
                    "warnings above.\n"
                )
                return 1
            report = entity_reports[0][1]
        else:
            entity_reports = None
            report = _main_runner()
    except Exception as exc:
        progress.end_processing()
        progress.show_error(str(exc))
        raise
    _show_runtime_ui(
        report, progress, diag,
        suppress_web_promo=bool(external_plan or comp_plan),
    )
    if args.store:
        counts = persist_report(report)
        sys.stderr.write(
            f"[last30days] Stored {counts['new']} new, {counts['updated']} updated findings\n"
        )
        sys.stderr.flush()

    # Show quality nudge if applicable
    try:
        from lib import quality_nudge
        quality = quality_nudge.compute_quality_score(config, {})
        if quality.get("nudge_text"):
            sys.stderr.write(f"\n{quality['nudge_text']}\n")
            sys.stderr.flush()
    except Exception:
        pass

    fun_level = config.get("FUN_LEVEL", "medium").lower()
    footer_save_path = None
    if args.save_dir:
        footer_save_path = compute_save_path_display(
            args.save_dir, report.topic, args.save_suffix or "", args.emit
        )

    # Signal to render_compact whether pre-research flags were supplied.
    # Used to emit a Pre-Research Status warning when the model skipped
    # Step 0.5 / 0.55 and invoked the engine bare on an eligible topic.
    pre_research_flags_present = bool(
        args.x_handle
        or args.github_user
        or args.subreddits
        or args.plan
        or args.auto_resolve
        or args.tiktok_creators
        or args.ig_creators
    )
    report.artifacts["pre_research_flags_present"] = pre_research_flags_present

    if entity_reports:
        rendered = emit_comparison_output(
            entity_reports,
            args.emit,
            fun_level=fun_level,
            save_path=footer_save_path,
            synthesis_md=synthesis_md,
        )
    else:
        rendered = emit_output(
            report,
            args.emit,
            fun_level=fun_level,
            save_path=footer_save_path,
            synthesis_md=synthesis_md,
        )
    if args.save_dir:
        # Save the main topic's raw file (single-entity or comparison main).
        save_path = save_output(
            report,
            args.emit,
            args.save_dir,
            suffix=args.save_suffix or "",
            synthesis_md=synthesis_md,
        )
        sys.stderr.write(f"[last30days] Saved output to {save_path}\n")
        # Competitor / vs-mode: also save a per-entity raw file for each peer.
        # Matches historical vs-mode behavior (N passes → N save files).
        if entity_reports and len(entity_reports) > 1:
            for label, entity_report in entity_reports[1:]:
                peer_path = save_output(
                    entity_report, args.emit, args.save_dir,
                    suffix=args.save_suffix or "",
                    synthesis_md=synthesis_md,
                )
                sys.stderr.write(f"[last30days] Saved output to {peer_path}\n")
        sys.stderr.flush()
    print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
