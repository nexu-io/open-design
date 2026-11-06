"""GitHub Issues/PRs search via the public GitHub Search API.

Uses api.github.com/search/issues for issue/PR discovery and
per-item comment enrichment. Auth via GITHUB_TOKEN env var or
`gh auth token` subprocess fallback.
"""

import json
import math
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional

from . import dates, log
from .query import extract_core_subject
from .relevance import token_overlap_relevance

SEARCH_URL = "https://api.github.com/search/issues"

DEPTH_LIMITS = {
    "quick": 15,
    "default": 30,
    "deep": 60,
}

ENRICH_LIMITS = {
    "quick": 3,
    "default": 5,
    "deep": 8,
}

USER_AGENT = "last30days/3.0 (research tool)"


def _log(msg: str):
    log.source_log("GitHub", msg, tty_only=False)


def _resolve_token(token: Optional[str] = None) -> Optional[str]:
    """Resolve GitHub auth token from argument, env, or gh CLI."""
    if token:
        return token
    env_token = os.environ.get("GITHUB_TOKEN")
    if env_token:
        return env_token
    # Fallback: try gh CLI
    try:
        result = subprocess.run(
            ["gh", "auth", "token"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        pass
    return None


def _fetch_json(
    url: str,
    token: Optional[str] = None,
    timeout: int = 15,
) -> Optional[Dict[str, Any]]:
    """Fetch JSON from GitHub API. Returns None on failure."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/vnd.github+json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as e:
        if e.code == 403:
            _log(f"403 rate limited or forbidden: {url}")
            return None
        if e.code == 422:
            _log(f"422 unprocessable: {url}")
            return None
        _log(f"HTTP {e.code}: {e.reason}")
        return None
    except (urllib.error.URLError, OSError, TimeoutError) as e:
        _log(f"Network error: {e}")
        return None
    except json.JSONDecodeError as e:
        _log(f"JSON decode error: {e}")
        return None


def _parse_repo_from_url(html_url: str) -> str:
    """Extract 'owner/repo' from a GitHub issue/PR URL."""
    parts = html_url.replace("https://github.com/", "").split("/")
    if len(parts) >= 2:
        return f"{parts[0]}/{parts[1]}"
    return ""


def _parse_date(iso_str: Optional[str]) -> Optional[str]:
    """Parse a GitHub ISO 8601 datetime string and return YYYY-MM-DD.

    Returns None for non-date input. GitHub's API always emits ISO 8601
    (e.g. "2026-02-26T16:00:00Z"), but we defer to dates.parse_date() so
    garbage input gets rejected instead of silently sliced.
    """
    dt = dates.parse_date(iso_str)
    return dt.strftime("%Y-%m-%d") if dt else None


def _compute_relevance(
    query: str,
    title: str,
    rank_index: int,
    reactions: int,
    comments: int,
) -> float:
    """Blend text relevance with engagement signals."""
    rank_score = max(0.3, 1.0 - (rank_index * 0.02))
    engagement_boost = min(0.2, math.log1p(reactions + comments) / 20)

    if query:
        content_score = token_overlap_relevance(query, title)
        relevance = min(1.0, 0.6 * rank_score + 0.4 * content_score + engagement_boost)
    else:
        relevance = min(1.0, rank_score * 0.7 + engagement_boost + 0.1)

    return round(relevance, 2)


def search_github(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    token: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Search GitHub Issues and PRs.

    Args:
        topic: Search topic
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        depth: 'quick', 'default', or 'deep'
        token: Optional GitHub token (falls back to env/gh CLI)

    Returns:
        List of normalized item dicts. Empty list on any failure.
    """
    resolved_token = _resolve_token(token)
    if not resolved_token:
        _log("No GitHub token available (set GITHUB_TOKEN or install gh CLI)")
        return []

    count = DEPTH_LIMITS.get(depth, DEPTH_LIMITS["default"])
    core = extract_core_subject(topic)
    _log(f"Searching for '{core}' (raw: '{topic}', since {from_date}, count={count})")

    # Build search query with date filter
    q = f"{core} created:>{from_date}"
    params = {
        "q": q,
        "sort": "reactions",
        "order": "desc",
        "per_page": str(min(count, 100)),
    }
    url = f"{SEARCH_URL}?{urllib.parse.urlencode(params)}"

    data = _fetch_json(url, token=resolved_token, timeout=30)
    if not data:
        return []

    raw_items = data.get("items", [])
    _log(f"Found {len(raw_items)} issues/PRs")

    items = []
    for i, item in enumerate(raw_items[:count]):
        html_url = item.get("html_url", "")
        repo = _parse_repo_from_url(html_url)
        title = item.get("title", "")
        body_text = item.get("body") or ""
        reactions_total = item.get("reactions", {}).get("total_count", 0) if isinstance(item.get("reactions"), dict) else 0
        comment_count = item.get("comments", 0)
        labels = [
            lbl.get("name", "") for lbl in (item.get("labels") or [])
            if isinstance(lbl, dict)
        ]
        state = item.get("state", "")
        is_pr = "pull_request" in item
        author = item.get("user", {}).get("login", "") if isinstance(item.get("user"), dict) else ""

        relevance = _compute_relevance(core, title, i, reactions_total, comment_count)

        items.append({
            "id": f"GH{i + 1}",
            "title": title,
            "url": html_url,
            "date": _parse_date(item.get("created_at")),
            "author": author,
            "source": "github",
            "score": reactions_total,
            "container": repo,
            "snippet": body_text[:300] if body_text else "",
            "relevance": relevance,
            "why_relevant": f"GitHub {'PR' if is_pr else 'issue'}: {title[:60]}",
            "engagement": {
                "reactions": reactions_total,
                "comments": comment_count,
            },
            "metadata": {
                "labels": labels,
                "state": state,
                "comment_count": comment_count,
                "reactions": reactions_total,
                "is_pr": is_pr,
            },
        })

    # Enrich top items with comments
    items = _enrich_top_items(items, depth, resolved_token)

    # Date filter
    filtered = []
    for item in items:
        d = item.get("date")
        if d is None or (from_date <= d <= to_date):
            filtered.append(item)

    # Sort by relevance
    filtered.sort(key=lambda x: x.get("relevance", 0), reverse=True)

    return filtered


def _enrich_top_items(
    items: List[Dict[str, Any]],
    depth: str,
    token: str,
) -> List[Dict[str, Any]]:
    """Fetch comments for top N items by reactions."""
    if not items:
        return items

    limit = ENRICH_LIMITS.get(depth, ENRICH_LIMITS["default"])

    by_reactions = sorted(
        range(len(items)),
        key=lambda i: items[i].get("score", 0),
        reverse=True,
    )
    to_enrich = by_reactions[:limit]

    _log(f"Enriching top {len(to_enrich)} items with comments")

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(
                _fetch_item_comments,
                items[idx]["url"],
                token,
            ): idx
            for idx in to_enrich
        }

        for future in as_completed(futures):
            idx = futures[future]
            try:
                comments = future.result(timeout=15)
                items[idx]["metadata"]["top_comments"] = comments
            except (KeyError, TypeError, OSError) as exc:
                _log(f"Comment enrichment failed for {items[idx].get('url', '?')}: {type(exc).__name__}: {exc}")
                items[idx]["metadata"]["top_comments"] = []

    return items


def _fetch_item_comments(
    issue_url: str,
    token: str,
    max_comments: int = 5,
) -> List[Dict[str, Any]]:
    """Fetch comments for a GitHub issue/PR.

    Args:
        issue_url: HTML URL like https://github.com/owner/repo/issues/123
        token: GitHub auth token
        max_comments: Max comments to return

    Returns:
        List of comment dicts with score, excerpt, author.
    """
    path = issue_url.replace("https://github.com/", "")
    path = path.replace("/pull/", "/issues/")
    api_url = f"https://api.github.com/repos/{path}/comments?per_page={max_comments}&sort=reactions&direction=desc"

    data = _fetch_json(api_url, token=token, timeout=15)
    if not data or not isinstance(data, list):
        return []

    comments = []
    for c in data[:max_comments]:
        body = c.get("body") or ""
        excerpt = body[:300] + "..." if len(body) > 300 else body
        reactions = c.get("reactions", {})
        reaction_count = reactions.get("total_count", 0) if isinstance(reactions, dict) else 0
        author = c.get("user", {}).get("login", "") if isinstance(c.get("user"), dict) else ""

        comments.append({
            "score": reaction_count,
            "excerpt": excerpt,
            "author": author,
        })

    return comments


# ---------------------------------------------------------------------------
# Person-mode search: author-scoped queries, star enrichment, release notes
# ---------------------------------------------------------------------------

PERSON_DEPTH_LIMITS = {
    "quick": {"pr_pages": 1, "own_repos": 3, "external_repos": 5},
    "default": {"pr_pages": 1, "own_repos": 5, "external_repos": 10},
    "deep": {"pr_pages": 2, "own_repos": 5, "external_repos": 15},
}


def _fetch_readme_snippet(repo: str, token: str, max_chars: int = 500) -> Optional[str]:
    """Fetch README content for a repo, truncated to first ~max_chars."""
    url = f"https://api.github.com/repos/{repo}/readme"
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/vnd.github.raw+json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except (urllib.error.HTTPError, urllib.error.URLError, OSError, TimeoutError):
        return None

    if not raw:
        return None
    # Try to break at a paragraph boundary
    if len(raw) <= max_chars:
        return raw
    cut = raw[:max_chars]
    last_double_newline = cut.rfind("\n\n")
    if last_double_newline > max_chars // 3:
        return cut[:last_double_newline].rstrip()
    return cut.rstrip() + "..."


def _fetch_latest_releases(
    repo: str, token: str, count: int = 3, max_body: int = 300,
) -> List[Dict[str, str]]:
    """Fetch latest releases for a repo."""
    url = f"https://api.github.com/repos/{repo}/releases?per_page={count}"
    data = _fetch_json(url, token=token, timeout=10)
    if not data or not isinstance(data, list):
        return []
    releases = []
    for r in data[:count]:
        tag = r.get("tag_name", "")
        date = _parse_date(r.get("published_at"))
        body = (r.get("body") or "")[:max_body]
        name = r.get("name") or tag
        releases.append({"tag": tag, "name": name, "date": date, "body": body})
    return releases


def _fetch_top_issues(repo: str, token: str) -> Dict[str, Any]:
    """Fetch top feature request (by reactions) and top complaint (by comments)."""
    result: Dict[str, Any] = {}

    # Top feature request: issues with enhancement label, sorted by reactions
    feat_q = urllib.parse.quote(f"repo:{repo} is:issue is:open label:enhancement")
    feat_url = f"{SEARCH_URL}?q={feat_q}&sort=reactions&order=desc&per_page=1"
    feat_data = _fetch_json(feat_url, token=token, timeout=10)
    if feat_data and feat_data.get("items"):
        item = feat_data["items"][0]
        result["top_feature_request"] = {
            "title": item.get("title", ""),
            "reactions": item.get("reactions", {}).get("total_count", 0) if isinstance(item.get("reactions"), dict) else 0,
            "comments": item.get("comments", 0),
            "url": item.get("html_url", ""),
        }
    elif feat_data and feat_data.get("total_count", 0) == 0:
        # No enhancement label; fall back to top issue by reactions
        fallback_q = urllib.parse.quote(f"repo:{repo} is:issue is:open")
        fallback_url = f"{SEARCH_URL}?q={fallback_q}&sort=reactions&order=desc&per_page=1"
        fallback_data = _fetch_json(fallback_url, token=token, timeout=10)
        if fallback_data and fallback_data.get("items"):
            item = fallback_data["items"][0]
            result["top_feature_request"] = {
                "title": item.get("title", ""),
                "reactions": item.get("reactions", {}).get("total_count", 0) if isinstance(item.get("reactions"), dict) else 0,
                "comments": item.get("comments", 0),
                "url": item.get("html_url", ""),
            }

    # Top complaint: most-discussed open issue (by comments)
    bug_q = urllib.parse.quote(f"repo:{repo} is:issue is:open")
    bug_url = f"{SEARCH_URL}?q={bug_q}&sort=comments&order=desc&per_page=1"
    bug_data = _fetch_json(bug_url, token=token, timeout=10)
    if bug_data and bug_data.get("items"):
        item = bug_data["items"][0]
        result["top_complaint"] = {
            "title": item.get("title", ""),
            "reactions": item.get("reactions", {}).get("total_count", 0) if isinstance(item.get("reactions"), dict) else 0,
            "comments": item.get("comments", 0),
            "url": item.get("html_url", ""),
        }

    return result


def _fetch_repo_info(repo: str, token: str) -> Optional[Dict[str, Any]]:
    """Fetch repo metadata (stars, forks, description, language)."""
    url = f"https://api.github.com/repos/{repo}"
    data = _fetch_json(url, token=token, timeout=10)
    if not data or not isinstance(data, dict):
        return None
    return {
        "stars": data.get("stargazers_count", 0),
        "forks": data.get("forks_count", 0),
        "description": (data.get("description") or "")[:200],
        "language": data.get("language") or "",
        "open_issues": data.get("open_issues_count", 0),
    }


def _format_stars(n: int) -> str:
    """Format star count as human-readable (e.g., 349K, 2.9K, 42)."""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.0f}K" if n >= 10_000 else f"{n / 1_000:.1f}K"
    return str(n)


