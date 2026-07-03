<script setup lang="ts">
/**
 * pods-playground-layer.app.components.pods-player.PodsPlayerPlaygroundShell
 *
 * v2 four-column pod playground: workspace rail, pod list, canvas, field panel.
 */

import { usePodPlayer } from '../../composables/pods-player/usePodPlayer'
import { usePlaygroundLayout } from '../../composables/pods-player/usePlaygroundLayout'
import type { PodsPlayerCanvasTarget, PodListItem } from '#pods-player/types'
import PodsPlayerWorkspaceRail from './PodsPlayerWorkspaceRail.vue'
import PodsPlayerPodList from './PodsPlayerPodList.vue'
import PodsPlayerCanvasToolbar from './PodsPlayerCanvasToolbar.vue'
import PodsPlayerCanvasCard from './PodsPlayerCanvasCard.vue'
import PodsPlayerFieldPanel from './PodsPlayerFieldPanel.vue'
import PodsPlayerPreview from './PodsPlayerPreview.vue'
import PodsPlayerStoryPreview from './PodsPlayerStoryPreview.vue'

type FieldPanelTab = 'chat' | 'fields' | 'timeline' | 'design'

const props = defineProps<{
  packs: { id: string; label: string }[]
  pods: PodListItem[]
  activePackId: string
  packLabel: string
  packMeta?: string
  slug: string
  /** When false, show quiet artifact hint in canvas card */
  artifactReady?: boolean
  /** Cmd+K from playground chrome (e.g. host command palette) */
  onCmdK?: () => void
  /** Let host shells provide the shared workspace rail. */
  hideWorkspaceRail?: boolean
  /** Prevent field edits when the active pack is a read-only template. */
  readOnly?: boolean
  /** Optional host-provided props, such as CMS scene data, for preview-only context. */
  previewPropsOverride?: Record<string, unknown> | null
  // The draft's saved field values (edit_state) — flatForm-shaped, applied
  // verbatim so a reloaded page shows what the user saved.
  savedFieldValues?: Record<string, unknown> | null
  /** Show the "New pod" affordance in the pod list (editable draft packs). */
  canCreatePod?: boolean
  selectedCanvasTargetKey?: string | null
  fieldPanelActiveTab?: FieldPanelTab | null
  /** Field-anchored notes (e.g. accessibility auto-adjustments) shown under matching controls. */
  fieldNotes?: Array<{ fieldPath: string; message: string }>
}>()

const emit = defineEmits<{
  selectPack: [id: string]
  selectPod: [slug: string]
  backToPacks: []
  selectCanvasTarget: [target: PodsPlayerCanvasTarget]
  previewReady: [payload: { sourcePreviewId: string | null }]
  'update:fieldPanelActiveTab': [value: FieldPanelTab]
  // Fired after a user edit in the field panel with the panel's full current
  // values — the host app persists them (playground autosave).
  formValuesChanged: [values: Record<string, unknown>]
  // "New pod" clicked in the pod list (Track 5 scaffolding entry point).
  newPod: []
}>()

const slugRef = toRef(props, 'slug')

const {
  runtime,
  pod,
  mode,
  viewport,
  fixture,
  schema,
  loading,
  reloadKey,
  flatForm,
  formSchema,
  previewProps,
  loadedSourcePreviewId,
  hasChanges,
  reloadComponent,
  applyFormUpdate,
} = usePodPlayer(slugRef, {
  savedValuesOverlay: () => props.savedFieldValues ?? null,
})

function stepPod(delta: number) {
  const idx = props.pods.findIndex((p) => p.slug === props.slug)
  if (idx < 0) return
  const next = props.pods[idx + delta]
  if (next) emit('selectPod', next.slug)
}

const layout = usePlaygroundLayout({
  onCmdK: () => props.onCmdK?.(),
  onArrowLeft: () => stepPod(-1),
  onArrowRight: () => stepPod(1),
})

const {
  podListCollapsed,
  fieldPanelCollapsed,
  scrollMode,
  advancedFieldsOpen,
  showFixtures,
  showPropsTab,
  showYamlTab,
  togglePodList,
  toggleFieldPanel,
  toggleScrollMode,
} = layout

const podLabel = computed(
  () => pod.value?.label || pod.value?.slug || props.slug,
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function mergePreviewProps(
  base: Record<string, unknown>,
  override: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!override) {
    return base
  }

  const merged = { ...base, ...override }

  for (const key of [
    'content',
    'contentLayout',
    'logoLayout',
    'image',
    'logo',
    'video',
    'bg',
  ]) {
    if (isRecord(base[key]) && isRecord(override[key])) {
      merged[key] = mergePreviewProps(
        base[key] as Record<string, unknown>,
        override[key] as Record<string, unknown>,
      )
    }
  }

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      merged[key] = base[key]
      continue
    }

    if (
      Array.isArray(base[key]) &&
      Array.isArray(value) &&
      base[key].length > 0 &&
      value.length === 0
    ) {
      merged[key] = base[key]
    }
  }

  return merged
}

