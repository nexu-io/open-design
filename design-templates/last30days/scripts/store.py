#!/usr/bin/env python3
"""SQLite research accumulator for last30days.

Stores topics, research runs, and findings with:
- WAL mode for safe concurrent access (cron + user)
- FTS5 full-text search with porter+unicode61 tokenizer
- URL-based dedup with engagement metric updates on re-sighting
- Lightweight schema migrations without external dependencies

Database location: ~/.local/share/last30days/research.db
"""

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

from lib import schema

DB_DIR = Path.home() / ".local" / "share" / "last30days"
DB_PATH = DB_DIR / "research.db"

# Allow override for testing
_db_override = None


def _get_db_path() -> Path:
    return _db_override or DB_PATH


SCHEMA_V1 = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-64000;

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    search_queries TEXT,
    schedule TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS research_runs (
    id INTEGER PRIMARY KEY,
    topic_id INTEGER REFERENCES topics(id),
    run_date TEXT NOT NULL,
    source_mode TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    token_cost REAL,
    duration_seconds REAL,
    status TEXT DEFAULT 'completed',
    error_message TEXT,
    findings_new INTEGER DEFAULT 0,
    findings_updated INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS findings (
    id INTEGER PRIMARY KEY,
    run_id INTEGER REFERENCES research_runs(id),
    topic_id INTEGER REFERENCES topics(id),
    source TEXT NOT NULL,
    source_url TEXT UNIQUE,
    source_title TEXT,
    author TEXT,
    content TEXT,
    summary TEXT,
    engagement_score REAL,
    relevance_score REAL,
    first_seen TEXT DEFAULT (datetime('now')),
    last_seen TEXT DEFAULT (datetime('now')),
    sighting_count INTEGER DEFAULT 1,
    dismissed INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_findings_topic ON findings(topic_id, first_seen);
CREATE INDEX IF NOT EXISTS idx_findings_source ON findings(source, topic_id);
CREATE INDEX IF NOT EXISTS idx_findings_url ON findings(source_url);

CREATE VIRTUAL TABLE IF NOT EXISTS findings_fts USING fts5(
    content, summary, source_title, author,
    tokenize='porter unicode61',
    content='findings',
    content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS findings_ai AFTER INSERT ON findings BEGIN
    INSERT INTO findings_fts(rowid, content, summary, source_title, author)
    VALUES (new.id, new.content, new.summary, new.source_title, new.author);
END;

CREATE TRIGGER IF NOT EXISTS findings_ad AFTER DELETE ON findings BEGIN
    INSERT INTO findings_fts(findings_fts, rowid, content, summary, source_title, author)
    VALUES ('delete', old.id, old.content, old.summary, old.source_title, old.author);
END;

CREATE TRIGGER IF NOT EXISTS findings_au AFTER UPDATE ON findings BEGIN
    INSERT INTO findings_fts(findings_fts, rowid, content, summary, source_title, author)
    VALUES ('delete', old.id, old.content, old.summary, old.source_title, old.author);
    INSERT INTO findings_fts(rowid, content, summary, source_title, author)
    VALUES (new.id, new.content, new.summary, new.source_title, new.author);
END;

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);
"""

SCHEMA_V1_DEFAULTS = """
INSERT OR IGNORE INTO schema_version (version) VALUES (1);
INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_budget', '5.00');
INSERT OR IGNORE INTO settings (key, value) VALUES ('delivery_channel', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('delivery_mode', 'announce');
INSERT OR IGNORE INTO settings (key, value) VALUES ('briefing_format', 'concise');
INSERT OR IGNORE INTO settings (key, value) VALUES ('default_schedule', '0 8 * * *');
"""

_UPDATABLE_RUN_COLUMNS = frozenset({
    "source_mode",
    "prompt_tokens",
    "completion_tokens",
    "token_cost",
    "duration_seconds",
    "status",
    "error_message",
    "findings_new",
    "findings_updated",
})

_UPDATABLE_FINDING_COLUMNS = frozenset({
    "source",
    "source_url",
    "source_title",
    "author",
    "content",
    "summary",
    "engagement_score",
    "relevance_score",
    "last_seen",
    "sighting_count",
    "dismissed",
})

# Future migrations keyed by version number
MIGRATIONS: Dict[int, str] = {}


def _connect(db_path: Optional[Path] = None) -> sqlite3.Connection:
    """Open a connection with WAL mode and row factory."""
    path = db_path or _get_db_path()
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(db_path: Optional[Path] = None) -> Path:
    """Create database and tables if they don't exist. Returns the DB path."""
    path = db_path or _get_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    conn = _connect(path)
    try:
        conn.executescript(SCHEMA_V1)
        conn.executescript(SCHEMA_V1_DEFAULTS)
        _run_migrations(conn)
        conn.commit()
    finally:
        conn.close()

    return path


def _run_migrations(conn: sqlite3.Connection):
    """Apply pending schema migrations."""
    current = conn.execute(
        "SELECT MAX(version) FROM schema_version"
    ).fetchone()[0] or 0

    for version in sorted(MIGRATIONS.keys()):
        if version > current:
            conn.executescript(MIGRATIONS[version])
            conn.execute(
                "INSERT INTO schema_version (version) VALUES (?)", (version,)
            )


# --- Topics ---


def add_topic(
    name: str,
    search_queries: Optional[List[str]] = None,
    schedule: str = "0 8 * * *",
) -> Dict[str, Any]:
    """Add a topic to the watchlist. Returns the topic dict."""
    init_db()
    conn = _connect()
    try:
        queries_json = json.dumps(search_queries) if search_queries else None
        conn.execute(
            """INSERT INTO topics (name, search_queries, schedule)
               VALUES (?, ?, ?)
               ON CONFLICT(name) DO UPDATE SET
                   search_queries = excluded.search_queries,
                   schedule = excluded.schedule,
                   updated_at = datetime('now')""",
            (name, queries_json, schedule),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM topics WHERE name = ?", (name,)
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


def remove_topic(name: str) -> bool:
    """Remove a topic from the watchlist. Returns True if found."""
    init_db()
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id FROM topics WHERE name = ?", (name,)
        ).fetchone()
        if not row:
            return False
        topic_id = row["id"]
        # Delete findings and runs for this topic
        conn.execute("DELETE FROM findings WHERE topic_id = ?", (topic_id,))
        conn.execute("DELETE FROM research_runs WHERE topic_id = ?", (topic_id,))
        conn.execute("DELETE FROM topics WHERE id = ?", (topic_id,))
        conn.commit()
        return True
    finally:
        conn.close()


def list_topics() -> List[Dict[str, Any]]:
    """List all topics with stats."""
    init_db()
    conn = _connect()
    try:
        rows = conn.execute(
            """SELECT t.*,
                      (SELECT COUNT(*) FROM findings WHERE topic_id = t.id) as finding_count,
                      (SELECT MAX(run_date) FROM research_runs WHERE topic_id = t.id) as last_run,
                      (SELECT status FROM research_runs WHERE topic_id = t.id
                       ORDER BY created_at DESC LIMIT 1) as last_status
               FROM topics t
               ORDER BY t.name"""
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_topic(name: str) -> Optional[Dict[str, Any]]:
    """Get a topic by name."""
    init_db()
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT * FROM topics WHERE name = ?", (name,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


# --- Research Runs ---


def record_run(
    topic_id: int,
    source_mode: str = "both",
    status: str = "completed",
    error_message: Optional[str] = None,
    duration_seconds: float = 0,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    token_cost: float = 0,
) -> int:
    """Record a research run. Returns the run ID."""
    conn = _connect()
    try:
        cursor = conn.execute(
            """INSERT INTO research_runs
               (topic_id, run_date, source_mode, status, error_message,
                duration_seconds, prompt_tokens, completion_tokens, token_cost)
               VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)""",
            (
                topic_id, source_mode, status, error_message,
                duration_seconds, prompt_tokens, completion_tokens, token_cost,
            ),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def update_run(run_id: int, **kwargs):
    """Update a research run's fields."""
    conn = _connect()
    try:
        invalid_columns = sorted(set(kwargs) - _UPDATABLE_RUN_COLUMNS)
        if invalid_columns:
            raise ValueError(
                f"Invalid run update fields: {', '.join(invalid_columns)}"
            )
        sets = ", ".join(f"{k} = ?" for k in kwargs)
        values = list(kwargs.values()) + [run_id]
        conn.execute(f"UPDATE research_runs SET {sets} WHERE id = ?", values)
        conn.commit()
    finally:
        conn.close()


# --- Findings ---


def store_findings(
    run_id: int,
    topic_id: int,
    findings: List[Dict[str, Any]],
) -> Dict[str, int]:
    """Store findings with URL-based dedup. Returns counts of new/updated."""
    # Collect findings that have a URL, preserving order.
    with_urls: List[tuple[str, Dict[str, Any]]] = []
    for f in findings:
        url = f.get("source_url") or f.get("url")
        if url:
            with_urls.append((url, f))

    if not with_urls:
        conn = _connect()
        try:
            conn.execute(
                "UPDATE research_runs SET findings_new = 0, findings_updated = 0 WHERE id = ?",
                (run_id,),
            )
            conn.commit()
        finally:
            conn.close()
        return {"new": 0, "updated": 0}

    conn = _connect()
    try:
        # Single batch SELECT to find existing findings by URL.
        urls = [url for url, _ in with_urls]
        placeholders = ",".join("?" for _ in urls)
        rows = conn.execute(
            f"SELECT id, source_url, engagement_score FROM findings WHERE source_url IN ({placeholders})",
            urls,
        ).fetchall()
        existing_by_url = {row["source_url"]: row for row in rows}

        update_rows: List[tuple] = []
        insert_rows: List[tuple] = []

        for url, f in with_urls:
            existing = existing_by_url.get(url)
            new_engagement = f.get("engagement_score", 0)
            if existing:
                update_rows.append((
                    max(new_engagement, existing["engagement_score"] or 0),
                    run_id,
                    existing["id"],
                ))
            else:
                insert_rows.append((
                    run_id,
                    topic_id,
                    f.get("source", "unknown"),
                    url,
                    f.get("source_title") or f.get("title", ""),
                    f.get("author", ""),
                    f.get("content") or f.get("text", ""),
                    f.get("summary", ""),
                    new_engagement,
                    f.get("relevance_score", 0),
                ))

        if update_rows:
            conn.executemany(
                """UPDATE findings SET
                       last_seen = datetime('now'),
                       sighting_count = sighting_count + 1,
                       engagement_score = ?,
                       run_id = ?
                   WHERE id = ?""",
                update_rows,
            )
        if insert_rows:
            conn.executemany(
                """INSERT INTO findings
                   (run_id, topic_id, source, source_url, source_title,
                    author, content, summary, engagement_score, relevance_score)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                insert_rows,
            )

        new_count = len(insert_rows)
        updated_count = len(update_rows)
        conn.execute(
            "UPDATE research_runs SET findings_new = ?, findings_updated = ? WHERE id = ?",
            (new_count, updated_count, run_id),
        )
        conn.commit()
    finally:
        conn.close()

    return {"new": new_count, "updated": updated_count}


def get_new_findings(
    topic_id: int,
    since: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get findings for a topic, optionally since a date."""
    conn = _connect()
    try:
        if since:
            rows = conn.execute(
                """SELECT * FROM findings
                   WHERE topic_id = ? AND first_seen >= ? AND dismissed = 0
                   ORDER BY first_seen DESC""",
                (topic_id, since),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM findings
                   WHERE topic_id = ? AND dismissed = 0
                   ORDER BY first_seen DESC""",
                (topic_id,),
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def search_findings(query: str, limit: int = 20) -> List[Dict[str, Any]]:
    """FTS5 search across all findings with BM25 ranking."""
    conn = _connect()
    try:
        rows = conn.execute(
            """SELECT f.*, bm25(findings_fts) as rank, t.name as topic_name
               FROM findings_fts
               JOIN findings f ON f.id = findings_fts.rowid
               LEFT JOIN topics t ON t.id = f.topic_id
               WHERE findings_fts MATCH ?
               ORDER BY rank
               LIMIT ?""",
            (query, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def update_finding(finding_id: int, **kwargs):
    """Update a finding's fields."""
    conn = _connect()
    try:
        invalid_columns = sorted(set(kwargs) - _UPDATABLE_FINDING_COLUMNS)
        if invalid_columns:
            raise ValueError(
                f"Invalid finding update fields: {', '.join(invalid_columns)}"
            )
        sets = ", ".join(f"{k} = ?" for k in kwargs)
        values = list(kwargs.values()) + [finding_id]
        conn.execute(f"UPDATE findings SET {sets} WHERE id = ?", values)
        conn.commit()
    finally:
        conn.close()


def delete_finding(finding_id: int):
    """Delete a finding."""
    conn = _connect()
    try:
        conn.execute("DELETE FROM findings WHERE id = ?", (finding_id,))
        conn.commit()
    finally:
        conn.close()


def dismiss_finding(finding_id: int):
    """Mark a finding as dismissed."""
    update_finding(finding_id, dismissed=1)


# --- Cost Tracking ---


def get_daily_cost(date: Optional[str] = None) -> float:
    """Get total token cost for a given day (default: today)."""
    conn = _connect()
    try:
        if not date:
            date = datetime.now().strftime("%Y-%m-%d")
        row = conn.execute(
            """SELECT COALESCE(SUM(token_cost), 0) as total
               FROM research_runs
               WHERE date(run_date) = date(?)""",
            (date,),
        ).fetchone()
        return row["total"]
    finally:
        conn.close()


# --- Settings ---


def get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    """Get a setting value."""
    init_db()
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT value FROM settings WHERE key = ?", (key,)
        ).fetchone()
        return row["value"] if row else default
    finally:
        conn.close()


def set_setting(key: str, value: str):
    """Set a setting value."""
    init_db()
    conn = _connect()
    try:
        conn.execute(
            """INSERT INTO settings (key, value, updated_at)
               VALUES (?, ?, datetime('now'))
               ON CONFLICT(key) DO UPDATE SET
                   value = excluded.value,
                   updated_at = datetime('now')""",
            (key, value),
        )
        conn.commit()
    finally:
        conn.close()


# --- Stats ---


def get_stats() -> Dict[str, Any]:
    """Get overall database stats."""
    conn = _connect()
    try:
        topic_count = conn.execute("SELECT COUNT(*) FROM topics WHERE enabled = 1").fetchone()[0]
        finding_count = conn.execute("SELECT COUNT(*) FROM findings").fetchone()[0]

        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        runs_7d = conn.execute(
            "SELECT COUNT(*) FROM research_runs WHERE run_date >= ?", (week_ago,)
        ).fetchone()[0]
        successful_7d = conn.execute(
            "SELECT COUNT(*) FROM research_runs WHERE run_date >= ? AND status = 'completed'",
            (week_ago,),
        ).fetchone()[0]
        failed_7d = conn.execute(
            "SELECT COUNT(*) FROM research_runs WHERE run_date >= ? AND status = 'failed'",
            (week_ago,),
        ).fetchone()[0]
        cost_7d = conn.execute(
            "SELECT COALESCE(SUM(token_cost), 0) FROM research_runs WHERE run_date >= ?",
            (week_ago,),
        ).fetchone()[0]

        # Source breakdown
        sources = {}
        for row in conn.execute(
            "SELECT source, COUNT(*) as cnt FROM findings GROUP BY source"
        ).fetchall():
            sources[row["source"]] = row["cnt"]

        db_path = _get_db_path()
        db_size = db_path.stat().st_size if db_path.exists() else 0

        return {
            "topics_active": topic_count,
            "total_findings": finding_count,
            "db_size_bytes": db_size,
            "runs_7d": runs_7d,
            "successful_7d": successful_7d,
            "failed_7d": failed_7d,
            "cost_7d": cost_7d,
            "sources": sources,
            "daily_budget": get_setting("daily_budget", "5.00"),
        }
    finally:
        conn.close()


def get_trending(days: int = 7) -> List[Dict[str, Any]]:
    """Get topics ranked by recent finding activity."""
    conn = _connect()
    try:
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        rows = conn.execute(
            """SELECT t.name, t.id,
                      COUNT(f.id) as new_findings,
                      COALESCE(SUM(f.engagement_score), 0) as total_engagement
               FROM topics t
               LEFT JOIN findings f ON f.topic_id = t.id AND f.first_seen >= ?
               WHERE t.enabled = 1
               GROUP BY t.id
               ORDER BY new_findings DESC""",
            (since,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def finding_from_candidate(candidate: schema.Candidate) -> Dict[str, Any]:
    """Convert a ranked candidate into a persisted finding."""
    primary_item = schema.candidate_primary_item(candidate)
    corroborating_sources = [
        source for source in schema.candidate_sources(candidate)
        if source and source != candidate.source
    ]
    summary = candidate.explanation or candidate.snippet or ""
    if corroborating_sources:
        prefix = f"Also seen in: {', '.join(corroborating_sources)}."
        summary = f"{prefix} {summary}".strip()
    body = (
        primary_item.body
        if primary_item and primary_item.body
        else candidate.snippet or candidate.title
    )
    author = primary_item.author if primary_item and primary_item.author else ""
    return {
        "source": candidate.source or "unknown",
        "source_url": candidate.url,
        "source_title": candidate.title,
        "author": author,
        "content": body,
        "summary": summary,
        "engagement_score": candidate.engagement or 0,
        "relevance_score": candidate.final_score or candidate.rerank_score or candidate.local_relevance,
    }


def findings_from_report(
    report: schema.Report,
    *,
    limit: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Convert report into persisted findings.

    Uses ranked candidates (post-rerank) when available for quality scores and explanations.
    Supplements with raw items from items_by_source for HN/PM that didn't rank highly
    but are valuable for watchlist persistence.
    """
    findings = []
    seen_urls = set()

    # Phase 1: Process ranked candidates (high-quality data with explanations and corroboration)
    for candidate in report.ranked_candidates:
        finding = finding_from_candidate(candidate)
        findings.append(finding)
        seen_urls.add(candidate.url)

    # Phase 2: Add HN/PM items not already captured in ranked candidates
    for source_name in ["hackernews", "polymarket"]:
        if source_name not in report.items_by_source:
            continue
        for item in report.items_by_source[source_name]:
            if item.url in seen_urls:
                continue  # Already captured with rich data
            findings.append({
                "source": source_name,
                "source_url": item.url,
                "source_title": item.title,
                "author": item.author or "",
                "content": item.body or "",
                "summary": item.snippet or (item.body[:500] if item.body else ""),
                "engagement_score": item.engagement_score or 0.0,
                "relevance_score": item.local_relevance or 0.5,
            })
            seen_urls.add(item.url)

    # Apply global limit after collecting all findings (fix: was per-source, now global)
    return findings[:limit] if limit is not None else findings


# --- CLI interface ---


def _cli_query(args):
    """Handle CLI query command."""
    topic = get_topic(args.topic)
    if not topic:
        print(json.dumps({"error": f"Topic not found: {args.topic}"}))
        return

    since = None
    if args.since:
        # Parse duration like "7d", "30d"
        days = int(args.since.rstrip("d"))
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    findings = get_new_findings(topic["id"], since)
    print(json.dumps({"topic": topic["name"], "findings": findings, "count": len(findings)}, default=str))


def _cli_search(args):
    """Handle CLI search command."""
    results = search_findings(args.query, limit=args.limit)
    print(json.dumps({"query": args.query, "results": results, "count": len(results)}, default=str))


def _cli_trending(args):
    """Handle CLI trending command."""
    results = get_trending(args.days)
    print(json.dumps({"trending": results}, default=str))


def _cli_stats(args):
    """Handle CLI stats command."""
    stats = get_stats()
    print(json.dumps(stats, default=str))


def main():
    parser = argparse.ArgumentParser(description="Query the last30days research database")
    sub = parser.add_subparsers(dest="command")

    # query
    q = sub.add_parser("query", help="Query findings for a topic")
    q.add_argument("topic", help="Topic name")
    q.add_argument("--since", help="Duration like '7d' or '30d'")
    q.set_defaults(func=_cli_query)

    # search
    s = sub.add_parser("search", help="Full-text search across findings")
    s.add_argument("query", help="Search query")
    s.add_argument("--limit", type=int, default=20, help="Max results")
    s.set_defaults(func=_cli_search)

    # trending
    t = sub.add_parser("trending", help="Show trending topics")
    t.add_argument("--days", type=int, default=7, help="Look back N days")
    t.set_defaults(func=_cli_trending)

    # stats
    st = sub.add_parser("stats", help="Show database stats")
    st.set_defaults(func=_cli_stats)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    # Ensure DB exists
    init_db()
    args.func(args)


if __name__ == "__main__":
    main()
