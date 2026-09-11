#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Callable
from unittest.mock import patch

import handoff as handoff_contract
from lib.config import ConfigError, compact_json, load_json, object_value, repository_root
from lib.github import (
    GitHubError,
    append_outputs,
    append_summary,
    api_json,
    download_artifact,
    event_payload,
    unique_artifact,
    run_artifacts,
)
from lib.r2 import R2Client, R2Credentials, R2Error, R2PreconditionFailed, self_check as r2_self_check


PROTOCOL = "nexu-workload-result-v1"
# One plan schema owns declaration and identity semantics. Bump on changes to
# hashing, normalization, or dependency interpretation; storage schemas differ.
SCHEMA_VERSION = 2
CONTROL_SUITE = "convergence-control"
DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")
IDENTITY_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,79}$")
PRODUCT_TYPES = {"job", "url"}
PUBLIC_READ_USER_AGENT = "open-design-workload-convergence/1"
STORAGE_ENV = {
    "endpoint": "CLOUDFLARE_R2_WORKLOAD_RESULTS_URL",
    "bucket": "CLOUDFLARE_R2_WORKLOAD_RESULTS_BUCKET",
    "public_origin": "OD_WORKLOAD_RESULTS_BASE_URL",
    "access_key_id": "CLOUDFLARE_R2_WORKLOAD_RESULTS_AK",
    "secret_access_key": "CLOUDFLARE_R2_WORKLOAD_RESULTS_SK",
}


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def require_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ConfigError(f"{label} must be a non-empty string")
    return value


def require_identity(value: Any, label: str) -> str:
    value = require_string(value, label)
    if not IDENTITY_RE.fullmatch(value):
        raise ConfigError(f"{label} has invalid identity {value!r}")
    return value


class Workload:
    def __init__(self, workflow: str, identity: str, raw: Any):
        value = object_value(raw, f"convergence.workflows.{workflow}.workloads.{identity}")
        expected = {"inputs", "runnerClass", "products", "reusable"}
        if not expected.issubset(value) or set(value) - expected - {"dependsOn", "parameters", "artifact"}:
            raise ConfigError(
                f"convergence.workflows.{workflow}.workloads.{identity} requires {sorted(expected)}; optional dependsOn, parameters and artifact"
            )
        self.identity = require_identity(identity, f"convergence workload {workflow}")
        self.inputs = ConvergenceContract.tokens(value["inputs"], f"workload {workflow}/{identity}.inputs")
        self.runner_class = require_identity(value["runnerClass"], f"workload {workflow}/{identity}.runnerClass")
        if value["products"] not in {"none", "manifest"}:
            raise ConfigError(f"workload {workflow}/{identity}.products must be none or manifest")
        self.products = value["products"]
        if not isinstance(value["reusable"], bool):
            raise ConfigError(f"workload {workflow}/{identity}.reusable must be boolean")
        self.reusable = value["reusable"]
        dependencies = value.get("dependsOn", [])
        if not isinstance(dependencies, list) or any(not isinstance(item, str) for item in dependencies):
            raise ConfigError(f"workload {workflow}/{identity}.dependsOn must be an array of workload identities")
        if len(set(dependencies)) != len(dependencies):
            raise ConfigError(f"workload {workflow}/{identity}.dependsOn contains duplicates")
        self.dependencies = sorted(require_identity(item, "workload dependency") for item in dependencies)
        self.parameters = object_value(value.get("parameters", {}), f"workload {workflow}/{identity}.parameters")
        if any(not isinstance(key, str) or not key or not isinstance(item, str) or not item
               for key, item in self.parameters.items()):
            raise ConfigError(f"workload {workflow}/{identity}.parameters must contain non-empty strings")
        self.artifact = None
        if "artifact" in value:
            artifact = object_value(value["artifact"], f"workload {workflow}/{identity}.artifact")
            if self.products != "manifest" or set(artifact) != {"product", "prefix"}:
                raise ConfigError("artifact requires a manifest workload, product and prefix")
            self.artifact = {key: require_identity(artifact[key], f"artifact.{key}") for key in ("product", "prefix")}


class WorkflowContract:
    def __init__(self, name: str, raw: Any):
        value = object_value(raw, f"convergence.workflows.{name}")
        if not {"policy", "workloads"} <= set(value) or set(value) - {"policy", "workloads", "execution", "admission"}:
            raise ConfigError(f"convergence.workflows.{name} requires policy and workloads; optional execution and admission")
        self.name = require_identity(name, "convergence workflow")
        self.policy = require_identity(value["policy"], f"convergence.workflows.{name}.policy")
        self.production_gate = None
        self.result_jobs = {}
        if "admission" in value:
            admission = object_value(value["admission"], "workflow admission")
            if name not in {"release-exact", "release-prerelease", "release-stable"} or not {"productionJob"} <= set(admission) or set(admission) - {"productionJob", "resultJobs"}:
                raise ConfigError("production admission is restricted to release workflows")
            self.production_gate = require_string(admission["productionJob"], "admission.productionJob")
            self.result_jobs = {require_identity(identity, "result job workload"): require_string(job, "result job")
                                for identity, job in object_value(admission.get("resultJobs", {}), "admission.resultJobs").items()}
        workloads = object_value(value["workloads"], f"convergence.workflows.{name}.workloads")
        if not workloads:
            raise ConfigError(f"convergence.workflows.{name}.workloads must not be empty")
        self.workloads = {identity: Workload(name, identity, raw_workload) for identity, raw_workload in workloads.items()}
        if set(self.result_jobs) - set(self.workloads):
            raise ConfigError("result admission names an unknown workload")
        self.order: list[str] = []
        visiting: list[str] = []

        def visit(identity: str) -> None:
            if identity not in self.workloads:
                raise ConfigError(f"workflow {name} references unknown dependency {identity}")
            if identity in visiting:
                raise ConfigError(f"workload dependency cycle: {' -> '.join([*visiting, identity])}")
            if identity in self.order:
                return
            visiting.append(identity)
            for dependency in self.workloads[identity].dependencies:
                visit(dependency)
            visiting.pop()
            self.order.append(identity)

        for identity in sorted(self.workloads):
            visit(identity)
        self.execution = None
        if "execution" in value:
            execution = object_value(value["execution"], f"workflow {name}.execution")
            if not {"enabled", "runners", "matrices"} <= set(execution) or set(execution) - {"enabled", "runners", "matrices", "inputs", "batches", "groups"}:
                raise ConfigError("execution requires enabled, runners and matrices; optional inputs")
            for input_name in object_value(execution.get("inputs", {}), "execution inputs"):
                require_identity(input_name, "execution input name")
            enabled = execution["enabled"]
            if (not isinstance(enabled, list) or any(not isinstance(item, str) for item in enabled)
                    or len(set(enabled)) != len(enabled) or set(enabled) - set(self.workloads)):
                raise ConfigError("execution enabled must name unique declared workloads")
            for identity in enabled:
                if set(self.workloads[identity].dependencies) - set(enabled):
                    raise ConfigError("enabled workload depends on a disabled workload")
            runners = object_value(execution["runners"], "execution runners")
            if set(runners) != {item.runner_class for item in self.workloads.values()}:
                raise ConfigError("execution runner inventory differs from workloads")
            for labels in runners.values():
                if not isinstance(labels, list) or not labels or any(not isinstance(label, str) or not label.strip() for label in labels):
                    raise ConfigError("execution runner labels must be non-empty strings")
            matrices = object_value(execution["matrices"], "execution matrices")
            for matrix_name, matrix in matrices.items():
                require_identity(matrix_name, "execution matrix name")
                if not isinstance(matrix, dict) or set(matrix) != {"include"} or not isinstance(matrix["include"], list):
                    raise ConfigError("execution matrices require include arrays")
                for entry in matrix["include"]:
                    entry = object_value(entry, "execution matrix entry")
                    if not entry or any(not isinstance(key, str) or not key or not isinstance(item, (str, bool, int)) for key, item in entry.items()):
                        raise ConfigError("execution matrix entries must contain scalar values")
                    workload = self.workloads.get(entry.get("workload"))
                    if workload is not None:
                        for key, declared in workload.parameters.items():
                            if key in entry and entry[key] != declared:
                                raise ConfigError(f"matrix {key} differs from workload parameters")
                            entry[key] = declared
            for batch_name, batch in object_value(execution.get("batches", {}), "execution batches").items():
                require_identity(batch_name, "batch name")
                batch = object_value(batch, "execution batch")
                if set(batch) != {"matrix", "fields", "product"} or batch["matrix"] not in matrices:
                    raise ConfigError("batch requires a declared matrix, fields and product")
                require_identity(batch["product"], "batch product")
                fields = object_value(batch["fields"], "batch fields")
                if not fields or "artifact" in fields:
                    raise ConfigError("batch fields must be nonempty and exclude artifact")
                for field, source in fields.items():
                    require_identity(field, "batch field")
                    require_identity(source, "batch source field")
                for entry in matrices[batch["matrix"]]["include"]:
                    if entry.get("workload") not in self.workloads or any(source not in entry for source in fields.values()):
                        raise ConfigError("batch entries require declared workloads and projection fields")
            for group_name, members in object_value(execution.get("groups", {}), "execution groups").items():
                require_identity(group_name, "execution group name")
                if (not isinstance(members, list) or not members
                        or any(not isinstance(member, str) for member in members)
                        or len(set(members)) != len(members) or set(members) - set(self.workloads)):
                    raise ConfigError("execution group must name unique declared workloads")
            self.execution = execution


