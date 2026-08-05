# OpenCode A2A Discovery Routing Design

## Goal

When a user explicitly asks OpenCode to use Open Design, OpenCode must hand the original request to Open Design immediately. Open Design owns design discovery, while OpenCode only renders and returns Open Design's structured question forms.

This prevents OpenCode from asking redundant or implementation-oriented questions such as whether to use Open Design or whether the result should be delivered as HTML, CSS, and JavaScript files.

## Scope

The required behavior change is limited to the OpenCode workspace adapter at `D:\opencode\.opencode\tool\open-design-a2a.ts`.

Open Design's A2A protocol and question-form implementation remain unchanged. The daemon already parses a completed `<question-form>`, publishes `TASK_STATE_INPUT_REQUIRED`, and includes the normalized form as `application/vnd.open-design.question-form+json`.

Open Design receives regression coverage for that existing boundary only if current tests do not already prove the required preservation behavior. No new HTTP endpoint, A2A method, media type, or contracts package field is introduced.

## Routing Rules

### Starting an Open Design task

The `open-design-a2a_send` tool description must instruct OpenCode that, when the user explicitly requests Open Design:

1. Call `open-design-a2a_send` immediately with the user's complete original design request.
2. Do not call OpenCode's native `question` tool before the A2A send.
3. Do not ask whether the user wants to use Open Design.
4. Do not ask implementation or delivery questions about HTML, CSS, JavaScript, local files, or deployment before the send.
5. Leave design discovery to the question form returned by Open Design.

These rules guide the agent without modifying OpenCode core routing code. This is appropriate for the proof of concept and keeps the client-side change portable to Mobilework.

### Rendering Open Design questions

The `open-design-a2a_get` tool description must instruct OpenCode that native question UI is allowed only after the task returns `TASK_STATE_INPUT_REQUIRED` with an `application/vnd.open-design.question-form+json` data part.

OpenCode must render the form exactly as returned:

- Preserve the form title, question labels, order, types, options, descriptions, defaults, and required flags.
- Do not add, remove, rewrite, summarize, or reorder questions or options.
- Do not append a delivery-method question or another Open Design confirmation question.
- Submit answers with `open-design-a2a_answer` using the returned task, context, form, and question IDs.

### Continuing the loop

After an answer is submitted, OpenCode continues polling the same task. Another `TASK_STATE_INPUT_REQUIRED` result starts another render-and-answer round. A completed task returns its artifact links and result; failed or canceled states are reported without inventing a replacement workflow.

## Data Flow

```text
User explicitly requests Open Design
  -> OpenCode calls open-design-a2a_send with the original brief
  -> Open Design starts the design run
  -> Open Design emits <question-form>
  -> A2A executor returns TASK_STATE_INPUT_REQUIRED plus structured form data
  -> OpenCode renders that exact form with native question UI
  -> User answers
  -> OpenCode calls open-design-a2a_answer
  -> Open Design resumes the same task
  -> repeat input-required rounds or return the completed artifact
```

## Error Handling

Existing adapter behavior remains responsible for Agent Card discovery, HTTP errors, JSON-RPC errors, missing results, and terminal task states. This change does not hide those failures or fall back to locally generating a design.

If Open Design returns an invalid form, the Open Design A2A executor continues to fail the task explicitly. OpenCode must surface that failure instead of reconstructing or guessing the missing questions.

## Validation

1. Import the OpenCode adapter with Bun to confirm that all four tools still load.
2. Inspect the exported `send` and `get` descriptions to verify the routing and exact-render rules are present.
3. Run the focused Open Design A2A question-form and executor tests. Add only the smallest missing regression assertion if existing tests do not cover preservation of structured form fields.
4. In a fresh OpenCode session, submit an explicit Open Design request and verify the first relevant tool call is `open-design-a2a_send`, not the native `question` tool.
5. Verify the first native question UI is populated from an Open Design `TASK_STATE_INPUT_REQUIRED` response and contains no client-invented delivery question.

## Non-goals

- No OpenCode core modification or hard-coded intent classifier.
- No change to Open Design's MCP service.
- No change to the A2A Agent Card, JSON-RPC methods, or media types.
- No attempt to prevent every possible model deviation at the runtime level; hard programmatic routing belongs in the later Mobilework implementation.
- No broad rewrite of Open Design's discovery question content in this change.