const effectivePreviewProps = computed(() =>
  mergePreviewProps(previewProps.value, props.previewPropsOverride),
)

// Saved edit_state is applied INSIDE usePodPlayer's form resets (the
// savedValuesOverlay option) so no watcher ordering can shadow it. This
// watch covers only LATE ARRIVAL: the draft fetch resolving after the pod
// already loaded. NEVER derive saved values from the compiled contract:
// mapping the contract through the fixture mapper produces empty schema
// defaults that clobber real fixture values and blank the canvas (live
// regression, July 2).
watch(
  () => props.savedFieldValues,
  (saved) => {
    if (loading.value) return
    if (!saved || typeof saved !== 'object') return

    for (const [key, value] of Object.entries(saved)) {
      if (value !== undefined) flatForm[key] = value
    }
  },
)
const selectableCanvasTargets = computed<PodsPlayerCanvasTarget[]>(() =>
  canvasTargetsFromFields(formSchema.value, effectivePreviewProps.value),
)

function setViewport(v: import('#pods-player/types').PodsPlayerViewport) {
  viewport.value = v
}

function setMode(m: import('#pods-player/types').PodsPlayerMode) {
  mode.value = m
}

function setShowFixtures(v: boolean) {
  showFixtures.value = v
}
function setShowPropsTab(v: boolean) {
  showPropsTab.value = v
}
function setShowYamlTab(v: boolean) {
  showYamlTab.value = v
}

function toggleAdvanced() {
  advancedFieldsOpen.value = !advancedFieldsOpen.value
}

function canvasTargetsFromFields(
  fields: unknown[],
  values: Record<string, unknown>,
): PodsPlayerCanvasTarget[] {
  const targets: PodsPlayerCanvasTarget[] = []

  const visit = (items: unknown[], prefix = '') => {
    for (const item of items) {
      if (!isRecord(item)) continue

      const type = typeof item.type === 'string' ? item.type : ''

      if (type === 'group' && Array.isArray(item.children)) {
        const name = typeof item.name === 'string' ? item.name : ''
        const explicitPath = typeof item.path === 'string' ? item.path : ''
        const nextPrefix =
          explicitPath ||
          (name && !name.startsWith('__') ? joinPath(prefix, name) : prefix)
        visit(item.children, nextPrefix)
        continue
      }

      if (type === 'row' && Array.isArray(item.fields)) {
        visit(item.fields, prefix)
        continue
      }

      if (type === 'repeater') {
        continue
      }

      const fieldName = typeof item.name === 'string' ? item.name : ''
      const explicitPath = typeof item.path === 'string' ? item.path : ''
      const path =
        explicitPath || (fieldName ? joinPath(prefix, fieldName) : '')

      if (!path) continue

      const value = pathValue(values, path)
      const displayValue = targetDisplayValue(value)

      if (!displayValue) continue

      targets.push({
        key: path,
        path,
        label: fieldLabel(item, fieldName || path),
        value,
        displayValue,
      })
    }
  }

  visit(fields)

  return targets
}

function joinPath(prefix: string, next: string): string {
  return prefix ? `${prefix}.${next}` : next
}

function pathValue(source: Record<string, unknown>, path: string): unknown {
  let current: unknown = source

  for (const part of path.split('.')) {
    if (!isRecord(current)) return undefined
    current = current[part]
  }

  return current
}

function fieldLabel(field: Record<string, unknown>, fallback: string): string {
  const label = field.label

  return typeof label === 'string' && label.trim().length > 0 ? label : fallback
}

function targetDisplayValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim().length >= 2 ? value.trim() : ''
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return ''
}
</script>

