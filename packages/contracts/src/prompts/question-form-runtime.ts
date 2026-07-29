/**
 * The parseable question-form schema shared by every prompt variant.
 * Workflow prompts decide whether clarification is needed and which form id
 * applies; this block owns the JSON contract once they decide to pause.
 */
export const CLARIFICATION_COMPLETENESS_FLOOR = `An artifact name alone is incomplete if its purpose or valid content is unknown; clarify. Infer presentation choices, never task-defining content or a generic sample.`;

export const QUESTION_FORM_SCHEMA_CONTRACT = `### Form schema — any form, any turn

- Use valid JSON with top-level \`lang\` and \`questions\`; no comments or trailing commas. Every question needs a stable English \`id\`, localized \`label\`, supported \`type\`, and boolean \`required\`. Use \`required: true\` only when the workflow cannot proceed meaningfully without the answer.
- Types: \`radio\`, \`checkbox\`, \`select\`, \`text\`, \`textarea\`, \`number\`, \`range\`, \`date\`, \`time\`, \`datetime-local\`, \`color\`, \`url\`, \`email\`, \`tel\`, \`file\`, \`switch\`, \`direction-cards\`. Use the narrowest suitable type and \`maxSelections\` for checkboxes.
- Finite-choice \`options\` are \`{ "label": "...", "value": "..." }\`. The host adds localized "Other" unless \`allowCustom: false\`; do not duplicate it. Add localized \`customLabel\` / \`customPlaceholder\` when useful.
- \`direction-cards\` needs non-empty \`cards\` whose \`id\` matches each option value. Each card requires \`id\`, localized \`label\`/\`mood\`, up to 4 \`references\`, 4–6 CSS \`palette\` colors, \`displayFont\`, and \`bodyFont\`. Without that metadata, use \`radio\`.
- Give every question an honest query-derived \`default\` so unchanged submission is useful: an option value, checkbox array, or concrete text, never filler. Omit only when none is honest, such as file upload; place it before \`options\` for streaming preselection.
- A \`file\` question may use \`multiple\` and \`accept\`; answers return as attached/context files that must be inspected before continuing.
- Localize every user-facing string and set \`lang\` to the matching BCP-47 tag; write as a native speaker would. Keep machine ids, types, and option values in English. A \`brand\` question uses \`pick_direction\`, \`brand_spec\`, and \`reference_match\`.
- Use 1–3 questions normally and at most 5. Count before emitting and remove the weakest until 5 or fewer remain.`;

/**
 * The minimum host-level question-form protocol shared by daemon and BYOK
 * prompt composers. Modes without the full design charter use this complete
 * decision + emission contract.
 */
export const HOST_QUESTION_FORM_PROTOCOL = `## Host clarification protocol — any turn

This protocol controls how a blocking clarification is presented; the active mode or workflow decides whether one is needed. It applies on turn 1 and every later turn. If you must pause to clarify user intent, emit one complete \`question-form\` element whose opening tag has quoted \`id\` and localized \`title\` attributes, followed by a valid JSON body and the exact closing tag \`</question-form>\`; then end the turn. Use the active mode or workflow's form id when defined, otherwise use \`discovery\`. Do not ask a blocking clarification as prose, a markdown list, or a partial form, and do not duplicate the questions outside the form. The form is assistant text parsed by the Open Design host, not a native tool call.

Derive every question from an unresolved material decision in the current query and context. Never ask for answered, safely inferable, or optional fields. A user-requested interview or questionnaire is requested content rather than a host clarification and may use ordinary prose unless a structured form materially improves the deliverable.

${CLARIFICATION_COMPLETENESS_FLOOR}

${QUESTION_FORM_SCHEMA_CONTRACT}`;
