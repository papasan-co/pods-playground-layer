/**
 * pods-playground-layer/nuxt.config.ts
 *
 * Pods Player is a Nuxt Layer that provides the shared “pod playground” UI:
 * - left preview (SFC or Web Component)
 * - right panel (Form / Props / YAML)
 * - viewport switcher, reload, etc.
 *
 * Host apps MUST provide a runtime adapter by overriding:
 * `app/composables/pods-player/usePodsPlayerRuntime.ts`
 */
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  /**
   * pods-playground-layer.$meta.name
   *
   * Creates a named layer alias '@pods-playground-layer' that works whether
   * the layer is local (monorepo) or remote (GitHub/npm).
   */
  $meta: {
    name: 'pods-playground-layer',
  },

  // Keep the layer minimal and host-driven.
  alias: {
    // Use an absolute path so the alias works regardless of which host project
    // extends this layer.
    '#pods-player': fileURLToPath(new URL('./app/pods-player/', import.meta.url)),
    /**
     * pods-playground-layer.alias.#pods-player-runtime
     *
     * Stable import path for the host runtime adapter. Hosts should override
     * this alias to point at their own implementation.
     */
    '#pods-player-runtime': fileURLToPath(
      new URL('./app/composables/pods-player/usePodsPlayerRuntime.ts', import.meta.url),
    ),
  },

  // Ensure Vite sees the alias as well (import-analysis runs at Vite level).
  vite: {
    resolve: {
      alias: {
        '#pods-player': fileURLToPath(new URL('./app/pods-player/', import.meta.url)),
        '#pods-player-runtime': fileURLToPath(
          new URL('./app/composables/pods-player/usePodsPlayerRuntime.ts', import.meta.url),
        ),
      },
    },
  },

  /**
   * pods-playground-layer.components
   *
   * Nuxt’s component auto-import does not reliably pick up nested component
   * folders from layers in all host setups. We declare the nested pods-player
   * directory explicitly so hosts can use `<PodsPlayerSingle />` without
   * hand-importing it in every page.
   */
  components: {
    dirs: [
      // Use absolute paths so `components.dirs` always points at THIS layer’s
      // component directories (not whichever host is extending the layer).
      { path: fileURLToPath(new URL('./app/components', import.meta.url)), pathPrefix: false },
      // Explicit nested dir: some host setups don’t reliably glob nested
      // subfolders when only the parent dir is specified.
      { path: fileURLToPath(new URL('./app/components/pods-player', import.meta.url)), pathPrefix: false },
    ],
  },
})

