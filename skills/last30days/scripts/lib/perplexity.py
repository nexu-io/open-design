"""Perplexity Sonar Pro / Deep Research via OpenRouter API.

Queries Perplexity models through OpenRouter for AI-synthesized research
with citation annotations. Returns normalized items with synthesis text
and individual citation entries.
"""

from __future__ import annotations

import sys
from urllib.parse import urlparse

from . import http, log


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

MODEL_SONAR_PRO = "perplexity/sonar-pro"
MODEL_DEEP_RESEARCH = "perplexity/sonar-deep-research"


def _log(msg: str):
    log.source_log("Perplexity", msg)


def _domain(url: str) -> str:
    return urlparse(url).netloc.strip().lower()


def search(
    query: str,
    date_range: tuple[str, str],
    config: dict,
    deep: bool = False,
) -> tuple[list[dict], dict]:
    """Search via Perplexity Sonar Pro or Deep Research through OpenRouter.

    Args:
        query: Search topic
        date_range: (from_date, to_date) as YYYY-MM-DD strings
        config: Must contain OPENROUTER_API_KEY
        deep: Use Deep Research model (~$0.90/query) instead of Sonar Pro

    Returns:
        Tuple of (items list, artifact dict).
    """
    api_key = config.get("OPENROUTER_API_KEY")
    if not api_key:
        _log("No OPENROUTER_API_KEY configured, skipping")
        return [], {}

    from_date, to_date = date_range
    model = MODEL_DEEP_RESEARCH if deep else MODEL_SONAR_PRO
    timeout = 120 if deep else 30

    if deep:
        print("[Perplexity] Using Deep Research (~$0.90/query)", file=sys.stderr)

    prompt = (
        f"What has been happening with {query} between {from_date} and {to_date}? "
        "Include specific dates, names, numbers, and sources."
    )

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    json_data = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
    }

    _log(f"Querying {model} for '{query}' ({from_date} to {to_date})")

    try:
        data = http.post(OPENROUTER_URL, json_data, headers=headers, timeout=timeout)
    except http.HTTPError as e:
        if e.status_code == 401:
            _log("Invalid OpenRouter API key (401)")
        elif e.status_code == 429:
            _log("Rate limited by OpenRouter (429)")
        else:
            _log(f"HTTP error: {e}")
        return [], {}
    except Exception as e:
        _log(f"Request failed: {e}")
        return [], {}

    # Parse response
    choices = data.get("choices", [])
    if not choices:
        _log("No choices in response")
        return [], {}

    synthesis = choices[0].get("message", {}).get("content", "")
    if not synthesis:
        _log("Empty synthesis content")
        return [], {}

    # Extract citations from annotations
    annotations = choices[0].get("message", {}).get("annotations", [])
    citations = []
    for ann in annotations:
        url_citation = ann.get("url_citation", {})
        url = url_citation.get("url", "")
        title = url_citation.get("title", "")
        if url:
            citations.append({"url": url, "title": title})

    # Deduplicate citations by URL
    seen_urls = set()
    unique_citations = []
    for c in citations:
        if c["url"] not in seen_urls:
            seen_urls.add(c["url"])
            unique_citations.append(c)
    citations = unique_citations

    _log(f"Got synthesis ({len(synthesis)} chars) with {len(citations)} citations")

    # Build items list
    items = []

    # Primary item: the synthesis itself
    snippet = synthesis[:2000]
    items.append({
        "id": "PX1",
        "title": f"Perplexity {'Deep Research' if deep else 'Sonar Pro'}: {query}",
        "url": "",
        "source_domain": "perplexity.ai",
        "snippet": snippet,
        "date": to_date,
        "relevance": 0.9,
        "why_relevant": f"AI synthesis of recent activity for '{query}'",
        "engagement": {"citations": len(citations)},
        "metadata": {"citations": citations},
    })

    # Individual items for each citation
    for i, cit in enumerate(citations):
        items.append({
            "id": f"PX{i + 2}",
            "title": cit["title"] or _domain(cit["url"]),
            "url": cit["url"],
            "source_domain": _domain(cit["url"]),
            "snippet": "",
            "date": None,
            "relevance": 0.7,
            "why_relevant": f"Cited in Perplexity synthesis for '{query}'",
            "engagement": {"citations": 1},
            "metadata": {"citations": [cit]},
        })

    artifact = {
        "label": "perplexity",
        "model": model,
        "deep": deep,
        "query": query,
        "synthesisLength": len(synthesis),
        "citationCount": len(citations),
    }

    return items, artifact
