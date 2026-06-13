"""xAI API client for X (Twitter) discovery."""

import json
import re
import sys
from typing import Any, Dict, List, Optional

from . import http, log


def _safe_text(val) -> str:
    """Extract text from string or localized object."""
    if isinstance(val, str):
        return val
    if isinstance(val, dict):
        return str(val.get("text", val.get("en", "")))
    return str(val) if val is not None else ""


def _log(msg: str):
    log.source_log("xAI", msg, tty_only=False)


def _log_error(msg: str):
    log.source_log("xAI ERROR", msg, tty_only=False)

# xAI uses responses endpoint with Agent Tools API
XAI_RESPONSES_URL = "https://api.x.ai/v1/responses"

# Depth configurations: (min, max) posts to request
DEPTH_CONFIG = {
    "quick": (8, 12),
    "default": (20, 30),
    "deep": (40, 60),
}

X_SEARCH_PROMPT = """You have access to real-time X (Twitter) data. Search for posts about: {topic}

Focus on posts from {from_date} to {to_date}. Find {min_items}-{max_items} high-quality, relevant posts.

IMPORTANT: Return ONLY valid JSON in this exact format, no other text:
{{
  "items": [
    {{
      "text": "Post text content (truncated if long)",
      "url": "https://x.com/user/status/...",
      "author_handle": "username",
      "date": "YYYY-MM-DD or null if unknown",
      "engagement": {{
        "likes": 100,
        "reposts": 25,
        "replies": 15,
        "quotes": 5
      }},
      "why_relevant": "Brief explanation of relevance",
      "relevance": 0.85
    }}
  ]
}}

Rules:
- relevance is 0.0 to 1.0 (1.0 = highly relevant)
- date must be YYYY-MM-DD format or null
- engagement can be null if unknown
- Include diverse voices/accounts if applicable
- Prefer posts with substantive content, not just links"""


def search_x(
    api_key: str,
    model: str,
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
    mock_response: Optional[Dict] = None,
) -> Dict[str, Any]:
    """Search X for relevant posts using xAI API with live search.

    Args:
        api_key: xAI API key
        model: Model to use
        topic: Search topic
        from_date: Start date (YYYY-MM-DD)
        to_date: End date (YYYY-MM-DD)
        depth: Research depth - "quick", "default", or "deep"
        mock_response: Mock response for testing

    Returns:
        Raw API response
    """
    if mock_response is not None:
        return mock_response

    min_items, max_items = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # Adjust timeout based on depth (generous for API response time)
    timeout = 90 if depth == "quick" else 120 if depth == "default" else 180

    # Use Agent Tools API with x_search tool (native date filtering)
    payload = {
        "model": model,
        "tools": [
            {"type": "x_search", "from_date": from_date, "to_date": to_date}
        ],
        "input": [
            {
                "role": "user",
                "content": X_SEARCH_PROMPT.format(
                    topic=topic,
                    from_date=from_date,
                    to_date=to_date,
                    min_items=min_items,
                    max_items=max_items,
                ),
            }
        ],
    }

    return http.post(XAI_RESPONSES_URL, payload, headers=headers, timeout=timeout)


def parse_x_response(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Parse xAI response to extract X items.

    Args:
        response: Raw API response

    Returns:
        List of item dicts
    """
    items = []

    # Check for API errors first
    if "error" in response and response["error"]:
        error = response["error"]
        err_msg = error.get("message", str(error)) if isinstance(error, dict) else str(error)
        _log_error(f"xAI API error: {err_msg}")
        if http.DEBUG:
            _log_error(f"Full error response: {json.dumps(response, indent=2)[:1000]}")
        return items

    # Try to find the output text
    output_text = ""
    if "output" in response:
        output = response["output"]
        if isinstance(output, str):
            output_text = output
        elif isinstance(output, list):
            for item in output:
                if isinstance(item, dict):
                    if item.get("type") == "message":
                        content = item.get("content", [])
                        for c in content:
                            if isinstance(c, dict) and c.get("type") == "output_text":
                                output_text = c.get("text", "")
                                break
                    elif "text" in item:
                        output_text = item["text"]
                elif isinstance(item, str):
                    output_text = item
                if output_text:
                    break

    # Also check for choices (older format)
    if not output_text and "choices" in response:
        for choice in response["choices"]:
            if "message" in choice:
                output_text = choice["message"].get("content", "")
                break

    if not output_text:
        return items

    # Extract JSON from the response
    json_match = re.search(r'\{[\s\S]*"items"[\s\S]*\}', output_text)
    if json_match:
        try:
            data = json.loads(json_match.group())
            items = data.get("items", [])
        except json.JSONDecodeError:
            _log(f"Failed to parse xAI response JSON: {output_text[:200]}")

    # Validate and clean items
    clean_items = []
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            continue

        url = item.get("url", "")
        if not url:
            continue

        # Parse engagement
        engagement = None
        eng_raw = item.get("engagement")
        if isinstance(eng_raw, dict):
            engagement = {
                "likes": int(eng_raw["likes"]) if eng_raw.get("likes") is not None else None,
                "reposts": int(eng_raw["reposts"]) if eng_raw.get("reposts") is not None else None,
                "replies": int(eng_raw["replies"]) if eng_raw.get("replies") is not None else None,
                "quotes": int(eng_raw["quotes"]) if eng_raw.get("quotes") is not None else None,
            }

        clean_item = {
            "id": f"X{i+1}",
            "text": _safe_text(item.get("text", "")).strip()[:500],  # Truncate long text
            "url": url,
            "author_handle": _safe_text(item.get("author_handle", "")).strip().lstrip("@"),
            "date": item.get("date"),
            "engagement": engagement,
            "why_relevant": _safe_text(item.get("why_relevant", "")).strip(),
            "relevance": min(1.0, max(0.0, float(item.get("relevance", 0.5)))),
        }

        # Validate date format
        if clean_item["date"]:
            if not re.match(r'^\d{4}-\d{2}-\d{2}$', str(clean_item["date"])):
                clean_item["date"] = None

        clean_items.append(clean_item)

    return clean_items