class ConvergenceContract:
    def __init__(self, path: Path):
        value = object_value(load_json(path), "convergence")
        if set(value) != {"schema", "suites", "workflows"}:
            raise ConfigError("convergence keys must be schema, suites, and workflows")
        schema = object_value(value["schema"], "convergence.schema")
        if set(schema) != {"version"} or type(schema["version"]) is not int or schema["version"] != SCHEMA_VERSION:
            raise ConfigError(f"convergence requires schema.version {SCHEMA_VERSION}")
        self.schema_version = schema["version"]
        suites = object_value(value["suites"], "convergence.suites")
        self.suites = {
            require_identity(name, "convergence suite"): self.tokens(tokens, f"convergence.suites.{name}")
            for name, tokens in suites.items()
        }
        if CONTROL_SUITE not in self.suites:
            raise ConfigError(f"convergence.suites must define {CONTROL_SUITE}")
        workflows = object_value(value["workflows"], "convergence.workflows")
        self.workflows = {name: WorkflowContract(name, raw) for name, raw in workflows.items()}
        if not self.workflows:
            raise ConfigError("convergence.workflows must not be empty")
        self.validate_graph()

    @staticmethod
    def tokens(value: Any, label: str) -> list[str]:
        if not isinstance(value, list) or not value:
            raise ConfigError(f"{label} must be a non-empty array")
        if any(not isinstance(token, str) or not token for token in value):
            raise ConfigError(f"{label} contains an invalid token")
        return value

    @staticmethod
    def validate_path(token: str, label: str) -> None:
        if token == "*":
            return
        if token.startswith(("/", "~")) or "\\" in token or "\n" in token:
            raise ConfigError(f"{label} has unsafe path token {token!r}")
        if ".." in PurePosixPath(token).parts:
            raise ConfigError(f"{label} escapes the repository: {token!r}")
        if "://" in token:
            raise ConfigError(f"{label} has unsupported token scheme: {token}")

    def workflow(self, name: str) -> WorkflowContract:
        if name not in self.workflows:
            raise ConfigError(f"unknown convergence workflow: {name}")
        return self.workflows[name]

    def validate_graph(self) -> None:
        nodes: dict[str, list[str]] = {f"suite://{name}": tokens for name, tokens in self.suites.items()}
        for workflow in self.workflows.values():
            for workload in workflow.workloads.values():
                nodes[f"workload://{workflow.name}/{workload.identity}"] = workload.inputs
        for node, tokens in nodes.items():
            for token in tokens:
                if token.startswith("suite://"):
                    if token not in nodes:
                        raise ConfigError(f"{node} references unknown {token}")
                else:
                    self.validate_path(token, node)
        visiting: list[str] = []
        complete: set[str] = set()

        def visit(node: str) -> None:
            if node in visiting:
                raise ConfigError(f"convergence dependency cycle: {' -> '.join((*visiting, node))}")
            if node in complete:
                return
            visiting.append(node)
            for token in nodes[node]:
                if token.startswith("suite://"):
                    visit(token)
            visiting.pop()
            complete.add(node)

        for node in nodes:
            visit(node)

    def suite_paths(self, name: str) -> list[str]:
        if name not in self.suites:
            raise ConfigError(f"unknown convergence suite: {name}")
        paths: set[str] = set()

        def collect(suite: str) -> None:
            for token in self.suites[suite]:
                if token.startswith("suite://"):
                    collect(token.removeprefix("suite://"))
                else:
                    paths.add(token)

        collect(name)
        return sorted(paths)


class GitFingerprinter:
    def __init__(self, root: Path):
        self.root = root
        self.cache: dict[str, list[tuple[str, str, str, str]]] = {}

    def records(self, token: str) -> list[tuple[str, str, str, str]]:
        if token in self.cache:
            return self.cache[token]
        if token == "*":
            pathspec: list[str] = []
        elif any(character in token for character in "*?["):
            pathspec = [f":(glob){token}"]
        else:
            pathspec = [token]
        command = ["git", "ls-files", "-s", "-z"]
        if pathspec:
            command += ["--", *pathspec]
        result = subprocess.run(command, cwd=self.root, check=True, stdout=subprocess.PIPE)
        records = []
        for raw in result.stdout.split(b"\0"):
            if not raw:
                continue
            metadata, path = raw.split(b"\t", 1)
            mode, oid, stage = metadata.decode("ascii").split()
            records.append((path.decode("utf-8", "surrogateescape"), mode, oid, stage))
        candidate = self.root / token
        if not records and not any(character in token for character in "*?[") and candidate.is_file():
            oid = subprocess.run(
                ["git", "hash-object", "--", token],
                cwd=self.root,
                check=True,
                stdout=subprocess.PIPE,
                text=True,
            ).stdout.strip()
            mode = "100755" if candidate.stat().st_mode & 0o111 else "100644"
            records.append((token, mode, oid, "0"))
        records.sort()
        if not records:
            raise ConfigError(f"convergence path token matched no tracked files: {token}")
        self.cache[token] = records
        return records


def digest_tokens(
    contract: ConvergenceContract,
    fingerprinter: GitFingerprinter,
    node: str,
    tokens: list[str],
    resolved: dict[str, str],
) -> str:
    if node in resolved:
        return resolved[node]
    digest = hashlib.sha256()
    digest.update(f"{PROTOCOL}\0{node}\0".encode())
    for token in sorted(set(tokens)):
        digest.update(f"token\0{token}\0".encode())
        if token.startswith("suite://"):
            name = token.removeprefix("suite://")
            child = digest_tokens(contract, fingerprinter, token, contract.suites[name], resolved)
            digest.update(f"digest\0{child}\0".encode())
        else:
            for path, mode, oid, stage in fingerprinter.records(token):
                digest.update(f"file\0{path}\0{mode}\0{oid}\0{stage}\0".encode("utf-8", "surrogateescape"))
    resolved[node] = digest.hexdigest()
    return resolved[node]


def calculate(
    contract: ConvergenceContract,
    root: Path,
    workflow_name: str,
    runner_plan: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    workflow = contract.workflow(workflow_name)
    resolved: dict[str, str] = {}
    fingerprinter = GitFingerprinter(root)
    results: dict[str, dict[str, Any]] = {}
    for identity in workflow.order:
        workload = workflow.workloads[identity]
        if workload.runner_class not in runner_plan:
            raise ConfigError(f"runner plan lacks class {workload.runner_class} for {workflow_name}/{identity}")
        labels = runner_plan[workload.runner_class]
        if not isinstance(labels, list) or not labels or any(not isinstance(label, str) or not label for label in labels):
            raise ConfigError(f"runner plan class {workload.runner_class} must be a non-empty string array")
        input_digest = digest_tokens(
            contract,
            fingerprinter,
            f"workload-inputs://{workflow_name}/{identity}",
            workload.inputs,
            resolved,
        )
        execution_class = canonical_json({"runnerClass": workload.runner_class, "labels": labels})
        # Only this control plane resolves dependency identities. Executors get
        # artifact inputs and emit business receipts, never planner state.
        # CONTROL_SUITE is exclusively a trusted-writer admission boundary.
        # Runtime-affecting source and execution settings must be declared by
        # the workload, not inherited from the entire workflow/config file.
        digest = hashlib.sha256(canonical_json({
            "schemaVersion": contract.schema_version,
            "protocol": PROTOCOL,
            "workflow": workflow_name,
            "policy": workflow.policy,
            "workload": identity,
            "inputs": input_digest,
            "executionClass": json.loads(execution_class),
            "products": workload.products,
            "reusable": workload.reusable,
            "dependencies": {name: results[name]["digest"] for name in workload.dependencies},
            "parameters": workload.parameters,
            "artifact": workload.artifact,
        }).encode())
        results[identity] = {
            "digest": digest.hexdigest(),
            "executionClass": json.loads(execution_class),
            "products": workload.products,
            "reusable": workload.reusable,
        }
    return results


def result_key(repository_id: int, workflow: str, policy: str, identity: str, digest: str) -> str:
    return (
        f"workload-results/v1/repos/{repository_id}/workflows/{workflow}/policies/{policy}"
        f"/workloads/{identity}/digests/{digest}.json"
    )


def product_key(
    repository_id: int, workflow: str, policy: str, identity: str, product: str, sha256: str,
) -> str:
    """Byte identity is independent of execution identity and release versions.

    Producers may create these objects, never workload-results records. Different
    executions producing the same bytes share an object; trusted admission still
    rejects conflicting successful results for one workload identity.
    """
    if type(repository_id) is not int or repository_id < 1:
        raise ConfigError("product requires a positive repository id")
    for name, value in {"workflow": workflow, "policy": policy, "workload": identity, "product": product}.items():
        require_identity(value, name)
    if not isinstance(sha256, str) or not DIGEST_RE.fullmatch(sha256):
        raise ConfigError("product requires a content SHA-256")
    return (
        f"workload-products/v2/repos/{repository_id}/workflows/{workflow}/policies/{policy}"
        f"/workloads/{identity}/products/{product}/sha256/{sha256}.zip"
    )


def validate_products(value: Any, label: str, require_urls: bool) -> dict[str, Any]:
    products = object_value(value, label)
    normalized: dict[str, Any] = {}
    for name, raw in sorted(products.items()):
        require_identity(name, f"{label} product")
        entry = object_value(raw, f"{label}.{name}")
        if not {"type", "source"}.issubset(entry) or set(entry) - {"type", "source", "data"}:
            raise ConfigError(f"{label}.{name} keys must be type, source, and optional data")
        product_type = require_string(entry["type"], f"{label}.{name}.type")
        if product_type not in PRODUCT_TYPES:
            raise ConfigError(f"{label}.{name}.type must be job or url")
        if require_urls and product_type != "url":
            raise ConfigError(f"{label}.{name} must be promoted to url before publication")
        source = require_string(entry["source"], f"{label}.{name}.source")
        if product_type == "url":
            parsed = urllib.parse.urlparse(source)
            if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
                raise ConfigError(f"{label}.{name}.source must be an HTTPS URL without credentials")
        elif not IDENTITY_RE.fullmatch(source):
            raise ConfigError(f"{label}.{name}.source must name a current-run job source")
        normalized_entry: dict[str, Any] = {"type": product_type, "source": source}
        if "data" in entry:
            data = object_value(entry["data"], f"{label}.{name}.data")
            canonical_json(data)
            if "sha256" in data and (
                not isinstance(data["sha256"], str) or not DIGEST_RE.fullmatch(data["sha256"])
            ):
                raise ConfigError(f"{label}.{name}.data.sha256 must be a lowercase SHA-256 digest")
            normalized_entry["data"] = data
        normalized[name] = normalized_entry
    return normalized


def validate_result(
    value: Any,
    *,
    repository_id: int,
    workflow: WorkflowContract,
    identity: str,
    expected: dict[str, Any],
) -> dict[str, Any]:
    result = object_value(value, "workload result")
    required = {
        "schemaVersion",
        "protocol",
        "repositoryId",
        "workflow",
        "policy",
        "workload",
        "digest",
        "executionClass",
        "products",
        "validated",
    }
    if set(result) != required:
        raise ConfigError("workload result fields differ")
    checks = {
        "schemaVersion": 1,
        "protocol": PROTOCOL,
        "repositoryId": repository_id,
        "workflow": workflow.name,
        "policy": workflow.policy,
        "workload": identity,
        "digest": expected["digest"],
        "executionClass": expected["executionClass"],
    }
    for key, expected_value in checks.items():
        if result.get(key) != expected_value:
            raise ConfigError(f"workload result {key} mismatch")
    products = validate_products(result["products"], "workload result.products", require_urls=True)
    if expected["products"] == "none" and products:
        raise ConfigError("products:none workload result must not contain products")
    if expected["products"] == "manifest" and not products:
        raise ConfigError("products:manifest workload result must contain products")
    validated_provenance(result["validated"])
    return {**result, "products": products}


def public_read_request(url: str, *, accept: str, byte_range: str | None = None) -> urllib.request.Request:
    headers = {
        "Accept": accept,
        "Cache-Control": "no-cache",
        "User-Agent": PUBLIC_READ_USER_AGENT,
    }
    if byte_range is not None:
        headers["Range"] = byte_range
    return urllib.request.Request(url, headers=headers)


def fetch_result(url: str, timeout: float) -> Any:
    request = public_read_request(url, accept="application/json")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise OSError(f"unexpected HTTP status {response.status}")
        if response.headers.get_content_type() not in {"application/json", "text/plain"}:
            raise OSError("unexpected workload result content type")
        body = response.read(262145)
        if len(body) > 262144:
            raise OSError("workload result exceeds 256 KiB")
        return json.loads(body)


def probe_product(url: str, timeout: float) -> None:
    request = public_read_request(url, accept="*/*", byte_range="bytes=0-0")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status not in {200, 206}:
            raise OSError(f"unexpected product HTTP status {response.status}")
        response.read(1)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_url(url: str, timeout: float) -> str:
    digest = hashlib.sha256()
    request = public_read_request(url, accept="*/*")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise OSError(f"unexpected product HTTP status {response.status}")
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_product_archive(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source, "r") as input_archive:
        entries = sorted(input_archive.infolist(), key=lambda entry: entry.filename)
        if len(entries) > 10000:
            raise ConfigError("product artifact contains too many entries")
        if sum(entry.file_size for entry in entries) > 2 * 1024 * 1024 * 1024:
            raise ConfigError("product artifact expands beyond 2 GiB")
        seen: set[str] = set()
        with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output_archive:
            for entry in entries:
                name = entry.filename
                path = PurePosixPath(name.rstrip("/"))
                if (
                    not name
                    or name.startswith(("/", "\\"))
                    or "\\" in name
                    or ".." in path.parts
                    or name in seen
                ):
                    raise ConfigError(f"product artifact has an unsafe or duplicate entry: {name!r}")
                seen.add(name)
                directory = name.endswith("/")
                normalized = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                normalized.compress_type = zipfile.ZIP_DEFLATED
                normalized.external_attr = (0o40755 if directory else 0o100644) << 16
                if directory:
                    output_archive.writestr(normalized, b"")
                    continue
                with input_archive.open(entry, "r") as input_file, output_archive.open(normalized, "w") as output_file:
                    shutil.copyfileobj(input_file, output_file, length=1024 * 1024)


def archive_product_directory(source: Path, destination: Path) -> None:
    """Emit the existing normalized product envelope without a GitHub relay."""
    if source.is_symlink() or not source.is_dir():
        raise ConfigError("product source must be a real directory")
    files = []
    names: set[str] = set()
    total = 0
    for file in source.rglob("*"):
        name = file.relative_to(source).as_posix()
        if file.is_symlink() or re.search(r"[\\:\x00-\x1f]", name):
            raise ConfigError("product directory contains unsafe paths")
        if file.is_dir():
            continue
        if not file.is_file() or name.lower() in names:
            raise ConfigError("product directory contains special or conflicting files")
        names.add(name.lower())
        files.append((name, file))
        total += file.stat().st_size
        if len(files) > 10000 or total > 2 * 1024 ** 3:
            raise ConfigError("product directory exceeds inventory bounds")
    if not files:
        raise ConfigError("product directory is empty")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, file in sorted(files):
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            with file.open("rb") as input_file, archive.open(entry, "w") as output_file:
                shutil.copyfileobj(input_file, output_file, length=1024 * 1024)


def retry_cache_read(operation: Callable[[float], Any], timeout: float) -> tuple[Any, bool]:
    """Retry one transient public read, never invalid evidence or a cache miss.
    Each attempt retains the caller's timeout; there is no sleeping, recursive
    retry, payload acquisition or change to workload identity."""
    for attempt in range(2):
        try:
            return operation(timeout), attempt != 0
        except urllib.error.HTTPError as error:
            if attempt or error.code not in {408, 429, 500, 502, 503, 504}:
                raise
        except (TimeoutError, ConnectionError, http.client.HTTPException, urllib.error.URLError):
            if attempt:
                raise
    raise AssertionError("cache read attempts exhausted without a result")


def resolve_results(
    base_url: str | None,
    repository_id: int,
    workflow: WorkflowContract,
    calculated: dict[str, dict[str, Any]],
    timeout: float,
) -> tuple[dict[str, bool], dict[str, str], dict[str, dict[str, Any]]]:
    hits: dict[str, bool] = {}
    reasons: dict[str, str] = {}
    results: dict[str, dict[str, Any]] = {}
    invalid_base_url = False
    if base_url:
        parsed = urllib.parse.urlparse(base_url)
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
            base_url = None
            invalid_base_url = True
    def resolve_one(item: tuple[str, dict[str, Any]]) -> tuple[str, bool, str, Any]:
        identity, expected = item
        if not expected["reusable"]:
            return identity, False, "reuse-disabled", None
        if not base_url:
            return identity, False, "base-url-invalid" if invalid_base_url else "base-url-missing", None
        key = result_key(repository_id, workflow.name, workflow.policy, identity, expected["digest"])
        url = f"{base_url.rstrip('/')}/{key}"
        try:
            value, retried = retry_cache_read(lambda budget: fetch_result(url, budget), timeout)
            result = validate_result(
                value,
                repository_id=repository_id,
                workflow=workflow,
                identity=identity,
                expected=expected,
            )
            for product in result["products"].values():
                # Planning checks availability, not payload bytes. Acquisition
                # verifies the declared digest before exposing any content.
                _, probe_retried = retry_cache_read(lambda budget: probe_product(product["source"], budget), timeout)
                retried = retried or probe_retried
            return identity, True, "result-hit-after-retry" if retried else "result-hit", result
        except urllib.error.HTTPError as error:
            return identity, False, "result-missing" if error.code == 404 else f"read-http-{error.code}", None
        except (
            ConfigError,
            json.JSONDecodeError,
            UnicodeError,
            http.client.HTTPException,
            OSError,
            urllib.error.URLError,
            TimeoutError,
        ) as error:
            return identity, False, f"read-unavailable:{type(error).__name__}", None
    # Parallelize independent metadata reads, not identity calculation. map keeps
    # declaration order, per-workload fail-open semantics and complete product probes.
    if calculated:
        with ThreadPoolExecutor(max_workers=min(8, len(calculated))) as executor:
            for identity, hit, reason, result in executor.map(resolve_one, calculated.items()):
                hits[identity], reasons[identity] = hit, reason
                if result is not None:
                    results[identity] = result
    return hits, reasons, results


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent), text=True)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as output:
            json.dump(value, output, indent=2, sort_keys=True)
            output.write("\n")
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def execution_decisions(
    enabled: dict[str, Any], hits: dict[str, bool], mode: str
) -> tuple[dict[str, bool], dict[str, bool]]:
    would_run = {identity: bool(enabled[identity]) and not hit for identity, hit in hits.items()}
    run = dict(would_run) if mode == "enforce" else {identity: bool(enabled[identity]) for identity in hits}
    return run, would_run


