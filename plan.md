# Tiny Worlds — Implementation & Design Plan

## Product intent

Build a substantial, approachable browser-based ecosystem simulator where users can watch multiple species interact, inspect individuals and species, intervene in the environment, understand evolutionary changes, explore history, replay moments, and save/load complete worlds. All simulation and save data remain in the browser; no account, server-side database, external API, or dependency is needed.

## Implementation approach

Use a dependency-free JavaScript ES-module application served by a small Node.js static server on the project's configured port 3000. The browser simulation owns all state. A seeded grid-based environment contains seasonal climate and renewable vegetation, while mobile organisms forage, hunt, reproduce, migrate, and age. Individual heritable traits vary through bounded mutation; survival and reproduction depend on energy, habitat fit, climate tolerance, and predator/prey interactions. The world stores dated event history and periodic full-state checkpoints for replay. Named local saves include simulation state, settings, history, and replay checkpoints; import/export uses JSON.

Use HTML Canvas for the panning/zoomable animated world and SVG/DOM for accessible panels and history charts. Keyboard and pointer controls work alongside visible buttons. Design for desktop first, then reflow to a usable single-column touch layout on narrow screens. Use browser-native APIs only (Canvas, SVG, localStorage, File, and downloads); no remote assets, trackers, or external services.

## Product modules

- `public/index.html`: semantic application shell, panels, dialogs, and accessible status regions.
- `public/styles.css`: responsive field-station interface, design tokens, motion, and reduced-motion behavior.
- `public/js/core/world.js`: world generation, terrain, seed handling, scenario initialization, and per-species trait/fitness distribution summaries.
- `public/js/core/simulation.js`: ecological daily tick, interactions, environmental response, and concise event generation.
- `public/js/core/evolution.js`: inherited traits, mutation, selection, and trait summaries.
- `public/js/core/history.js`: metric sampling, chronological events, checkpoints, seek/restore, and replay boundaries.
- `public/js/core/storage.js`: versioned named saves, autosave, import/export, and safe validation.
- `public/js/data/scenarios.js`: prairie baseline, drought, winter refuge, predator pulse, and custom-world defaults.
- `public/js/ui/world-view.js`: canvas rendering, camera transforms, hit testing, pan/zoom, and focused organisms.
- `public/js/ui/charts.js`: lightweight SVG population, trait/fitness distribution, resource, and biodiversity charts with variation bands.
- `public/js/ui/panels.js`: species browser, organism inspector, scenario/environment controls, summaries, and event feed.
- `public/js/main.js`: application composition, controls, simulation loop, persistence, keyboard shortcuts, and UI state.
- `server.js`: dependency-free static HTTP server, listening on `0.0.0.0:3000` by default and honoring `PORT`.
- `build.js`: copies the static deliverable to `dist/`; `public/manus-routes.json` declares the root route; `public/tiny-worlds-mark.svg` supplies the source-controlled seed-orbit app mark.
- `tests/*.test.js`: Node built-in unit tests for deterministic generation, ecological rules, evolution, history/replay, and save/load data normalization.

## Design direction

- **Design Movement:** Modern scientific field station crossed with the warmth of a natural-history journal.
- **Core Principles:** Observable cause and effect; information-rich but legible; calm, living motion; practical tools that never obscure the habitat.
- **Color Philosophy:** Deep ink-green and warm paper anchor the interface; a quiet field-green signature and vivid ecological accents distinguish species and events. Meaningful chart colors remain consistent.
- **Layout Paradigm:** An instrument panel framing one expansive, uninterrupted habitat canvas, with collapsible field notes at the edges and a horizontal time-ribbon below the world—not a stack of uniform cards.
- **Signature Elements:** Fine contour-line framing; specimen-style species markers; a luminous seasonal sun-path/time scrubber.
- **Interaction Philosophy:** Direct manipulation of the habitat and explicit, reversible environmental controls; explain changes in plain language and confirm destructive reset/import replacement.
- **Animation:** Short, soft locomotion and resource shimmer; eased camera movement; pause-respecting simulation animation; avoid flashing, honor `prefers-reduced-motion`, and keep animation separate from simulation time.
- **Typography System:** A confident editorial serif for the project name and major moments, paired with a highly legible neutral sans for controls and data; tabular numerals for metrics and small uppercase labels for instrumentation.
- **Brand Essence:** A hands-on pocket biosphere for curious observers, where ecological change can be seen and understood; **curious, grounded, alive**.
- **Brand Voice:** Observant, concise, and never judgmental. Example lines: “A dry week is testing the meadow.” “The foxes are finding more mice than usual.”
- **Wordmark & Logo:** “Tiny Worlds” in an editorial serif beside a custom orbital seed mark: a central seed with two offset leaf-orbit arcs, with no generic globe icon.
- **Signature Brand Color:** Lichen green (`#86a873`).

## Project structure

See the module list above. `public/` contains all browser-served source and assets; `dist/` is generated by `build.js` and excluded from version control. Project-root `app.config.ts` holds the separate HTTPS project-logo metadata URL; `README.md`, `package.json`, `server.js`, `build.js`, `plan.md`, `TODO.md`, and the Node test suite document, serve, build, validate, and track the product. The app is static and local-first; no backend resources are enabled or required.
