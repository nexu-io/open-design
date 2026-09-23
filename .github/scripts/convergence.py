#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import http.client
import io
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
from typing import Any
from unittest.mock import patch

import handoff as handoff_contract
from lib.config import ConfigError, compact_json, load_json, object_value, repository_root
from lib.github import (
    GitHubError,
    append_outputs,
    append_summary,
    download_artifact,
    event_payload,
    run_jobs,
    unique_run_artifact,
)
from lib.r2 import R2Client, R2Credentials, R2Error, R2PreconditionFailed, self_check as r2_self_check
from lib.workload_products import materialize_products
from lib.postinstall_plan import plan_digest as postinstall_plan_digest
from lib.postinstall_plan import resolve_plan as resolve_postinstall_plan


PROTOCOL = "nexu-workload-result-v1"
# Identity/declaration semantics have one version. Storage receipts remain v1.
SCHEMA_VERSION = 10
SUPPORTED_SCHEMA_VERSIONS = {1, 9, SCHEMA_VERSION}
CONTROL_SUITE = "convergence-control"
DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")
IDENTITY_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,79}$")
PRODUCT_TYPES = {"job", "url"}
PUBLIC_READ_USER_AGENT = "open-design-workload-convergence/1"
JSON_BLOB_CACHE: dict[str, dict[str, Any]] = {}
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
        optional = {"postinstallIntent", "recipe", "trustedSources", "success", "successBoundary"}
        if not expected.issubset(value) or set(value) - expected - optional:
            raise ConfigError(
                f"convergence.workflows.{workflow}.workloads.{identity} keys must be {sorted(expected)}"
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
        self.success_boundary = value.get("successBoundary", "job")
        if not isinstance(self.success_boundary, str) or self.success_boundary not in {"job", "steps"}:
            raise ConfigError("successBoundary must be job or steps")
        if "successBoundary" in value and not self.reusable:
            raise ConfigError("successBoundary requires a reusable workload")
        self.success = object_value(value.get("success", {}), f"workload {workflow}/{identity}.success")
        for job, steps in self.success.items():
            require_string(job, "success job name")
            if (not isinstance(steps, list) or not steps
                    or any(not isinstance(step, str) or not step for step in steps)
                    or len(set(steps)) != len(steps)):
                raise ConfigError(f"success job {job} requires unique non-empty execution steps")
        self.recipe = require_identity(value["recipe"], "shared recipe") if "recipe" in value else None
        self.postinstall_intent = (
            require_identity(value["postinstallIntent"], f"workload {workflow}/{identity} postinstall intent")
            if "postinstallIntent" in value else None
        )
        self.trusted_sources = value.get("trustedSources", [])
        if not isinstance(self.trusted_sources, list):
            raise ConfigError("trustedSources must be an array")
        seen: set[str] = set()
        for source in self.trusted_sources:
            source = object_value(source, "trusted source")
            if set(source) != {"workflow", "policy", "workload"}:
                raise ConfigError("trusted source requires workflow, policy, and workload")
            for field, item in source.items():
                require_identity(item, f"trusted source {field}")
            if canonical_json(source) in seen:
                raise ConfigError("duplicate trusted source")
            seen.add(canonical_json(source))
        if (self.recipe is not None or self.trusted_sources) and not self.reusable:
            raise ConfigError("shared recipes require reusable workloads")
        if self.trusted_sources and self.recipe is None:
            raise ConfigError("trustedSources requires an explicit shared recipe")


class WorkflowContract:
    def __init__(self, name: str, raw: Any):
        value = object_value(raw, f"convergence.workflows.{name}")
        if not {"policy", "workloads"}.issubset(value) or set(value) - {"policy", "workloads", "batches", "matrices"}:
            raise ConfigError(f"convergence.workflows.{name} requires policy, workloads and optional batches/matrices")
        self.name = require_identity(name, "convergence workflow")
        self.policy = require_identity(value["policy"], f"convergence.workflows.{name}.policy")
        workloads = object_value(value["workloads"], f"convergence.workflows.{name}.workloads")
        if not workloads:
            raise ConfigError(f"convergence.workflows.{name}.workloads must not be empty")
        self.workloads = {identity: Workload(name, identity, raw_workload) for identity, raw_workload in workloads.items()}
        self.matrices = object_value(value.get("matrices", {}), "execution matrices")
        self.executions: dict[str, list[Any]] = {}
        for matrix_name, rows in self.matrices.items():
            require_identity(matrix_name, "matrix name")
            if not isinstance(rows, list) or not rows:
                raise ConfigError("execution matrix requires nonempty rows")
            names: set[str] = set()
            for row in rows:
                row = object_value(row, "matrix row")
                name = require_string(row.get("name"), "matrix row name")
                if name in names:
                    raise ConfigError("duplicate matrix row name")
                names.add(name)
                if sum(key in row for key in ("workload", "workloads", "enabledInput")) != 1:
                    raise ConfigError("matrix row requires one workload, workloads or enabledInput selector")
                if "enabledInput" not in row:
                    identities = row.get("workloads", [row.get("workload")])
                    if not isinstance(identities, list) or not identities or any(
                        not isinstance(identity, str) or identity not in self.workloads for identity in identities
                    ) or len(set(identities)) != len(identities):
                        raise ConfigError("matrix row references invalid workloads")
                    if len({self.workloads[identity].runner_class for identity in identities}) != 1:
                        raise ConfigError("grouped workloads must share an execution class")
                    if "runner" in row:
                        raise ConfigError("workload matrix runner comes from its execution class")
                    for identity in identities:
                        if name not in self.workloads[identity].success:
                            raise ConfigError("matrix row lacks a matching success proof")
                        self.executions.setdefault(identity, []).append(row)
                else:
                    require_identity(row["enabledInput"], "matrix enabled input")
                    require_string(row.get("runner"), "matrix runner")
        for identity, rows in self.executions.items():
            if {row["name"] for row in rows} != set(self.workloads[identity].success):
                raise ConfigError("matrix rows must cover every workload success job")
        self.batches = object_value(value.get("batches", {}), "execution batches")
        self.requests: dict[str, Any] = {}
        self.contributions: dict[str, Any] = {}
        for batch_name, batch in self.batches.items():
            require_identity(batch_name, "batch name")
            batch = object_value(batch, "batch")
            if set(batch) != {"artifact", "entries"}:
                raise ConfigError("batch requires artifact and entries")
            require_identity(batch["artifact"], "batch artifact")
            entries = object_value(batch["entries"], "batch entries")
            if not entries:
                raise ConfigError("batch must contain entries")
            for entry_name, entry in entries.items():
                require_identity(entry_name, "batch entry")
                entry = object_value(entry, "batch entry")
                if set(entry) != {"workload", "request", "product"}:
                    raise ConfigError("batch entry requires workload, request and product")
                identity = require_identity(entry["workload"], "batch workload")
                if identity not in self.workloads or identity in self.requests:
                    raise ConfigError("batch workload must be declared exactly once")
                if self.workloads[identity].products != "manifest":
                    raise ConfigError("batch workload must declare manifest products")
                require_identity(entry["product"], "batch product")
                request = object_value(entry["request"], "execution request")
                if set(request) & {"operation", "retain", "artifact"}:
                    raise ConfigError("request shadows control projection")
                self.requests[identity] = request
                self.contributions[identity] = {entry["product"]: {
                    "type": "job", "source": batch["artifact"], "path": f"{entry_name}/product"}}


class ConvergenceContract:
    def __init__(self, path: Path):
        value = object_value(load_json(path), "convergence")
        if not {"schema", "suites", "workflows"}.issubset(value) or set(value) - {"schema", "suites", "workflows", "resources"}:
            raise ConfigError("convergence keys must be schema, suites, workflows, and optional resources")
        schema = object_value(value["schema"], "convergence.schema")
        if (set(schema) != {"version"} or type(schema["version"]) is not int
                or schema["version"] not in SUPPORTED_SCHEMA_VERSIONS):
            raise ConfigError(f"convergence requires schema.version in {sorted(SUPPORTED_SCHEMA_VERSIONS)}")
        self.schema_version = schema["version"]
        self.resources = object_value(value.get("resources", {}), "convergence.resources")
        for name, resource in self.resources.items():
            require_identity(name, "resource name")
            resource = object_value(resource, f"resource {name}")
            if set(resource) == {"paths", "exclude"}:
                paths = self.tokens(resource["paths"], f"resource {name}.paths")
                excluded = resource["exclude"]
                if not isinstance(excluded, list) or any(not isinstance(item, str) or not item for item in excluded):
                    raise ConfigError(f"resource {name}.exclude must be path strings")
                for token in [*paths, *excluded]:
                    self.validate_path(token, name)
            elif set(resource) == {"json", "omit"}:
                token = require_string(resource["json"], f"resource {name}.json")
                self.validate_path(token, name)
                if any(char in token for char in "*?["):
                    raise ConfigError("JSON projection requires one literal file")
                omitted = resource["omit"]
                if not isinstance(omitted, list) or any(not isinstance(key, str) or not key for key in omitted) or len(set(omitted)) != len(omitted):
                    raise ConfigError("JSON projection omit must contain unique top-level field names")
            else:
                raise ConfigError(f"resource {name} requires paths/exclude or json/omit")
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
        if self.schema_version >= 9:
            for workflow in self.workflows.values():
                for workload in workflow.workloads.values():
                    if workload.reusable and not workload.success:
                        raise ConfigError(
                            f"reusable workload {workflow.name}/{workload.identity} requires success jobs"
                        )
        if self.schema_version < 10 and any(
            workload.postinstall_intent
            for workflow in self.workflows.values()
            for workload in workflow.workloads.values()
        ):
            raise ConfigError("postinstallIntent requires convergence schema.version 10")
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
                elif token.startswith("resource://"):
                    if token.removeprefix("resource://") not in self.resources:
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
                elif token.startswith("resource://"):
                    resource = self.resources[token.removeprefix("resource://")]
                    paths.update(resource["paths"] if "paths" in resource else [resource["json"]])
                else:
                    paths.add(token)

        collect(name)
        return sorted(paths)


class GitFingerprinter:
    def __init__(self, root: Path, index: Path | None = None):
        self.root = root
        self.index = index
        self.cache: dict[str, list[tuple[str, str, str, str]]] = {}
        self.json_cache: dict[str, dict[str, Any]] = {}
        self.tracked_files: dict[str, tuple[str, str, str, str]] | None = None

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
        result = subprocess.run(command, cwd=self.root, check=True, stdout=subprocess.PIPE,
                                env={**os.environ, "GIT_INDEX_FILE": str(self.index)} if self.index else None)
        records = []
        for raw in result.stdout.split(b"\0"):
            if not raw:
                continue
            metadata, path = raw.split(b"\t", 1)
            mode, oid, stage = metadata.decode("ascii").split()
            records.append((path.decode("utf-8", "surrogateescape"), mode, oid, stage))
        candidate = self.root / token
        if self.index is None and not records and not any(character in token for character in "*?[") and candidate.is_file():
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

    def resource_digest(self, resource: dict[str, Any]) -> str:
        """Project declared resources from Git blobs, never mutable checkout data.

        Omission is explicit configuration, not knowledge of product versions.
        Unknown JSON fields remain determinants; missing omitted fields refuse.
        """
        if "paths" in resource:
            records = {record for token in resource["paths"] for record in self.records(token)}
            excluded = {record[0] for token in resource["exclude"] for record in self.records(token)}
            projected: Any = sorted(record for record in records if record[0] not in excluded)
            if not projected:
                raise ConfigError("file resource projection is empty")
        else:
            records = self.records(resource["json"])
            if len(records) != 1 or records[0][0] != resource["json"] or records[0][1] not in {"100644", "100755"} or records[0][3] != "0":
                raise ConfigError("JSON resource requires one regular, unconflicted Git file")
            path, mode, oid, stage = records[0]
            raw = subprocess.check_output(["git", "cat-file", "blob", oid], cwd=self.root)
            value = object_value(json.loads(raw), f"JSON resource {path}")
            for key in resource["omit"]:
                if key not in value:
                    raise ConfigError(f"JSON resource {path} lacks omitted field {key}")
                del value[key]
            projected = {"path": path, "mode": mode, "stage": stage, "value": value}
        return hashlib.sha256(canonical_json({"declaration": resource, "value": projected}).encode()).hexdigest()

    def json_object(self, path: str) -> dict[str, Any]:
        if path in self.json_cache:
            return self.json_cache[path]
        if self.tracked_files is None:
            result = subprocess.run(
                ["git", "ls-files", "-s", "-z"], cwd=self.root, check=True, stdout=subprocess.PIPE,
                env={**os.environ, "GIT_INDEX_FILE": str(self.index)} if self.index else None,
            )
            self.tracked_files = {}
            for raw in result.stdout.split(b"\0"):
                if not raw:
                    continue
                metadata, raw_path = raw.split(b"\t", 1)
                mode, oid, stage = metadata.decode("ascii").split()
                name = raw_path.decode("utf-8", "surrogateescape")
                self.tracked_files[name] = (name, mode, oid, stage)
        record = self.tracked_files.get(path)
        if record is None or record[1] not in {"100644", "100755"} or record[3] != "0":
            raise ConfigError(f"JSON input requires one regular, unconflicted Git file: {path}")
        oid = record[2]
        if oid not in JSON_BLOB_CACHE:
            raw = subprocess.check_output(["git", "cat-file", "blob", oid], cwd=self.root)
            JSON_BLOB_CACHE[oid] = object_value(json.loads(raw), f"JSON input {path}")
        value = JSON_BLOB_CACHE[oid]
        self.json_cache[path] = value
        return value


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
    ordered_tokens = tokens if contract.schema_version == 1 else sorted(set(tokens))
    for token in ordered_tokens:
        digest.update(f"token\0{token}\0".encode())
        if token.startswith("suite://"):
            name = token.removeprefix("suite://")
            child = digest_tokens(contract, fingerprinter, token, contract.suites[name], resolved)
            digest.update(f"digest\0{child}\0".encode())
        elif token.startswith("resource://"):
            child = fingerprinter.resource_digest(contract.resources[token.removeprefix("resource://")])
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
    *,
    index: Path | None = None,
    identities: set[str] | None = None,
) -> dict[str, dict[str, Any]]:
    workflow = contract.workflow(workflow_name)
    resolved: dict[str, str] = {}
    fingerprinter = GitFingerprinter(root, index)
    legacy_control_digest = (
        digest_tokens(contract, fingerprinter, f"suite://{CONTROL_SUITE}", contract.suites[CONTROL_SUITE], resolved)
        if contract.schema_version == 1 else None
    )
    postinstall_plans: dict[str, dict[str, Any]] = {}
    results: dict[str, dict[str, Any]] = {}
    for identity, workload in workflow.workloads.items():
        if identities is not None and identity not in identities:
            continue
        if workload.runner_class not in runner_plan:
            raise ConfigError(f"runner plan lacks class {workload.runner_class} for {workflow_name}/{identity}")
        labels = runner_plan[workload.runner_class]
        if not isinstance(labels, list) or not labels or any(not isinstance(label, str) or not label for label in labels):
            raise ConfigError(f"runner plan class {workload.runner_class} must be a non-empty string array")
        input_digest = digest_tokens(
            contract,
            fingerprinter,
            f"recipe-inputs://{workload.recipe}" if workload.recipe else f"workload-inputs://{workflow_name}/{identity}",
            workload.inputs,
            {} if workload.recipe else resolved,
        )
        execution_class = canonical_json({"runnerClass": workload.runner_class, "labels": labels})
        postinstall = None
        if workload.postinstall_intent:
            try:
                if workload.postinstall_intent not in postinstall_plans:
                    postinstall_plans[workload.postinstall_intent] = resolve_postinstall_plan(
                        workload.postinstall_intent, fingerprinter.json_object,
                    )
                plan = postinstall_plans[workload.postinstall_intent]
            except (KeyError, TypeError, ValueError) as error:
                raise ConfigError(
                    f"invalid postinstall plan for {workflow_name}/{identity}: {error}"
                ) from error
            postinstall = {
                "intent": workload.postinstall_intent,
                "digest": postinstall_plan_digest(plan),
            }
        if contract.schema_version == 1:
            digest = hashlib.sha256()
            digest.update(f"{PROTOCOL}\0workload-result\0".encode())
            for value in (
                workflow_name, workflow.policy, identity, input_digest,
                legacy_control_digest, execution_class, workload.products,
            ):
                digest.update(value.encode())
                digest.update(b"\0")
            results[identity] = {
                "digest": digest.hexdigest(),
                "executionClass": json.loads(execution_class),
                "products": workload.products,
                "reusable": workload.reusable,
            }
            continue
        # Control source is an admission boundary, not a global cache input.
        # Workloads declare execution-affecting source/configuration explicitly.
        identity_material = {
            "schemaVersion": contract.schema_version, "protocol": PROTOCOL,
            "identity": {"recipe": workload.recipe} if workload.recipe else {
                "workflow": workflow_name, "policy": workflow.policy, "workload": identity,
            },
            "inputs": input_digest, "executionClass": json.loads(execution_class),
            "products": workload.products, "reusable": workload.reusable,
            "success": workload.success,
            "successBoundary": workload.success_boundary,
            "request": workflow.requests.get(identity),
            "execution": workflow.executions.get(identity),
        }
        if postinstall is not None:
            identity_material["postinstallPlan"] = postinstall
        digest = hashlib.sha256(canonical_json(identity_material).encode())
        results[identity] = {
            "digest": digest.hexdigest(),
            "executionClass": json.loads(execution_class),
            "products": workload.products,
            "reusable": workload.reusable,
            "trustedSources": workload.trusted_sources,
        }
        if postinstall is not None:
            results[identity]["postinstallPlan"] = postinstall
    return results


