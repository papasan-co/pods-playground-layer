import type { PodsPlayerRuntime } from '#pods-player/types'

/**
 * pods-playground-layer.app.composables.pods-player.usePodsPlayerRuntime
 *
 * The Pods Player UI is shared via a Nuxt layer, but pod data + runtime loading
 * is host-specific. Each consuming app MUST override this composable.
 *
 * - `cms-story-components/src/playground`: loads SFCs + local fixtures/YAML/schemas
 * - `cms-frontend`: loads published PodPack artifacts + bundles (web components)
 */
export function usePodsPlayerRuntime(): PodsPlayerRuntime {
  throw new Error(
    [
      'usePodsPlayerRuntime() is not implemented.',
      'This is a Nuxt Layer composable that must be provided by the host app.',
      'Create `app/composables/pods-player/usePodsPlayerRuntime.ts` in the host app to override it.',
    ].join(' '),
  )
}

