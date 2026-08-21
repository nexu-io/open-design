#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath

from lib.config import ConfigError, compact_json, load_json, object_value, repository_root, schema_v1
from lib.github import append_outputs, append_summary


PROTOCOL = "nexu-hash-v1"
CONTROL_SUITE = "ci-control"


class HashContract:
    def __init__(self, path):
        value = object_value(load_json(path), "hash")
        if set(value) != {"schema", "suites", "workflows"}:
            raise ConfigError("hash keys must be schema, suites, and workflows")
        schema_v1(value, "hash")
        self.suites = object_value(value["suites"], "hash.suites")
        self.workflows = object_value(value["workflows"], "hash.workflows")
        if CONTROL_SUITE not in self.suites:
            raise ConfigError(f"hash.suites must define {CONTROL_SUITE}")
        self._validate()

    @staticmethod
    def _tokens(value, label):
        if not isinstance(value, list) or not value:
            raise ConfigError(f"{label} must be a non-empty array")
        if any(not isinstance(token, str) or not token for token in value):
            raise ConfigError(f"{label} contains an invalid token")
        return value

    @staticmethod
    def _validate_path(token, label):
        if token == "*":
            return
        if token.startswith(("/", "~")) or "\\" in token or "\n" in token:
            raise ConfigError(f"{label} has unsafe path token {token!r}")
        if ".." in PurePosixPath(token).parts:
            raise ConfigError(f"{label} escapes the repository: {token!r}")
        if "://" in token:
            raise ConfigError(f"{label} has unsupported token scheme: {token}")

    def _validate(self):
        nodes = {}
        for suite, raw in self.suites.items():
            if not isinstance(suite, str) or not suite:
                raise ConfigError("hash.suites keys must be non-empty strings")
            nodes[f"suite://{suite}"] = self._tokens(raw, f"hash.suites.{suite}")
        for workflow, identities in self.workflows.items():
            if not isinstance(workflow, str) or not workflow or "/" in workflow:
                raise ConfigError("hash.workflows keys must be non-empty strings")
            identities = object_value(identities, f"hash.workflows.{workflow}")
            if not identities:
                raise ConfigError(f"hash.workflows.{workflow} must not be empty")
            for identity, raw in identities.items():
                if not isinstance(identity, str) or not identity or "/" in identity:
                    raise ConfigError(f"hash.workflows.{workflow} has an invalid identity")
                nodes[f"key://{workflow}/{identity}"] = self._tokens(raw, f"hash.workflows.{workflow}.{identity}")
        for node, tokens in nodes.items():
            for token in tokens:
                if token.startswith(("suite://", "key://")):
                    if token not in nodes:
                        raise ConfigError(f"{node} references unknown {token}")
                else:
                    self._validate_path(token, node)
        visiting, complete = [], set()

        def visit(node):
            if node in visiting:
                raise ConfigError(f"hash dependency cycle: {' -> '.join((*visiting, node))}")
            if node in complete:
                return
            visiting.append(node)
            tokens = nodes[node]
            if node.startswith("key://"):
                tokens = [f"suite://{CONTROL_SUITE}", *tokens]
            for token in tokens:
                if token in nodes:
                    visit(token)
            visiting.pop()
            complete.add(node)

        for node in nodes:
            visit(node)

    def declarations(self, workflow):
        if workflow not in self.workflows:
            raise ConfigError(f"unknown hash workflow: {workflow}")
        return self.workflows[workflow]


class GitFingerprinter:
    def __init__(self, root):
        self.root = root
        self.cache = {}

    def records(self, token):
        if token in self.cache:
            return self.cache[token]
        if token == "*":
            pathspec = []
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
        records.sort()
        if not records:
            raise ConfigError(f"hash path token matched no tracked files: {token}")
        self.cache[token] = records
        return records