def calculate_snapshot(
    contract: ConvergenceContract, root: Path, workflow: str,
    runner_plan: dict[str, Any], tree_sha: str,
    *, identities: set[str] | None = None,
) -> dict[str, dict[str, Any]]:
    """Read an independently verified Git tree as data, using the sole identity algorithm.

    The caller must authenticate the tree against the producing run first.
    No producer files are checked out or executed and the trusted index is untouched.
    """
    if not re.fullmatch(r"[0-9a-f]{40}", tree_sha):
        raise ConfigError("snapshot tree must be a full Git SHA")
    with tempfile.TemporaryDirectory(prefix="convergence-index-") as temporary:
        index = Path(temporary) / "index"
        subprocess.run(["git", "read-tree", tree_sha], cwd=root, check=True,
                       env={**os.environ, "GIT_INDEX_FILE": str(index)})
        return calculate(contract, root, workflow, runner_plan, index=index, identities=identities)


def validate_candidate_plan(
    candidate: dict[str, Any], contract: ConvergenceContract,
    expected: dict[str, dict[str, Any]],
) -> None:
    """Bind every result to an independently calculated trusted plan, not to itself."""
    workflow = contract.workflow(candidate["workflow"])
    if candidate["policy"] != workflow.policy:
        raise ConfigError("candidate policy differs from trusted plan")
    with tempfile.TemporaryDirectory(prefix="convergence-candidate-") as temporary:
        source = Path(temporary) / "candidate.json"
        write_json_atomic(source, candidate)
        prepare_publication(source, Path(temporary) / "receipts", require_urls=False)
    for item in candidate["results"]:
        receipt = item["receipt"]
        identity = receipt["workload"]
        value = expected.get(identity)
        if identity not in workflow.workloads or value is None or not value["reusable"]:
            raise ConfigError(f"candidate workload is not reusable in trusted plan: {identity}")
        for field in ("digest", "executionClass"):
            if receipt[field] != value[field]:
                raise ConfigError(f"candidate {identity} {field} differs from trusted plan")
        if bool(receipt["products"]) != (value["products"] == "manifest"):
            raise ConfigError(f"candidate {identity} products differ from trusted plan")
        if identity in workflow.contributions and receipt["products"] != workflow.contributions[identity]:
            raise ConfigError(f"candidate {identity} batch source differs from declaration")


