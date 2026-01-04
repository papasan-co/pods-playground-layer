<script setup lang="ts">
import type { PodDetails, PodsPlayerMode, PodsPlayerViewport } from '#pods-player/types'
import type { FormField } from '#pods-player/formMapper'
import { flatFromFixture, rebuildPayload } from '#pods-player/formMapper'
import { schemaToFields } from '#pods-player/schemaToFields'
import { usePodsPlayerRuntime } from '#pods-player-runtime'
import PodsPlayerViewportSwitcher from './PodsPlayerViewportSwitcher.vue'
import PodsPlayerModeSwitcher from './PodsPlayerModeSwitcher.vue'
import PodsPlayerPreview from './PodsPlayerPreview.vue'
import PodsPlayerMetaPanel from './PodsPlayerMetaPanel.vue'

/**
 * pods-player-layer.app.components.pods-player.PodsPlayerSingle
 *
 * The canonical “single pod playground” layout:
 * - header (title, viewport switcher, optional mode switcher, reload)
 * - preview column
 * - meta/editor column (Form / Props / YAML)
 *
 * This component is intentionally host-agnostic. The host runtime decides where
 * pods come from and how previews load.
 */

const props = defineProps<{
  slug: string
}>()

const runtime = usePodsPlayerRuntime()

const pod = ref<PodDetails | null>(null)
const mode = ref<PodsPlayerMode>((runtime.supportedModes?.[0] ?? 'sfc') as PodsPlayerMode)
const viewport = ref<PodsPlayerViewport>('laptop')

const fixture = ref<Record<string, unknown> | null>(null)
const schema = ref<unknown>(null)
const loading = ref(true)

const reloadKey = ref(0)
const initialFormValues = ref<Record<string, unknown>>({})

function reloadComponent() {
  reloadKey.value++
  initialFormValues.value = JSON.parse(JSON.stringify(flatForm))
}

const flatForm = reactive<Record<string, unknown>>({})
const formSchema = ref<FormField[]>([])

function fieldsFromPod(p: PodDetails | null): FormField[] {
  if (!p) return []

  const direct = Array.isArray(p.fields) ? p.fields : null
  if (direct) return direct as FormField[]

  const fromContract = p.compiledContract && Array.isArray((p.compiledContract as any).fields)
    ? ((p.compiledContract as any).fields as FormField[])
    : null
  if (fromContract) return fromContract

  const uiFields = p.compiledContract && Array.isArray((p.compiledContract as any)?.ui?.fields)
    ? ((p.compiledContract as any).ui.fields as FormField[])
    : null
  if (uiFields) return uiFields

  return []
}

function extractResponsiveValue(value: unknown, viewport: PodsPlayerViewport): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const viewportMap = { laptop: 'desktop', tablet: 'tablet', phone: 'phone' } as const
    const key = viewportMap[viewport]
    if (key in (value as any)) return (value as any)[key]
  }
  return value
}

function processResponsiveFields(
  payload: Record<string, unknown>,
  fields: FormField[],
  viewport: PodsPlayerViewport,
): Record<string, unknown> {
  const processed = { ...payload }

  for (const field of fields) {
    if (field.responsive && processed[field.name]) {
      const path = field.path || field.name
      const value = extractResponsiveValue(processed[field.name], viewport)

      if (path.includes('.')) {
        const parts = path.split('.')
        let current: any = processed
        for (let i = 0; i < parts.length - 1; i++) {
          const key = parts[i]
          if (!key) continue
          if (!current[key]) current[key] = {}
          current = current[key]
        }
        const finalKey = parts[parts.length - 1]
        if (finalKey) current[finalKey] = value
      } else {
        processed[field.name] = value
      }
    } else if (field.type === 'group' && field.children) {
      const groupValue = processed[field.name]
      if (groupValue && typeof groupValue === 'object') {
        processed[field.name] = processResponsiveFields(groupValue as any, field.children, viewport)
      }
    }
  }

  return processed
}

const previewProps = computed(() => {
  if (formSchema.value.length === 0) return fixture.value || {}
  const payload = rebuildPayload(formSchema.value, flatForm)
  return processResponsiveFields(payload, formSchema.value, viewport.value)
})

