---
name: KIM Applied UI Kit
description: Reusable, source-backed UI kit for KIM advisory consultation surfaces.
source_basis: source-examples/kim-liquidez-real.html, source-examples/kim-design-system.html, KIM-COMPONENT-CONTRACTS.md
---

# KIM Applied UI Kit

## Product Overview

This UI kit supports KIM wealth-advisory consultation surfaces. It turns the preserved KIM design system into an operational reading layer for liquidity, client context and next-step preparation without inventing portfolio data or becoming a generic dashboard.

## Claude Design Package Guide

This is a reusable Claude Design package. It documents the applied kit structure, component files, usage workflow, design notes and source basis so future agents can compose consistent KIM consultation surfaces.

### When to use

Use the kit for an internal consultation view, a liquidity-horizon classification flow, or a source-backed reference for Button, Field, Tag, Card, Tabs and Table.

### How to use

Load the shared KIM tokens, import the modular files in `components/`, mount the composed index, replace only approved content and run the interaction review.

## Reuse Guide

The applied kit structure, component files, usage workflow, design notes and source basis are the five required inputs for reuse. Read each section in this document, then start from the composed index rather than copying isolated markup.

## Applied Kit Structure

`index.html` is the composed entry surface. It loads `../../colors_and_type.css`, `components/kit-components.css` and `components/kit-components.js`; the script mounts the route cards and KIM principle strip. `liquidez.html` is the applied horizon-reading flow. `components.html` is the visual reference for component states.

## Structure

The kit is deliberately split into a token layer, loadable CSS/JavaScript modules and reusable JSX source modules. `index.html` loads the first two layers and mounts a composed surface; the JSX modules retain the component anatomy for consumers that implement the kit in a React environment.

## Component Files

| File | Responsibility |
|---|---|
| `components/kit-components.css` | Shared styles for kit navigation, route cards and principle surface. |
| `components/kit-components.js` | Mounts the composed route cards and principle into `index.html`. |
| `components/RouteCard.js` | Reusable route-card anatomy and product-operation contract. |
| `components/PrincipleStrip.js` | Reusable editorial-direction strip and surface contract. |
| `components/LiquidityHorizonTable.js` | Reusable structural table for a liquidity-horizon reading. |
| `components/RouteCard.jsx` | React source counterpart of the browser-ready RouteCard module. |
| `components/PrincipleStrip.jsx` | React source counterpart of the browser-ready PrincipleStrip module. |
| `components/LiquidityHorizonTable.jsx` | React source counterpart of the browser-ready liquidity table module. |
| `index.html` | Loads tokens and modules, then mounts the applied entry surface. |
| `liquidez.html` | Tabs, filter, table and context for horizon classification. |
| `components.html` | Field, Button, Tag and Card state references. |

## Usage Workflow

1. Start from `index.html` and choose the needed route.
2. Import `../../colors_and_type.css` plus the component files instead of duplicating visual rules.
3. Replace only approved copy and data; labels, hierarchy and interaction anatomy remain intact.
4. Test focus, validation text, hover, active, disabled, keyboard behavior, reflow and reduced motion.

## Design Notes

The kit is deliberately restrained: white surface, black reading text, CONFIANTE as the singular deep brand surface, Degular for functional type, thin borders, 4/8 px radii and no shadows. It uses one primary action per context and keeps display typography outside operational controls.

## Source Basis

The source basis is the preserved KIM gallery and liquidity piece in `source-examples/`, the component contracts in `KIM-COMPONENT-CONTRACTS.md`, the profile architecture in `KIM-PROFILE-ARCHITECTURE.md`, and the shared token file `../../colors_and_type.css`. In a conflict, those sources override the applied kit.

## applied-kit-structure

The composed entry is `index.html`; it imports the shared token stylesheet and two modules from `components/`.

## component-files

The modular files are `components/kit-components.css` and `components/kit-components.js`; the applied pages are `index.html`, `liquidez.html` and `components.html`.

## usage-workflow

Read source, import tokens and modules, compose approved content, then validate interactions.

## design-notes

Keep white surface, thin borders, Degular, restrained radii and zero shadow.

## source-basis

Use the preserved source examples, component contracts and profile architecture as the controlling evidence.