def successful_workload_jobs(
    jobs: list[dict[str, Any]], required: dict[str, list[str]],
    provenance: dict[str, Any], execution_class: dict[str, Any],
    *, boundary: str = "job",
) -> list[int] | None:
    """Accept all declared shards and required steps from a trusted attempt API response.

    `required` belongs to trusted workflow configuration, never a candidate.
    Missing/failed/cancelled/skipped required execution is never a success.
    Explicit steps boundaries permit a completed job whose unrelated tail failed;
    cancellation and incomplete jobs remain ineligible. The default is job-wide.
    Contradictory or ambiguous identities are invalid evidence. Older attempts
    are not silently borrowed; their independently published receipts remain usable.
    """
    if boundary not in {"job", "steps"}:
        raise ConfigError("unknown workload success boundary")
    if not required or any(not steps for steps in required.values()):
        raise ConfigError("workload success requires jobs with explicit execution steps")
    accepted = []
    for name, steps in required.items():
        matches = [job for job in jobs if job.get("name") == name]
        if len(matches) > 1:
            raise ConfigError(f"ambiguous workload job: {name}")
        if not matches:
            return None
        job = matches[0]
        for field, expected in (("run_id", provenance["runId"]),
                                ("run_attempt", provenance["runAttempt"]),
                                ("head_sha", provenance["headSha"])):
            if job.get(field) != expected:
                raise ConfigError(f"workload job {name} {field} differs from producing attempt")
        conclusions = {"success", "failure"} if boundary == "steps" else {"success"}
        if job.get("status") != "completed" or job.get("conclusion") not in conclusions:
            return None
        if job.get("labels") != execution_class["labels"]:
            raise ConfigError(f"workload job {name} runner labels differ from plan")
        if type(job.get("id")) is not int or job["id"] <= 0 or job["id"] in accepted:
            raise ConfigError(f"invalid or repeated workload job id: {name}")
        for step in steps:
            executions = [item for item in job.get("steps", []) if item.get("name") == step]
            if len(executions) > 1:
                raise ConfigError(f"ambiguous workload step: {name}/{step}")
            if not executions or executions[0].get("status") != "completed" or executions[0].get("conclusion") != "success":
                return None
        accepted.append(job["id"])
    return accepted


def result_key(repository_id: int, workflow: str, policy: str, identity: str, digest: str) -> str:
    return (
        f"workload-results/v1/repos/{repository_id}/workflows/{workflow}/policies/{policy}"
        f"/workloads/{identity}/digests/{digest}.json"
    )


def product_key(
    repository_id: int,
    workflow: str,
    policy: str,
    identity: str,
    digest: str,
    product: str,
) -> str:
    return (
        f"workload-products/v1/repos/{repository_id}/workflows/{workflow}/policies/{policy}"
        f"/workloads/{identity}/digests/{digest}/products/{product}.zip"
    )


def validate_products(value: Any, label: str, require_urls: bool) -> dict[str, Any]:
    products = object_value(value, label)
    normalized: dict[str, Any] = {}
    for name, raw in sorted(products.items()):
        require_identity(name, f"{label} product")
        entry = object_value(raw, f"{label}.{name}")
        if not {"type", "source"}.issubset(entry) or set(entry) - {"type", "source", "data", "path"}:
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
        if "path" in entry:
            path = require_string(entry["path"], "product artifact path")
            if product_type != "job" or any(not IDENTITY_RE.fullmatch(part) for part in path.split("/")):
                raise ConfigError("product path requires a safe current-job directory")
            normalized_entry["path"] = path
        if "data" in entry:
            data = object_value(entry["data"], f"{label}.{name}.data")
            canonical_json(data)
            if "sha256" in data and (
                not isinstance(data["sha256"], str) or not DIGEST_RE.fullmatch(data["sha256"])
            ):
                raise ConfigError(f"{label}.{name}.data.sha256 must be a lowercase SHA-256 digest")
            normalized_entry["data"] = data
        if require_urls and not DIGEST_RE.fullmatch(normalized_entry.get("data", {}).get("sha256", "")):
            raise ConfigError(f"{label}.{name}.data.sha256 is required for a promoted URL product")
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
        "digest": expected["digest"],
        "executionClass": expected["executionClass"],
    }
    source = {key: result.get(key) for key in ("workflow", "policy", "workload")}
    if source not in result_sources(workflow, identity, expected):
        raise ConfigError("workload result producer is not explicitly trusted")
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


