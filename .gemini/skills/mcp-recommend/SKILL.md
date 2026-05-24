---
name: mcp-recommend
description: |
  Analyze project and recommend optimal MCP servers based on detected technologies.
  Use when setting up a new project or reviewing MCP configuration.
  Detects: node, python, docker, git, react, nextjs, database, browser-testing, etc.
---

# MCP Server Recommender

Analyzes the current project and recommends optimal MCP servers based on detected technologies, dependencies, and best practices.

## Quick Start

```bash
# From dev-infra (or any project with script in PATH)
mcp-recommend

# Or directly
"${DEV_INFRA_HOME:-$HOME/Development/Projects/dev-infra}/scripts/mcp-recommend"
```

## Commands

| Argument | Description |
|----------|-------------|
| (none) | Show recommendations for current project |
| `--all` | Include disabled/experimental servers |
| `--apply` | Generate wrapper scripts and show config |
| `--install` | Verify npm packages exist |
| `--json` | JSON output for automation |
| `--list` | List all servers in registry |
| `--search Q` | Search servers by name/description |
| `--count` | Show server counts only |

## What It Detects

| File/Pattern | Project Type |
|--------------|--------------|
| `package.json` | node |
| `tsconfig.json` | typescript |
| `requirements.txt` | python |
| `Dockerfile` | docker |
| `.git/` | git |
| `docs/` or large README | documented |
| `.envrc` with `op://` | 1password |
| `react` in package.json | react |
| `next` in package.json | nextjs |
| `prisma`/`drizzle` | database |
| `playwright`/`puppeteer` | browser-testing |

## Server Recommendations

Based on detected project type:

| Project Type | Recommended Servers |
|--------------|---------------------|
| All projects | filesystem |
| git | gitkraken |
| documented | context7 |
| database | postgres |
| browser-testing | puppeteer, browserbase |
| scraping | firecrawl, browserbase |
| code-review | coderabbit |

## Example Output

```
╔════════════════════════════════════════════════════════════╗
║  MCP Server Recommender v1.2.0                             ║
╚════════════════════════════════════════════════════════════╝

📁 Project: dev-infra
📍 Path: /Users/you/Development/Projects/dev-infra

Detected Technologies:
  • docker
  • git
  • node
  • documented

Recommended MCP Servers:
  filesystem
    └─ Secure file operations
  gitkraken
    └─ Git operations and GitHub integration
    └─ Requires: GITKRAKEN_TOKEN
  context7
    └─ Documentation from source repos

Next steps:
  mcp-recommend --apply    # Generate wrapper scripts and config
  mcp-recommend --install  # Also install npm packages globally
```

## Best Practices

- **Enable 2-3 servers max** — Each consumes 50-85k tokens of context
- **Use wrapper scripts** — Inherit environment from direnv
- **Project-scoped configs** — Use `.claude/mcp.json` per project

## Server Registry

The script includes a curated registry of ~40 MCP servers across three tiers:

1. **Tier 1 (Official)**: filesystem, puppeteer, postgres, sqlite, memory
2. **Tier 2 (Vendor)**: github, gitkraken, brave-search, context7, firecrawl
3. **Tier 3 (Community)**: Disabled by default, enable with `--all`

Run `mcp-recommend --list` to see all available servers.
