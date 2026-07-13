#!/usr/bin/env python3
"""Morning briefing generator for last30days.

Synthesizes accumulated findings into formatted briefings.
The Python script collects the data; the agent (via SKILL.md) does the
beautiful synthesis. This script provides the structured data.

Usage:
    python3 briefing.py generate              # Daily briefing data
    python3 briefing.py generate --weekly     # Weekly digest data
    python3 briefing.py show [--date DATE]    # Show saved briefing
"""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
sys.path.insert(0, str(SCRIPT_DIR))

import store

BRIEFS_DIR = Path.home() / ".local" / "share" / "last30days" / "briefs"


def _parse_sqlite_utc_timestamp(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)


def generate_daily(since: str = None) -> dict:
    """Generate daily briefing data.

    Returns structured data for the agent to synthesize into a beautiful briefing.
    """
    store.init_db()
    topics = store.list_topics()

    if not topics:
        return {
            "status": "no_topics",
            "message": "No watchlist topics yet. Add one with: last30days watch add \"your topic\"",
        }

    enabled = [t for t in topics if t["enabled"]]
    if not enabled:
        return {
            "status": "no_enabled",
            "message": "All topics are paused. Enable a topic to generate briefings.",
        }

    # Default: findings since yesterday
    if not since:
        since = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    briefing_topics = []
    total_new = 0

    for topic in enabled:
        findings = store.get_new_findings(topic["id"], since)
        last_run = topic.get("last_run")
        last_status = topic.get("last_status", "unknown")

        # Calculate staleness
        stale = False
        hours_ago = None
        if last_run:
            try:
                run_dt = _parse_sqlite_utc_timestamp(last_run)
                hours_ago = (datetime.now(timezone.utc) - run_dt).total_seconds() / 3600
                stale = hours_ago > 36  # Stale if > 36 hours
            except (ValueError, TypeError):
                stale = True

        topic_data = {
            "name": topic["name"],
            "findings": findings,
            "new_count": len(findings),
            "last_run": last_run,
            "last_status": last_status,
            "stale": stale,
            "hours_ago": round(hours_ago, 1) if hours_ago else None,
        }

        # Extract top finding by engagement
        if findings:
            top = max(findings, key=lambda f: f.get("engagement_score", 0))
            topic_data["top_finding"] = {
                "title": top.get("source_title", ""),
                "source": top.get("source", ""),
                "author": top.get("author", ""),
                "engagement": top.get("engagement_score", 0),
                "content": top.get("content", "")[:300],
            }

        briefing_topics.append(topic_data)
        total_new += len(findings)

    # Cost info
    daily_cost = store.get_daily_cost()
    budget = float(store.get_setting("daily_budget", "5.00"))

    # Find the single top finding across all topics (for TL;DR)
    all_findings = []
    for t in briefing_topics:
        for f in t["findings"]:
            f["_topic"] = t["name"]
            all_findings.append(f)

    top_overall = None
    if all_findings:
        top_overall = max(all_findings, key=lambda f: f.get("engagement_score", 0))

    result = {
        "status": "ok",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "since": since,
        "topics": briefing_topics,
        "total_new": total_new,
        "total_topics": len(briefing_topics),
        "top_finding": {
            "title": top_overall.get("source_title", ""),
            "topic": top_overall.get("_topic", ""),
            "engagement": top_overall.get("engagement_score", 0),
        } if top_overall else None,
        "cost": {
            "daily": daily_cost,
            "budget": budget,
        },
        "failed_topics": [
            t["name"] for t in briefing_topics if t["last_status"] == "failed"
        ],
    }

    # Save briefing data
    _save_briefing(result)

    return result


def generate_weekly() -> dict:
    """Generate weekly digest data with trend analysis."""
    store.init_db()

    week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    two_weeks_ago = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d")

    topics = store.list_topics()
    if not topics:
        return {"status": "no_topics", "message": "No watchlist topics."}

    weekly_topics = []

    for topic in topics:
        if not topic["enabled"]:
            continue

        # This week's findings
        this_week = store.get_new_findings(topic["id"], week_ago)

        # Last week's findings (for comparison)
        conn = store._connect()
        try:
            last_week_rows = conn.execute(
                """SELECT * FROM findings
                   WHERE topic_id = ? AND first_seen >= ? AND first_seen < ? AND dismissed = 0
                   ORDER BY engagement_score DESC""",
                (topic["id"], two_weeks_ago, week_ago),
            ).fetchall()
            last_week = [dict(r) for r in last_week_rows]
        finally:
            conn.close()

        this_engagement = sum(f.get("engagement_score", 0) for f in this_week)
        last_engagement = sum(f.get("engagement_score", 0) for f in last_week)

        # Trend calculation
        if last_engagement > 0:
            engagement_change = ((this_engagement - last_engagement) / last_engagement) * 100
        else:
            engagement_change = 100 if this_engagement > 0 else 0

        weekly_topics.append({
            "name": topic["name"],
            "this_week_count": len(this_week),
            "last_week_count": len(last_week),
            "this_week_engagement": this_engagement,
            "last_week_engagement": last_engagement,
            "engagement_change_pct": round(engagement_change, 1),
            "top_findings": this_week[:5],  # Top 5 by engagement (already sorted)
        })

    result = {
        "status": "ok",
        "type": "weekly",
        "week_of": week_ago,
        "topics": weekly_topics,
    }

    _save_briefing(result, suffix="-weekly")

    return result


def show_briefing(date: str = None) -> dict:
    """Load a saved briefing by date."""
    if not date:
        date = datetime.now().strftime("%Y-%m-%d")

    path = BRIEFS_DIR / f"{date}.json"
    if not path.exists():
        # Try weekly
        path = BRIEFS_DIR / f"{date}-weekly.json"

    if not path.exists():
        return {"status": "not_found", "message": f"No briefing found for {date}."}

    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save_briefing(data: dict, suffix: str = ""):
    """Save briefing data to local archive."""
    BRIEFS_DIR.mkdir(parents=True, exist_ok=True)
    date = datetime.now().strftime("%Y-%m-%d")
    path = BRIEFS_DIR / f"{date}{suffix}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)


def main():
    parser = argparse.ArgumentParser(description="Generate last30days briefings")
    sub = parser.add_subparsers(dest="command")

    # generate
    g = sub.add_parser("generate", help="Generate a briefing")
    g.add_argument("--weekly", action="store_true", help="Weekly digest")
    g.add_argument("--since", help="Findings since date (YYYY-MM-DD)")

    # show
    s = sub.add_parser("show", help="Show a saved briefing")
    s.add_argument("--date", help="Date (YYYY-MM-DD, default: today)")

    args = parser.parse_args()

    if args.command == "generate":
        if args.weekly:
            result = generate_weekly()
        else:
            result = generate_daily(since=args.since)
        print(json.dumps(result, indent=2, default=str))

    elif args.command == "show":
        result = show_briefing(date=args.date)
        print(json.dumps(result, indent=2, default=str))

    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