def normalize_product_archive(source: Path, destination: Path, prefix: str | None = None) -> None:
    if prefix is not None and any(not IDENTITY_RE.fullmatch(part) for part in prefix.split("/")):
        raise ConfigError("unsafe product artifact selection")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source, "r") as input_archive:
        entries = sorted(input_archive.infolist(), key=lambda entry: entry.filename)
        if len(entries) > 10000:
            raise ConfigError("product artifact contains too many entries")
        if sum(entry.file_size for entry in entries) > 2 * 1024 * 1024 * 1024:
            raise ConfigError("product artifact expands beyond 2 GiB")
        seen: set[str] = set()
        selected = 0
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
                if prefix is not None:
                    if not name.startswith(prefix + "/"):
                        continue
                    name = name[len(prefix) + 1:]
                    if not name:
                        continue
                selected += 1
                directory = name.endswith("/")
                normalized = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                normalized.compress_type = zipfile.ZIP_DEFLATED
                normalized.external_attr = (0o40755 if directory else 0o100644) << 16
                if directory:
                    output_archive.writestr(normalized, b"")
                    continue
                with input_archive.open(entry, "r") as input_file, output_archive.open(normalized, "w") as output_file:
                    shutil.copyfileobj(input_file, output_file, length=1024 * 1024)
        if not selected:
            raise ConfigError("product artifact selection is empty")


def result_sources(workflow: WorkflowContract, identity: str, expected: dict[str, Any]) -> list[dict[str, str]]:
    own = {"workflow": workflow.name, "policy": workflow.policy, "workload": identity}
    return [own, *[source for source in expected.get("trustedSources", []) if source != own]]


def retry_public_read(read):
    """One retry for enumerated transport failures; never authorize a build."""
    for attempt in range(2):
        try:
            return read()
        except urllib.error.HTTPError as error:
            if error.code not in {408, 429, 500, 502, 503, 504} or attempt:
                raise
        except (TimeoutError, ConnectionError, http.client.IncompleteRead,
                http.client.RemoteDisconnected) as error:
            if attempt:
                raise ConfigError(f"public read unavailable after one retry: {type(error).__name__}") from error
        except urllib.error.URLError as error:
            if not isinstance(error.reason, (TimeoutError, ConnectionError)) or attempt:
                raise ConfigError(f"public read unavailable: {type(error.reason).__name__}") from error


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
    if base_url:
        parsed = urllib.parse.urlparse(base_url)
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ConfigError("invalid configured workload result base URL")
    def resolve_one(item: tuple[str, dict[str, Any]]) -> tuple[str, bool, str, Any]:
        identity, expected = item
        if not expected["reusable"]:
            return identity, False, "reuse-disabled", None
        if not base_url:
            return identity, False, "base-url-missing", None
        reason = "result-missing"
        for source in result_sources(workflow, identity, expected):
            key = result_key(repository_id, source["workflow"], source["policy"], source["workload"], expected["digest"])
            url = f"{base_url.rstrip('/')}/{key}"
            try:
                value = retry_public_read(lambda: fetch_result(url, timeout))
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    continue
                raise ConfigError(f"result read failed for {identity}: HTTP {error.code}") from error
            result = validate_result(value, repository_id=repository_id, workflow=workflow,
                                     identity=identity, expected=expected)
            if any(result[field] != source[field] for field in source):
                raise ConfigError("workload result producer differs from requested storage key")
            for product in result["products"].values():
                # A receipt with missing products is broken, not a cache miss.
                # Planning observes availability, never materializes payloads.
                retry_public_read(lambda: probe_product(product["source"], timeout))
            return identity, True, "result-hit", result
        return identity, False, reason, None
    # Bound independent public metadata reads; preserve declaration order
    # regardless of completion order. Unavailable is not absent.
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


def project_batches(workflow: WorkflowContract, pending: dict[str, Any], output: Path | None = None) -> dict[str, Any]:
    """Independent identities, grouped transport; executors never receive Plan state."""
    requests: dict[str, Any] = {}
    for batch_name, batch in workflow.batches.items():
        requests[batch_name] = {}
        for name, entry in batch["entries"].items():
            decision = pending["workloads"][entry["workload"]]
            if not decision["scopeEnabled"]:
                continue
            request = dict(entry["request"])
            request.update(operation="build", retain=bool(pending["mode"] == "enforce"
                           and decision["reusable"] and decision["run"] and not decision["resultHit"]))
            if not decision["run"]:
                if not decision["resultHit"] or not decision["reusable"]:
                    raise ConfigError("execution projection requires a reusable hit")
                products = validate_products(decision["result"]["products"], "batch inputs", require_urls=True)
                if set(products) != {entry["product"]}:
                    raise ConfigError("batch product set differs")
                product = products[entry["product"]]
                digest = product.get("data", {}).get("sha256")
                if not isinstance(digest, str) or not DIGEST_RE.fullmatch(digest):
                    raise ConfigError("execution input requires a verified product digest")
                request.update(operation="restore", artifact={"url": product["source"], "sha256": digest})
            else:
                # Project the already calculated identity, never hash again in
                # a runner or require the native executor to understand Plan.
                request["buildId"] = decision["digest"]
            requests[batch_name][name] = request
            if output is not None:
                write_json_atomic(output / batch_name / f"{name}.json", request)
    return requests


def published_requests(workflow: WorkflowContract, pending: dict[str, Any], receipts: list[Any]) -> dict[str, Any]:
    """Resolve consumer requests from admitted receipts, never recalculate identity.

    Called only after the trusted writer published the supplied receipts. An
    unfinished workload remains a build request; consumers must refuse it.
    """
    decisions = dict(pending["workloads"])
    seen: set[str] = set()
    for receipt in receipts:
        identity = require_identity(receipt.get("workload"), "published workload")
        if identity not in decisions or identity in seen:
            raise ConfigError("unexpected or duplicate published workload")
        seen.add(identity)
        expected = decisions[identity]
        result = validate_result(receipt, repository_id=pending["repositoryId"],
                                 workflow=workflow, identity=identity, expected=expected)
        decisions[identity] = {**expected, "resultHit": True, "run": False, "result": result}
    return project_batches(workflow, {**pending, "workloads": decisions})


def consumer_sources(requests: dict[str, Any]) -> dict[str, Any]:
    """Business descriptors plus verified bytes; no Plan state reaches consumers."""
    return {name: [
        {**{key: value for key, value in request.items() if key not in {"operation", "retain", "artifact"}},
         **request["artifact"]} for request in entries.values()
    ] if entries and all(request["operation"] == "restore" for request in entries.values()) else None
            for name, entries in requests.items()}


def reference_key(value: Any) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_./-]+", value):
        raise ConfigError("invalid product key")
    if any(part in {"", ".", ".."} for part in value.split("/")):
        raise ConfigError("unsafe product key")
    return value


def key_requests(requests: dict[str, Any], origin: str) -> dict[str, Any]:
    """Job outputs carry keys only; public URLs stay in receipts/local inputs."""
    result = json.loads(compact_json(requests))
    for entries in result.values():
        for request in entries.values():
            if "artifact" not in request:
                continue
            artifact = request["artifact"]
            prefix = public_origin(origin) + "/"
            url = artifact.pop("url")
            if not url.startswith(prefix):
                raise ConfigError("product reference is outside the configured origin")
            artifact["key"] = reference_key(url[len(prefix):])
    return result


