# Humanize PPT Agent Teams + Public Preview Notes

Use these notes when evolving Humanize PPT from an outline Skill into a public Agent Teams workflow.

## Product shape

Humanize PPT should be positioned as the **main orchestrator Agent** for PPT production, not as a renderer or a bundle of slide templates.

```text
Humanize PPT Agent / Main Orchestrator
→ Guizang Agent: Chinese-stable rendering
→ Zara Agent: style exploration + HTML generation + deploy
→ HyperFrames Agent: video slots / motion inserts
→ Presenter Agent: presenter mode after deck finalization
→ QA Agent: content, visual, path, delivery checks
```

The main Agent loads `humanize-ppt`; each specialist Agent loads exactly the Skill it needs. The main Agent owns AST, routing, commands, manifests, and final QA.

## Durable workflow corrections

- Keep presenter mode as a **post-processing adapter**, not a style path. Generate/select the deck first, then add presenter mode.
- Keep deploy separate from presenter mode. Deploy is URL/PDF/assets; presenter is current slide, next slide, notes, timer, audience/speaker view.
- Do not let downstream PPT Skills consume raw source directly. Humanize PPT should first emit the AST production contract.
- Do not frame Humanize PPT as a fixed set of 4 HTML PPT Skills. Frame it as an orchestrator that can route to many Skills.
- For public demos, first prove a full loop works before over-polishing README copy.

## V0.2 artifacts to generate

A useful Agent Teams runner should emit:

```text
workdir/
  deck_brief.md
  ast_outline.md
  slide_plan.json
  speaker_intent.md
  asset_manifest.md
  video_slots.json
  router_plan.json
  run_manifest.json
  commands/
    guizang-agent.md
    zara-agent.md
    hyperframes-agent.md
    presenter-agent.md
    qa-agent.md
  outputs/
    guizang/
    zara/
    hyperframes/
    presenter/
    qa/
```

## Command protocol for specialist Agents

Use explicit, bounded commands:

```text
You are [Agent Name].
Load skill: [Skill Name].
Input directory: [workdir]
Read: deck_brief.md, ast_outline.md, slide_plan.json, speaker_intent.md, asset_manifest.md
Task: [exact task]
Write outputs to: [exact output directory]
Do not rewrite the AST goal, consume raw source unless allowed, or modify another agent's outputs.
Return: output paths, decisions made, known issues, verification result.
```

## Public repo release loop

For a public Skill repo:

1. Create/push public repo early.
2. Install it locally from GitHub (`npx skills add https://github.com/ORG/REPO.git -g -y`).
3. Run one full safe sample from the installed copy.
4. Verify generated style exploration, presenter mode, and deploy/static page.
5. Enable GitHub Pages from `/docs` and verify URLs with `curl`.
6. Only then polish README and docs.

## README convention

Mirror the `ai-news-radar` pattern: keep `README.md` as Chinese-first and `README.en.md` as English. Top links should cross-link language, live demo, AST/OPC docs, and Agent Teams docs.
