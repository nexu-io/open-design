import { serializeOdNextRequestTurnV1 } from './od-next-prompt-bundle.js';

/** Host-only identity for plain incremental request text; never sent as a wrapper. */
export const OD_NEXT_RESUME_REQUEST_SCHEMA = 'open-design.od-next-resume-request/v1' as const;

export const OD_NEXT_PRODUCTION_MARKER_PROTOCOL = 'OD Next production-marker/v1';

export const OD_NEXT_PLAN_OUTPUT_INSTRUCTIONS = `${OD_NEXT_PRODUCTION_MARKER_PROTOCOL}

First distinguish a plan requested as the final answer from planning to produce
an artifact the user requested. A travel itinerary, study plan, work plan, or
request to only list a plan ends with that plan, without a production-ready
marker or an added artifact. The user need not also say "do not execute".
A request to save the plan as a file does not authorize executing its steps.
Only user-requested artifact creation can need a separate planning turn;
missing format instructions and scenario defaults do not authorize creation.
When continuing an existing task with an actionable plan, execute it only if
the current user-authorized scope includes production; otherwise answer the
plan-only request and stop. Do not repeat a completed planning turn.
For a new design deliverable, write a concise, actionable plan in normal prose:
the goal, requested deliverables, design direction, implementation steps, and
necessary assumptions. Do not build the deliverables in this planning turn.
Write this plan in the user's language, using a few clear sentences or steps.
Describe the intended result, not internal routing, Skill names, or commands.
After the plan is ready, end with the single od-production-ready control line
using the exact current-turn key supplied by the host. The host will continue
production automatically after this turn ends successfully; do not ask for confirmation.
Do not emit the marker for a plan-only/no-write request, an unanswered question,
a non-design answer, an unfinished plan, or a direct edit already completed.
If information is sufficient, use reasonable stated assumptions instead of asking.
Plan mode requires editable Markdown documents.
Chat mode permits explicitly requested trivial file changes. Session mode alone does not mean plan-only: follow its
scope and the actual request. Never expand scope when the user answers a question.
If an essential answer is missing, ask through a question-form and omit the marker.
During production, execute the plan, then describe the actual files and remaining
gaps in prose. Never emit another production-ready marker in production.
Do not emit Plan Contract, Runtime State, executionIntent, hashes, or other
machine JSON. Host identity and lifecycle are recorded by Open Design.
An ended turn is not proof of delivered files: never claim unwritten work is complete.`;

export function renderOdNextProductionReadyInstructions(key: string): string {
  if (!/^[a-f0-9]+$/.test(key)) return '';
  return `Plan-to-production continuation:
For cloud video generation, verify current account/workspace availability with
\`"$OD_NODE_BIN" "$OD_BIN" media models --cloud --json\` before choosing a default.
A static model ID is not proof of availability. Empty catalogue means unavailable;
a failed lookup means unknown. Preserve explicit model/provider choices and report
an unavailable choice without switching billing channels. Configured BYOK and
local Motion are independent of this cloud catalogue.
A plan requested as the answer (travel/study/work plan, or only listing a plan)
is complete in itself: no added artifact and no marker, even without "do not execute".
Saving a requested plan file does not authorize executing it. Scenario defaults
and missing format instructions do not authorize artifact creation.
Only when the user requested artifact creation beyond the plan itself and this
turn finishes its actionable production plan, write this exact line as the last
non-empty line of your response, outside code fences, quotes, or tool output:
<od-production-ready key="${key}" />
Copy this turn's key exactly. This line requests one production turn; it does
not claim delivery. Omit it for plan-only requests, pending questions, ordinary
answers, and already completed direct edits. Do not explain the control line.
These host instructions do not change the user's language. Use the latest
user request's language from your FIRST progress sentence through the plan
and final answer. A Chinese request requires Chinese progress text as well.
Keep the visible plan brief and result-focused: what the user will receive,
how it will look or behave, and any material assumption. Keep Skill loading,
CLI commands, internal paths, routing IDs, CSS and schema details in tool
calls or internal reasoning, unless the user explicitly asks for them.`;
}

export function composeOdNextMarkerProductionTurn(input: {
  taskExecutionId: string;
  taskRunIndex: number;
  hostProtocolText: string;
}): string {
  return serializeOdNextRequestTurnV1({
    taskExecutionId: input.taskExecutionId, taskRunIndex: input.taskRunIndex, stage: 'production',
    payload: `Continue the current session and execute the plan from the preceding
response within the user's latest explicit requirements and exclusions.
Use the language of the user's latest request for all user-facing text,
including the first progress update. This English host instruction does not
change the user's language. Do not narrate internal Skill IDs, routing,
provider parameters, shell commands, or runtime workspace paths. Mention
technical details only when the user needs them to use or assess the result.
For ordinary design requests, describe results in plain language instead of
listing CSS properties, framework internals, or implementation attributes.
If the user asked only for a plan, the preceding plan or continuation instruction
does not authorize artifact creation: provide the requested plan and stop.
Drop any unrequested wrapper, export, or extra deliverable from that plan.
Keep source files and assets necessary to produce the requested outputs.
Use the already loaded deliverable Skills and documented tool help for commands
and input shapes. Work within this project and its authorized references; do not
search Open Design's application source, other projects, or credentials to
reverse-engineer a tool. If a documented call fails, use its actual error and
help to correct the input; report an unavailable capability rather than inventing it.
Preserve non-conflicting requirements, assumptions, and design direction. This is the production turn; do not re-plan or request
confirmation of the accepted plan. Use the tools actually available, and choose
native subagents only when useful and supported. No structured plan, capability
proof, Runtime State, or hash is required. Do not emit od-production-ready again.
If an essential new question prevents work, ask it plainly through question-form.
Finish with a concise description of files actually produced and any remaining
gaps. Once the requested outputs exist, deliver without adding unrequested
syntax checks, validation scripts, screenshots, playback, or review loops.
Waiting for generation, rendering a requested final format, and registering a
live artifact are still production. A user's explicit request for testing takes
precedence; do not claim testing or playback that did not occur.
The sole default exception is the Core-authorized bounded check during actual
user-requested video-motion production; it does not apply to a loaded helper,
plan-only response, interactive animation, or unrelated follow-up.
Never claim that a plan, a tool invocation, or an absent file is delivery.

${input.hostProtocolText}`,
  });
}