def required_workloads(
    workflow: WorkflowContract, enabled: dict[str, bool], hits: dict[str, bool], mode: str,
) -> dict[str, bool]:
    """Close execution inputs, not all transitive sources of a cache hit.

    A reused consumer already contains its declared outputs and does not need
    its producer jobs. A missing consumer must acquire every direct dependency,
    recursively executing only dependencies whose own result is unavailable.
    """
    required = dict(enabled)
    for identity in reversed(workflow.order):
        if required[identity] and (mode == "shadow" or not hits[identity]):
            for dependency in workflow.workloads[identity].dependencies:
                required[dependency] = True
    return required


def acquire_command(args: argparse.Namespace) -> int:
    """Bootstrap a portable tool without requiring that tool to restore itself."""
    descriptor = object_value(load_json(args.descriptor), "artifact descriptor")
    if set(descriptor) != {"url", "sha256"} or not isinstance(descriptor["sha256"], str) or not DIGEST_RE.fullmatch(descriptor["sha256"]):
        raise ConfigError("artifact descriptor requires URL and SHA-256")
    url = require_string(descriptor["url"], "artifact URL")
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ConfigError("artifact requires credential-free HTTPS")
    if args.output.exists() or args.output.is_symlink():
        raise ConfigError("artifact output already exists")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, request, response, code, message, headers, new_url):
            raise ConfigError("artifact redirects are forbidden")
    with tempfile.TemporaryDirectory(prefix=".tool-artifact-", dir=args.output.parent) as temporary:
        scratch = Path(temporary)
        archive = scratch / "product.zip"
        with urllib.request.build_opener(NoRedirect).open(public_read_request(url, accept="application/zip"), timeout=120) as response, archive.open("xb") as output:
            if response.status != 200:
                raise ConfigError("artifact acquisition failed")
            size = 0
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > 2 * 1024 ** 3:
                    raise ConfigError("artifact exceeds 2 GiB")
                output.write(chunk)
        if sha256_file(archive) != descriptor["sha256"]:
            raise ConfigError("artifact digest mismatch")
        staged = scratch / "files"
        staged.mkdir()
        with zipfile.ZipFile(archive) as product:
            entries = product.infolist()
            if len(entries) > 10000 or sum(entry.file_size for entry in entries) > 2 * 1024 ** 3:
                raise ConfigError("artifact inventory exceeds bounds")
            seen: set[str] = set()
            for entry in entries:
                name = entry.filename.rstrip("/")
                parts = name.split("/")
                mode = entry.external_attr >> 16
                if (not name or any(part in {"", ".", ".."} for part in parts) or re.search(r"[\\:\x00-\x1f]", name)
                        or name.lower() in seen or (mode & 0o170000) not in {0, 0o100000, 0o040000}):
                    raise ConfigError("artifact contains unsafe paths or entries")
                seen.add(name.lower())
                destination = staged.joinpath(*parts)
                if entry.is_dir():
                    destination.mkdir(parents=True, exist_ok=True)
                else:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    with product.open(entry) as source, destination.open("xb") as output:
                        shutil.copyfileobj(source, output, length=1024 * 1024)
        if args.output.exists() or args.output.is_symlink():
            raise ConfigError("artifact output already exists")
        staged.rename(args.output)
    return 0


def execution_command(args: argparse.Namespace, contract: ConvergenceContract) -> int:
    """Project a workflow's own declarations; never load a business CLI or package."""
    workflow = contract.workflow(args.workflow)
    if workflow.execution is None:
        raise ConfigError("workflow has no execution declaration")
    execution = workflow.execution
    scope = {"enabled": {identity: identity in execution["enabled"] for identity in workflow.workloads}}
    write_json_atomic(args.output / "scope.json", scope)
    write_json_atomic(args.output / "runners.json", execution["runners"])
    write_json_atomic(args.output / "matrices.json", execution["matrices"])
    for name, value in execution.get("inputs", {}).items():
        write_json_atomic(args.output / "inputs" / f"{name}.json", value)
    if args.github_output is not None:
        with args.github_output.open("a", encoding="utf-8") as output:
            for name, matrix in execution["matrices"].items():
                output.write(f"{name}={json.dumps(matrix, separators=(',', ':'))}\n")
    return 0