def resolve_references(args: argparse.Namespace) -> int:
    """Runner-local address assembly only: no Git, identities or cache decisions."""
    origin = public_origin(os.environ.get("OD_WORKLOAD_RESULTS_BASE_URL", ""))
    values = {}

    def resolve(reference):
        if not isinstance(reference, dict) or "url" in reference:
            raise ConfigError("expected a key-only product reference")
        digest = reference.get("sha256")
        if not isinstance(digest, str) or not DIGEST_RE.fullmatch(digest):
            raise ConfigError("product reference requires SHA-256")
        return {**{k: v for k, v in reference.items() if k != "key"},
                "url": origin + "/" + reference_key(reference.get("key"))}

    if args.shared:
        sources = json.loads(os.environ.get("SHARED_SOURCES", "null"))
        if not isinstance(sources, list) or not all(isinstance(s, dict) for s in sources) or sorted(s.get("unit", "") for s in sources) != sorted(args.shared.split(",")):
            raise ConfigError("shared product references are missing or incomplete")
        values["WORKSPACE_SOURCES"] = compact_json([resolve(source) for source in sources])
    if args.batch:
        requests = json.loads(os.environ.get("SOURCE_REQUESTS", "null"))
        if not isinstance(requests, dict) or not isinstance(requests.get(args.batch), dict) or not requests[args.batch]:
            raise ConfigError("source request batch is missing")
        for name, request in requests[args.batch].items():
            if not re.fullmatch(r"[a-z][a-z0-9_]*", name):
                raise ConfigError("invalid source request name")
            operation = request.get("operation")
            if operation not in {"build", "restore"}:
                raise ConfigError("invalid source operation")
            artifact = resolve(request.get("artifact")) if operation == "restore" else {}
            values[f"SOURCE_{name.upper()}_URL"] = artifact.get("url", "")
            values[f"SOURCE_{name.upper()}_SHA256"] = artifact.get("sha256", "")
            if operation == "build":
                build_id = request.get("buildId")
                if not isinstance(build_id, str) or not DIGEST_RE.fullmatch(build_id):
                    raise ConfigError("build request requires its projected build identity")
                values[f"SOURCE_{name.upper()}_BUILD_ID"] = build_id
    if not values:
        raise ConfigError("no references selected")
    # Atomic validation before writing any local environment values. Never
    # append complete URLs to GITHUB_OUTPUT (runner secret filtering drops them).
    path = os.environ.get("GITHUB_ENV")
    if not path:
        raise ConfigError("GITHUB_ENV is required for runner-local references")
    if any("\n" in value or "\r" in value for value in values.values()):
        raise ConfigError("reference environment value contains a line break")
    with open(path, "a", encoding="utf-8") as stream:
        for key, value in values.items():
            stream.write(f"{key}={value}\n")
    return 0


def project_matrices(workflow: WorkflowContract, run: dict[str, bool],
                     runners: dict[str, Any], inputs: dict[str, Any]) -> dict[str, str]:
    """Project independent unit decisions; no aggregate hot/cold policy."""
    outputs = {}
    for name, rows in workflow.matrices.items():
        selected = []
        for row in rows:
            member = dict(row)
            if "enabledInput" not in row:
                identities = row.get("workloads", [row.get("workload")])
                if any(identity not in run for identity in identities):
                    raise ConfigError("matrix workload lacks a Plan decision")
                if not any(run[identity] for identity in identities):
                    continue
                member["runner"] = runners[workflow.workloads[identities[0]].runner_class]
            else:
                enabled = inputs.get(row["enabledInput"])
                if type(enabled) is not bool:
                    raise ConfigError("matrix selection input must be boolean")
                if not enabled:
                    continue
            selected.append(member)
        outputs[f"{name}_matrix"] = compact_json({"include": selected})
        outputs[f"{name}_count"] = str(len(selected))
        # Project each receipt's complete shard set for independently scheduled
        # jobs in the calling workflow. This does not alter workload identity.
        for identity in sorted({row["workload"] for row in rows if "workload" in row}):
            outputs[f"{identity}_matrix"] = compact_json({
                "include": [row for row in selected if row.get("workload") == identity],
            })
    return outputs


def contribute_batches_command(args: argparse.Namespace, contract: ConvergenceContract) -> int:
    pending = load_json(args.pending)
    workflow = contract.workflow(pending["workflow"])
    for batch in workflow.batches.values():
        for name, entry in batch["entries"].items():
            decision = pending["workloads"][entry["workload"]]
            if not (decision["scopeEnabled"] and decision["reusable"] and decision["run"] and not decision["resultHit"]):
                continue
            products = {entry["product"]: {"type": "job", "source": batch["artifact"], "path": f"{name}/product"}}
            contribute_command(argparse.Namespace(pending=args.pending, workload=entry["workload"],
                               products_json=json.dumps(products), output_dir=args.output_dir), contract)
    return 0


def restore_command(args: argparse.Namespace, contract: ConvergenceContract) -> int:
    pending = object_value(load_json(args.pending), "pending convergence")
    workflow = contract.workflow(require_identity(pending.get("workflow"), "pending workflow"))
    if pending.get("protocol") != PROTOCOL or pending.get("schemaVersion") != 1 or pending.get("policy") != workflow.policy:
        raise ConfigError("pending convergence contract differs")
    if args.workload not in workflow.workloads:
        raise ConfigError("unknown restore workload")
    expected = object_value(pending.get("workloads"), "pending workloads").get(args.workload)
    expected = object_value(expected, "pending workload")
    if args.refresh and expected.get("scopeEnabled") and expected.get("reusable"):
        # Acquire a newly published result using the frozen recipe identity.
        # Never re-fingerprint the source in a consuming job.
        workflow_results = resolve_results(
            os.environ.get("OD_WORKLOAD_RESULTS_BASE_URL"), pending["repositoryId"],
            workflow, {args.workload: expected}, args.timeout,
        )
        expected = {**expected, "resultHit": workflow_results[0][args.workload],
                    "result": workflow_results[2].get(args.workload)}
    if not expected.get("scopeEnabled") or not expected.get("reusable") or not expected.get("resultHit"):
        raise ConfigError("restore requires a selected reusable-result hit")
    if args.output_dir.exists() or args.output_dir.is_symlink():
        raise ConfigError("product destination must not already exist")
    # Receipt selection and binding are configuration facts. They must remain
    # fail-fast even when the caller permits unavailable product bytes to fall
    # back to workload execution.
    result = validate_result(
        expected.get("result"), repository_id=pending["repositoryId"],
        workflow=workflow, identity=args.workload, expected=expected,
    )
    try:
        sizes = materialize_products(
            result["products"], args.output_dir,
            lambda url: public_read_request(url, accept="*/*"), timeout=args.timeout,
        )
    except (ConfigError, OSError, http.client.HTTPException, urllib.error.URLError) as error:
        # This output permits an explicit executor fallback; it never turns a
        # failed restoration into a successful build or validation receipt.
        report = {"restored": False, "reason": f"restore-unavailable:{type(error).__name__}"}
    else:
        report = {"restored": True, "bytes": sum(sizes.values()), "products": sizes}
    append_outputs({"restored": str(report["restored"]).lower()})
    print(json.dumps(report, sort_keys=True))
    return 0 if report["restored"] or args.allow_miss else 2


