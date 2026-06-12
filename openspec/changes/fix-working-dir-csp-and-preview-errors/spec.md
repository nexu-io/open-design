# Web Deployment Reliability Specification

## Purpose

Define the required web-only behavior for working-directory selection, sandboxed community preview loading, public connector configuration reads, and bundled plugin preview validity when Open Design is deployed via Docker Compose on a VPS.

## Requirements

### Requirement: Working-directory selection MUST apply the chosen folder to the project

The system MUST make the existing "Choose folder" workflow functional in web-only deployments.

The system MUST treat working-directory assignment as a two-step flow:
1. create the project through the existing project-creation API, and
2. persist the chosen folder through `POST /api/projects/:id/working-dir`.

The system MUST NOT silently leave a project on the daemon-managed default directory after the user selected a working directory.

#### Scenario: Create flow applies chosen folder

- GIVEN the web UI is running without any desktop or Electron host
- AND the user uses the existing "Choose folder" button in a create-project flow
- AND the folder dialog returns a selectable directory path
- WHEN the user creates the project
- THEN the system MUST create the project first
- AND the system MUST call `POST /api/projects/:id/working-dir` for the created project
- AND the project metadata MUST persist the selected directory as `baseDir`
- AND subsequent project resolution MUST use that persisted directory instead of the daemon-managed default directory

#### Scenario: Working-directory assignment failure is visible

- GIVEN the user selected a working directory before creating a project
- WHEN the follow-up `POST /api/projects/:id/working-dir` request fails
- THEN the system MUST surface that failure to the user
- AND the system MUST NOT present the project as if the selected folder is active
- AND the project MUST remain in a consistent state with no ambiguous active working directory

#### Scenario: In-project picker persists a new working directory

- GIVEN an existing project is open in the web UI
- AND the project exposes the existing `WorkingDirPicker`
- WHEN the user chooses a new folder through that picker
- THEN the picker flow MUST call `POST /api/projects/:id/working-dir`
- AND the project metadata MUST update its persisted `baseDir`
- AND the new working directory MUST still be active after reload

### Requirement: Working-directory assignment MUST work without desktop-auth tokens in web-only deployments

The system MUST allow `POST /api/projects/:id/working-dir` to succeed in a web-only deployment without requiring any desktop-auth HMAC token.

The system MUST keep the existing privilege boundary that direct project creation cannot set `metadata.baseDir` through generic project creation payloads.

#### Scenario: Web-only assignment succeeds without desktop token

- GIVEN the deployment target does not include any desktop or Electron runtime
- AND a valid project already exists
- AND the request to `POST /api/projects/:id/working-dir` provides a candidate directory path
- WHEN the path passes validation
- THEN the endpoint MUST accept the request without requiring a desktop-auth token
- AND the endpoint MUST persist the validated path as `metadata.baseDir`

#### Scenario: Generic project creation still rejects direct baseDir writes

- GIVEN a client sends `POST /api/projects` with `metadata.baseDir` in the creation payload
- WHEN the request reaches the generic project-creation route
- THEN the system MUST reject setting `baseDir` through that route
- AND the system MUST require working-directory persistence to happen through `POST /api/projects/:id/working-dir`

### Requirement: Working-directory assignment MUST validate filesystem safety rules

The system MUST validate candidate working directories before persisting them.

At minimum, a candidate path MUST:
- resolve successfully through canonical path resolution,
- refer to an existing directory,
- NOT resolve to the filesystem root, and
- NOT resolve to the daemon data directory or a path inside it.

#### Scenario: Canonical existing directory is accepted

- GIVEN a project exists
- AND the client submits a directory path that resolves through canonical path resolution to an existing directory
- WHEN the path is not root and is not the daemon data directory
- THEN the system MUST persist the canonical resolved path as `metadata.baseDir`

#### Scenario: Missing directory is rejected

- GIVEN a project exists
- WHEN the client submits a path that cannot be resolved to an existing directory
- THEN the system MUST reject the request
- AND the project MUST keep its previous working directory unchanged

#### Scenario: Filesystem root is rejected