const hasChanges = computed(() => {
  const initial = initialFormValues.value
  if (formSchema.value.length === 0) return false

  for (const key in flatForm) {
    if (JSON.stringify(flatForm[key]) !== JSON.stringify(initial[key])) return true
  }
  for (const key in initial) {
    if (!(key in flatForm)) return true
  }
  return false
})

async function loadPodData() {
  loading.value = true
  try {
    pod.value = await runtime.getPod(props.slug)
    if (!pod.value) return

    // Ensure mode is valid for the host.
    if (!runtime.supportedModes.includes(mode.value)) {
      mode.value = runtime.supportedModes[0] ?? 'sfc'
    }

    // Load optional artifacts.
    fixture.value =
      pod.value.fixture ??
      (runtime.getFixture ? await runtime.getFixture(props.slug) : null) ??
      null
    schema.value =
      pod.value.schema ??
      (runtime.getSchema ? await runtime.getSchema(props.slug) : null) ??
      null

    // Primary: JSON fields from compiled contract / backend response.
    formSchema.value = fieldsFromPod(pod.value)

    // Fallback: derive from JSON Schema (important for CMS v1).
    if (formSchema.value.length === 0 && schema.value) {
      formSchema.value = schemaToFields(schema.value)
    }

    if (formSchema.value.length > 0) {
      Object.keys(flatForm).forEach((key) => Reflect.deleteProperty(flatForm, key))
      const flat = flatFromFixture(formSchema.value, fixture.value || {})
      Object.assign(flatForm, flat)
      initialFormValues.value = JSON.parse(JSON.stringify(flatForm))
    } else {
      initialFormValues.value = {}
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => props.slug,
  async () => {
    await loadPodData()
  },
  { immediate: true },
)

function applyFormUpdate(payload: { field: string; value: unknown }) {
  flatForm[payload.field] = payload.value
}
</script>

<template>
  <div class="flex h-full overflow-hidden">
    <section class="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div class="border-b border-gray-200 dark:border-gray-800 p-4 flex items-center bg-white dark:bg-gray-900">
        <div class="flex-1">
          <div class="text-sm font-semibold">
            {{ pod?.label || 'Pod' }}
            <span v-if="pod?.slug" class="text-xs text-gray-500">({{ pod.slug }})</span>
          </div>
          <p v-if="pod?.description" class="text-xs text-gray-500 mt-1">
            {{ pod.description }}
          </p>
        </div>

        <div class="flex-1 flex justify-center">
          <PodsPlayerViewportSwitcher v-model="viewport" />
        </div>

        <div class="flex-1 flex items-center justify-end gap-3">
          <!-- Optional host extensions (e.g. AI/chat toggle, publish button). -->
          <slot name="headerRight" />
          <PodsPlayerModeSwitcher v-model="mode" :supported-modes="runtime.supportedModes" />
          <UButton
            icon="i-lucide-refresh-cw"
            :color="hasChanges ? 'info' : 'neutral'"
            :variant="hasChanges ? 'solid' : 'outline'"
            size="sm"
            title="Reload preview"
            @click="reloadComponent"
          />
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center h-full">
        <div class="text-gray-500">Loading…</div>
      </div>
      <div v-else-if="!pod" class="flex items-center justify-center h-full">
        <div class="text-gray-500">Pod not found</div>
      </div>
      <slot
        v-else
        name="preview"
        :pod="pod"
        :mode="mode"
        :viewport="viewport"
        :preview-props="previewProps"
        :reloadKey="reloadKey"
      >
        <PodsPlayerPreview
          :key="reloadKey"
          :pod="pod"
          :mode="mode"
          :viewport="viewport"
          :preview-props="previewProps"
        />
      </slot>
    </section>

    <section class="w-96 border-l border-gray-200 dark:border-gray-800 flex flex-col bg-white dark:bg-gray-900">
      <PodsPlayerMetaPanel
        :pod="pod"
        :schema="schema"
        :fixture="fixture"
        :model-value="flatForm"
        :viewport="viewport"
        @update:model-value="applyFormUpdate"
        @update:viewport="(val) => (viewport = val)"
      />
      <!-- Optional host extension point (e.g. AI panel) -->
      <slot name="rightPanelFooter" />
    </section>
  </div>
</template>