def plan_command(args: argparse.Namespace, contract: ConvergenceContract, root: Path) -> int:
    repository_id = args.repository_id or int(os.environ.get("GITHUB_REPOSITORY_ID", "0"))
    repository = args.repository or os.environ.get("GITHUB_REPOSITORY", "")
    base_url = args.base_url or os.environ.get(STORAGE_ENV["public_origin"], "")
    if repository_id <= 0 or not repository:
        raise ConfigError("repository id and name are required for convergence planning")
    workflow = contract.workflow(args.workflow)
    enabled = ({identity: True for identity in workflow.workloads}
               if args.all_workloads else object_value(load_json(args.scope_plan).get("enabled"), "scope plan.enabled"))
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
    run, would_run = execution_decisions(enabled, hits, args.mode)
    reasons = {
        identity: "scope-disabled"
        if not enabled[identity]
        else "shadow-result-hit"
        if args.mode == "shadow" and hits[identity]
        else "result-hit"
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
    requests = project_batches(workflow, pending, args.pending.parent / "requests")
    transport = key_requests(requests, base_url)
    append_outputs({"requests": compact_json(transport)})
    append_outputs({"sources": compact_json(consumer_sources(transport))})
    append_outputs(project_matrices(workflow, run, json.loads(args.runner_plan_json),
                                    object_value(json.loads(args.execution_inputs_json), "execution inputs")))
    append_outputs(
        {
            "run": compact_json(run),
            "hit": compact_json(hits),
            "would_run": compact_json(would_run),
            "expects_contributions": str(any(run[name] and calculated[name]["reusable"] and not hits[name]
                                             for name in calculated)).lower(),
            "contributions": compact_json({
                mode: any(run[name] and value["reusable"] and not hits[name] and value["products"] == mode
                          for name, value in calculated.items()) for mode in ("none", "manifest")
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
    jobs: list[dict[str, Any]] | None = None,
    *, products_mode: str | None = None,
) -> dict[str, Any]:
    pending = object_value(load_json(pending_path), "pending convergence")
    workflow = contract.workflow(require_string(pending.get("workflow"), "pending workflow"))
    if pending.get("schemaVersion") != 1 or pending.get("protocol") != PROTOCOL or pending.get("policy") != workflow.policy:
        raise ConfigError("pending convergence contract differs")
    provenance = validated_provenance(provenance)
    workloads = object_value(pending.get("workloads"), "pending workloads")
    receipts = []
    if products_mode not in {None, "none", "manifest"}:
        raise ConfigError("unknown collection product mode")
    for identity, raw in workloads.items():
        if identity not in workflow.workloads:
            raise ConfigError(f"pending convergence has unknown workload {identity}")
        if products_mode is not None and workflow.workloads[identity].products != products_mode:
            continue
        value = object_value(raw, f"pending workloads.{identity}")
        if (
            not value.get("reusable")
            or not value.get("scopeEnabled")
            or not value.get("run")
            or value.get("resultHit")
        ):
            continue
        if jobs is not None and successful_workload_jobs(
            jobs, workflow.workloads[identity].success, provenance, value["executionClass"],
            boundary=workflow.workloads[identity].success_boundary,
        ) is None:
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
            if identity in workflow.contributions and products != workflow.contributions[identity]:
                raise ConfigError(f"product manifest batch source differs: {identity}")
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
    jobs = None if contract.schema_version == 1 else run_jobs(
        context["repository"], context["provenance"]["runId"], context["provenance"]["runAttempt"]
    )
    products_mode = getattr(args, "products", None)
    if products_mode == "manifest":
        contribute_batches_command(argparse.Namespace(pending=args.pending, output_dir=args.products_root), contract)
    candidate = finalize_candidate(args.pending, context["provenance"], args.products_root, contract, jobs,
                                   products_mode=products_mode)
    identities = getattr(args, "workloads", [])
    if not isinstance(identities, list) or any(not isinstance(value, str) for value in identities) or len(set(identities)) != len(identities):
        raise ConfigError("contribution workloads must be a unique string array")
    if identities:
        workflow = contract.workflow(load_json(args.pending)["workflow"])
        if any(identity not in workflow.workloads for identity in identities):
            raise ConfigError("unknown contribution workload")
        candidate["results"] = [item for item in candidate["results"] if item["receipt"]["workload"] in identities]
        if {item["receipt"]["workload"] for item in candidate["results"]} != set(identities):
            raise ConfigError("selected contribution workload lacks complete success evidence")
    batch_names = getattr(args, "batches", [])
    if not isinstance(batch_names, list) or any(not isinstance(name, str) for name in batch_names) or len(set(batch_names)) != len(batch_names):
        raise ConfigError("contribution batches must be a unique string array")
    if batch_names:
        pending = load_json(args.pending)
        workflow = contract.workflow(pending["workflow"])
        if any(name not in workflow.batches for name in batch_names):
            raise ConfigError("unknown contribution batch")
        selected = {entry["workload"] for name in batch_names for entry in workflow.batches[name]["entries"].values()}
        candidate["results"] = [item for item in candidate["results"] if item["receipt"]["workload"] in selected]
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


def authenticated_source_tree(entry: dict[str, Any], payload: dict[str, Any]) -> str:
    """Bind the candidate tree to the server's checkout commit, never its claim.

    PR runs execute a merge tree, not the head branch tree. Only the server merge
    ref with the exact recorded base/head parents is admissible. A moved or
    unavailable ref fails closed; we never checkout or execute producer files.
    """
    commit = entry["head_sha"]
    if entry["event"] == "pull_request":
        pulls = payload["workflow_run"].get("pull_requests", [])
        if not isinstance(pulls, list) or len(pulls) != 1:
            raise ConfigError("PR source tree requires exactly one producing pull request")
        number = object_value(pulls[0], "producing pull request").get("number")
        if type(number) is not int or number <= 0:
            raise ConfigError("producing pull request number must be positive")
        subprocess.run(["git", "fetch", "--no-tags", "--depth=1", "origin",
                        f"refs/pull/{number}/merge"], check=True)
        commit = subprocess.check_output(["git", "rev-parse", "FETCH_HEAD"], text=True).strip()
        # cat-file preserves real parents even in a depth-1 checkout; rev-list
        # and pretty-format %P intentionally hide parents at shallow boundaries.
        raw = subprocess.check_output(["git", "cat-file", "-p", commit], text=True)
        headers = raw.split("\n\n", 1)[0].splitlines()
        parents = [line.removeprefix("parent ") for line in headers if line.startswith("parent ")]
        if parents != [entry["base_sha"], entry["head_sha"]]:
            raise ConfigError("producing PR merge parents differ from candidate base/head")
    tree = subprocess.check_output(["git", "rev-parse", f"{commit}^{{tree}}"], text=True).strip()
    if tree != entry["tree_sha"]:
        raise ConfigError("candidate tree differs from authenticated source tree")
    return tree


def validate_admitted_plan(
    candidate: dict[str, Any], contract: ConvergenceContract, root: Path, tree: str,
) -> None:
    """Authenticate execution via attempt jobs, then recompute the source recipe.

    Job names and required steps come from trusted configuration. Runner labels
    come from those actual jobs, not a CI-specific global runner catalogue.
    """
    workflow = contract.workflow(candidate["workflow"])
    provenance = candidate["provenance"]
    jobs = run_jobs(candidate["repository"], provenance["runId"], provenance["runAttempt"])
    receipts = [object_value(item.get("receipt"), "candidate receipt")
                for item in candidate["results"]]
    runners: dict[str, Any] = {}
    identities: set[str] = set()
    for receipt in receipts:
        identity = receipt.get("workload")
        if identity not in workflow.workloads or not workflow.workloads[identity].reusable:
            raise ConfigError(f"candidate workload is not reusable: {identity}")
        workload = workflow.workloads[identity]
        execution = object_value(receipt.get("executionClass"), "receipt execution class")
        if set(execution) != {"runnerClass", "labels"} or execution["runnerClass"] != workload.runner_class:
            raise ConfigError(f"candidate {identity} runner class differs from declaration")
        if successful_workload_jobs(jobs, workload.success, provenance, execution,
                                    boundary=workload.success_boundary) is None:
            raise ConfigError(f"candidate {identity} lacks successful execution in producing attempt")
        if workload.runner_class in runners and runners[workload.runner_class] != execution["labels"]:
            raise ConfigError("candidate has inconsistent runner class labels")
        runners[workload.runner_class] = execution["labels"]
        identities.add(identity)
    expected = calculate_snapshot(contract, root, workflow.name, runners, tree, identities=identities)
    validate_candidate_plan(candidate, contract, expected)


def admit_command(args: argparse.Namespace, contract: ConvergenceContract) -> int:
    payload = event_payload()
    context = workflow_run_context(payload)
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
    if publish and contract.schema_version != 1:
        tree = authenticated_source_tree(entry, payload)
        root = args.root.resolve() if args.root else repository_root(__file__)
        validate_admitted_plan(load_json(Path(candidate)), contract, root, tree)
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


def stage_products_command(args: argparse.Namespace) -> int:
    repository = require_string(os.environ.get("GITHUB_REPOSITORY"), "GITHUB_REPOSITORY")
    run_id = args.run_id
    if run_id is None:
        run_id = workflow_run_context(event_payload())["run_id"]
    if run_id <= 0:
        raise ConfigError("a positive producing run id is required")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    staged = []
    for source in candidate_product_sources(args.candidate):
        artifact = unique_run_artifact(repository, run_id, source)
        if artifact is None:
            raise ConfigError(f"current-run product artifact is missing: {source}")
        destination = args.output_dir / f"{source}.zip"
        download_artifact(repository, artifact["id"], destination)
        staged.append(source)
    print(json.dumps({"staged": staged}, sort_keys=True))
    return 0


def public_origin(value: str) -> str:
    if "\n" in value or "\r" in value:
        raise ConfigError("invalid public origin")
    parsed = urllib.parse.urlparse(value.rstrip("/"))
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise ConfigError("public origin must be HTTPS without credentials")
    if parsed.query or parsed.fragment:
        raise ConfigError("public origin must not contain query or fragment")
    return value.rstrip("/")


def existing_receipt(url: str, timeout: float) -> Any | None:
    try:
        return retry_public_read(lambda: fetch_result(url, timeout))
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise


def same_reusable_contract(existing: Any, expected: Any) -> bool:
    if not isinstance(existing, dict) or not isinstance(expected, dict):
        return False
    try:
        validated_provenance(existing.get("validated"))
        def contract(value):
            products = validate_products(value.get("products"), "result products", require_urls=True)
            for product in products.values():
                data = product.get("data", {})
                if not isinstance(data.get("sha256"), str) or not DIGEST_RE.fullmatch(data["sha256"]):
                    raise ConfigError("published product requires SHA-256")
                product["data"] = {key: value for key, value in data.items() if key != "sha256"}
            return {**{key: value for key, value in value.items() if key not in {"validated", "products"}},
                    "products": products}
        return canonical_json(contract(existing)) == canonical_json(contract(expected))
    except ConfigError:
        return False


def verified_winner(existing: Any, expected: Any, timeout: float) -> dict[str, Any]:
    """A complete immutable receipt wins; never project the losing build's bytes."""
    if not same_reusable_contract(existing, expected):
        raise ConfigError("immutable workload result contract collision")
    for product in existing["products"].values():
        actual = retry_public_read(lambda: sha256_url(product["source"], timeout))
        if actual != product["data"]["sha256"]:
            raise ConfigError("immutable workload result product integrity mismatch")
    return existing


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
        try:
            resolve_results("https://results.example", 42, workflow, {"unit": expected}, 0.1)
        except ConfigError:
            pass
        else:
            raise ConfigError("convergence self-check accepted a malformed result")
    with patch.object(module, "fetch_result", side_effect=[TimeoutError(), receipt]) as read:
        hits, _, _ = resolve_results("https://results.example", 42, workflow, {"unit": expected}, 0.1)
        if hits != {"unit": True} or read.call_count != 2:
            raise ConfigError("convergence self-check did not retry a transient read once")
    with patch.object(module, "fetch_result", side_effect=urllib.error.HTTPError("url", 404, "missing", {}, None)) as read:
        hits, _, _ = resolve_results("https://results.example", 42, workflow, {"unit": expected}, 0.1)
        if hits != {"unit": False} or read.call_count != 1:
            raise ConfigError("convergence self-check did not recognize confirmed absence")
    for unavailable in (
        TimeoutError(),
        UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid start byte"),
        http.client.IncompleteRead(b"{", 2),
    ):
        with patch.object(module, "fetch_result", side_effect=unavailable) as read:
            try:
                resolve_results("https://results.example", 42, workflow, {"unit": expected}, 0.1)
            except (ConfigError, UnicodeError):
                if read.call_count != (1 if isinstance(unavailable, UnicodeError) else 2):
                    raise ConfigError("unexpected public read retry count")
            else:
                raise ConfigError("unavailable result silently selected execution")
    for malformed_provenance in ({"runId": 1}, {**provenance, "unexpected": True}):
        malformed_receipt = json.loads(canonical_json(receipt))
        malformed_receipt["validated"] = malformed_provenance
        with patch.object(module, "fetch_result", return_value=malformed_receipt):
            try:
                resolve_results("https://results.example", 42, workflow, {"unit": expected}, 0.1)
            except ConfigError:
                pass
            else:
                raise ConfigError("convergence self-check accepted malformed provenance")
    product_expected = {**expected, "products": "manifest"}
    product_receipt = json.loads(canonical_json(receipt))
    product_receipt["products"] = {
        "bundle": {"type": "url", "source": "https://results.example/bundle.zip",
                   "data": {"sha256": "a" * 64}}
    }
    with (
        patch.object(module, "fetch_result", return_value=product_receipt),
        patch.object(module, "probe_product") as probe,
        patch.object(module, "sha256_url", side_effect=AssertionError("planner downloaded payload")),
    ):
        hits, _, _ = resolve_results("https://results.example", 42, workflow, {"unit": product_expected}, 0.1)
        if hits != {"unit": True} or probe.call_count != 1:
            raise ConfigError("convergence self-check did not use metadata-only product availability")
    missing_digest_receipt = json.loads(canonical_json(product_receipt))
    missing_digest_receipt["products"]["bundle"].pop("data")
    with (
        patch.object(module, "fetch_result", return_value=missing_digest_receipt),
        patch.object(module, "probe_product") as probe,
    ):
        try:
            resolve_results("https://results.example", 42, workflow, {"unit": product_expected}, 0.1)
        except ConfigError:
            if probe.called:
                raise ConfigError("convergence self-check probed a product before validating its digest")
        else:
            raise ConfigError("convergence self-check reported a hit without a product digest")
    with (
        patch.object(module, "fetch_result", return_value=product_receipt),
        patch.object(module, "probe_product", side_effect=TimeoutError()),
    ):
        try:
            resolve_results("https://results.example", 42, workflow, {"unit": product_expected}, 0.1)
        except ConfigError:
            pass
        else:
            raise ConfigError("convergence self-check accepted an unavailable product set")
    try:
        resolve_results("not-a-url", 42, workflow, {"unit": expected}, 0.1)
    except ConfigError:
        pass
    else:
        raise ConfigError("convergence self-check accepted an invalid configured base URL")
    for status, attempts in ((403, 1), (429, 2), (503, 2)):
        with patch.object(module, "fetch_result", side_effect=urllib.error.HTTPError("url", status, "unavailable", {}, None)) as read:
            try:
                resolve_results("https://results.example", 42, workflow, {"unit": expected}, 0.1)
            except ConfigError:
                if read.call_count != attempts:
                    raise ConfigError("unexpected HTTP retry count")
            else:
                raise ConfigError("HTTP failure silently selected execution")
    repeated = json.loads(canonical_json(receipt))
    repeated["validated"]["runId"] = 2
    if not same_reusable_contract(receipt, repeated):
        raise ConfigError("convergence self-check rejected an idempotent repeated result")
    repeated["executionClass"]["labels"] = ["different-runner"]
    if same_reusable_contract(receipt, repeated):
        raise ConfigError("convergence self-check accepted a nondeterministic repeated result")
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        body = b"real restored bytes"
        class ProductResponse(io.BytesIO):
            status = 200
        product = {"type": "url", "source": "https://results.example/product",
                   "data": {"sha256": hashlib.sha256(body).hexdigest()}}
        request = lambda url: public_read_request(url, accept="*/*")
        with patch("urllib.request.urlopen", side_effect=lambda *_a, **_kw: ProductResponse(body)):
            sizes = materialize_products({"bundle": product}, root / "restored", request, timeout=0.1)
            if sizes != {"bundle": len(body)} or (root / "restored/bundle").read_bytes() != body:
                raise ConfigError("product restoration did not preserve verified bytes")
            bad = {**product, "data": {"sha256": "0" * 64}}
            for invalid in ({"bundle": product, "second": bad}, {"bundle": {**product, "data": {}}}):
                try:
                    materialize_products(invalid, root / "failed", request, timeout=0.1)
                except ConfigError:
                    pass
                else:
                    raise ConfigError("product restoration accepted invalid integrity metadata")
                if (root / "failed").exists():
                    raise ConfigError("product restoration exposed a partial set")
            try:
                materialize_products({"bundle": product}, root / "restored", request, timeout=0.1)
            except ConfigError:
                pass
            else:
                raise ConfigError("product restoration overwrote an existing destination")
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


def contribute_command(args: argparse.Namespace, contract: ConvergenceContract) -> int:
    """Bind product references to the frozen plan; only the gate issues success."""
    pending = object_value(load_json(args.pending), "pending convergence")
    workflow = contract.workflow(require_identity(pending.get("workflow"), "pending workflow"))
    if args.workload not in workflow.workloads:
        raise ConfigError("unknown contribution workload")
    value = object_value(pending["workloads"].get(args.workload), "pending workload")
    if not value.get("run") or not value.get("scopeEnabled"):
        raise ConfigError("contribution requires an executed workload")
    products = validate_products(json.loads(args.products_json), "contribution products", require_urls=False)
    if workflow.workloads[args.workload].products != "manifest" or not products:
        raise ConfigError("contribution requires a manifest workload and nonempty products")
    write_json_atomic(args.output_dir / args.workload / "product-manifest.json", {
        "workload": args.workload, "digest": value["digest"],
        "executionClass": value["executionClass"], "products": products,
    })
    return 0


def publish_command(args: argparse.Namespace) -> int:
    storage = storage_config(required=True)
    origin = public_origin(storage["public_origin"])
    client = R2Client(
        endpoint=storage["endpoint"],
        bucket=storage["bucket"],
        credentials=R2Credentials(storage["access_key_id"], storage["secret_access_key"]),
        timeout=args.timeout,
    )
    with tempfile.TemporaryDirectory() as temporary:
        prepare_publication(args.candidate, Path(temporary), require_urls=False)
    candidate = object_value(load_json(args.candidate), "convergence candidate")
    repository_id = candidate["repositoryId"]
    workflow = candidate["workflow"]
    policy = candidate["policy"]
    promoted_products = 0
    product_uploads: dict[str, list[tuple[str, Path, str]]] = {}
    for item in candidate["results"]:
        receipt = item["receipt"]
        identity = receipt["workload"]
        digest = receipt["digest"]
        products = validate_products(receipt["products"], "receipt.products", require_urls=False)
        for name, product in products.items():
            if product["type"] != "job":
                continue
            source = product["source"]
            source_archive = args.products_root / f"{source}.zip"
            if not source_archive.is_file():
                raise ConfigError(f"current-run product artifact is missing: {source}")
            archive = args.output_dir / "products" / f"{identity}-{name}.zip"
            normalize_product_archive(source_archive, archive, product.get("path"))
            key = product_key(repository_id, workflow, policy, identity, digest, name)
            content_digest = sha256_file(archive)
            data = dict(product.get("data", {}))
            declared_digest = data.get("sha256")
            if declared_digest is not None and declared_digest != content_digest:
                raise ConfigError(f"declared product digest differs from artifact: {identity}/{name}")
            data["sha256"] = content_digest
            product_uploads.setdefault(identity, []).append((key, archive, content_digest))
            promoted = {"type": "url", "source": f"{origin}/{key}"}
            promoted["data"] = data
            receipt["products"][name] = promoted
            promoted_products += 1
    promoted_candidate = args.output_dir / "promoted-candidate.json"
    write_json_atomic(promoted_candidate, candidate)
    manifest = prepare_publication(promoted_candidate, args.output_dir)
    pending = None
    if getattr(args, "pending", None):
        pending = load_json(args.pending)
        if args.config is None:
            raise ConfigError("consumer projection requires explicit config")
        contract = ConvergenceContract(args.config)
        # Validate the request contract before writes, but project final consumer
        # references only after resolving any preexisting or concurrent winner.
        published_requests(contract.workflow(pending["workflow"]), pending,
                           [item["receipt"] for item in candidate["results"]])
    published = 0
    unchanged = 0
    uploaded_products = 0
    uploaded_product_bytes = 0
    winners = []
    for item in manifest:
        key = item["key"]
        file = Path(item["file"])
        receipt = load_json(file)
        url = f"{origin}/{key}"
        existing = existing_receipt(url, args.timeout)
        if existing is not None:
            winners.append(verified_winner(existing, receipt, args.timeout))
            unchanged += 1
            continue
        # Never overwrite partial uploads. A product collision may belong to a
        # concurrent completed receipt; without that receipt, fail explicitly.
        raced_winner = None
        for product_object_key, archive, content_digest in product_uploads.get(receipt["workload"], []):
            try:
                client.put_file(key=product_object_key, file=archive, content_type="application/zip")
                uploaded_products += 1
                uploaded_product_bytes += archive.stat().st_size
            except R2PreconditionFailed:
                if sha256_url(f"{origin}/{product_object_key}", args.timeout) != content_digest:
                    raced = existing_receipt(url, args.timeout)
                    if raced is None:
                        raise ConfigError(f"incomplete immutable publication: {product_object_key}")
                    raced_winner = verified_winner(raced, receipt, args.timeout)
                    break
        if raced_winner is not None:
            winners.append(raced_winner)
            unchanged += 1
            continue
        try:
            client.put_file(key=key, file=file)
            winners.append(receipt)
            published += 1
        except R2PreconditionFailed:
            raced = existing_receipt(url, args.timeout)
            if raced is None:
                raise ConfigError(f"immutable workload result publication race is incomplete: {key}")
            winners.append(verified_winner(raced, receipt, args.timeout))
            unchanged += 1
    print(
        json.dumps(
            {"promotedProducts": promoted_products, "uploadedProducts": uploaded_products,
             "uploadedProductBytes": uploaded_product_bytes, "published": published, "unchanged": unchanged},
            sort_keys=True,
        )
    )
    append_outputs({"receipts": compact_json(winners)})
    if pending is not None:
        requests = published_requests(contract.workflow(pending["workflow"]), pending, winners)
        transport = key_requests(requests, origin)
        append_outputs({"requests": compact_json(transport)})
        append_outputs({"sources": compact_json(consumer_sources(transport))})
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Plan and publish reusable workload results.")
    parser.add_argument("--config", type=Path)
    parser.add_argument("--root", type=Path)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("validate")
    sub.add_parser("control-paths")
    references = sub.add_parser("resolve-references")
    references.add_argument("--batch")
    references.add_argument("--shared", help="Comma-separated required business units")
    plan = sub.add_parser("github-output")
    plan.add_argument("--workflow", required=True)
    scope = plan.add_mutually_exclusive_group(required=True)
    scope.add_argument("--scope-plan", type=Path)
    scope.add_argument("--all-workloads", action="store_true", help="select every declared workload, without changed-path routing")
    plan.add_argument("--runner-plan-json", required=True)
    plan.add_argument("--execution-inputs-json", default="{}")
    plan.add_argument("--repository-id", type=int)
    plan.add_argument("--repository")
    plan.add_argument("--base-url", default="")
    plan.add_argument("--timeout", type=float, default=2.0)
    plan.add_argument("--mode", choices=["shadow", "enforce"], default="shadow")
    plan.add_argument("--pending", type=Path, required=True)
    handoff = sub.add_parser("handoff")
    handoff.add_argument("--pending", type=Path, required=True)
    handoff.add_argument("--products-root", type=Path, required=True)
    handoff.add_argument("--handoff-root", type=Path, required=True)
    handoff.add_argument("--id", default="ci-results")
    handoff.add_argument("--products", choices=["none", "manifest"], help="collect one independent result lane")
    handoff.add_argument("--batches", type=json.loads, default=[], help="JSON array of declared product batches to collect")
    handoff.add_argument("--workloads", type=json.loads, default=[], help="JSON array of independently completed workloads to collect")
    restore = sub.add_parser("restore")
    restore.add_argument("--pending", type=Path, required=True)
    restore.add_argument("--workload", required=True)
    restore.add_argument("--output-dir", type=Path, required=True)
    restore.add_argument("--timeout", type=float, default=60.0)
    restore.add_argument("--allow-miss", action="store_true", help="caller explicitly handles restored=false by executing the workload")
    restore.add_argument("--refresh", action="store_true", help="read newly published receipt using the frozen pending identity")
    contribute = sub.add_parser("contribute")
    contribute.add_argument("--pending", type=Path, required=True)
    contribute.add_argument("--workload", required=True)
    contribute.add_argument("--products-json", required=True)
    contribute.add_argument("--output-dir", type=Path, required=True)
    batches = sub.add_parser("contribute-batches")
    batches.add_argument("--pending", type=Path, required=True)
    batches.add_argument("--output-dir", type=Path, required=True)
    admit = sub.add_parser("admit")
    admit.add_argument("--handoff-root", type=Path, required=True)
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
    publish.add_argument("--pending", type=Path, help="project consumer requests after trusted publication")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "resolve-references":
        return resolve_references(args)
    root = args.root.resolve() if args.root else repository_root(__file__)
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
    if args.command == "github-output":
        return plan_command(args, contract, root)
    if args.command == "handoff":
        return handoff_command(args, contract)
    if args.command == "restore":
        return restore_command(args, contract)
    if args.command == "contribute":
        return contribute_command(args, contract)
    if args.command == "contribute-batches":
        return contribute_batches_command(args, contract)
    return admit_command(args, contract)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ConfigError, GitHubError, R2Error, json.JSONDecodeError, subprocess.SubprocessError, OSError) as error:
        print(f"convergence error: {error}", file=sys.stderr)
        raise SystemExit(2)