def product_inputs(pending: dict[str, Any], contributions: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    """Project acquired-result bindings as ordinary executor artifact inputs."""
    inputs = {}
    for identity, workload in pending["workloads"].items():
        if not workload["scopeEnabled"]:
            continue
        if identity in (contributions or {}):
            raw_products = contributions[identity]["products"]
        elif not workload["run"] and workload["resultHit"]:
            raw_products = workload["result"]["products"]
        else:
            continue
        products = validate_products(raw_products, f"{identity}.products", require_urls=True)
        for name, product in products.items():
            digest = product.get("data", {}).get("sha256")
            if not isinstance(digest, str) or not DIGEST_RE.fullmatch(digest):
                raise ConfigError(f"reusable artifact requires an exact digest: {identity}/{name}")
            inputs[f"{identity}/{name}"] = {"url": product["source"], "sha256": digest}
    return inputs


def batch_inputs(workflow: WorkflowContract, pending: dict[str, Any], contributions: dict[str, Any] | None = None) -> dict[str, list[dict[str, Any]]]:
    """Group execution without coarsening identities; emit only business fields
    and verified artifact inputs, never planner state to the executor."""
    if workflow.execution is None:
        return {}
    products = product_inputs(pending, contributions)
    batches = {}
    for name, batch in workflow.execution.get("batches", {}).items():
        entries = []
        for entry in workflow.execution["matrices"][batch["matrix"]]["include"]:
            identity = entry["workload"]
            selected = pending["workloads"][identity]
            if not selected["scopeEnabled"]:
                continue
            request = {field: entry[source] for field, source in batch["fields"].items()}
            if not selected["run"] or identity in (contributions or {}):
                binding = products.get(f"{identity}/{batch['product']}")
                if binding is None:
                    raise ConfigError(f"batch input lacks a verified artifact: {identity}")
                request["artifact"] = binding
            entries.append(request)
        batches[name] = entries
    return batches


def contribute_command(args: argparse.Namespace, contract: ConvergenceContract) -> int:
    """Bind a successful job's opaque output in the control plane, not its tool."""
    pending = object_value(load_json(args.pending), "pending convergence")
    workflow = contract.workflow(require_string(pending.get("workflow"), "pending workflow"))
    if pending.get("schemaVersion") != 1 or pending.get("protocol") != PROTOCOL or pending.get("policy") != workflow.policy:
        raise ConfigError("pending convergence contract differs")
    identity = require_identity(args.workload, "contributed workload")
    if identity not in workflow.workloads or workflow.workloads[identity].products != "manifest":
        raise ConfigError("contribution requires a declared product workload")
    workload = object_value(pending.get("workloads", {}).get(identity), "pending workload")
    if workload.get("scopeEnabled") is not True or workload.get("run") is not True:
        raise ConfigError("contribution requires a selected execution, not a cache hit")
    digest = workload.get("digest")
    if not isinstance(digest, str) or not DIGEST_RE.fullmatch(digest):
        raise ConfigError("contribution requires a calculated workload digest")
    execution_class = object_value(workload.get("executionClass"), "contribution execution class")
    if set(execution_class) != {"runnerClass", "labels"} or execution_class["runnerClass"] != workflow.workloads[identity].runner_class:
        raise ConfigError("contribution execution class differs")
    labels = execution_class["labels"]
    if not isinstance(labels, list) or not labels or any(not isinstance(label, str) or not label for label in labels):
        raise ConfigError("contribution execution labels are invalid")
    directory = getattr(args, "directory", None)
    if directory is not None:
        if workflow.workloads[identity].artifact is None or workflow.workloads[identity].artifact["product"] != args.product:
            raise ConfigError("direct upload requires the declared workload product")
        storage = storage_config(required=True)
        origin = public_origin(storage["public_origin"])
        client = storage_client(storage, args.timeout)
        with tempfile.TemporaryDirectory(prefix="convergence-product-") as temporary:
            archive = Path(temporary) / "product.zip"
            archive_product_directory(directory, archive)
            product = upload_product(client, origin, pending["repositoryId"], workflow.name,
                                     workflow.policy, identity, args.product, archive, args.timeout)
        products = {args.product: product}
    else:
        products = validate_products({args.product: {"type": "job", "source": args.artifact}}, "contribution products", require_urls=False)
    write_json_atomic(args.output / identity / "product-manifest.json", {
        "workload": identity, "digest": digest, "executionClass": execution_class, "products": products,
    })
    if directory is not None:
        # An explicit current-run input, not a trusted reusable result.
        descriptor = {"url": product["source"], "sha256": product["data"]["sha256"]}
        write_json_atomic(args.output / identity / f"{args.product}.json", descriptor)
        print(compact_json(descriptor))
    return 0


def contribute_all_command(args: argparse.Namespace, contract: ConvergenceContract) -> int:
    if not re.fullmatch(r"[a-f0-9]{40}", args.source_commit):
        raise ConfigError("artifact source commit must be a full Git SHA")
    pending = object_value(load_json(args.pending), "pending convergence")
    workflow = contract.workflow(require_string(pending.get("workflow"), "pending workflow"))
    if pending.get("schemaVersion") != 1 or pending.get("protocol") != PROTOCOL or pending.get("policy") != workflow.policy:
        raise ConfigError("pending convergence contract differs")
    decisions = object_value(pending.get("workloads"), "pending workloads")
    if set(decisions) != set(workflow.workloads):
        raise ConfigError("pending workload inventory differs")
    for identity, workload in workflow.workloads.items():
        selected = object_value(decisions[identity], "pending workload")
        if not workload.reusable or selected.get("run") is not True or workload.products != "manifest":
            continue
        if workload.artifact is None:
            raise ConfigError(f"executed workload lacks an artifact declaration: {identity}")
        manifest = args.output / identity / "product-manifest.json"
        if manifest.exists():
            validate_contribution(load_json(manifest), pending, workflow, identity)
            continue
        contribute_command(argparse.Namespace(
            pending=args.pending, workload=identity, product=workload.artifact["product"],
            artifact=f"{workload.artifact['prefix']}-{args.source_commit}", output=args.output,
        ), contract)
    return 0


def validate_contribution(value: Any, pending: dict[str, Any], workflow: WorkflowContract, identity: str) -> dict[str, Any]:
    manifest = object_value(value, "current-run product manifest")
    selected = object_value(pending["workloads"].get(identity), "current-run workload")
    declaration = workflow.workloads[identity]
    if set(manifest) != {"workload", "digest", "executionClass", "products"}:
        raise ConfigError("current-run product manifest fields differ")
    if (selected.get("run") is not True or selected.get("scopeEnabled") is not True
            or manifest["workload"] != identity or manifest["digest"] != selected["digest"]
            or manifest["executionClass"] != selected["executionClass"]):
        raise ConfigError("current-run product execution binding differs")
    products = validate_products(manifest["products"], "current-run products", require_urls=True)
    if declaration.artifact is None or set(products) != {declaration.artifact["product"]}:
        raise ConfigError("current-run product inventory differs")
    for name, product in products.items():
        data = product.get("data", {})
        if type(data.get("size")) is not int or data["size"] <= 0:
            raise ConfigError("current-run product requires a positive byte size")
        key = product_key(pending["repositoryId"], workflow.name, workflow.policy, identity, name, data.get("sha256"))
        parsed = urllib.parse.urlparse(product["source"])
        if parsed.query or parsed.fragment or parsed.path != f"/{key}":
            raise ConfigError("current-run product cache namespace differs")
    return manifest


def contribution_batch(args: argparse.Namespace, contract: ConvergenceContract):
    pending = object_value(load_json(args.pending), "pending convergence")
    workflow = contract.workflow(require_string(pending.get("workflow"), "pending workflow"))
    if pending.get("schemaVersion") != 1 or pending.get("protocol") != PROTOCOL or pending.get("policy") != workflow.policy:
        raise ConfigError("pending convergence contract differs")
    execution = workflow.execution or {}
    batch = execution.get("batches", {}).get(args.batch)
    if batch is None:
        raise ConfigError("unknown contribution batch")
    entries = [entry for entry in execution["matrices"][batch["matrix"]]["include"]
               if pending["workloads"][entry["workload"]]["run"]
               and pending["workloads"][entry["workload"]]["scopeEnabled"]]
    return pending, workflow, batch, entries


def contribute_batch_command(args: argparse.Namespace, contract: ConvergenceContract) -> int:
    pending, workflow, batch, entries = contribution_batch(args, contract)
    field = batch["fields"].get(args.directory_field)
    if field is None:
        raise ConfigError("product directory field is not declared by the batch")
    requests = []
    for entry in entries:
        directory = args.products_root / require_identity(entry[field], "product directory") / "artifact"
        declaration = workflow.workloads[entry["workload"]].artifact
        if declaration is None or declaration["product"] != batch["product"]:
            raise ConfigError("batch product declaration differs")
        if not directory.is_dir() or directory.is_symlink():
            raise ConfigError("executed batch product directory is missing")
        requests.append(argparse.Namespace(pending=args.pending, workload=entry["workload"],
            product=batch["product"], directory=directory, output=args.output, timeout=args.timeout))
    with ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(lambda request: contribute_command(request, contract), requests))
    manifests = {entry["workload"]: load_json(args.output / entry["workload"] / "product-manifest.json") for entry in entries}
    references = {}
    for identity, manifest in manifests.items():
        validate_contribution(manifest, pending, workflow, identity)
        # Job outputs must not contain the public origin: GitHub may mask it
        # because the deployment stores that configuration as a secret.
        references[identity] = {**manifest, "products": {
            name: {**product, "type": "plan-key", "source": product_key(
                pending["repositoryId"], workflow.name, workflow.policy, identity, name, product["data"]["sha256"])}
            for name, product in manifest["products"].items()}}
    append_outputs({"products": compact_json(references)})
    return 0


def bind_command(args: argparse.Namespace, contract: ConvergenceContract) -> int:
    pending, workflow, batch, entries = contribution_batch(args, contract)
    manifests = object_value(json.loads(args.products_json), "current-run products")
    if set(manifests) != {entry["workload"] for entry in entries}:
        raise ConfigError("current-run batch product inventory differs")
    origin = public_origin(os.environ.get(STORAGE_ENV["public_origin"], "")) if manifests else ""
    for identity, manifest in manifests.items():
        manifest = object_value(manifest, "current-run product reference")
        products = object_value(manifest.get("products"), "current-run product references")
        resolved = {}
        for name, reference in products.items():
            reference = object_value(reference, "current-run product reference")
            data = object_value(reference.get("data"), "current-run product data")
            key = product_key(pending["repositoryId"], workflow.name, workflow.policy, identity, name, data.get("sha256"))
            if (set(reference) != {"type", "source", "data"} or reference["type"] != "plan-key"
                    or reference["source"] != key):
                raise ConfigError("current-run product key reference differs")
            resolved[name] = {"type": "url", "source": f"{origin}/{key}", "data": data}
        manifest = {**manifest, "products": resolved}
        validate_contribution(manifest, pending, workflow, identity)
        manifests[identity] = manifest
    # Re-project consumer inputs without altering plan decisions or trusted hits.
    for name, descriptor in product_inputs(pending, manifests).items():
        write_json_atomic(args.output / f"{name}.json", descriptor)
    sources = batch_inputs(workflow, pending, manifests)[args.batch]
    write_json_atomic(args.output / "batches" / f"{args.batch}.json", {"sources": sources})
    for identity, manifest in manifests.items():
        write_json_atomic(args.products_root / identity / "product-manifest.json", manifest)
    return 0


