# Intake, decisions and handoff

## Collect only missing essentials

Start from the conversation and current project. If an existing production folder is supplied, read `STATE.md`, `BRIEF.md` and `STORYBOARD.md` before asking anything.

| Input | Ask or inspect | Decision rule |
| --- | --- | --- |
| Goal | Product/topic, audience, one thing to remember, CTA | Do not invent a feature, claim, metric, testimonial or offer. |
| Material | Supplied images/video, logo, approved copy, local paths or accessible URLs | Build an asset inventory with provenance and permitted use in this film. Reference footage is not automatically approved final material. |
| Delivery | Destination, dimensions/aspect ratio, fps, duration, sound requirement, language | Record the native composition specification. A silent result cannot fulfill an unresolved voiceover request; identify the actual sound source. |
| Direction | Reference, brand rules, examples to avoid, template preference | Follow the chosen route. Recommend a creative direction when needed; template choice applies only to a template task and may already be resolved or delegated. |
| Constraints | Must-show details, protected copy, deadline or generation budget when relevant | Preserve explicit choices. Do not ask about paid APIs when this local workflow needs none. |

Example first message in the user's language:

> 我会沿用已有资料，补齐本次需要的信息，再确定创作方向。还缺：视频要让谁记住哪一句话；可用的产品图片/视频和准确文案；希望多长、发在哪里、是否需要配音或音乐；喜欢的参考风格。如果你没有风格偏好，我会给出几个适合现有素材的方案。

Shorten this to the actual gaps. Offer sensible choices for preferences; ask factual questions without inventing answers. Missing essential product assets block the affected shot, not unrelated planning or approved abstract graphics. An explicitly requested template starter can use its default text and graphics without optional asset questions; record that starter scope and distinguish it from a finished product film.

## Production folder

Use a user-controlled production/output directory, e.g. `motion-projects/<project-name>/`. Do not put client media or production decisions into the installed plugin/skill folder. Keep planning and review artifacts outside the live native project when possible: files in that project affect its content revision. Use the returned project directory and native tools for authoring; never edit `workspace.json`, `projects.json` or `export.json` to simulate tool actions.

Reuse existing records and create artifacts only as their stages become meaningful. This is not a requirement to create every file for a local edit, review or export:

| Artifact | Required contents |
| --- | --- |
| `BRIEF.md` | Goal, audience, message, factual sources, approved copy/assets, output spec, constraints, acceptance criteria, unresolved inputs |
| `STYLE.md` | Chosen reference traits, exact accent, crop/position rules, text hierarchy, reading holds and choices to avoid |
| `STORYBOARD.md` | Action/shot record plus template ID if applicable and relationship to the message |
| `STATE.md` | Current stage, user decisions, workspace identity, revision, artifacts, blockers and next action |
| `reviews/` | Actual frames/contact sheets and `findings.md`; distinguish draft and exported-file evidence |
| `VERIFY.md` | Per-check status, evidence, exact export identity and unresolved limitations |
| `final.mp4`, native project folder/archive | Final video and editable HTML/CSS/JS, local assets, configuration and Studio manifests; use actual produced paths |

If the host cannot write files, return these named documents as structured chat artifacts and state that persistence needs the host/user. Do not claim that files were saved. MCP workflow reads do not create a production folder for the agent.

## Brief fields

```text
Project / owner-supplied context
Audience and viewing destination
One sentence the viewer should remember
CTA and exact approved copy
Product claims → source/approval for each
Assets → local/project-relative path, role, source, usable range and audio use
Reference → traits to take, content not to reuse
Delivery → duration, dimensions, fps, sound, language
Style → approved creative direction; selected template ID only when applicable
Acceptance → narrative, legibility, truthful assets, technical and playback checks
Unresolved inputs → question, affected stage, who can resolve it
```

Use explicit `unresolved` entries only in production documents. Never copy them into titles, subtitles or the delivered film.

## Storyboard contract

Use the [director action script](../../motion-director/references/action-script.md) for original work; reuse its records rather than creating a duplicate storyboard. The following fields are an integration checklist, not a fixed shot structure or mandatory table:

`scene/element ID | frames [in,out) / seconds | viewer takeaway | asset path + source start/end | exact copy and audio | typography/layout/crop | entry → exit/next cut | acceptance check`

- One purpose and a concrete visual per shot. No rows that merely say “add cinematic effects.”
- Use the chosen fps; total frames agree with the composition duration. Distinguish intentional layered overlaps from accidental gaps/overlaps.
- Align intended cuts to frames, allow readable holds and keep source trims within actual media length.
- Specify native composition/GSAP animation and transitions only when supported by the pinned guide and tested by seeking. Scene-local time and root time must be mapped explicitly.
- Mark unresolved assets in the document and resolve them before final production. Do not fill a product shot with the startup demo.
- Record approved copy verbatim. Reduce text density with the user when editing would change its factual meaning.

## Resume contract

`STATE.md` records:

```text
Route and requested scope:
Stage: intake | direction | storyboard | production | review | export | verification | delivered | blocked
Workspace: dataDirectory and previewUrl returned by Motion
Project identity: current native directory, title and purpose
Revision inspected:
Template: native ID (or custom), optional editorial recipe, adaptations, and user's selection/delegation
Decisions: exact relevant user instructions; unresolved choices
Artifacts: actual paths or chat artifact references
Latest export: job ID, revision, snapshot dimensions/fps/duration, audio policy, path, SHA-256 when available
Checks: visual / technical / playback → passed, failed or not_run + evidence
Defects: ID, repair count, current evidence
Next action / blocker:
```

On resume, compare the recorded directory and content revision with `motion_get_project`. Read changed sources and reconcile them with Studio edits. Template/project selection can change the active directory; never keep writing to a cached previous path. Do not silently replace a revision or claim old verification covers a new file. Small requested edits reuse the selected direction and only reopen affected creative decisions.
