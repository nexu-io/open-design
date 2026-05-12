"""Static provider catalog and runtime client implementations."""

from __future__ import annotations

import json
import re
import sys
from typing import Any

from . import env, http, schema

GEMINI_FLASH_LITE = "gemini-3.1-flash-lite-preview"
GEMINI_PRO = "gemini-3.1-pro-preview"
OPENAI_DEFAULT = "gpt-5.4-nano"
XAI_DEFAULT = "grok-4-1-fast"

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses"
XAI_RESPONSES_URL = "https://api.x.ai/v1/responses"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_DEFAULT = "google/gemini-flash-2.0"


class ReasoningClient:
    """Shared interface for planner and rerank providers."""

    name: str

    def generate_text(
        self,
        model: str,
        prompt: str,
        *,
        tools: list[dict[str, Any]] | None = None,
        response_mime_type: str | None = None,
    ) -> str:
        raise NotImplementedError

    def generate_json(
        self,
        model: str,
        prompt: str,
        *,
        tools: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        text = self.generate_text(model, prompt, tools=tools, response_mime_type="application/json")
        return extract_json(text)


class GeminiClient(ReasoningClient):
    name = "gemini"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def _generate_content(
        self,
        model: str,
        prompt: str,
        *,
        tools: list[dict[str, Any]] | None = None,
        response_mime_type: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0},
        }
        if response_mime_type:
            body["generationConfig"]["responseMimeType"] = response_mime_type
        if tools:
            body["tools"] = tools
        return http.post(
            GEMINI_URL.format(model=model, api_key=self.api_key),
            body,
            headers={"Content-Type": "application/json"},
            timeout=90,
        )

    def generate_text(
        self,
        model: str,
        prompt: str,
        *,
        tools: list[dict[str, Any]] | None = None,
        response_mime_type: str | None = None,
    ) -> str:
        payload = self._generate_content(
            model,
            prompt,
            tools=tools,
            response_mime_type=response_mime_type,
        )
        return extract_gemini_text(payload)

class OpenAIClient(ReasoningClient):
    name = "openai"

    def __init__(self, token: str, auth_source: str, account_id: str | None):
        self.token = token
        self.auth_source = auth_source
        self.account_id = account_id

    def generate_text(
        self,
        model: str,
        prompt: str,
        *,
        tools: list[dict[str, Any]] | None = None,
        response_mime_type: str | None = None,
    ) -> str:
        del tools, response_mime_type
        if self.auth_source == env.AUTH_SOURCE_CODEX:
            payload = {
                "model": model,
                "stream": True,
                "store": False,
                "input": [
                    {
                        "type": "message",
                        "role": "user",
                        "content": [{"type": "input_text", "text": prompt}],
                    }
                ],
            }
            headers = {
                "Authorization": f"Bearer {self.token}",
                "chatgpt-account-id": self.account_id or "",
                "OpenAI-Beta": "responses=experimental",
                "originator": "pi",
                "Content-Type": "application/json",
            }
            raw = http.post_raw(CODEX_RESPONSES_URL, payload, headers=headers, timeout=90)
            return extract_openai_text(_parse_codex_stream(raw))

        payload = {
            "model": model,
            "store": False,
            "input": prompt,
            "temperature": 0,
        }
        response = http.post(
            OPENAI_RESPONSES_URL,
            payload,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
            },
            timeout=90,
        )
        return extract_openai_text(response)


class XAIClient(ReasoningClient):
    name = "xai"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def generate_text(
        self,
        model: str,
        prompt: str,
        *,
        tools: list[dict[str, Any]] | None = None,
        response_mime_type: str | None = None,
    ) -> str:
        del tools, response_mime_type
        payload = {
            "model": model,
            "input": [{"role": "user", "content": prompt}],
        }
        response = http.post(
            XAI_RESPONSES_URL,
            payload,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=90,
        )
        return extract_openai_text(response)


class OpenRouterClient(ReasoningClient):
    name = "openrouter"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def generate_text(
        self,
        model: str,
        prompt: str,
        *,
        tools: list[dict[str, Any]] | None = None,
        response_mime_type: str | None = None,
    ) -> str:
        del tools, response_mime_type
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
        }
        response = http.post(
            OPENROUTER_URL,
            payload,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=90,
        )
        return extract_openai_text(response)


