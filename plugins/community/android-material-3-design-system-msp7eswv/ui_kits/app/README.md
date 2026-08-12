# Material Inbox Applied UI Kit

This browser-reviewable example applies the package's Material 3 semantic roles, component states, and adaptive list-detail structure. It is an authored example, not source code copied from a Google product.

## Structure

- `index.html` loads `../../colors_and_type.css`, `app.css`, React, ReactDOM, Babel, and the modular JSX components before mounting `App`.
- `components/App.jsx` owns selection, filtering, composing, archive feedback, and responsive composition.
- `components/NavigationRail.jsx` renders expanded/medium navigation plus compact top and bottom bars.
- `components/MailList.jsx` covers search, unread filtering, selection, and empty state.
- `components/MessageDetail.jsx` renders message content and task actions.
- `components/ComposerDialog.jsx` provides editable fields, required validation, and modal focus behavior.
- `components/Snackbar.jsx` announces short-lived feedback and supports an optional undo action.
- `interaction-check.html` runs the browser regression suite for composer focus/value retention, modal focus containment/restoration, replacement snackbar timing, actionable controls, contrast, and target sizes.

Every directly loaded component exposes a browser global so the Babel preview entry can compose the application without a build step.

## Usage

Open `index.html` in a browser, then review compact, medium, and expanded widths. Exercise search, the unread filter, message selection, archive/undo, reply, and the compose form. Serve the folder over HTTP and open `interaction-check.html`; it reports each interaction contract as PASS or stops on the first regression. When reusing the kit, copy or compose the component roles you need, load `colors_and_type.css` before `app.css`, and replace the sample information architecture and data with real product requirements.

## Design Notes

The layout is based on Material 3 adaptive navigation and list-detail guidance. Compact windows switch between list and detail and use bottom navigation. Medium windows introduce a navigation rail while retaining one main pane. Expanded windows show rail, list, and detail together. Tonal surfaces create hierarchy; shadow is reserved for the FAB, dialog, and snackbar. Controls retain 48px targets, visible focus, text validation, and reduced-motion support.

## Source Basis

Read `../../DESIGN.md`, `../../PROVENANCE.md`, and the focused files under `../../preview/`. The original UI-kit proposal is preserved at `../../references/source-3-README.md`; this shipped implementation is the source of truth for actual filenames and behavior.
