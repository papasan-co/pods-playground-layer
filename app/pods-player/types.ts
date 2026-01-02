/**
 * pods-player-layer/app/pods-player/types.ts
 *
 * Shared types for the Pods Player layer.
 *
 * The goal is to keep the layer UI deterministic and host-agnostic:
 * - `cms-story-components` playground can render SFCs directly
 * - `cms-frontend` can render Web Components from a published PodPack bundle
 *
 * Host apps provide the implementation via `usePodsPlayerRuntime()`.
 */

export type PodsPlayerMode = 'sfc' | 'wc'
export type PodsPlayerViewport = 'laptop' | 'tablet' | 'phone'

export interface PodListItem {
  slug: string
  label: string
  description?: string
  version?: string
  category?: string

  /**
   * Optional folder name for source-based (SFC) loading patterns.
   * This exists because some pods use a folder naming convention that differs
   * from a slug-to-PascalCase transform (e.g., digits / acronyms).
   */
  folderName?: string

  /**
   * Web-component tag (must contain a hyphen).
   * In CMS mode this comes from the published manifest.
   */
  webComponentTag?: string
}

export interface PodDetails extends PodListItem {
  schema?: unknown | null
  yaml?: string | null
  fixture?: Record<string, unknown> | null
}

export interface PodsPlayerEnsureResult {
  /**
   * For WC mode: the tag to mount once bundles are loaded.
   */
  webComponentTag?: string | null

  /**
   * Bundle URLs required for WC mode. The layer will inject them into the iframe.
   */
  bundleUrls?: string[]

  /**
   * Whether it is safe to mount the preview element.
   * (Prevents setting props before the element definition exists.)
   */
  ready: boolean
}

export interface PodsPlayerRuntime {
  /**
   * Which preview modes the host can support.
   * - cms-story-components playground: ['sfc']
   * - cms-frontend: ['wc'] (v1)
   */
  supportedModes: PodsPlayerMode[]

  /**
   * Host-provided list for browse views (cards/grids).
   */
  listPods(): Promise<PodListItem[]>

  /**
   * Host-provided pod lookup (metadata, plus optionally schema/yaml/fixture).
   */
  getPod(slug: string): Promise<PodDetails | null>

  /**
   * Optional: load the raw JSON schema for the pod.
   */
  getSchema?(slug: string): Promise<unknown | null>

  /**
   * Optional: load the YAML definition (used to build the Form tab).
   */
  getYaml?(slug: string): Promise<string | null>

  /**
   * Optional: load a default fixture for initial preview.
   */
  getFixture?(slug: string): Promise<Record<string, unknown> | null>

  /**
   * SFC mode: load a Vue component for preview.
   */
  loadSfcComponent?(pod: PodDetails): Promise<unknown | null>

  /**
   * WC mode: provide the bundle URLs + tag and/or perform any preloading.
   */
  ensureRuntimeLoaded?(pod: PodDetails): Promise<PodsPlayerEnsureResult>
}