- GIVEN a project exists
- WHEN the client submits `/` as the candidate working directory
- THEN the system MUST reject the request
- AND the project MUST keep its previous working directory unchanged

#### Scenario: Daemon data directory is rejected

- GIVEN a project exists
- AND the daemon data directory is configured
- WHEN the client submits the daemon data directory or a descendant of it as the candidate working directory
- THEN the system MUST reject the request
- AND the project MUST keep its previous working directory unchanged

### Requirement: Web working-directory defaults MUST honor `OD_WORKING_DIR`

The system MUST support `OD_WORKING_DIR` as a web-deployment default working directory.

When configured, the system MUST initialize create-flow working-directory state from that value so that web users can deploy a preconfigured default through Docker Compose without requiring desktop integration.

#### Scenario: Configured default seeds the create flow

- GIVEN the daemon is started with `OD_WORKING_DIR` set to a directory path
- WHEN a user opens a project-creation flow in the web UI
- THEN the working-directory control state MUST initialize from that configured default
- AND a project created without overriding that default MUST use the configured directory as its persisted `baseDir`

#### Scenario: User override wins over configured default

- GIVEN `OD_WORKING_DIR` is configured
- AND the user uses the existing "Choose folder" button to select a different directory
- WHEN the project is created
- THEN the user-selected directory MUST be used for `POST /api/projects/:id/working-dir`
- AND the configured default MUST NOT overwrite the user choice

### Requirement: Sandboxed plugin previews MUST load external static resources through a same-origin proxy

The system MUST keep preview iframes sandboxed while allowing supported external static resources to load only after rewrite to a same-origin proxy URL.

The preview HTML rewriting layer MUST rewrite supported external resource references, including:
- stylesheet links,
- script `src` URLs,
- supported image and media URLs,
- supported font URLs,
- Google Fonts stylesheet URLs, and
- supported URLs found inside inline CSS, inline script strings, and proxied CSS `url(...)` references.

The system MUST NOT rely on direct external network access from the iframe for those resources.

#### Scenario: External stylesheet is rewritten through the cache proxy

- GIVEN a plugin preview HTML document contains `<link rel="stylesheet" href="https://example-cdn.test/site.css">`
- WHEN the preview HTML is served to the sandboxed iframe
- THEN the stylesheet URL MUST be rewritten to a same-origin cache/proxy URL
- AND the iframe MUST load the stylesheet through that same-origin URL rather than directly from the external origin

#### Scenario: External script is rewritten through the cache proxy

- GIVEN a plugin preview HTML document contains `<script src="https://example-cdn.test/app.js"></script>`
- WHEN the preview HTML is served to the sandboxed iframe
- THEN the script URL MUST be rewritten to a same-origin cache/proxy URL
- AND the iframe MUST load the script through that same-origin URL rather than directly from the external origin

#### Scenario: Google Fonts CSS is proxied and recursively rewritten

- GIVEN a plugin preview HTML document references a Google Fonts stylesheet URL
- WHEN the stylesheet is fetched through the proxy
- THEN the proxy MUST return stylesheet content from a same-origin URL
- AND any nested `url(...)` references inside that stylesheet MUST be rewritten to same-origin cache/proxy URLs
- AND the resulting font files MUST load without requiring direct access to `fonts.googleapis.com` or `fonts.gstatic.com`

#### Scenario: Inline CSS url() references are rewritten for supported assets

- GIVEN a plugin preview HTML document contains inline CSS with supported external `url(...)` references
- WHEN the preview HTML is served
- THEN those supported URLs MUST be rewritten to same-origin cache/proxy URLs before the iframe renders the document

### Requirement: Asset-cache proxy MUST enforce guarded fetch rules

The system MUST preserve SSRF protections while extending preview asset support.

The proxy MUST only fetch supported external resources over `http:` or `https:` and MUST reject:
- URLs with embedded credentials,
- localhost targets,
- private, loopback, or link-local IP destinations,
- DNS-rebinding attempts, and
- unsupported methods.

The proxy MUST enforce resource-class limits for content type and size.

The proxy MUST support the resource classes required by preview rewriting, including fonts, CSS, static JavaScript, images, and media.

