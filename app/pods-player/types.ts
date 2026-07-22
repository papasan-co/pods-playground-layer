/**
 * pods-playground-layer/app/pods-player/types.ts
 *
 * Shared types for the Pods Player layer.
 *
 * The goal is to keep the layer UI deterministic and host-agnostic:
 * - `cms-story-components` playground can render SFCs directly
 * - artifact-based viewers can render via the Vue ESM runtime bundle
 *
 * Host apps provide the implementation via `usePodsPlayerRuntime()`.
 */

import type {
  PodRuntimeContentRevisions,
  PodRuntimeIdentity,
  PodRuntimeSession,
  RuntimeAssetSet,
} from './runtime/isolation'
import type { PodStyleOwnershipManifest } from './runtime/styleOwnership'

export type {
  PodRuntimeContentRevisions,
  PodRuntimeIdentity,
  PodRuntimeSession,
  RuntimeAssetSet,
} from './runtime/isolation'

export type PodsPlayerMode = 'sfc' | 'vue'
export type PodsPlayerViewport = 'laptop' | 'tablet' | 'phone'

export interface PodListItem {
  slug: string
  label: string
  description?: string
  version?: string
  category?: string
  /**
   * Optional release layer provenance for artifact-based hosts.
   * Lets shared browse UI distinguish org-authored pods from core templates.
   */
  sourceLayer?: 'org' | 'core'
  sourceLabel?: string
  /**
   * Optional preview thumbnail URL for browse/list views.
   * Hosts can compute this from `pods.json` preview metadata (preferred).
   */
  previewImageUrl?: string | null

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
  fixtureVariants?: Record<string, Record<string, unknown>> | null
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

  /**
   * Canonical style-owner registry emitted with current pod artifacts.
   * Historical artifacts may omit it and enter the explicit compatibility path.
   */
  styleOwnership?: PodStyleOwnershipManifest | null
}

export interface PodsPlayerCanvasTarget {
  key: string
  path: string
  label: string
  value: unknown
  displayValue: string
}

export interface PodsPlayerEnsureResult {
  /**
   * Vue ESM runtime bundle URL(s) required for vue runtime mode.
   * These should be loaded as module scripts inside the preview iframe.
   */
  vueBundleUrls?: string[]

  /**
   * Stylesheet URL(s) that must be loaded inside the preview iframe before
   * rendering a Vue runtime pod. Used by source previews to avoid briefly
   * showing unstyled or partially styled layouts while artifact CSS loads.
   */
  stylesheetUrls?: string[]

  /**
   * Whether it is safe to mount the preview element.
   * (Prevents setting props before the element definition exists.)
   */
  ready: boolean

  /** Immutable semantic identity used for registry lookup and asset ownership. */
  runtimeIdentity?: Readonly<PodRuntimeIdentity>
  runtimeArtifactKey?: string
  runtimeBoundaryKey?: string
  runtimeAssets?: RuntimeAssetSet
  runtimeContentRevisions?: Readonly<PodRuntimeContentRevisions>
  packCssAssetSetVersion?: string
  legacyRuntime?: boolean
}

export interface PodsPlayerRuntimeRequest {
  session?: PodRuntimeSession
  signal?: AbortSignal
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
  listPods(options?: PodsPlayerRuntimeRequest): Promise<PodListItem[]>

  /**
   * Host-provided pod lookup (metadata, plus optionally schema/yaml/fixture).
   */
  getPod(slug: string, options?: PodsPlayerRuntimeRequest): Promise<PodDetails | null>

  /**
   * Optional: load the raw JSON schema for the pod.
   */
  getSchema?(slug: string, options?: PodsPlayerRuntimeRequest): Promise<unknown | null>

  /**
   * Optional: load the YAML definition (used to build the Form tab).
   */
  getYaml?(slug: string, options?: PodsPlayerRuntimeRequest): Promise<string | null>

  /**
   * Optional: load a default fixture for initial preview.
   */
  getFixture?(slug: string, options?: PodsPlayerRuntimeRequest): Promise<Record<string, unknown> | null>

  /**
   * Optional: CSS custom properties applied to preview roots/iframes.
   * Hosts can use this to make pack-level token changes visible in preview.
   */
  getPreviewCssVars?(): Promise<Record<string, string> | null>

  /**
   * SFC mode: load a Vue component for preview.
   */
  loadSfcComponent?(pod: PodDetails): Promise<unknown | null>

  /**
   * Optional: warm a source-preview SFC module before the host activates it.
   * This lets Pod Studio keep the last painted canvas visible while the next
   * HMR module/session is fetched.
   */
  prepareSourcePreview?(input: {
    packId: string
    podSlug: string
    sourcePreviewId: string
    draftPackId?: string | null
  }): Promise<{ prepared: boolean; transport?: string | null; fallbackReason?: string | null }>

  /**
   * Vue runtime mode: provide the ESM runtime bundle URL(s) and/or perform any preloading.
   *
   * `parentStylesInert` keeps pack stylesheets out of the host document for
   * iframe previews, which load their declared styles directly.
   */
  ensureRuntimeLoaded?(
    pod: PodDetails,
    options?: PodsPlayerRuntimeRequest & { parentStylesInert?: boolean },
  ): Promise<PodsPlayerEnsureResult>
}