_MODEL_DEFAULTS: dict[str, tuple[str, str]] = {
    "gemini": (GEMINI_FLASH_LITE, GEMINI_FLASH_LITE),
    "openai": (OPENAI_DEFAULT, OPENAI_DEFAULT),
    "xai": (XAI_DEFAULT, XAI_DEFAULT),
    "openrouter": (OPENROUTER_DEFAULT, OPENROUTER_DEFAULT),
}


def _resolve_model_pins(config: dict[str, Any], depth: str, provider_name: str) -> tuple[str, str, str]:
    """Resolve planner, rerank, and grounding model pins for a provider."""
    default_planner, default_rerank = _MODEL_DEFAULTS.get(provider_name, (GEMINI_FLASH_LITE, GEMINI_FLASH_LITE))
    if depth == "deep" and provider_name == "gemini":
        default_rerank = GEMINI_PRO

    planner_model = config.get("LAST30DAYS_PLANNER_MODEL") or default_planner
    rerank_model = config.get("LAST30DAYS_RERANK_MODEL") or default_rerank

    if provider_name == "gemini":
        _require_gemini_31_preview(planner_model, role="planner")
        _require_gemini_31_preview(rerank_model, role="rerank")

    return planner_model, rerank_model


def mock_runtime(config: dict[str, Any], depth: str) -> schema.ProviderRuntime:
    """Resolve model pins for mock mode without requiring live credentials."""
    provider_name = (config.get("LAST30DAYS_REASONING_PROVIDER") or "gemini").lower()
    if provider_name == "auto":
        provider_name = "gemini"
    if provider_name not in _MODEL_DEFAULTS:
        raise RuntimeError(f"Unsupported reasoning provider: {provider_name}")

    planner_model, rerank_model = _resolve_model_pins(config, depth, provider_name)
    return schema.ProviderRuntime(
        reasoning_provider=provider_name,
        planner_model=planner_model,
        rerank_model=rerank_model,

        x_search_backend=_resolve_x_backend(config),
    )


def resolve_runtime(config: dict[str, Any], depth: str) -> tuple[schema.ProviderRuntime, ReasoningClient | None]:
    """Resolve the reasoning provider and pinned models."""
    provider_name = (config.get("LAST30DAYS_REASONING_PROVIDER") or "auto").lower()
    google_key = config.get("GOOGLE_API_KEY") or config.get("GEMINI_API_KEY") or config.get("GOOGLE_GENAI_API_KEY")
    openai_token = config.get("OPENAI_API_KEY")
    xai_key = config.get("XAI_API_KEY")

    if provider_name == "auto":
        if google_key:
            provider_name = "gemini"
        elif openai_token and config.get("OPENAI_AUTH_STATUS") == env.AUTH_STATUS_OK:
            provider_name = "openai"
        elif xai_key:
            provider_name = "xai"
        elif config.get("OPENROUTER_API_KEY"):
            provider_name = "openrouter"
        else:
            return schema.ProviderRuntime(
                reasoning_provider="local",
                planner_model="deterministic",
                rerank_model="local-score",
                x_search_backend=_resolve_x_backend(config),
            ), None

    planner_model, rerank_model = _resolve_model_pins(config, depth, provider_name)

    if provider_name == "gemini":
        if not google_key:
            raise RuntimeError("Gemini selected but no Google API key is configured.")
        runtime = schema.ProviderRuntime(
            reasoning_provider="gemini",
            planner_model=planner_model,
            rerank_model=rerank_model,

            x_search_backend=_resolve_x_backend(config),
        )
        return runtime, GeminiClient(google_key)

    if provider_name == "openai":
        if not openai_token or config.get("OPENAI_AUTH_STATUS") != env.AUTH_STATUS_OK:
            raise RuntimeError("OpenAI selected but no valid OpenAI auth is configured.")
        runtime = schema.ProviderRuntime(
            reasoning_provider="openai",
            planner_model=planner_model,
            rerank_model=rerank_model,

            x_search_backend=_resolve_x_backend(config),
        )
        return runtime, OpenAIClient(
            openai_token,
            config.get("OPENAI_AUTH_SOURCE") or env.AUTH_SOURCE_API_KEY,
            config.get("OPENAI_CHATGPT_ACCOUNT_ID"),
        )

    if provider_name == "xai":
        if not xai_key:
            raise RuntimeError("xAI selected but XAI_API_KEY is not configured.")
        runtime = schema.ProviderRuntime(
            reasoning_provider="xai",
            planner_model=planner_model,
            rerank_model=rerank_model,

            x_search_backend=_resolve_x_backend(config),
        )
        return runtime, XAIClient(xai_key)

    if provider_name == "openrouter":
        openrouter_key = config.get("OPENROUTER_API_KEY")
        if not openrouter_key:
            raise RuntimeError("OpenRouter selected but OPENROUTER_API_KEY is not configured.")
        runtime = schema.ProviderRuntime(
            reasoning_provider="openrouter",
            planner_model=planner_model,
            rerank_model=rerank_model,
            x_search_backend=_resolve_x_backend(config),
        )
        return runtime, OpenRouterClient(openrouter_key)

    raise RuntimeError(f"Unsupported reasoning provider: {provider_name}")