#### Scenario: Supported font is fetched and cached

- GIVEN a rewritten same-origin proxy URL targets a supported external font resource
- WHEN the proxy fetches the resource
- THEN the proxy MUST accept the response only if the resource type and size are allowed for fonts
- AND the proxy MUST serve the cached result from a same-origin URL usable by the preview iframe

#### Scenario: CSS response is recursively rewritten

- GIVEN a rewritten same-origin proxy URL targets an external CSS resource
- WHEN the proxy fetches the stylesheet
- THEN the proxy MUST rewrite supported nested `url(...)` references inside the stylesheet to same-origin cache/proxy URLs before returning it

#### Scenario: SSRF-protected target is rejected

- GIVEN a rewritten same-origin proxy URL targets localhost, a private IP, a link-local address, or a URL with credentials
- WHEN the proxy evaluates the target
- THEN the proxy MUST reject the request
- AND the preview MUST NOT gain access to that protected destination through the proxy

### Requirement: Preview sandbox CSP MUST permit only same-origin proxied resource loading

The sandbox CSP for plugin previews MUST allow the supported same-origin proxy flow while continuing to block direct external network access by default.

The preview CSP MUST include explicit support for same-origin fonts and same-origin fetches needed by the proxied preview flow.

#### Scenario: Same-origin proxied resources are allowed by CSP

- GIVEN a plugin preview document references supported resources that were rewritten to same-origin proxy URLs
- WHEN the iframe loads the preview
- THEN the preview CSP MUST allow those same-origin stylesheet, script, font, media, image, and fetch requests to complete

#### Scenario: Direct external fetch remains blocked

- GIVEN a plugin preview document still contains a direct external network request that was not rewritten to the same-origin proxy
- WHEN the iframe loads the preview under the sandbox CSP
- THEN the direct external request MUST remain blocked by CSP by default

### Requirement: Public Composio config reads MUST succeed during daemon startup

The system MUST treat `GET /api/connectors/composio/config` as a public safe-read route whose availability does not depend on the daemon having already resolved its listening port.

The route MUST continue returning only the public response shape and MUST NOT expose connector secrets.

#### Scenario: Public config GET succeeds before port resolution

- GIVEN the daemon has started handling requests but has not yet resolved `resolvedPort`
- AND a browser request targets `GET /api/connectors/composio/config`
- WHEN the request is evaluated by origin-guard middleware
- THEN the route MUST return the public config payload instead of a 403 startup error
- AND the response body MUST expose only `configured` and `apiKeyTail`

#### Scenario: Public config GET remains secret-safe

- GIVEN Composio is configured with an API key
- WHEN a client calls `GET /api/connectors/composio/config`
- THEN the response MUST indicate whether Composio is configured
- AND the response MAY include only the allowed public key tail metadata
- AND the full API key MUST NOT appear in the response

#### Scenario: Composio config writes remain protected

- GIVEN a client attempts `PUT /api/connectors/composio/config`
- WHEN the request does not satisfy the local-daemon protection already required for that route
- THEN the system MUST continue rejecting the write
- AND the startup-safe GET behavior MUST NOT relax write protection

### Requirement: Bundled plugin previews MUST reference renderable HTML assets

Bundled plugins that declare a preview entry MUST ship the referenced renderable HTML asset.

The bundled `example-live-artifact` plugin MUST provide a renderable preview HTML file at the path referenced by its manifest.

#### Scenario: example-live-artifact preview resolves successfully

- GIVEN the bundled `example-live-artifact` plugin is installed
- WHEN a client requests `GET /api/plugins/example-live-artifact/preview`
- THEN the server MUST return HTML content instead of a 404 preview-not-found error
- AND the returned preview MUST be renderable without depending on missing plugin assets

#### Scenario: Bundled preview declaration is audited

- GIVEN a bundled plugin declares a preview entry in its manifest
- WHEN the bundled plugin preview audit or test suite validates bundled plugin manifests
- THEN the audit MUST fail if the declared preview entry does not exist as a renderable HTML asset
- AND the failure MUST prevent shipping a bundled plugin with a broken preview declaration