def plan_command(args: argparse.Namespace, contract: ConvergenceContract, root: Path) -> int:
    repository_id = args.repository_id or int(os.environ.get("GITHUB_REPOSITORY_ID", "0"))
    repository = args.repository or os.environ.get("GITHUB_REPOSITORY", "")
    base_url = args.base_url or os.environ.get(STORAGE_ENV["public_origin"], "")
    if repository_id <= 0 or not repository:
        raise ConfigError("repository id and name are required for convergence planning")
    workflow = contract.workflow(args.workflow)
    scope_plan = load_json(args.scope_plan)
    enabled = object_value(scope_plan.get("enabled"), "scope plan.enabled")
    if set(enabled) != set(workflow.workloads):
        raise ConfigError(
            f"scope/convergence identity mismatch (scope={sorted(enabled)}, convergence={sorted(workflow.workloads)})"
        )
    if any(not isinstance(value, bool) for value in enabled.values()):
        raise ConfigError("scope plan.enabled values must be booleans")
    runner_plan = object_value(json.loads(args.runner_plan_json), "runner plan")
    calculated = calculate(contract, root, args.workflow, runner_plan)
    hits, read_reasons, results = resolve_results(
        base_url or None,
        repository_id,
        workflow,
        calculated,
        args.timeout,
    )
    requested = enabled
    enabled = required_workloads(workflow, requested, hits, args.mode)
    run, _ = execution_decisions(enabled, hits, args.mode)
    _, would_run = execution_decisions(required_workloads(workflow, requested, hits, "enforce"), hits, "enforce")
    reasons = {
        identity: "scope-disabled"
        if not enabled[identity]
        else "shadow-result-hit"
        if args.mode == "shadow" and hits[identity]
        else read_reasons[identity]
        if hits[identity]
        else read_reasons[identity]
        for identity in calculated
    }
    pending = {
        "schemaVersion": 1,
        "protocol": PROTOCOL,
        "repositoryId": repository_id,
        "repository": repository,
        "workflow": workflow.name,
        "policy": workflow.policy,
        "mode": args.mode,
        "workloads": {
            identity: {
                **calculated[identity],
                "scopeEnabled": bool(enabled[identity]),
                "resultHit": hits[identity],
                "run": run[identity],
                "wouldRun": would_run[identity],
                "result": results.get(identity),
            }
            for identity in calculated
        },
    }
    write_json_atomic(args.pending, pending)
    write_json_atomic(args.pending.parent / "summary.json", {
        "schemaVersion": 1, "operation": "workflow.plan.summary", "workflow": workflow.name,
        "workloads": [{"name": name, "hit": hits[name], "run": run[name], "reason": reasons[name]}
                      for name in workflow.order if enabled[name]],
    })
    if args.products_output is not None:
        for name, binding in product_inputs(pending).items():
            write_json_atomic(args.products_output / f"{name}.json", binding)
        for name, entries in batch_inputs(workflow, pending).items():
            write_json_atomic(args.products_output / "batches" / f"{name}.json", {"sources": entries})
            write_json_atomic(args.products_output / "batches" / f"{name}.execution.json", {
                "sources": [entry for entry in entries if "artifact" not in entry],
            })
    append_outputs(
        {
            "run": compact_json(run),
            "hit": compact_json(hits),
            "would_run": compact_json(would_run),
            "group_run": compact_json({
                name: any(run[identity] for identity in members)
                for name, members in (workflow.execution or {}).get("groups", {}).items()
            }),
            "batch_run": compact_json({
                name: any(run[entry["workload"]] for entry in workflow.execution["matrices"][batch["matrix"]]["include"])
                for name, batch in (workflow.execution or {}).get("batches", {}).items()
            }),
            "execution_matrices": compact_json({
                name: {"include": [entry for entry in matrix["include"] if run.get(entry.get("workload"), False)]}
                for name, matrix in (workflow.execution or {}).get("matrices", {}).items()
            }),
        }
    )
    lines = [
        "### Workload convergence",
        "",
        f"Mode: `{args.mode}`",
        "",
        "| Workload | Scope | Reusable | Result | Run | Reason |",
        "| --- | ---: | ---: | ---: | ---: | --- |",
    ]
    for identity, value in calculated.items():
        lines.append(
            f"| {identity} | {str(bool(enabled[identity])).lower()} | {str(value['reusable']).lower()} "
            f"| {str(hits[identity]).lower()} | {str(run[identity]).lower()} | {reasons[identity]} |"
        )
    append_summary("\n".join(lines))
    print(json.dumps({"run": run, "hit": hits, "wouldRun": would_run, "reasons": reasons}, indent=2, sort_keys=True))
    return 0


def validated_provenance(value: Any) -> dict[str, Any]:
    provenance = object_value(value, "provenance")
    required = {"event", "runId", "runAttempt", "headSha", "baseSha", "treeSha", "validatedAt"}
    if set(provenance) != required:
        raise ConfigError("provenance fields differ")
    if provenance["event"] not in {"pull_request", "merge_group", "workflow_dispatch"}:
        raise ConfigError("provenance.event is not admissible")
    for name in ("runId", "runAttempt"):
        if not isinstance(provenance[name], int) or provenance[name] <= 0:
            raise ConfigError(f"provenance.{name} must be positive")
    for name in ("headSha", "baseSha", "treeSha"):
        if not isinstance(provenance[name], str) or not re.fullmatch(r"[0-9a-f]{40}", provenance[name]):
            raise ConfigError(f"provenance.{name} must be a lowercase SHA")
    require_string(provenance["validatedAt"], "provenance.validatedAt")
    return provenance


def finalize_candidate(
    pending_path: Path,
    provenance: dict[str, Any],
    products_root: Path,
    contract: ConvergenceContract,
) -> dict[str, Any]:
    pending = object_value(load_json(pending_path), "pending convergence")
    workflow = contract.workflow(require_string(pending.get("workflow"), "pending workflow"))
    if pending.get("schemaVersion") != 1 or pending.get("protocol") != PROTOCOL or pending.get("policy") != workflow.policy:
        raise ConfigError("pending convergence contract differs")
    provenance = validated_provenance(provenance)
    workloads = object_value(pending.get("workloads"), "pending workloads")
    receipts = []
    for identity, raw in workloads.items():
        if identity not in workflow.workloads:
            raise ConfigError(f"pending convergence has unknown workload {identity}")
        value = object_value(raw, f"pending workloads.{identity}")
        if (
            not value.get("reusable")
            or not value.get("scopeEnabled")
            or not value.get("run")
            or value.get("resultHit")
        ):
            continue
        products_mode = workflow.workloads[identity].products
        if products_mode == "manifest":
            manifest_path = products_root / identity / "product-manifest.json"
            if not manifest_path.is_file():
                raise ConfigError(f"executed reusable product workload lacks manifest: {identity}")
            manifest = object_value(load_json(manifest_path), f"product manifest {identity}")
            products = validate_products(
                manifest.get("products"),
                f"product manifest {identity}.products",
                require_urls=False,
            )
            if manifest.get("workload") != identity or manifest.get("digest") != value.get("digest"):
                raise ConfigError(f"product manifest identity or digest mismatch: {identity}")
            if manifest.get("executionClass") != value.get("executionClass"):
                raise ConfigError(f"product manifest execution class mismatch: {identity}")
        else:
            products = {}
        receipt = {
            "schemaVersion": 1,
            "protocol": PROTOCOL,
            "repositoryId": pending["repositoryId"],
            "workflow": workflow.name,
            "policy": workflow.policy,
            "workload": identity,
            "digest": value["digest"],
            "executionClass": value["executionClass"],
            "products": products,
            "validated": provenance,
        }
        receipts.append(
            {
                "key": result_key(pending["repositoryId"], workflow.name, workflow.policy, identity, value["digest"]),
                "receipt": receipt,
            }
        )
    return {
        "schemaVersion": 1,
        "protocol": PROTOCOL,
        "repositoryId": pending["repositoryId"],
        "repository": pending["repository"],
        "workflow": workflow.name,
        "policy": workflow.policy,
        "provenance": provenance,
        "results": receipts,
    }