<template>
  <div
    class="pods-playground-chrome flex h-full min-h-0 overflow-hidden"
    style="
      background: var(--pg-bg);
      font-family: var(--pg-font-sans);
      color: var(--pg-fg-primary);
    "
  >
    <!-- E2E / introspection: nearest Vue component owns usePodPlayer flatForm in setupState -->
    <section
      data-pods-flat-form-anchor
      class="pointer-events-none sr-only w-96"
      aria-hidden="true"
    />
    <PodsPlayerWorkspaceRail
      v-if="!hideWorkspaceRail"
      :packs="packs"
      :active-pack-id="activePackId"
      @select-pack="emit('selectPack', $event)"
    >
      <template v-if="$slots['workspace-avatar']" #avatar>
        <slot name="workspace-avatar" />
      </template>
    </PodsPlayerWorkspaceRail>

    <PodsPlayerPodList
      :pack-label="packLabel"
      :pack-meta="packMeta"
      :pods="pods"
      :active-slug="slug"
      :collapsed="podListCollapsed"
      :can-create-pod="canCreatePod"
      @select-pod="emit('selectPod', $event)"
      @back="emit('backToPacks')"
      @expand="togglePodList()"
      @new-pod="emit('newPod')"
    />

    <div class="relative flex min-w-0 flex-1 flex-col overflow-hidden pr-3.5 pt-3.5">
      <PodsPlayerCanvasToolbar
        :pack-label="packLabel"
        :pod-label="podLabel"
        :viewport="viewport"
        :pod-list-collapsed="podListCollapsed"
        :field-panel-collapsed="fieldPanelCollapsed"
        :scroll-mode="scrollMode"
        :has-changes="hasChanges"
        :mode="mode"
        :supported-modes="runtime.supportedModes"
        :show-fixtures="showFixtures"
        :show-props-tab="showPropsTab"
        :show-yaml-tab="showYamlTab"
        @update:viewport="setViewport"
        @update:mode="setMode"
        @toggle-pod-list="togglePodList()"
        @toggle-field-panel="toggleFieldPanel()"
        @reload="reloadComponent()"
        @toggle-scroll-mode="toggleScrollMode()"
        @update:show-fixtures="setShowFixtures"
        @update:show-props-tab="setShowPropsTab"
        @update:show-yaml-tab="setShowYamlTab"
      />

      <div
        v-if="$slots['canvas-status']"
        class="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2"
      >
        <slot name="canvas-status" />
      </div>

      <PodsPlayerCanvasCard
        :artifact-ready="artifactReady !== false"
        :viewport="viewport"
      >
        <div
          v-if="loading && !pod"
          class="flex flex-1 items-center justify-center p-8 text-sm"
          style="color: var(--pg-fg-meta)"
        >
          Loading…
        </div>
        <div
          v-else-if="!pod"
          class="flex flex-1 items-center justify-center p-8 text-sm"
          style="color: var(--pg-fg-meta)"
        >
          Pod not found
        </div>
        <PodsPlayerStoryPreview
          v-else-if="scrollMode"
          :pod="pod"
          :mode="mode"
          :viewport="viewport"
          :preview-props="effectivePreviewProps"
          :reload-key="reloadKey"
          class="min-h-0 flex-1"
        />
        <PodsPlayerPreview
          v-else
          :key="reloadKey"
          class="min-h-0 flex-1"
          :pod="pod"
          :mode="mode"
          :viewport="viewport"
          :preview-props="effectivePreviewProps"
          :selectable-targets="selectableCanvasTargets"
          :selected-target-key="selectedCanvasTargetKey"
          :content-ready="!loading"
          :content-source-preview-id="loadedSourcePreviewId"
          @select-target="emit('selectCanvasTarget', $event)"
          @ready="emit('previewReady', $event)"
        />
      </PodsPlayerCanvasCard>
    </div>

    <PodsPlayerFieldPanel
      :pod="pod"
      :schema="schema"
      :fixture="fixture"
      :model-value="flatForm"
      :viewport="viewport"
      :collapsed="fieldPanelCollapsed"
      :advanced-open="advancedFieldsOpen"
      :show-props-tab="showPropsTab"
      :show-yaml-tab="showYamlTab"
      :read-only="readOnly"
      :active-tab="fieldPanelActiveTab"
      :field-notes="fieldNotes"
      @update:model-value="
        (payload) => {
          if (readOnly) return
          applyFormUpdate(payload)
          emit('formValuesChanged', { ...flatForm })
        }
      "
      @update:viewport="setViewport"
      @update:active-tab="emit('update:fieldPanelActiveTab', $event)"
      @toggle-advanced="toggleAdvanced"
      @expand="toggleFieldPanel()"
    >
      <template v-if="$slots['field-panel-chat']" #chat>
        <slot name="field-panel-chat" />
      </template>
      <template v-if="$slots['field-panel-timeline']" #timeline>
        <slot name="field-panel-timeline" />
      </template>
      <template v-if="$slots['field-panel-design']" #design>
        <slot name="field-panel-design" />
      </template>
      <template v-if="$slots['field-panel-footer']" #footer>
        <slot name="field-panel-footer" />
      </template>
    </PodsPlayerFieldPanel>
  </div>
</template>
