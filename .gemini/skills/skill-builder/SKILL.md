---
name: "Skill Builder"
description: "Create new Claude Code Skills with proper YAML frontmatter, progressive disclosure structure, and complete directory organization. Use when you need to build custom skills for specific workflows, generate skill templates, or understand the Claude Skills specification."
---

# Skill Builder

Creates production-ready Claude Code Skills with proper YAML frontmatter, progressive disclosure architecture, and complete file/folder structure.

## Quick Start

```bash
# 1. Create skill directory
mkdir -p ~/.claude/skills/my-skill

# 2. Create SKILL.md
cat > ~/.claude/skills/my-skill/SKILL.md << 'EOF'
---
name: "My Skill"
description: "What this does. Use when [trigger conditions]."
---

# My Skill

## What This Skill Does
[Instructions]

## Quick Start
[Basic usage]
EOF
```

## YAML Frontmatter (Required)

Every SKILL.md **must** start with exactly two fields:

```yaml
---
name: "Skill Name"          # REQUIRED: Max 64 chars, Title Case
description: "What + When"  # REQUIRED: Max 1024 chars, include trigger conditions
---
```

Only `name` and `description` are used by Claude. Additional fields are ignored.

**Good descriptions** front-load keywords and include "when" clauses:
- "Generate TypeScript interfaces from JSON schema. Use when converting schemas or building API clients."
- "Debug React performance issues. Use when components re-render unnecessarily or investigating slow updates."

## Directory Structure

```
~/.claude/skills/           # Personal skills (all projects)
<project>/.claude/skills/   # Project skills (team-shared, git-committed)

my-skill/
  SKILL.md                  # REQUIRED: Main skill file
  scripts/                  # Optional: Executable scripts
  resources/                # Optional: Templates, examples, schemas
  docs/                     # Optional: Advanced docs (loaded on-demand)
```

**Important**: Skills MUST be directly under `skills/[skill-name]/`. No nested subdirectories.

## Progressive Disclosure (3 Levels)

| Level | Loaded | Size | Purpose |
|-------|--------|------|---------|
| 1. Metadata | Always (startup) | ~200 chars | Skill matching via name+description |
| 2. SKILL.md body | When triggered | 1-10 KB | Main instructions |
| 3. Referenced files | On-demand | Variable | Deep reference, examples |

100 skills = ~6KB context at Level 1. Only active skill loads Level 2+.

## Recommended SKILL.md Structure

```markdown
---
name: "Your Skill"
description: "What + when"
---

# Your Skill

## What This Skill Does
[2-3 sentences]

## Prerequisites
- [Requirements]

## Quick Start
[Most common use case]

## Step-by-Step Guide
### Step 1: Setup
### Step 2: Usage
### Step 3: Verify

## Advanced Features
See [ADVANCED.md](docs/ADVANCED.md)

## Troubleshooting
- **Issue**: Description / **Solution**: Fix
```

**Keep SKILL.md lean** (~2-5 KB). Move lengthy content to `docs/` and reference it.

## Validation Checklist

- [ ] Starts/ends with `---` (YAML frontmatter)
- [ ] `name` present (max 64 chars)
- [ ] `description` includes "what" and "when" (max 1024 chars)
- [ ] Directory directly under `~/.claude/skills/` or `.claude/skills/`
- [ ] Core instructions ~2-5 KB
- [ ] Advanced content in separate `docs/`
- [ ] Examples are concrete and runnable

## Template: Basic Skill

```markdown
---
name: "My Basic Skill"
description: "One sentence what. One sentence when to use."
---

# My Basic Skill

## What This Skill Does
[2-3 sentences]

## Quick Start
```bash
# Single command
```

## Step-by-Step Guide
### Step 1: Setup
### Step 2: Usage

## Troubleshooting
- **Issue**: Problem / **Solution**: Fix
```

## Template: Full-Featured Skill

```markdown
---
name: "My Advanced Skill"
description: "Comprehensive what. Use when [trigger 1], [trigger 2]. Supports [stack]."
---

# My Advanced Skill

## Prerequisites
- Technology 1 (version X+)

## What This Skill Does
1. **Core Feature**: Description
2. **Integration**: Description

## Quick Start
```bash
./scripts/install.sh
./scripts/quickstart.sh
```

## Configuration
Edit `config.json` — see [Configuration Guide](docs/CONFIGURATION.md)

## Step-by-Step Guide
[Main procedures]

## Advanced Features
See [docs/ADVANCED.md](docs/ADVANCED.md)

## Scripts Reference
| Script | Purpose |
|--------|---------|
| `install.sh` | Install dependencies |
| `generate.sh` | Generate code |

## Troubleshooting
See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
```
