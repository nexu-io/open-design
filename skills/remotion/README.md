# Stitch-Remotion Video Walkthrough Skill

Generate professional walkthrough videos from Stitch app designs using Remotion.

## What This Skill Does

This skill bridges Stitch (UI design platform) and Remotion (programmatic video library) to automatically create walkthrough videos showcasing app screens with:

- **Smooth transitions**: Cross-fades, slides, and zoom effects
- **Text overlays**: Screen titles, descriptions, and feature callouts
- **Professional animations**: Spring-based natural motion
- **Customizable timing**: Control display duration per screen

## Prerequisites

1. **Stitch MCP Server**: Access to retrieve screens from Stitch projects
2. **Node.js**: For running Remotion
3. **Remotion**: Either Remotion MCP Server or Remotion CLI

## Example Use Case

**User Request:**
> "Look up the screens in my Stitch project 'Calculator App' and build a remotion video that shows a walkthrough of the screens."

**What Happens:**
1. Agent retrieves all screens from the Stitch project
2. Downloads screenshots for each screen
3. Creates a Remotion composition with transitions
4. Generates video with smooth animations and text overlays
5. Renders final MP4 video

## Key Features

- **Automated asset retrieval** from Stitch projects
- **Modular Remotion components** for easy customization
- **Multiple transition styles** (fade, slide, zoom)
- **Text overlay system** for annotations
- **Configurable timing** per screen
- **Professional rendering** with quality optimization

## Installation

Install this skill using:

```bash
npx skills add google-labs-code/stitch-skills --skill remotion --global
```

## File Structure

When using this skill, the agent will create:

```
project/
├── video/                      # Remotion project
│   ├── src/
│   │   ├── WalkthroughComposition.tsx
│   │   ├── ScreenSlide.tsx
│   │   └── components/
│   ├── public/assets/screens/  # Stitch screenshots
│   └── remotion.config.ts
├── screens.json                # Screen manifest
└── output.mp4                  # Final video
```

## How It Works

1. **Discovery**: Identifies Stitch and Remotion MCP servers
2. **Retrieval**: Fetches screens and metadata from Stitch project
3. **Asset Download**: Downloads screenshots for each screen
4. **Composition**: Generates Remotion React components
5. **Preview**: Opens Remotion Studio for refinement (optional)
6. **Render**: Produces final video file

## Integration Points

**With Stitch:**
- Uses Stitch MCP to list projects and screens
- Downloads screenshots and HTML code
- Extracts screen metadata (title, dimensions)

**With Remotion:**
- Creates TypeScript/React components
- Configures composition settings
- Renders video using Remotion CLI or MCP

## Advanced Capabilities

- **Dynamic text extraction**: Parse Stitch HTML to auto-generate annotations
- **Interactive hotspots**: Highlight clickable elements
- **Voiceover integration**: Sync narration with screen transitions
- **Multiple video patterns**: Slide show, feature highlight, user flow

## Related Skills

- **design-md**: Extract design system from Stitch projects (useful for consistent branding in videos)
- **react-components**: Convert Stitch designs to React (if you want interactive demos instead of videos)

## Learn More

See the full [SKILL.md](./SKILL.md) for detailed instructions, troubleshooting, and best practices.

## License

This is not an officially supported Google product.
