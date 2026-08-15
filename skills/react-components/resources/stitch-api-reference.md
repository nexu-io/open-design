# Stitch API reference

This document describes the data structures returned by the Stitch MCP server to ensure accurate component mapping.

### Metadata schema
When calling `get_screen`, the server returns a JSON object with these key properties:
* **htmlCode**: Contains a `downloadUrl`. This is a signed URL that requires a system-level fetch (curl) to handle redirects and security handshakes.
* **screenshot**: Includes a `downloadUrl` for the visual design. Use this to verify layout intent that might not be obvious in the raw HTML.
* **deviceType**: Usually set to `DESKTOP`. All generated components should prioritize the corresponding viewport (2560px width) as the base layout.

### Technical mapping rules
1. **Element tracking**: Preserve `data-stitch-id` attributes as comments in the TSX to allow for future design synchronization.
2. **Asset handling**: Treat background images in the HTML as dynamic data. Extract the URLs into `mockData.ts` rather than hardcoding them into the component styles.
3. **Style extraction**: The HTML `<head>` contains a localized `tailwind.config`. This config must be merged with the local project theme to ensure colors like `primary` and `background-dark` render correctly.
