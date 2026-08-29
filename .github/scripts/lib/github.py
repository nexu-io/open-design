from __future__ import annotations

import json
import os
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


API_ROOT = "https://api.github.com"
API_VERSION = "2022-11-28"
USER_AGENT = "open-design-actions/1"


class GitHubError(RuntimeError):
    pass


def require_env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise GitHubError(f"{name} is required")
    return value


def event_payload(path: Path | None = None) -> dict[str, Any]:
    event_path = path or Path(require_env("GITHUB_EVENT_PATH"))
    try:
        value = json.loads(event_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise GitHubError(f"cannot load GitHub event payload: {error}") from error
    if not isinstance(value, dict):
        raise GitHubError("GitHub event payload must be an object")
    return value


def api_request(path: str, *, token: str | None = None) -> urllib.request.Request:
    if not path.startswith("/"):
        path = f"/{path}"
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": USER_AGENT,
    }
    resolved_token = token or os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if resolved_token:
        headers["Authorization"] = f"Bearer {resolved_token}"
    return urllib.request.Request(f"{API_ROOT}{path}", headers=headers)


def api_json(path: str, *, token: str | None = None) -> Any:
    try:
        with urllib.request.urlopen(api_request(path, token=token), timeout=30) as response:
            return json.load(response)
    except (OSError, json.JSONDecodeError, urllib.error.URLError) as error:
        raise GitHubError(f"GitHub API request failed for {path}: {error}") from error


def run_artifacts(repository: str, run_id: int) -> list[dict[str, Any]]:
    quoted_repository = "/".join(urllib.parse.quote(part, safe="") for part in repository.split("/"))
    artifacts: list[dict[str, Any]] = []
    page = 1
    while True:
        value = api_json(f"/repos/{quoted_repository}/actions/runs/{run_id}/artifacts?per_page=100&page={page}")
        if not isinstance(value, dict) or not isinstance(value.get("artifacts"), list):
            raise GitHubError("GitHub artifacts response has an invalid shape")
        batch = value["artifacts"]
        for artifact in batch:
            if not isinstance(artifact, dict):
                raise GitHubError("GitHub artifact entry has an invalid shape")
            artifacts.append(artifact)
        if len(batch) < 100:
            return artifacts
        page += 1


def unique_run_artifact(repository: str, run_id: int, name: str) -> dict[str, Any] | None:
    matches = [
        artifact
        for artifact in run_artifacts(repository, run_id)
        if artifact.get("name") == name and artifact.get("expired") is False
    ]
    if not matches:
        return None
    if len(matches) != 1:
        raise GitHubError(f"expected exactly one current-run artifact named {name!r}, found {len(matches)}")
    artifact_id = matches[0].get("id")
    if not isinstance(artifact_id, int) or artifact_id <= 0:
        raise GitHubError(f"artifact {name!r} has an invalid id")
    return matches[0]


def download_artifact(repository: str, artifact_id: int, destination: Path) -> None:
    quoted_repository = "/".join(urllib.parse.quote(part, safe="") for part in repository.split("/"))
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=f".{destination.name}.", dir=str(destination.parent))
    try:
        with os.fdopen(handle, "wb") as output:
            try:
                request = api_request(f"/repos/{quoted_repository}/actions/artifacts/{artifact_id}/zip")
                opener = urllib.request.build_opener(_NoRedirect())
                try:
                    response = opener.open(request, timeout=30)
                except urllib.error.HTTPError as redirect:
                    if redirect.code not in {301, 302, 303, 307, 308}:
                        raise
                    location = redirect.headers.get("Location")
                    if not location:
                        raise GitHubError(f"artifact {artifact_id} download redirect omitted Location")
                    response = urllib.request.urlopen(
                        urllib.request.Request(location, headers={"User-Agent": USER_AGENT}),
                        timeout=60,
                    )
                with response:
                    while chunk := response.read(1024 * 1024):
                        output.write(chunk)
            except (OSError, urllib.error.URLError) as error:
                raise GitHubError(f"cannot download GitHub artifact {artifact_id}: {error}") from error
        os.replace(temporary, destination)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


def append_outputs(values: dict[str, str]):
    output_path = os.environ.get("GITHUB_OUTPUT")
    lines = [f"{key}={value}" for key, value in values.items()]
    if output_path:
        with Path(output_path).open("a", encoding="utf-8") as output:
            output.write("\n".join(lines) + "\n")
    else:
        print("\n".join(lines))


def append_summary(markdown: str):
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with Path(summary_path).open("a", encoding="utf-8") as summary:
            summary.write(markdown.rstrip() + "\n")
