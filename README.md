# pods player layer

A shared **Nuxt layer** that provides the unified “Pod Library / Pods Player” UI used in:

- `cms-frontend` (org-scoped pod library + iframe web-component preview)
- `cms-story-components/src/playground` (component library playground + SFC preview)

This layer is intentionally **component-only** (no pages/routes). Host apps mount these components in their own pages.

## what’s inside

- **Shared UI components** (owned by the layer)
  - `app/components/pods-player/*` — canonical Pods Player UI (preview + editor panel)
  - `app/components/PodGrid.vue`, `app/components/PodCard.vue` — shared listing UI
- **Shared utilities/types**
  - `app/pods-player/*` — types, schema → form mapping, fixtures helpers
- **Shared fixture assets**
  - `public/pods-player-assets/*` — images/video/geo/json used by fixtures
  - served at runtime from `/pods-player-assets/*`

## required host integration (runtime adapter)

The layer is host-agnostic: it doesn’t know where pods come from or how to load previews.

Layer components import a **host-provided** runtime adapter via:

- `#pods-player-runtime` → `app/composables/pods-player/usePodsPlayerRuntime.ts`

Each consuming app must override this alias to its own implementation.

## consuming from a host app

In a host `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  extends: [
    ['github:papasan-co/pods-playground-layer', { auth: process.env.PLAYGROUND_GITHUB_TOKEN }],
  ],
  alias: {
    '#pods-player-runtime': fileURLToPath(new URL('./app/composables/pods-player/usePodsPlayerRuntime.ts', import.meta.url)),
  },
  vite: {
    resolve: {
      alias: {
        '#pods-player-runtime': fileURLToPath(new URL('./app/composables/pods-player/usePodsPlayerRuntime.ts', import.meta.url)),
      },
    },
  },
})
```

Notes:
- The alias override must exist **both** at Nuxt-level and **Vite-level** (Vite import-analysis happens before Nuxt aliasing in some cases).
- If the repo is public, `PLAYGROUND_GITHUB_TOKEN` is optional.

## tailwind (nuxt ui v4 / tailwind v4)

Tailwind v4 uses **CSS-first scanning**. Host apps must add `@source` directives in their main CSS to scan the layer files (Nuxt does not automatically scan remote layer directories for class usage).

Example (host `app/assets/css/main.css`):

```css
@import "tailwindcss";
@import "@nuxt/ui";

/* Scan the cached GitHub layer under node_modules/.c12 */
@source "../../../node_modules/.c12/github_papasan_co_*/app/**/*.{vue,js,ts,jsx,tsx}";
```

The `.c12` cache path differs by host app root (e.g. `cms-story-components/src/playground/node_modules/.c12/...`).

## local development

This repo is typically consumed via GitHub Nuxt layers, but it can also be used locally in a monorepo.

- `node_modules/` should not be committed (ignored via `.gitignore`).
- Prefer keeping the layer minimal and letting hosts own routes, data fetching, and preview loading.

