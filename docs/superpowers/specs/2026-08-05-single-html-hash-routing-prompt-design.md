# Single-HTML multi-page hash-routing prompt

## Summary

When the daemon runs in `single-html` mode and a user asks for a website with
multiple logical pages, strengthen the stable site-output instruction so the
agent implements those pages as a hash-routed single-page application inside
the one required `index.html`.

This is intentionally a prompt-only improvement. It does not add a request
field, router runtime, structural validator, or automatic repair retry. The
result is best-effort rather than a hard protocol guarantee.

## Motivation

`single-html` already guarantees a self-contained deployable artifact: one
visible `index.html` with inline CSS and JavaScript and embedded runtime
resources. A generated example showed that this format can still provide a
convincing multi-page experience by keeping logical pages in separate page
containers and switching between them with routes such as `#/about` and
`#/work/:id`.

The current prompt describes the file and resource constraints but does not
tell the agent how to represent a user request for multiple pages. An agent may
therefore create several HTML documents. The existing postprocessor selects
one entry document and omits the others, which can discard requested pages.

## Scope

Change only the `single-html` branch of `renderSiteOutputModePrompt()` in
`apps/daemon/src/site-output/mode.ts` and its focused tests.

Do not change:

- daemon startup flags or environment variables;
- HTTP, CLI, MCP, or A2A request and response contracts;
- the `SiteOutputMode` type;
- the single-file postprocessor or validator;
- run retry behavior;
- generated router injection;
- `multi-file` behavior.

## Prompt contract

Retain the existing mandatory rules:

- produce exactly one visible file named `index.html`;
- inline all CSS and JavaScript;
- embed images, fonts, and required resources as data URLs;
- do not depend on remote runtime resources;
- allow the service to normalize and validate the generated result.

Append a conditional multi-page rule with the following meaning:

```text
If the user requests multiple pages, views, or routes:
- Implement them inside the single index.html as a client-side SPA.
- Use hash routes such as #/, #/about, and #/work/:id.
- Do not create separate HTML files for logical pages.
- Do not use history.pushState or server-dependent pathname routing.
- Give every logical page a stable, unique page container.
- Show exactly one logical page for the active route.
- Use hash-compatible navigation links such as href="#/about".
- Handle initial loading, hashchange, browser back/forward, unknown routes,
  and parameterized routes.
- Keep shared navigation and layout inside the same document.
```

The wording is conditional. A normal one-page landing page is not required to
introduce a router or artificial page containers.

## Expected generated structure

The prompt does not mandate exact element names, but a conforming generated
site will usually resemble:

```html
<nav>
  <a href="#/">Home</a>
  <a href="#/about">About</a>
</nav>

<main>
  <section id="page-home" class="page active">...</section>
  <section id="page-about" class="page">...</section>
  <section id="page-detail" class="page">...</section>
</main>

<script>
  // Parse location.hash, match static or parameterized routes,
  // show one page, and react to hashchange.
</script>
```

Static routes such as `#/about` and parameterized routes such as
`#/work/:id` are both allowed. The generated router owns parameter parsing and
detail rendering because this design does not introduce a daemon-owned router.

## Data flow

```text
daemon starts with --site-output-mode single-html
  -> render stable single-html instruction
  -> user requests one page or multiple logical pages
  -> agent interprets the conditional routing instruction
  -> agent writes one self-contained index.html
  -> existing postprocessor inlines and normalizes resources
  -> existing single-html validator checks file and resource constraints
  -> run returns the existing outputPolicy result
```

All run surfaces receive the same instruction because the daemon already adds
the site-output prompt to the shared stable instruction slice.

## Failure behavior and limitations

There is no new route-aware failure condition. The existing validator can
confirm that the result is one self-contained HTML file, but it cannot confirm
that:

- every requested logical page exists;
- every navigation link resolves to a page container;
- exactly one logical page is visible after each route change;
- browser back and forward navigation works;
- parameterized routes render the correct data;
- the agent avoided losing pages before postprocessing.

If the agent ignores the instruction and creates multiple HTML files, existing
`single-html` behavior still selects one entry and records omitted pages as a
warning. This limitation is accepted for the prompt-only phase. A later phase
may add a structured `pageMode`, declarative route manifest, standard router,
route-aware validation, or an agent repair loop without changing this phase's
basic hash-routing recommendation.

## Testing

Add focused assertions for `renderSiteOutputModePrompt('single-html')` that
verify the instruction includes:

- the conditional multi-page trigger;
- hash route examples;
- the prohibition on separate HTML pages;
- the prohibition on `history.pushState` and pathname routing;
- initial load, `hashchange`, browser history, fallback, and parameterized
  route requirements.

Also verify that:

- the existing single-file and resource rules remain present;
- the `multi-file` prompt does not receive the hash-SPA-only instruction;
- daemon type checking and repository guard checks continue to pass.

No browser end-to-end test is added because this phase changes instructions,
not a deterministic router implementation.

## Acceptance criteria

- Starting the daemon in `single-html` mode sends the strengthened stable
  instruction to every existing run surface.
- A request for multiple pages is explicitly directed toward one-file hash SPA
  output, including static and parameterized routes.
- A request for a normal single page remains free to produce a router-free
  document.
- No public contract, startup option, postprocessor, validator, or response
  shape changes.
- Documentation states that this is best-effort rather than a hard guarantee.