def digest_node(contract, fingerprinter, node, tokens, resolved):
    if node in resolved:
        return resolved[node]
    if node.startswith("key://"):
        tokens = [f"suite://{CONTROL_SUITE}", *tokens]
    digest = hashlib.sha256()
    digest.update(f"{PROTOCOL}\0{node}\0".encode())
    for token in tokens:
        digest.update(f"token\0{token}\0".encode())
        if token.startswith("suite://"):
            name = token.removeprefix("suite://")
            child = digest_node(contract, fingerprinter, token, contract.suites[name], resolved)
            digest.update(f"digest\0{child}\0".encode())
        elif token.startswith("key://"):
            workflow, identity = token.removeprefix("key://").split("/", 1)
            child = digest_node(contract, fingerprinter, token, contract.workflows[workflow][identity], resolved)
            digest.update(f"digest\0{child}\0".encode())
        else:
            for path, mode, oid, stage in fingerprinter.records(token):
                digest.update(f"file\0{path}\0{mode}\0{oid}\0{stage}\0".encode("utf-8", "surrogateescape"))
    resolved[node] = digest.hexdigest()
    return resolved[node]


def calculate(contract, root, workflow):
    resolved = {}
    fingerprinter = GitFingerprinter(root)
    hashes = {}
    for identity, declared in contract.declarations(workflow).items():
        node = f"key://{workflow}/{identity}"
        # Control inputs are implicit so later optimized declarations cannot
        # accidentally make their own planner/configuration changes invisible.
        hashes[identity] = digest_node(contract, fingerprinter, node, declared, resolved)
    return hashes


def read_previous(path, workflow):
    try:
        value = load_json(path)
        if value.get("schemaVersion") != 1 or value.get("workflow") != workflow or not isinstance(value.get("hashes"), dict):
            raise ConfigError("state contract differs")
        if any(not isinstance(key, str) or not isinstance(digest, str) for key, digest in value["hashes"].items()):
            raise ConfigError("state hashes are invalid")
        return value["hashes"], None
    except (ConfigError, AttributeError) as error:
        return {}, str(error)


def write_state(path, workflow, hashes):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"schemaVersion": 1, "workflow": workflow, "hashes": hashes}
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent), text=True)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as output:
            json.dump(payload, output, indent=2, sort_keys=True)
            output.write("\n")
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def execute(root, contract, workflow, scope_plan_path, state_path):
    plan = load_json(scope_plan_path)
    enabled = object_value(plan.get("enabled"), "scope plan.enabled")
    identities = set(contract.declarations(workflow))
    if set(enabled) != identities:
        raise ConfigError(f"scope/hash identity mismatch (scope={sorted(enabled)}, hash={sorted(identities)})")
    if any(not isinstance(value, bool) for value in enabled.values()):
        raise ConfigError("scope plan.enabled values must be booleans")
    previous, state_warning = read_previous(state_path, workflow) if state_path.exists() else ({}, "state missing")
    current = calculate(contract, root, workflow)
    equal = {identity: previous.get(identity) == digest for identity, digest in current.items()}
    run = {identity: bool(enabled[identity]) and not equal[identity] for identity in current}
    reasons = {
        identity: "scope-disabled" if not enabled[identity] else "hash-equal" if equal[identity] else "hash-changed"
        for identity in current
    }
    write_state(state_path, workflow, current)
    append_outputs({"run": compact_json(run), "equal": compact_json(equal)})
    lines = ["### Hash decisions", "", "| Identity | Scope | Equal | Run | Reason |", "| --- | ---: | ---: | ---: | --- |"]
    for identity in current:
        lines.append(f"| {identity} | {str(bool(enabled[identity])).lower()} | {str(equal[identity]).lower()} | {str(run[identity]).lower()} | {reasons[identity]} |")
    if state_warning:
        lines += ["", f"> Previous state unavailable ({state_warning}); identities start cold."]
    append_summary("\n".join(lines))
    print(json.dumps({"run": run, "equal": equal, "reasons": reasons}, indent=2, sort_keys=True))


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path)
    parser.add_argument("--root", type=Path)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("validate")
    github = sub.add_parser("github-output")
    github.add_argument("--workflow", required=True)
    github.add_argument("--scope-plan", type=Path, required=True)
    github.add_argument("--state", type=Path, required=True)
    return parser.parse_args()


def main():
    args = parse_args()
    root = args.root.resolve() if args.root else repository_root(__file__)
    contract = HashContract(args.config or root / ".github/config/hash.json")
    if args.command == "validate":
        for workflow in contract.workflows:
            calculate(contract, root, workflow)
        print("hash configuration is valid")
        return 0
    execute(root, contract, args.workflow, args.scope_plan, args.state)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ConfigError, subprocess.SubprocessError, OSError) as error:
        print(f"hash configuration error: {error}", file=sys.stderr)
        raise SystemExit(2)
