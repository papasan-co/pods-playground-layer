import type { Config } from 'tailwindcss'

/**
 * pods-player-layer/tailwind.config.ts
 *
 * Tailwind configuration for the Pods Player Layer.
 * Declares which files should be scanned for Tailwind utility classes.
 *
 * Host applications should import and merge this config to ensure
 * utilities used in layer components are generated.
 */
export default {
  content: [
    // Scan the layer's component files for Tailwind classes
    './app/components/**/*.{vue,js,ts}',
    './app/composables/**/*.{js,ts}',
    './app/utils/**/*.{js,ts}',
  ],
} satisfies Partial<Config>