def _resolve_x_backend(config: dict[str, Any]) -> str | None:
    preferred = (config.get("LAST30DAYS_X_BACKEND") or "").lower()
    if preferred in {"xai", "bird"}:
        return preferred
    return env.get_x_source(config)


def _require_gemini_31_preview(model: str, *, role: str) -> None:
    if model.startswith("gemini-3.1-") and model.endswith("-preview"):
        return
    raise RuntimeError(
        f"{role} must use a Gemini 3.1 preview model. Got: {model}"
    )


def extract_json(text: str) -> dict[str, Any]:
    """Extract the first JSON object from a model response."""
    text = text.strip()
    if not text:
        raise ValueError("Expected JSON response, got empty text")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            raise
        return json.loads(match.group(0))


def extract_gemini_text(payload: dict[str, Any]) -> str:
    for candidate in payload.get("candidates", []):
        content = candidate.get("content") or {}
        for part in content.get("parts", []):
            text = part.get("text")
            if text:
                return text
    if payload:
        print(f"[Providers] extract_gemini_text: no text in payload keys: {list(payload.keys())}", file=sys.stderr)
    return ""


def extract_openai_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    output = payload.get("output") or payload.get("choices") or []
    for item in output:
        if isinstance(item, str):
            return item
        if isinstance(item, dict):
            if isinstance(item.get("text"), str):
                return item["text"]
            content = item.get("content") or []
            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and isinstance(part.get("text"), str):
                        return part["text"]
                    if isinstance(part, dict) and part.get("type") == "output_text" and isinstance(part.get("text"), str):
                        return part["text"]
            message = item.get("message") or {}
            if isinstance(message, dict) and isinstance(message.get("content"), str):
                return message["content"]
    if payload:
        print(f"[Providers] extract_openai_text: no text in payload keys: {list(payload.keys())}", file=sys.stderr)
    return ""


def _parse_sse_chunk(chunk: str) -> dict[str, Any] | None:
    data_lines = [
        line[5:].strip()
        for line in chunk.split("\n")
        if line.startswith("data:")
    ]
    if not data_lines:
        return None
    data = "\n".join(data_lines).strip()
    if not data or data == "[DONE]":
        return None
    try:
        return json.loads(data)
    except json.JSONDecodeError:
        print(f"[Providers] _parse_sse_chunk: invalid JSON: {data[:100]}", file=sys.stderr)
        return None


def _parse_codex_stream(raw: str) -> dict[str, Any]:
    events: list[dict[str, Any]] = []
    buffer = ""
    for chunk in raw.splitlines(keepends=True):
        buffer += chunk
        while "\n\n" in buffer:
            event_chunk, buffer = buffer.split("\n\n", 1)
            event = _parse_sse_chunk(event_chunk)
            if event is not None:
                events.append(event)
    if buffer.strip():
        event = _parse_sse_chunk(buffer)
        if event is not None:
            events.append(event)

    for event in reversed(events):
        if event.get("type") == "response.completed" and isinstance(event.get("response"), dict):
            return event["response"]
        if isinstance(event.get("response"), dict):
            return event["response"]

    output_text = ""
    for event in events:
        delta = event.get("delta")
        if isinstance(delta, str):
            output_text += delta
        text = event.get("text")
        if isinstance(text, str):
            output_text += text
    if output_text:
        return {
            "output": [
                {
                    "type": "message",
                    "content": [{"type": "output_text", "text": output_text}],
                }
            ]
        }
    if raw.strip():
        print(f"[Providers] _parse_codex_stream: received {len(raw)} bytes but could not extract text", file=sys.stderr)
    return {}
