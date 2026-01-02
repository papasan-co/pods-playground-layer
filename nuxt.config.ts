/**
 * pods-player-layer/nuxt.config.ts
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
  // Keep the layer minimal and host-driven.
  alias: {
    // Use an absolute path so the alias works regardless of which host project
    // extends this layer.
    '#pods-player': fileURLToPath(new URL('./app/pods-player/', import.meta.url)),
  },

  // Ensure Vite sees the alias as well (import-analysis runs at Vite level).
  vite: {
    resolve: {
      alias: {
        '#pods-player': fileURLToPath(new URL('./app/pods-player/', import.meta.url)),
      },
    },
  },
})

