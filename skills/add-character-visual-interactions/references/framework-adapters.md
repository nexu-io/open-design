# Framework Adapters

## Compatibility Scope

Treat these entries as adaptation guidance, not as proof that every version, renderer, router, or build configuration is supported. Detect the actual stack and version first. In the completion report, name only the frameworks and routes verified with fresh build and browser evidence.

## General Rule

Detect the stack from the package manifest and existing source. Match existing component style and build tooling. Do not migrate APIs, rewrite the page, or introduce a new state pattern for a visual-only change.

## Vue

Use the existing Options API or Composition API style. Keep DOM and Three.js handles in refs. Register browser work in onMounted and remove it in onBeforeUnmount. A page-local component and a small pure motion module are normally sufficient.

## React

Keep renderer and DOM handles in refs. Start listeners, timers, and animation frames inside an effect and return complete cleanup. Make initialization idempotent because development Strict Mode may mount effects twice.

## Next.js and Nuxt

Keep browser-only rendering on the client. Dynamically load heavy 3D code when SSR would evaluate browser globals. Do not make the whole application client-only for one visual component.

## Svelte

Use bound element references and start browser work in onMount. Return or register complete cleanup in onDestroy. Keep motion math outside the component when it needs unit tests.

## Angular

Start DOM or renderer work after the view is initialized and release it in OnDestroy. Keep handles on the component instance. Run continuous animation outside Angular change detection when the existing project pattern supports it.

## Vanilla and Other Stacks

Use a module-scoped initializer that returns a cleanup function. Follow the same target, motion, renderer separation. For another framework, map initialization and cleanup onto native lifecycle primitives before writing code.

## Styling

Reuse existing CSS conventions, whether scoped CSS, CSS Modules, Tailwind, styled components, or another established system. Keep page positioning in the page layout and character internals in the visual component.