def search_github_person(
    username: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    token: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Person-mode GitHub search: author-scoped queries with star enrichment.

    Returns SourceItems for:
    - 1 velocity summary item
    - Per-repo items for top external repos (with stars + release notes)
    - Per-repo items for own repos (with stars + README + top issues + releases)
    """
    resolved_token = _resolve_token(token)
    if not resolved_token:
        _log("No GitHub token available for person-mode search")
        return []

    limits = PERSON_DEPTH_LIMITS.get(depth, PERSON_DEPTH_LIMITS["default"])
    _log(f"Person-mode search for @{username} (since {from_date})")

    # Phase 1: PR velocity via search API
    total_q = urllib.parse.quote(f"author:{username} type:pr created:>{from_date}")
    merged_q = urllib.parse.quote(f"author:{username} type:pr is:merged created:>{from_date}")

    total_url = f"{SEARCH_URL}?q={total_q}&per_page=1"
    merged_url = f"{SEARCH_URL}?q={merged_q}&sort=reactions&order=desc&per_page=100"

    total_data = _fetch_json(total_url, token=resolved_token, timeout=20)
    merged_data = _fetch_json(merged_url, token=resolved_token, timeout=20)

    total_prs = total_data.get("total_count", 0) if total_data else 0
    merged_count = merged_data.get("total_count", 0) if merged_data else 0
    merged_items = merged_data.get("items", []) if merged_data else []

    _log(f"Found {total_prs} total PRs, {merged_count} merged")

    if total_prs == 0 and merged_count == 0:
        _log("No PRs found, falling back to keyword search")
        return []

    # Phase 2: Group merged PRs by repo
    repo_pr_counts: Dict[str, int] = {}
    for item in merged_items:
        repo = _parse_repo_from_url(item.get("html_url", ""))
        if repo:
            repo_pr_counts[repo] = repo_pr_counts.get(repo, 0) + 1

    # Sort repos by PR count (most active first)
    sorted_repos = sorted(repo_pr_counts.items(), key=lambda x: x[1], reverse=True)

    # Phase 3: Fetch own repos
    own_repos_url = f"https://api.github.com/users/{username}/repos?sort=stars&per_page={limits['own_repos']}&direction=desc"
    own_repos_data = _fetch_json(own_repos_url, token=resolved_token, timeout=15)
    own_repo_names = set()
    own_repos_info: List[Dict[str, Any]] = []
    if own_repos_data and isinstance(own_repos_data, list):
        for r in own_repos_data:
            full_name = r.get("full_name", "")
            if full_name and not r.get("fork"):
                own_repo_names.add(full_name)
                own_repos_info.append({
                    "full_name": full_name,
                    "stars": r.get("stargazers_count", 0),
                    "forks": r.get("forks_count", 0),
                    "description": (r.get("description") or "")[:200],
                    "language": r.get("language") or "",
                    "open_issues": r.get("open_issues_count", 0),
                })

    # Separate external repos from own repos
    external_repos = [(repo, count) for repo, count in sorted_repos if repo not in own_repo_names]
    external_repos = external_repos[:limits["external_repos"]]

    # Phase 4: Parallel enrichment (star counts, releases, READMEs, top issues)
    items: List[Dict[str, Any]] = []
    idx = 0

    # Build velocity summary
    open_prs = total_prs - merged_count
    merge_rate = round(100 * merged_count / total_prs) if total_prs > 0 else 0
    num_repos = len(repo_pr_counts)
    velocity_text = (
        f"GitHub Person Profile: @{username}\n\n"
        f"CONTRIBUTION VELOCITY (last {(to_date > from_date) and 30 or 30} days)\n"
        f"- {merged_count} PRs merged across {num_repos} repos ({merge_rate}% merge rate)\n"
        f"- {total_prs} total PRs submitted, {open_prs} still open\n"
    )

    idx += 1
    items.append({
        "id": f"GH{idx}",
        "title": f"@{username}: {merged_count} PRs merged across {num_repos} repos ({merge_rate}% merge rate)",
        "url": f"https://github.com/{username}",
        "date": to_date,
        "author": username,
        "source": "github",
        "score": merged_count,
        "container": f"@{username}",
        "snippet": velocity_text,
        "relevance": 0.95,
        "why_relevant": f"GitHub profile: @{username} - {merged_count} PRs merged across {num_repos} repos",
        "engagement": {"reactions": merged_count, "comments": total_prs},
        "metadata": {
            "labels": ["person-profile", "velocity"],
            "state": "open",
            "comment_count": 0,
            "reactions": merged_count,
            "is_pr": False,
        },
    })

    # Phase 5: Enrich external repos (parallel: star counts + releases)
    _log(f"Enriching {len(external_repos)} external repos + {len(own_repos_info)} own repos")

    with ThreadPoolExecutor(max_workers=8) as executor:
        # External repo enrichment: stars + releases
        ext_futures = {}
        for repo, pr_count in external_repos:
            ext_futures[executor.submit(_enrich_external_repo, repo, resolved_token)] = (repo, pr_count)

        # Own repo enrichment: README + releases + top issues
        own_futures = {}
        for own_repo in own_repos_info:
            own_futures[executor.submit(_enrich_own_repo, own_repo["full_name"], resolved_token)] = own_repo

        # Collect external repo results
        for future in as_completed(ext_futures):
            repo, pr_count = ext_futures[future]
            try:
                enrichment = future.result(timeout=20)
            except Exception as exc:
                _log(f"External repo enrichment failed for {repo}: {exc}")
                enrichment = {}

            repo_info = enrichment.get("info")
            releases = enrichment.get("releases", [])

            stars = repo_info["stars"] if repo_info else 0
            stars_str = _format_stars(stars)
            desc = repo_info["description"] if repo_info else ""

            snippet_parts = [f"Contributed {pr_count} merged PRs to {repo} ({stars_str} stars)"]
            if desc:
                snippet_parts.append(f"  {desc}")
            if releases:
                for rel in releases[:2]:
                    body_preview = f" - {rel['body'][:150]}" if rel.get("body") else ""
                    snippet_parts.append(f"  Latest release: {rel['name']} ({rel['date']}){body_preview}")

            idx += 1
            items.append({
                "id": f"GH{idx}",
                "title": f"{repo} ({stars_str} stars) - {pr_count} PRs merged",
                "url": f"https://github.com/{repo}",
                "date": releases[0]["date"] if releases and releases[0].get("date") else to_date,
                "author": username,
                "source": "github",
                "score": stars,
                "container": repo,
                "snippet": "\n".join(snippet_parts),
                "relevance": min(0.9, 0.6 + math.log1p(stars) / 30 + min(0.15, pr_count / 20)),
                "why_relevant": f"GitHub contribution: {pr_count} PRs merged to {repo} ({stars_str} stars)",
                "engagement": {"reactions": stars, "comments": pr_count},
                "metadata": {
                    "labels": ["person-profile", "external-repo"],
                    "state": "open",
                    "comment_count": pr_count,
                    "reactions": stars,
                    "is_pr": False,
                },
            })

        # Collect own repo results
        for future in as_completed(own_futures):
            own_repo = own_futures[future]
            try:
                enrichment = future.result(timeout=25)
            except Exception as exc:
                _log(f"Own repo enrichment failed for {own_repo['full_name']}: {exc}")
                enrichment = {}

            repo_name = own_repo["full_name"]
            stars = own_repo["stars"]
            stars_str = _format_stars(stars)
            open_issues = own_repo["open_issues"]
            desc = own_repo["description"]

            readme = enrichment.get("readme")
            releases = enrichment.get("releases", [])
            top_issues = enrichment.get("top_issues", {})

            snippet_parts = [f"Own project: {repo_name} ({stars_str} stars, {open_issues} open issues)"]
            if desc:
                snippet_parts.append(f"  {desc}")
            if readme:
                snippet_parts.append(f"  README: {readme[:300]}")
            if releases:
                for rel in releases[:2]:
                    body_preview = f" - {rel['body'][:150]}" if rel.get("body") else ""
                    snippet_parts.append(f"  Latest release: {rel['name']} ({rel['date']}){body_preview}")
            feat = top_issues.get("top_feature_request")
            if feat:
                snippet_parts.append(f"  Top feature request: \"{feat['title']}\" ({feat['reactions']} reactions, {feat['comments']} comments)")
            complaint = top_issues.get("top_complaint")
            if complaint:
                snippet_parts.append(f"  Top complaint: \"{complaint['title']}\" ({complaint['comments']} comments)")

            idx += 1
            items.append({
                "id": f"GH{idx}",
                "title": f"{repo_name} ({stars_str} stars) - own project, {open_issues} open issues",
                "url": f"https://github.com/{repo_name}",
                "date": releases[0]["date"] if releases and releases[0].get("date") else to_date,
                "author": username,
                "source": "github",
                "score": stars,
                "container": repo_name,
                "snippet": "\n".join(snippet_parts),
                "relevance": min(0.95, 0.7 + math.log1p(stars) / 25),
                "why_relevant": f"GitHub own project: {repo_name} ({stars_str} stars)",
                "engagement": {"reactions": stars, "comments": open_issues},
                "metadata": {
                    "labels": ["person-profile", "own-repo"],
                    "state": "open",
                    "comment_count": open_issues,
                    "reactions": stars,
                    "is_pr": False,
                },
            })

    # Sort by relevance
    items.sort(key=lambda x: x.get("relevance", 0), reverse=True)
    _log(f"Person-mode returned {len(items)} items")
    return items


def _enrich_external_repo(repo: str, token: str) -> Dict[str, Any]:
    """Fetch star count + releases for an external repo."""
    info = _fetch_repo_info(repo, token)
    releases = _fetch_latest_releases(repo, token, count=3)
    return {"info": info, "releases": releases}


def _enrich_own_repo(repo: str, token: str) -> Dict[str, Any]:
    """Fetch README + releases + top issues for an own repo."""
    readme = _fetch_readme_snippet(repo, token, max_chars=500)
    releases = _fetch_latest_releases(repo, token, count=3)
    top_issues = _fetch_top_issues(repo, token)
    return {"readme": readme, "releases": releases, "top_issues": top_issues}


# ---------------------------------------------------------------------------
# Project-mode search: fetch comprehensive data for specific repos
# ---------------------------------------------------------------------------

def search_github_project(
    repos: List[str],
    from_date: str,
    to_date: str,
    depth: str = "default",
    token: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Project-mode GitHub search: fetch stars, README, releases, top issues for repos.

    Args:
        repos: List of 'owner/repo' strings.
        from_date: Start date (YYYY-MM-DD).
        to_date: End date (YYYY-MM-DD).
        depth: 'quick', 'default', or 'deep'.
        token: Optional GitHub token.

    Returns:
        List of SourceItems, one per repo.
    """
    resolved_token = _resolve_token(token)
    if not resolved_token:
        _log("No GitHub token available for project-mode search")
        return []

    _log(f"Project-mode search for {len(repos)} repos: {', '.join(repos)}")

    items: List[Dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=min(8, len(repos))) as executor:
        futures = {
            executor.submit(_enrich_project_repo, repo, resolved_token): repo
            for repo in repos
        }

        for idx, future in enumerate(as_completed(futures)):
            repo = futures[future]
            try:
                enrichment = future.result(timeout=25)
            except Exception as exc:
                _log(f"Project enrichment failed for {repo}: {exc}")
                continue

            info = enrichment.get("info")
            if not info:
                _log(f"No repo info for {repo}, skipping")
                continue

            readme = enrichment.get("readme")
            releases = enrichment.get("releases", [])
            top_issues = enrichment.get("top_issues", {})

            stars = info["stars"]
            stars_str = _format_stars(stars)
            open_issues = info["open_issues"]
            desc = info["description"]
            lang = info["language"]

            snippet_parts = [f"Project: {repo} ({stars_str} stars, {open_issues} open issues, {lang})"]
            if desc:
                snippet_parts.append(f"  {desc}")
            if readme:
                snippet_parts.append(f"  README: {readme[:400]}")
            if releases:
                for rel in releases[:2]:
                    body_preview = f" - {rel['body'][:150]}" if rel.get("body") else ""
                    snippet_parts.append(f"  Latest release: {rel['name']} ({rel['date']}){body_preview}")
            feat = top_issues.get("top_feature_request")
            if feat:
                snippet_parts.append(f"  Top feature request: \"{feat['title']}\" ({feat['reactions']} reactions, {feat['comments']} comments)")
            complaint = top_issues.get("top_complaint")
            if complaint:
                snippet_parts.append(f"  Top complaint: \"{complaint['title']}\" ({complaint['comments']} comments)")

            items.append({
                "id": f"GH{idx + 1}",
                "title": f"{repo} ({stars_str} stars) - {open_issues} open issues",
                "url": f"https://github.com/{repo}",
                "date": releases[0]["date"] if releases and releases[0].get("date") else to_date,
                "author": repo.split("/")[0],
                "source": "github",
                "score": stars,
                "container": repo,
                "snippet": "\n".join(snippet_parts),
                "relevance": min(0.95, 0.7 + math.log1p(stars) / 25),
                "why_relevant": f"GitHub project: {repo} ({stars_str} stars, live)",
                "engagement": {"reactions": stars, "comments": open_issues},
                "metadata": {
                    "labels": ["project-mode"],
                    "state": "open",
                    "comment_count": open_issues,
                    "reactions": stars,
                    "is_pr": False,
                    "github_stars": {repo: stars},
                },
            })

    items.sort(key=lambda x: x.get("relevance", 0), reverse=True)
    _log(f"Project-mode returned {len(items)} items")
    return items


def _enrich_project_repo(repo: str, token: str) -> Dict[str, Any]:
    """Fetch all project data for a repo: info + README + releases + top issues."""
    info = _fetch_repo_info(repo, token)
    readme = _fetch_readme_snippet(repo, token, max_chars=500)
    releases = _fetch_latest_releases(repo, token, count=3)
    top_issues = _fetch_top_issues(repo, token)
    return {"info": info, "readme": readme, "releases": releases, "top_issues": top_issues}


# ---------------------------------------------------------------------------
# Post-rerank star enrichment: annotate candidates with live star counts
# ---------------------------------------------------------------------------

_REPO_URL_PATTERN = re.compile(r"github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)")
_SKIP_PATHS = {"topics", "search", "orgs", "settings", "features", "about", "pricing", "enterprise", "explore", "marketplace", "sponsors"}


def extract_repo_refs(candidates: List[Any]) -> List[str]:
    """Extract unique owner/repo strings from candidate URLs, titles, and snippets."""
    seen: set = set()
    repos: List[str] = []
    for c in candidates:
        texts = [
            getattr(c, "url", "") or "",
            getattr(c, "title", "") or "",
        ]
        # Also check evidence snippets if available
        evidence = getattr(c, "evidence", None)
        if evidence:
            texts.append(str(evidence))
        for text in texts:
            for match in _REPO_URL_PATTERN.findall(text):
                # Normalize: strip trailing .git, lowercase
                repo = match.rstrip(".git").lower()
                owner = repo.split("/")[0]
                if owner in _SKIP_PATHS:
                    continue
                if repo not in seen:
                    seen.add(repo)
                    repos.append(match)  # preserve original case
    return repos


def enrich_candidates_with_stars(
    candidates: List[Any],
    token: Optional[str] = None,
    already_enriched: Optional[set] = None,
    max_repos: int = 10,
) -> int:
    """Annotate candidates with live GitHub star counts.

    Returns the number of repos enriched.
    """
    resolved_token = _resolve_token(token)
    if not resolved_token:
        return 0

    refs = extract_repo_refs(candidates)
    if not refs:
        return 0

    skip = already_enriched or set()
    to_fetch = [r for r in refs if r.lower() not in {s.lower() for s in skip}][:max_repos]
    if not to_fetch:
        return 0

    _log(f"Star enrichment: fetching {len(to_fetch)} repos")

    # Parallel fetch star counts
    star_map: Dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=min(8, len(to_fetch))) as executor:
        futures = {executor.submit(_fetch_repo_info, repo, resolved_token): repo for repo in to_fetch}
        for future in as_completed(futures):
            repo = futures[future]
            try:
                info = future.result(timeout=10)
                if info:
                    star_map[repo.lower()] = info["stars"]
            except Exception:
                pass

    if not star_map:
        return 0

    # Annotate candidates
    enriched_count = 0
    for c in candidates:
        texts = [getattr(c, "url", "") or "", getattr(c, "title", "") or ""]
        evidence = getattr(c, "evidence", None)
        if evidence:
            texts.append(str(evidence))
        combined = " ".join(texts)
        for match in _REPO_URL_PATTERN.findall(combined):
            repo_lower = match.rstrip(".git").lower()
            if repo_lower in star_map:
                stars = star_map[repo_lower]
                stars_str = _format_stars(stars)
                # Add to metadata
                if not hasattr(c, "metadata") or c.metadata is None:
                    continue
                if "github_stars" not in c.metadata:
                    c.metadata["github_stars"] = {}
                c.metadata["github_stars"][match] = stars
                # Append to evidence if present
                if hasattr(c, "evidence") and c.evidence and f"(live:" not in c.evidence:
                    c.evidence = c.evidence + f" (live: {stars_str} stars)"
                enriched_count += 1
                break  # one annotation per candidate

    _log(f"Star enrichment: annotated {enriched_count} candidates")
    return enriched_count
