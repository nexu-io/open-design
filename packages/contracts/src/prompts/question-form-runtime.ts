/**
 * The parseable question-form schema shared by every prompt variant.
 * Workflow prompts decide whether clarification is needed and which form id
 * applies; this block owns the JSON contract once they decide to pause.
 */
export const QUESTION_FORM_SCHEMA_CONTRACT = `### Form schema — any form, any turn

- The body is valid JSON with top-level \`lang\` and \`questions\`; do not use comments or trailing commas. \`questions\` is an array, and every question has a stable English \`id\`, localized \`label\`, supported \`type\`, and boolean \`required\`.
- Supported types: \`radio\`, \`checkbox\`, \`select\`, \`text\`, \`textarea\`, \`number\`, \`range\`, \`date\`, \`time\`, \`datetime-local\`, \`color\`, \`url\`, \`email\`, \`tel\`, \`file\`, \`switch\`, and \`direction-cards\`. Use \`maxSelections\` for checkboxes and the narrowest suitable control: e.g. \`range\` for intensity, date/time for deadlines, \`switch\` for booleans, and \`textarea\` only for open prose.
- Finite-choice \`options\` are \`{ "label": "...", "value": "..." }\` objects. The host adds localized "Other" unless \`allowCustom: false\`; do not add another catch-all. Add localized \`customLabel\` / \`customPlaceholder\` when useful.
- \`direction-cards\` requires non-empty \`cards\`, matching each option value by \`id\`. Each card requires \`id\`, localized \`label\` and \`mood\`, \`references\` (up to 4 strings), \`palette\` (4–6 CSS colors), \`displayFont\`, and \`bodyFont\`. If card metadata is unavailable, use \`radio\`; options alone render no cards.
- Give every question an honest query-derived \`default\` so submitting unchanged is useful: an option \`value\`, an array for checkbox, or concrete text — never filler. Omit \`default\` only when no honest default exists, such as a file upload. Put \`default\` before \`options\` so streaming forms can preselect it.
- A \`file\` question may use \`multiple\` and \`accept\`. Selected files are uploaded into Design Files and arrive on the answer turn as attached/context files; inspect them before continuing.
- Localize every user-facing string and set \`lang\` to the matching BCP-47 tag. Write what a native speaker would say rather than translating word for word. Keep machine-readable ids, types, and option values in English; a \`brand\` question uses \`pick_direction\`, \`brand_spec\`, and \`reference_match\`.
- Use 1–3 questions normally and at most 5. Count before emitting and remove the weakest until 5 or fewer remain.`;

/**
 * The minimum host-level question-form protocol shared by daemon and BYOK
 * prompt composers. Modes without the full design charter use this complete
 * decision + emission contract.
 */
export const HOST_QUESTION_FORM_PROTOCOL = `## Host clarification protocol — any turn

This protocol controls how a blocking clarification is presented; the active mode or workflow decides whether one is needed. It applies on turn 1 and every later turn. If you must pause to clarify user intent, emit one complete \`question-form\` element whose opening tag has quoted \`id\` and localized \`title\` attributes, followed by a valid JSON body and the exact closing tag \`</question-form>\`; then end the turn. Use the active mode or workflow's form id when defined, otherwise use \`discovery\`. Do not ask a blocking clarification as prose, a markdown list, or a partial form, and do not duplicate the questions outside the form. The form is assistant text parsed by the Open Design host, not a native tool call.

Derive every question from an unresolved material decision in the current query and context. Never ask for answered, safely inferable, or optional fields. A user-requested interview or questionnaire is requested content rather than a host clarification and may use ordinary prose unless a structured form materially improves the deliverable.

${QUESTION_FORM_SCHEMA_CONTRACT}`;
