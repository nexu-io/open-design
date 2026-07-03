# Open Design Web Clipper — Privacy Policy

_Last updated: 2026-06-16_

**Short version: the Open Design Web Clipper does not collect, store, or transmit
your data to us or to any third party. Everything you clip goes only to the
Open Design app running on your own computer.**

## What the extension does

When you trigger a capture (a page snapshot, screenshot, picked images, a picked
element, or a Figma capture), the extension reads the content of the page you are
viewing and sends it to the Open Design application running locally on your own
machine over the loopback address `http://127.0.0.1` (the local daemon). That is
the only network destination the extension sends captured content to.

## What we collect

Nothing. The developer (Open Design / nexu-io) operates **no servers** that
receive your captures, browsing activity, or any personal information from this
extension. There is **no analytics, no telemetry, no tracking, and no
advertising** in the extension.

## Permissions and why they exist

- **Access to websites you clip (`<all_urls>`)** — to read and screenshot the
  active page and inline its resources into a self-contained snapshot, and to
  reach your local Open Design app. The extension acts only on the page you
  explicitly choose to capture.
- **Scripting / tabs** — to run the capture and on-page picker in the active tab
  when you start a capture.
- **Context menus** — the right-click "Save image to Open Design Library" entry.
- **Downloads** — to save a "Download Figma (.json)" import file to your disk when you ask.
- **Storage** — to remember local preferences only (the daemon URL if you changed
  it, and whether the on-page bar is shown). Stored locally in your browser; never
  transmitted to us.

## Where your data lives

All captured content is stored by the Open Design app in its local Library on your
device. Managing, exporting, or deleting that content is done inside the Open
Design app. Uninstalling the extension removes its local preferences.

## Changes

If this policy changes, the updated version will be published at this URL with a
new "Last updated" date.

## Contact

Questions: https://github.com/nexu-io/open-design/issues
