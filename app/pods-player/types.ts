/**
 * pods-player-layer/app/pods-player/types.ts
 *
 * Shared types for the Pods Player layer.
 *
 * The goal is to keep the layer UI deterministic and host-agnostic:
 * - `cms-story-components` playground can render SFCs directly
 * - artifact-based viewers can render via the Vue ESM runtime bundle
 *
 * Host apps provide the implementation via `usePodsPlayerRuntime()`.
 */

export type PodsPlayerMode = 'sfc' | 'vue'
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

}

export interface PodDetails extends PodListItem {
  schema?: unknown | null
  yaml?: string | null
  fixture?: Record<string, unknown> | null
  /**
   * Canonical field definitions for the pod's CMS UI.
   *
   * In v2, hosts should prefer providing JSON fields via compiled contracts
   * instead of raw YAML.
   */
  fields?: unknown[] | null

  /**
   * Optional: full compiled contract JSON (as stored in backend DB / pods.json).
   * When provided, the player can derive `fields` from it.
   */
  compiledContract?: Record<string, unknown> | null
}

export interface PodsPlayerEnsureResult {
  /**
   * Vue ESM runtime bundle URL(s) required for vue runtime mode.
   * These should be loaded as module scripts inside the preview iframe.
   */
  vueBundleUrls?: string[]

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
   * - artifact-based viewers (cms-frontend, etc): ['vue']
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
   * Vue runtime mode: provide the ESM runtime bundle URL(s) and/or perform any preloading.
   */
  ensureRuntimeLoaded?(pod: PodDetails): Promise<PodsPlayerEnsureResult>
}

