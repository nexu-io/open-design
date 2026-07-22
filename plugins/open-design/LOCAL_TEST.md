# Local test build

This is the local validation path for the same V1 workflow used by the hosted ChatGPT app. The package includes a self-contained stdio MCP for Codex so `collect_brief` and its Custom UI do not disappear when a manually started HTTP dev server stops.

## 1. Validate the package

From the repository root:

```bash
pnpm exec tsx plugins/open-design/scripts/verify-local.ts --package-only
```

This checks the repo marketplace entry, plugin and app manifests, Cloud sign-in policy, and bundled Codex MCP entry. It also requires the exact nine-skill package—`open-design-basics` plus eight artifact skills—and fails if the retired `create-with-open-design` folder is still present. The artifact keywords must cover all eight V1 types.

## 2. Start the local gateway

Use the repository lifecycle entry point:

```bash
pnpm tools-dev run web --daemon-port 17456 --web-port 17574
```

The daemon accepts MCP inspection from a direct loopback client without disabling the production authentication boundary. Sign in to Open Design Cloud in the local Open Design UI when you want to exercise account balance and a real generation run.

## 3. Verify the MCP Apps contract

In another terminal:

```bash
pnpm exec tsx plugins/open-design/scripts/verify-local.ts
```

The verifier connects to `http://127.0.0.1:17456/mcp` and proves that:

- the server identifies as Open Design;
- only the nine Cloud V1 tools are published;
- `collect_brief`, `create_project`, and `start_run` expose the same eight artifact types: website, product prototype, presentation, design system, image, video, audio, and document;
- `create_project` requires both `name` and `artifactType`;
- Artifact Card v10 is registered, every artifact type has output choices, and v2–v9 resource URIs resolve to the current card;
- the Custom UI stays choice-only and does not duplicate the host with an internal OpenDesign header, logo, or subtitle.

You can also connect MCP Inspector to `http://127.0.0.1:17456/mcp` to call tools and render the card interactively.

To inspect the real MCP Apps card without a ChatGPT host, start the local Card Gallery:

```bash
pnpm exec tsx plugins/open-design/scripts/preview-local-card.ts
```

The gallery defaults to the website brief. Preview another type either with the
startup flag:

```bash
pnpm exec tsx plugins/open-design/scripts/preview-local-card.ts \
  --artifact-type document
```

or with the page query:

```text
http://127.0.0.1:17640/?state=brief&artifactType=document
```

Valid values are `website`, `product-prototype`, `presentation`,
`design-system`, `image`, `video`, `audio`, and `document`. The gallery also
renders links for switching among them while preserving the other card states.

In the `brief` state, use the gallery to confirm the rendering layer: every
visible question is a radio, checkbox, select, switch, or direction card, with
no text input, textarea, or other editable surface. The card itself should
begin with the brief or status content; Open Design identity belongs to the
host, so the card must not repeat an internal header, logo, or subtitle. The
gallery loads the card HTML from the live MCP resource and provides a small
host simulator for refresh, versions, restore, export, and external-link
actions; it does not maintain a separate copy of the card.

The gallery is a renderer smoke test, not a test of question selection. Validate
dynamic discovery through a fresh Codex or ChatGPT task, where the active skill
derives `knownAnswers` and `questionForm` from the real user request before it
calls `collect_brief`.

For the added V1 lanes, also confirm that image/video/audio briefs expose
media-specific format choices and that the document brief offers Markdown plus
print-ready or PDF-ready HTML—not native DOCX.

## 4. Install the repository plugin in Codex

Open the repository marketplace from the Codex deep link in the project handoff and install **Open Design**. After every install or update—including a manifest, skill, bundle, or cachebuster change—fully quit and relaunch Codex, then create a fresh task and select Open Design again. The plugin-page Refresh control and a fresh task by themselves do not reload an already-running MCP process.

The installed plugin must contribute `open-design-basics`, the eight artifact skills, and an `open-design` stdio MCP. The acceptance signal is a real `collect_brief` tool call whose request-specific, choice-only Custom UI card appears in the fresh task; prose questions, literal `<question-form>` markup, or the same fixed questionnaire for unrelated briefs mean the dynamic path is not active. `collect_brief` works while the Open Design daemon is offline; account and generation calls additionally require Open Design to be running.

### Dynamic discovery acceptance

Use fresh tasks so an old MCP or skill snapshot cannot hide a regression. Run at
least these cases:

1. Send two materially different requests for the same artifact type, such as a B2B product waitlist site and an editorial portfolio. The questions and options should reflect each request; they must not be identical generic goal/audience/content/direction/output rows.
2. Repeat a request while explicitly supplying its audience, CTA, page scope, reference, or format. Each supplied decision must appear in `knownAnswers` and disappear from `questionForm.questions`; it must not return as a disabled or prefilled duplicate.
3. Send a detailed request that leaves only one or two consequential decisions open. The form should ask only those decisions. A normal incomplete brief should ask 2–3 questions and no generated form may exceed 5.
4. Send the same request in Chinese. `title`, `description`, `submitLabel`, question labels, help text, and option labels should be natural Chinese; `id`, `type`, and option `value` stay stable English machine identifiers, and `lang` is `zh-CN`.
5. Inspect the tool call. It must use `collect_brief({ artifactType, projectTitle?, knownAnswers, questionForm })`. Every question uses `radio`, `checkbox`, `select`, `switch`, or `direction-cards`, includes a valid `defaultValue`, and has choices tailored to the current request.
6. Submit the form. The follow-up message must begin `[form answers — <questionForm.id>]`; each visible answer should retain its stable `[value: ...]`. The next turn merges those values, does not ask them again, and proceeds to account/project/run steps when no consequential gap remains.
7. Give a complete brief or say “直接做，不要提问”. The skill should skip `collect_brief` instead of inventing low-value questions.

Across all cases, the form body must not add a second OpenDesign logo, name,
subtitle, or product header below the host's tool header.

The checked-in `.app.json` remains empty until ChatGPT Developer Mode assigns the real `asdk_app_...` identifier. That identifier belongs to the hosted app registration and must not be replaced with a fake local id.

## 5. Optional ChatGPT Developer Mode test

ChatGPT cannot connect directly to a loopback URL. To test inside ChatGPT before production deployment, expose the local daemon through an access-controlled HTTPS tunnel and set the public MCP resource URL to the tunnel's exact `/mcp` URL. For that short-lived test only, set `OD_CHATGPT_MCP_ALLOW_UNAUTHENTICATED=1`, then remove it immediately after the session.

Do not use this tunnel mode for a shared or production deployment. The release build must use Open Design OAuth and managed tenant routing described in [PRODUCTION.md](./PRODUCTION.md).

The hosted deployment has a separate read-only verifier at
`scripts/verify-production.ts`; it intentionally requires HTTPS and therefore
does not replace this loopback test path.