def producer_context(payload: dict[str, Any]) -> dict[str, Any]:
    event = os.environ.get("GITHUB_EVENT_NAME", "")
    if event == "pull_request":
        source = object_value(payload.get("pull_request"), "pull_request event")
        head = object_value(source.get("head"), "pull_request.head")
        base = object_value(source.get("base"), "pull_request.base")
        head_sha = require_string(head.get("sha"), "pull_request.head.sha")
        base_sha = require_string(base.get("sha"), "pull_request.base.sha")
    elif event == "merge_group":
        source = object_value(payload.get("merge_group"), "merge_group event")
        head_sha = require_string(source.get("head_sha"), "merge_group.head_sha")
        base_sha = require_string(source.get("base_sha"), "merge_group.base_sha")
    elif event == "workflow_dispatch":
        head_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        base_sha = head_sha
    else:
        raise ConfigError(f"unsupported convergence producer event: {event!r}")
    repository = require_string(os.environ.get("GITHUB_REPOSITORY"), "GITHUB_REPOSITORY")
    repository_data = object_value(payload.get("repository"), "event repository")
    repository_id = int(os.environ.get("GITHUB_REPOSITORY_ID", "0") or repository_data.get("id", 0))
    run_id = int(os.environ.get("GITHUB_RUN_ID", "0"))
    run_attempt = int(os.environ.get("GITHUB_RUN_ATTEMPT", "0"))
    if repository_id <= 0 or run_id <= 0 or run_attempt <= 0:
        raise ConfigError("GitHub repository/run identity must be positive")
    tree_sha = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], text=True).strip()
    return {
        "repositoryId": repository_id,
        "repository": repository,
        "provenance": validated_provenance(
            {
                "event": event,
                "runId": run_id,
                "runAttempt": run_attempt,
                "headSha": head_sha,
                "baseSha": base_sha,
                "treeSha": tree_sha,
                "validatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            }
        ),
    }


def handoff_command(args: argparse.Namespace, contract: ConvergenceContract) -> int:
    context = producer_context(event_payload())
    candidate = finalize_candidate(args.pending, context["provenance"], args.products_root, contract)
    if candidate.get("repositoryId") != context["repositoryId"] or candidate.get("repository") != context["repository"]:
        raise ConfigError("pending convergence repository differs from the producing run")
    handoff_contract.write_convergence(args.handoff_root, args.id, candidate)
    append_outputs(
        {
            "name": handoff_contract.artifact_name("convergence", args.id),
            "path": str(args.handoff_root),
        }
    )
    print(json.dumps(candidate, indent=2, sort_keys=True))
    return 0


def prepare_publication(
    candidate_path: Path,
    output_dir: Path,
    *,
    require_urls: bool = True,
) -> list[dict[str, str]]:
    candidate = object_value(load_json(candidate_path), "convergence candidate")
    if candidate.get("schemaVersion") != 1 or candidate.get("protocol") != PROTOCOL:
        raise ConfigError("convergence candidate contract differs")
    repository_id = candidate.get("repositoryId")
    if not isinstance(repository_id, int) or repository_id <= 0:
        raise ConfigError("convergence candidate repositoryId must be positive")
    workflow = require_identity(candidate.get("workflow"), "convergence candidate workflow")
    policy = require_identity(candidate.get("policy"), "convergence candidate policy")
    provenance = validated_provenance(candidate.get("provenance"))
    results = candidate.get("results")
    if not isinstance(results, list):
        raise ConfigError("convergence candidate results must be an array")
    manifest = []
    seen: set[str] = set()
    for index, raw in enumerate(results):
        item = object_value(raw, f"convergence candidate results[{index}]")
        if set(item) != {"key", "receipt"}:
            raise ConfigError("convergence candidate result keys differ")
        receipt = object_value(item["receipt"], "convergence candidate receipt")
        expected_fields = {
            "schemaVersion",
            "protocol",
            "repositoryId",
            "workflow",
            "policy",
            "workload",
            "digest",
            "executionClass",
            "products",
            "validated",
        }
        if set(receipt) != expected_fields:
            raise ConfigError("convergence candidate receipt fields differ")
        identity = require_identity(receipt.get("workload"), "receipt workload")
        digest = require_string(receipt.get("digest"), "receipt digest")
        if not DIGEST_RE.fullmatch(digest):
            raise ConfigError("receipt digest must be sha256")
        expected_key = result_key(repository_id, workflow, policy, identity, digest)
        if item["key"] != expected_key or expected_key in seen:
            raise ConfigError("convergence candidate result key mismatch or duplicate")
        if receipt.get("schemaVersion") != 1 or receipt.get("protocol") != PROTOCOL:
            raise ConfigError("receipt protocol differs")
        if receipt.get("repositoryId") != repository_id or receipt.get("workflow") != workflow or receipt.get("policy") != policy:
            raise ConfigError("receipt identity differs from candidate")
        validate_products(receipt.get("products"), "receipt.products", require_urls=require_urls)
        if validated_provenance(receipt.get("validated")) != provenance:
            raise ConfigError("receipt provenance differs from candidate")
        seen.add(expected_key)
        path = output_dir / f"{identity}-{digest}.json"
        write_json_atomic(path, receipt)
        manifest.append({"key": expected_key, "file": str(path)})
    return manifest


def prepare_publication_command(args: argparse.Namespace) -> int:
    manifest = prepare_publication(args.candidate, args.output_dir)
    print(json.dumps({"results": manifest}, indent=2, sort_keys=True))
    return 0


def candidate_product_sources(candidate_path: Path) -> list[str]:
    with tempfile.TemporaryDirectory() as temporary:
        manifest = prepare_publication(candidate_path, Path(temporary), require_urls=False)
        sources: set[str] = set()
        for item in manifest:
            receipt = object_value(load_json(Path(item["file"])), "convergence candidate receipt")
            products = validate_products(receipt.get("products"), "receipt.products", require_urls=False)
            sources.update(entry["source"] for entry in products.values() if entry["type"] == "job")
    return sorted(sources)


def workflow_run_context(payload: dict[str, Any]) -> dict[str, Any]:
    run = object_value(payload.get("workflow_run"), "workflow_run event")
    repository = object_value(payload.get("repository"), "event repository")
    head_repository = object_value(run.get("head_repository"), "workflow_run.head_repository")
    context = {
        "repository_id": repository.get("id"),
        "repository": repository.get("full_name"),
        "workflow": run.get("name"),
        "event": run.get("event"),
        "run_id": run.get("id"),
        "run_attempt": run.get("run_attempt"),
        "head_sha": run.get("head_sha"),
        "head_repository": head_repository.get("full_name"),
    }
    if not isinstance(context["repository_id"], int) or context["repository_id"] <= 0:
        raise ConfigError("workflow_run repository id must be positive")
    for field in ("repository", "workflow", "event", "head_sha", "head_repository"):
        require_string(context[field], f"workflow_run {field}")
    for field in ("run_id", "run_attempt"):
        if not isinstance(context[field], int) or context[field] <= 0:
            raise ConfigError(f"workflow_run {field} must be positive")
    if context["event"] not in {"pull_request", "merge_group", "workflow_dispatch"}:
        raise ConfigError("workflow_run event is not admissible")
    return context


def git_differs(left: str, right: str, paths: list[str]) -> bool:
    result = subprocess.run(["git", "diff", "--quiet", left, right, "--", *paths], check=False)
    if result.returncode not in {0, 1}:
        raise subprocess.CalledProcessError(result.returncode, result.args)
    return result.returncode == 1


def admitted_source() -> dict[str, Any]:
    payload = event_payload()
    if os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch":
        return payload
    # Temporary maintainer-authorized bootstrap, not a general branch trust switch.
    repository = object_value(payload.get("repository"), "event repository")
    inputs = object_value(payload.get("inputs"), "dispatch inputs")
    sha = handoff_contract.require_sha(inputs.get("trusted_sha"), "trusted_sha")
    run_id = handoff_contract.require_int(inputs.get("producer_run_id"), "producer_run_id")
    branch = "feat/electron-shell-exact-delivery"
    if repository.get("full_name") != "nexu-io/open-design":
        raise ConfigError("manual convergence repository is not authorized")
    if os.environ.get("GITHUB_REF") != f"refs/heads/{branch}" or os.environ.get("GITHUB_SHA") != sha:
        raise ConfigError("manual convergence dispatch must pin the authorized branch SHA")
    checkout = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if checkout != sha:
        raise ConfigError("manual convergence checkout differs from trusted SHA")
    run = object_value(api_json(f"/repos/nexu-io/open-design/actions/runs/{run_id}"), "producing run")
    expected = {"id": run_id, "name": "release-exact", "event": "workflow_dispatch",
                "path": ".github/workflows/release-exact.yml", "status": "completed",
                "head_branch": branch, "head_sha": sha}
    if any(run.get(key) != value for key, value in expected.items()) or run.get("conclusion") not in {"success", "failure"}:
        raise ConfigError("manual convergence requires a completed exact run at the trusted SHA")
    if object_value(run.get("head_repository"), "head repository").get("full_name") != repository["full_name"]:
        raise ConfigError("manual convergence head repository is not authorized")
    return {"repository": repository, "workflow_run": run}


def validate_production_admission(payload: dict[str, Any], contract: ConvergenceContract) -> dict[str, Any]:
    """Trusted live evidence from this attempt, not a producer-supplied success flag.
    CI retains whole-run success. Release delivery failure cannot erase a completed
    production gate; missing, ambiguous, failed and prior-attempt gates refuse."""
    context = workflow_run_context(payload)
    run = object_value(payload.get("workflow_run"), "producing run")
    gate = contract.workflow(context["workflow"]).production_gate
    if run.get("status") != "completed" or run.get("conclusion") not in ({"success", "failure"} if gate else {"success"}):
        raise ConfigError("producing run is not admissible")
    if gate is None:
        return context
    if context["event"] != "workflow_dispatch" or context["head_repository"] != context["repository"]:
        raise ConfigError("release production admission requires a same-repository dispatch")
    jobs = []
    page = 1
    while True:
        response = object_value(api_json(f"/repos/{context['repository']}/actions/runs/{context['run_id']}/attempts/{context['run_attempt']}/jobs?per_page=100&page={page}"), "production jobs")
        batch = response.get("jobs")
        if not isinstance(batch, list) or len(batch) > 100:
            raise ConfigError("invalid production job response")
        jobs.extend(job for job in batch if isinstance(job, dict) and job.get("name") == gate)
        if len(batch) < 100:
            break
        page += 1
        if page > 100:
            raise ConfigError("production job inventory exceeds bound")
    expected = {"name": gate, "run_id": context["run_id"], "run_attempt": context["run_attempt"],
                "head_sha": context["head_sha"], "status": "completed", "conclusion": "success"}
    if len(jobs) != 1 or any(jobs[0].get(key) != value for key, value in expected.items()):
        raise ConfigError("current-attempt production gate is missing, ambiguous or unsuccessful")
    return context


def source_command() -> int:
    payload = admitted_source()
    context = workflow_run_context(payload)
    workflow = context["workflow"]
    if workflow not in {"ci", "release-exact", "release-prerelease", "release-stable"}:
        raise ConfigError("unsupported convergence source workflow")
    config = ".github/config/convergence.json" if workflow == "ci" else f".github/config/plan/{workflow}.json"
    validate_production_admission(payload, ConvergenceContract(Path(config)))
    append_outputs({
        "run_id": str(context["run_id"]),
        "run_attempt": str(context["run_attempt"]),
        "config": config,
        "handoff_id": "ci-results" if workflow == "ci" else f"{workflow}-results",
    })
    return 0


def admit_result_jobs(candidate: dict[str, Any], workflow: WorkflowContract, context: dict[str, Any]) -> dict[str, Any]:
    """Production success cannot vouch for later installed acceptance. Exclude
    results whose declared live job did not succeed in this exact attempt.
    Unrelated production results survive a failed delivery or acceptance."""
    gated = {item["receipt"]["workload"] for item in candidate["results"]} & set(workflow.result_jobs)
    if not gated:
        return candidate
    jobs = []
    for page in range(1, 101):
        response = object_value(api_json(f"/repos/{context['repository']}/actions/runs/{context['run_id']}/attempts/{context['run_attempt']}/jobs?per_page=100&page={page}"), "result jobs")
        batch = response.get("jobs")
        if not isinstance(batch, list) or len(batch) > 100:
            raise ConfigError("invalid result job response")
        jobs.extend(batch)
        if len(batch) < 100:
            break
    else:
        raise ConfigError("result job inventory exceeds bound")
    admitted = set()
    for identity in gated:
        name = workflow.result_jobs[identity]
        matches = [job for job in jobs if isinstance(job, dict) and job.get("name") == name]
        expected = {"name": name, "run_id": context["run_id"], "run_attempt": context["run_attempt"],
                    "head_sha": context["head_sha"], "status": "completed", "conclusion": "success"}
        if len(matches) == 1 and all(matches[0].get(key) == value for key, value in expected.items()):
            admitted.add(identity)
    return {**candidate, "results": [item for item in candidate["results"]
                                    if item["receipt"]["workload"] not in gated or item["receipt"]["workload"] in admitted]}


def admit_command(args: argparse.Namespace, contract: ConvergenceContract) -> int:
    context = validate_production_admission(admitted_source(), contract)
    if os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch":
        if args.release_policy is None:
            raise ConfigError("manual convergence requires a release policy artifact")
        policy = object_value(load_json(args.release_policy), "release policy")
        if (policy.get("operation") != "release.policy" or policy.get("channel") != "betahyx"
                or policy.get("sourceCommit") != context["head_sha"]
                or policy.get("sourceRef") != "refs/heads/feat/electron-shell-exact-delivery"):
            raise ConfigError("manual convergence requires the authorized betahyx release policy")
    if context["head_repository"] != context["repository"]:
        raise ConfigError("workflow_run head repository is not trusted")
    entries = handoff_contract.candidate_entry_dirs(args.handoff_root, "convergence")
    if len(entries) != 1:
        raise ConfigError(f"expected one convergence handoff, found {len(entries)}")
    entry = handoff_contract.validate_convergence(entries[0])
    links = {
        "repository_id": context["repository_id"],
        "repository": context["repository"],
        "workflow": context["workflow"],
        "event": context["event"],
        "run_id": context["run_id"],
        "run_attempt": context["run_attempt"],
        "head_sha": context["head_sha"],
    }
    for field, expected in links.items():
        if entry[field] != expected:
            raise ConfigError(f"convergence handoff {field} differs from workflow_run")
    workflow = contract.workflow(entry["workflow"])
    if entry["policy"] != workflow.policy:
        raise ConfigError("convergence handoff policy differs from trusted policy")
    base_sha = entry["base_sha"]
    head_sha = entry["head_sha"]
    subprocess.run(
        ["git", "fetch", "--no-tags", "--depth=1", "origin", base_sha, head_sha],
        check=True,
    )
    control_paths = contract.suite_paths(CONTROL_SUITE)
    candidate = entry["candidate_path"]
    reason = "trusted"
    publish = True
    if git_differs(base_sha, head_sha, control_paths):
        reason = "producer-control-plane-changed"
        publish = False
    elif git_differs("HEAD", base_sha, control_paths):
        reason = "producer-control-plane-superseded"
        publish = False
    if publish:
        admitted = admit_result_jobs(object_value(load_json(Path(candidate)), "candidate"), workflow, context)
        candidate = str(Path(candidate).with_name("admitted-candidate.json"))
        write_json_atomic(Path(candidate), admitted)
    append_outputs(
        {
            "candidate": candidate,
            "publish": str(publish).lower(),
            "reason": reason,
        }
    )
    print(json.dumps({"candidate": candidate, "publish": publish, "reason": reason}, sort_keys=True))
    return 0


def storage_config(*, required: bool) -> dict[str, str]:
    values = {key: os.environ.get(name, "") for key, name in STORAGE_ENV.items()}
    missing = [STORAGE_ENV[key] for key, value in values.items() if not value]
    if required and missing:
        raise ConfigError(f"workload result storage is missing: {', '.join(missing)}")
    return values


def storage_status_command() -> int:
    configured = all(storage_config(required=False).values())
    append_outputs({"configured": str(configured).lower()})
    if not configured:
        print("Workload result storage is not configured; validated result was not published.")
    return 0


def storage_client(storage: dict[str, str], timeout: float) -> R2Client:
    return R2Client(endpoint=storage["endpoint"], bucket=storage["bucket"],
                    credentials=R2Credentials(storage["access_key_id"], storage["secret_access_key"]),
                    timeout=timeout)


def verify_product(client: R2Client, origin: str, key: str, data: dict[str, Any], timeout: float) -> None:
    existing = client.head(key=key)
    if existing is None or existing.get("content-length") != str(data["size"]):
        raise ConfigError(f"immutable workload product missing or size collision: {key}")
    if sha256_url(f"{origin}/{key}", timeout) != data["sha256"]:
        raise ConfigError(f"immutable workload product collision: {key}")


def upload_product(client: R2Client, origin: str, repository_id: int, workflow: str,
                   policy: str, identity: str, name: str, archive: Path, timeout: float,
                   declared: dict[str, Any] | None = None) -> dict[str, Any]:
    """Producer writes have no caller-supplied key or trusted-result operation.

    This is an application guard, not credential-level isolation. The same
    bucket credential is temporarily shared by the controlled exact lane.
    """
    data = dict(declared or {})
    digest = sha256_file(archive)
    if data.get("sha256", digest) != digest:
        raise ConfigError(f"declared product digest differs from artifact: {identity}/{name}")
    data.update(sha256=digest, size=archive.stat().st_size)
    key = product_key(repository_id, workflow, policy, identity, name, digest)
    if client.head(key=key) is None:
        try:
            client.put_file(key=key, file=archive, content_type="application/zip")
        except R2PreconditionFailed:
            verify_product(client, origin, key, data, timeout)
    else:
        verify_product(client, origin, key, data, timeout)
    return {"type": "url", "source": f"{origin}/{key}", "data": data}


def stage_products_command(args: argparse.Namespace) -> int:
    repository = require_string(os.environ.get("GITHUB_REPOSITORY"), "GITHUB_REPOSITORY")
    run_id = args.run_id
    if run_id is None:
        run_id = workflow_run_context(event_payload())["run_id"]
    if run_id <= 0:
        raise ConfigError("a positive producing run id is required")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    staged = []
    sources = candidate_product_sources(args.candidate)
    artifacts = run_artifacts(repository, run_id) if sources else []
    for source in sources:
        artifact = unique_artifact(artifacts, source)
        if artifact is None:
            raise ConfigError(f"current-run product artifact is missing: {source}")
        destination = args.output_dir / f"{source}.zip"
        download_artifact(repository, artifact["id"], destination)
        staged.append(source)
    print(json.dumps({"staged": staged}, sort_keys=True))
    return 0


def public_origin(value: str) -> str:
    parsed = urllib.parse.urlparse(value.rstrip("/"))
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise ConfigError("public origin must be HTTPS without credentials")
    if parsed.query or parsed.fragment:
        raise ConfigError("public origin must not contain query or fragment")
    return value.rstrip("/")


def existing_receipt(url: str, timeout: float) -> Any | None:
    try:
        return fetch_result(url, timeout)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise


def same_reusable_result(existing: Any, expected: Any) -> bool:
    if not isinstance(existing, dict) or not isinstance(expected, dict):
        return False
    try:
        validated_provenance(existing.get("validated"))
    except ConfigError:
        return False
    return canonical_json({key: value for key, value in existing.items() if key != "validated"}) == canonical_json(
        {key: value for key, value in expected.items() if key != "validated"}
    )


def self_check() -> None:
    public_request = public_read_request("https://results.example/result.json", accept="application/json")
    if public_request.get_header("User-agent") != PUBLIC_READ_USER_AGENT:
        raise ConfigError("convergence public reads omitted the stable client identity")
    workflow = WorkflowContract.__new__(WorkflowContract)
    workflow.name = "ci"
    workflow.policy = "self-check-v1"
    expected = {
        "digest": "d" * 64,
        "executionClass": {"runnerClass": "worker", "labels": ["test-runner"]},
        "products": "none",
        "reusable": True,
    }
    provenance = {
        "event": "pull_request",
        "runId": 1,
        "runAttempt": 1,
        "headSha": "a" * 40,
        "baseSha": "b" * 40,
        "treeSha": "c" * 40,
        "validatedAt": "2026-08-21T00:00:00Z",
    }
    receipt = {
        "schemaVersion": 1,
        "protocol": PROTOCOL,
        "repositoryId": 42,
        "workflow": "ci",
        "policy": "self-check-v1",
        "workload": "unit",
        "digest": expected["digest"],
        "executionClass": expected["executionClass"],
        "products": {},
        "validated": provenance,
    }
    module = sys.modules[__name__]
    with patch.object(module, "fetch_result", return_value=receipt):
        hits, _, _ = resolve_results("https://results.example", 42, workflow, {"unit": expected}, 0.1)
        if hits != {"unit": True}:
            raise ConfigError("convergence self-check did not accept a valid result")
        shadow_run, _ = execution_decisions({"unit": True}, hits, "shadow")
        if shadow_run != {"unit": True}:
            raise ConfigError("convergence self-check omitted a shadow-mode result hit")
    with patch.object(module, "fetch_result", return_value={}):
        hits, _, _ = resolve_results("https://results.example", 42, workflow, {"unit": expected}, 0.1)
        if hits != {"unit": False}:
            raise ConfigError("convergence self-check accepted a malformed result")
    with patch.object(module, "fetch_result", side_effect=TimeoutError()):
        hits, _, _ = resolve_results("https://results.example", 42, workflow, {"unit": expected}, 0.1)
        if hits != {"unit": False}:
            raise ConfigError("convergence self-check did not fail open on timeout")
    for unavailable in (
        UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid start byte"),
        http.client.IncompleteRead(b"{", 2),
    ):
        with patch.object(module, "fetch_result", side_effect=unavailable):
            hits, _, _ = resolve_results("https://results.example", 42, workflow, {"unit": expected}, 0.1)
            if hits != {"unit": False}:
                raise ConfigError(
                    f"convergence self-check did not fail open on {type(unavailable).__name__}"
                )
    for malformed_provenance in ({"runId": 1}, {**provenance, "unexpected": True}):
        malformed_receipt = json.loads(canonical_json(receipt))
        malformed_receipt["validated"] = malformed_provenance
        with patch.object(module, "fetch_result", return_value=malformed_receipt):
            hits, _, _ = resolve_results("https://results.example", 42, workflow, {"unit": expected}, 0.1)
            if hits != {"unit": False}:
                raise ConfigError("convergence self-check accepted malformed provenance")
    product_expected = {**expected, "products": "manifest"}
    product_receipt = json.loads(canonical_json(receipt))
    product_receipt["products"] = {
        "bundle": {"type": "url", "source": "https://results.example/bundle.zip"}
    }
    hashed_receipt = json.loads(canonical_json(product_receipt))
    hashed_receipt["products"]["bundle"]["data"] = {"sha256": "e" * 64}
    with (
        patch.object(module, "fetch_result", return_value=hashed_receipt),
        patch.object(module, "probe_product") as probe,
        patch.object(module, "sha256_url", side_effect=AssertionError("plan downloaded payload")),
    ):
        hits, _, _ = resolve_results("https://results.example", 42, workflow, {"unit": product_expected}, 0.1)
        if hits != {"unit": True} or probe.call_count != 1:
            raise ConfigError("convergence self-check omitted lightweight product probing")
    with (
        patch.object(module, "fetch_result", return_value=product_receipt),
        patch.object(module, "probe_product", side_effect=TimeoutError()),
    ):
        hits, _, _ = resolve_results(
            "https://results.example",
            42,
            workflow,
            {"unit": product_expected},
            0.1,
        )
        if hits != {"unit": False}:
            raise ConfigError("convergence self-check accepted an unavailable product set")
    hits, reasons, _ = resolve_results("not-a-url", 42, workflow, {"unit": expected}, 0.1)
    if hits != {"unit": False} or reasons != {"unit": "base-url-invalid"}:
        raise ConfigError("convergence self-check did not fail open on an invalid base URL")
    repeated = json.loads(canonical_json(receipt))
    repeated["validated"]["runId"] = 2
    if not same_reusable_result(receipt, repeated):
        raise ConfigError("convergence self-check rejected an idempotent repeated result")
    repeated["executionClass"]["labels"] = ["different-runner"]
    if same_reusable_result(receipt, repeated):
        raise ConfigError("convergence self-check accepted a nondeterministic repeated result")
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        first = root / "first.zip"
        second = root / "second.zip"
        with zipfile.ZipFile(first, "w") as archive:
            archive.writestr("b.txt", "b")
            archive.writestr("a.txt", "a")
        with zipfile.ZipFile(second, "w") as archive:
            archive.writestr("a.txt", "a")
            archive.writestr("b.txt", "b")
        first_normalized = root / "first-normalized.zip"
        second_normalized = root / "second-normalized.zip"
        normalize_product_archive(first, first_normalized)
        normalize_product_archive(second, second_normalized)
        if sha256_file(first_normalized) != sha256_file(second_normalized):
            raise ConfigError("convergence self-check produced nondeterministic product archives")


def cache_inventory(client: R2Client, repository_id: int, workflow: str) -> dict:
    """Observe reusable storage only, including previous policies/key layouts.

    Workload caches are workflow-scoped, not channel-owned. Do not attribute
    these bytes to a channel or enumerate the version-distribution bucket.
    """
    suffix = f"repos/{repository_id}/workflows/{require_identity(workflow, 'workflow')}/"
    prefixes = [f"{kind}/{suffix}" for kind in
                ("workload-products/v1", "workload-products/v2", "workload-results/v1")]
    try:
        with ThreadPoolExecutor(max_workers=3) as executor:
            groups = list(executor.map(lambda prefix: client.inventory(prefix=prefix), prefixes))
        return {"status": "observed", "complete": all(group["complete"] for group in groups),
                "objects": sum(group["objects"] for group in groups),
                "bytes": sum(group["bytes"] for group in groups), "prefixes": dict(zip(prefixes, groups))}
    except Exception as error:
        # Observation never changes cache admission, publication or deletion.
        return {"status": "unavailable", "complete": False, "errorType": type(error).__name__}


def cache_usage_report(before: dict, after: dict, repository_id: int, workflow: str) -> dict:
    budget = 50 * 1024 ** 3
    complete = before["complete"] and after["complete"]
    size = after.get("bytes")
    return {"schemaVersion": 1, "operation": "workflow.cache.usage", "repositoryId": repository_id,
            "workflow": workflow, "scope": "workflow-all-policies", "budgetBytes": budget,
            "budgetStatus": "review" if size is not None and size > budget else
                            "within" if after["complete"] else "unknown",
            "before": before, "after": after,
            "observedGrowthBytes": after["bytes"] - before["bytes"] if complete else None,
            "growthScope": "observation-window-including-concurrent-writers"}


def publish_command(args: argparse.Namespace) -> int:
    storage = storage_config(required=True)
    origin = public_origin(storage["public_origin"])
    client = storage_client(storage, args.timeout)
    with tempfile.TemporaryDirectory() as temporary:
        prepare_publication(args.candidate, Path(temporary), require_urls=False)
    candidate = object_value(load_json(args.candidate), "convergence candidate")
    repository_id = candidate["repositoryId"]
    workflow = candidate["workflow"]
    policy = candidate["policy"]
    observer = storage_client(storage, min(args.timeout, 3))
    before = cache_inventory(observer, repository_id, workflow)
    promoted_products = 0
    for item in candidate["results"]:
        receipt = item["receipt"]
        identity = receipt["workload"]
        digest = receipt["digest"]
        products = validate_products(receipt["products"], "receipt.products", require_urls=False)
        for name, product in products.items():
            if product["type"] != "job":
                data = product.get("data", {})
                if type(data.get("size")) is not int or data["size"] <= 0:
                    raise ConfigError("direct product requires a positive byte size")
                key = product_key(repository_id, workflow, policy, identity, name, data.get("sha256"))
                if product["source"] != f"{origin}/{key}":
                    raise ConfigError("direct product URL differs from its declared cache namespace")
                verify_product(client, origin, key, data, args.timeout)
                continue
            source = product["source"]
            source_archive = args.products_root / f"{source}.zip"
            if not source_archive.is_file():
                raise ConfigError(f"current-run product artifact is missing: {source}")
            archive = args.output_dir / "products" / f"{identity}-{name}.zip"
            normalize_product_archive(source_archive, archive)
            receipt["products"][name] = upload_product(client, origin, repository_id, workflow, policy,
                                                       identity, name, archive, args.timeout, product.get("data"))
            promoted_products += 1
    promoted_candidate = args.output_dir / "promoted-candidate.json"
    write_json_atomic(promoted_candidate, candidate)
    manifest = prepare_publication(promoted_candidate, args.output_dir)
    published = 0
    unchanged = 0
    for item in manifest:
        key = item["key"]
        file = Path(item["file"])
        receipt = load_json(file)
        url = f"{origin}/{key}"
        existing = existing_receipt(url, args.timeout)
        if existing is not None:
            if not same_reusable_result(existing, receipt):
                raise ConfigError(f"immutable workload result collision: {key}")
            unchanged += 1
            continue
        try:
            client.put_file(key=key, file=file)
            published += 1
        except R2PreconditionFailed:
            raced = existing_receipt(url, args.timeout)
            if raced is None or not same_reusable_result(raced, receipt):
                raise ConfigError(f"immutable workload result publication race differs: {key}")
            unchanged += 1
    usage = cache_usage_report(before, cache_inventory(observer, repository_id, workflow), repository_id, workflow)
    write_json_atomic(args.output_dir / "cache-usage.json", usage)
    append_summary("### Reusable workload cache capacity\n\n"
                   "Workflow scope, all policies; not a channel total. Version distribution objects excluded.\n\n"
                   "50 GiB is a review signal, never a deletion/eviction gate. Incomplete scans are lower bounds; "
                   "growth includes concurrent writers.\n\n```json\n" + json.dumps(usage, sort_keys=True, indent=2) + "\n```")
    print(
        json.dumps(
            {"promotedProducts": promoted_products, "published": published, "unchanged": unchanged},
            sort_keys=True,
        )
    )
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Plan and publish reusable workload results.")
    parser.add_argument("--config", type=Path)
    parser.add_argument("--root", type=Path)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("validate")
    sub.add_parser("control-paths")
    acquire = sub.add_parser("acquire")
    acquire.add_argument("--descriptor", type=Path, required=True)
    acquire.add_argument("--output", type=Path, required=True)
    execution = sub.add_parser("execution")
    execution.add_argument("--workflow", required=True)
    execution.add_argument("--output", type=Path, required=True)
    execution.add_argument("--github-output", type=Path)
    plan = sub.add_parser("github-output")
    plan.add_argument("--workflow", required=True)
    plan.add_argument("--scope-plan", type=Path, required=True)
    plan.add_argument("--runner-plan-json", required=True)
    plan.add_argument("--repository-id", type=int)
    plan.add_argument("--repository")
    plan.add_argument("--base-url", default="")
    plan.add_argument("--timeout", type=float, default=2.0)
    plan.add_argument("--mode", choices=["shadow", "enforce"], default="shadow")
    plan.add_argument("--pending", type=Path, required=True)
    plan.add_argument("--products-output", type=Path)
    contribute = sub.add_parser("contribute")
    contribute.add_argument("--pending", type=Path, required=True)
    contribute.add_argument("--workload", required=True)
    contribute.add_argument("--product", required=True)
    source = contribute.add_mutually_exclusive_group(required=True)
    source.add_argument("--artifact")
    source.add_argument("--directory", type=Path)
    contribute.add_argument("--timeout", type=float, default=120.0)
    contribute.add_argument("--output", type=Path, required=True)
    contribute_all = sub.add_parser("contribute-all")
    contribute_all.add_argument("--pending", type=Path, required=True)
    contribute_all.add_argument("--source-commit", required=True)
    contribute_all.add_argument("--output", type=Path, required=True)
    for command in ("contribute-batch", "bind"):
        batch = sub.add_parser(command)
        batch.add_argument("--pending", type=Path, required=True)
        batch.add_argument("--batch", required=True)
        batch.add_argument("--products-root", type=Path, required=True)
        batch.add_argument("--output", type=Path, required=True)
        if command == "contribute-batch":
            batch.add_argument("--directory-field", required=True)
            batch.add_argument("--timeout", type=float, default=120.0)
        else:
            batch.add_argument("--products-json", required=True)
    handoff = sub.add_parser("handoff")
    handoff.add_argument("--pending", type=Path, required=True)
    handoff.add_argument("--products-root", type=Path, required=True)
    handoff.add_argument("--handoff-root", type=Path, required=True)
    handoff.add_argument("--id", default="ci-results")
    admit = sub.add_parser("admit")
    admit.add_argument("--handoff-root", type=Path, required=True)
    admit.add_argument("--release-policy", type=Path)
    sub.add_parser("source")
    publication = sub.add_parser("prepare-publication")
    publication.add_argument("--candidate", type=Path, required=True)
    publication.add_argument("--output-dir", type=Path, required=True)
    sub.add_parser("storage-status")
    stage = sub.add_parser("stage-products")
    stage.add_argument("--candidate", type=Path, required=True)
    stage.add_argument("--output-dir", type=Path, required=True)
    stage.add_argument("--run-id", type=int)
    publish = sub.add_parser("publish")
    publish.add_argument("--candidate", type=Path, required=True)
    publish.add_argument("--output-dir", type=Path, required=True)
    publish.add_argument("--products-root", type=Path, required=True)
    publish.add_argument("--timeout", type=float, default=15.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.root.resolve() if args.root else repository_root(__file__)
    if args.command == "source":
        return source_command()
    if args.command == "prepare-publication":
        return prepare_publication_command(args)
    if args.command == "storage-status":
        return storage_status_command()
    if args.command == "stage-products":
        return stage_products_command(args)
    if args.command == "publish":
        return publish_command(args)
    contract = ConvergenceContract(args.config or root / ".github/config/convergence.json")
    if args.command == "control-paths":
        print("\n".join(contract.suite_paths(CONTROL_SUITE)))
        return 0
    if args.command == "validate":
        r2_self_check()
        self_check()
        runner_classes = {
            workload.runner_class
            for workflow in contract.workflows.values()
            for workload in workflow.workloads.values()
        }
        runner_plan = {runner_class: [f"validation-{runner_class}"] for runner_class in runner_classes}
        for workflow in contract.workflows:
            calculate(contract, root, workflow, runner_plan)
        print("convergence configuration is valid")
        return 0
    if args.command == "acquire":
        return acquire_command(args)
    if args.command == "execution":
        return execution_command(args, contract)
    if args.command == "github-output":
        return plan_command(args, contract, root)
    if args.command == "contribute":
        return contribute_command(args, contract)
    if args.command == "contribute-all":
        return contribute_all_command(args, contract)
    if args.command == "contribute-batch":
        return contribute_batch_command(args, contract)
    if args.command == "bind":
        return bind_command(args, contract)
    if args.command == "handoff":
        return handoff_command(args, contract)
    return admit_command(args, contract)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ConfigError, GitHubError, R2Error, json.JSONDecodeError, subprocess.SubprocessError, OSError) as error:
        print(f"convergence error: {error}", file=sys.stderr)
        raise SystemExit(2)
