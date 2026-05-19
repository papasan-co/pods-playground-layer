<script setup lang="ts">
import type { PodDetails, PodsPlayerViewport } from '#pods-player/types'
import type { FormField } from '#pods-player/formMapper'
import { schemaToFields } from '#pods-player/schemaToFields'
import { usePodsPlayerRuntime } from '#pods-player-runtime'
import PodsPlayerBlockForm from './PodsPlayerBlockForm.vue'

type PanelTab = 'chat' | 'fields' | 'timeline' | 'design'

const props = defineProps<{
  pod: PodDetails | null
  schema: unknown
  fixture: Record<string, unknown> | null
  modelValue: Record<string, unknown>
  viewport?: PodsPlayerViewport
  collapsed: boolean
  advancedOpen: boolean
  showPropsTab: boolean
  showYamlTab: boolean
  /** When true, block field edits (for example, read-only template packs). */
  readOnly?: boolean
  /** Optional host-controlled active tab. */
  activeTab?: PanelTab | null
}>()

const emit = defineEmits<{
  'update:modelValue': [payload: { field: string; value: unknown }]
  'update:viewport': [value: PodsPlayerViewport]
  'update:activeTab': [value: PanelTab]
  toggleAdvanced: []
  expand: []
}>()

const runtime = usePodsPlayerRuntime()
const slots = useSlots()

const yamlContent = ref<string | null>(null)
const formFields = ref<FormField[]>([])
const loadingYaml = ref(false)

type PodDetailsWithCompiledContract = PodDetails & {
  compiled_contract?: Record<string, unknown> | null
}

/**
 * Resolve editable fields for the active pod from embedded form definitions or compiled contracts.
 *
 * Role: Keeps YAML + schema fallbacks aligned with `usePodPlayer` field hydration.
 */
function fieldsFromPod(p: PodDetails | null): FormField[] {
  if (!p) return []

  const direct = Array.isArray(p.fields) ? p.fields : null
  if (direct) return direct as FormField[]

  const podWithContract = p as PodDetailsWithCompiledContract
  const compiledContract =
    podWithContract.compiledContract ?? podWithContract.compiled_contract ?? null
  const contract = compiledContract as { fields?: unknown; ui?: { fields?: unknown } } | null

  const fromContract = contract && Array.isArray(contract.fields)
    ? (contract.fields as FormField[])
    : null
  if (fromContract) return fromContract

  const uiFields = contract && Array.isArray(contract.ui?.fields)
    ? (contract.ui.fields as FormField[])
    : null
  if (uiFields) return uiFields

  return []
}

let fieldLoadId = 0

watch(
  [() => props.pod, () => props.schema],
  async ([pod, schema]) => {
    const loadId = ++fieldLoadId
    const slug = pod?.slug

    if (!slug) {
      yamlContent.value = null
      formFields.value = []
      loadingYaml.value = false
      return
    }

    loadingYaml.value = true
    try {
      const yaml = (await runtime.getYaml?.(slug)) ?? null
      if (loadId !== fieldLoadId) return

      yamlContent.value = yaml
      formFields.value = fieldsFromPod(pod ?? null)

      if (formFields.value.length === 0 && schema) {
        formFields.value = schemaToFields(schema) as FormField[]
      }
    } catch {
      if (loadId !== fieldLoadId) return

      yamlContent.value = null
      formFields.value = fieldsFromPod(pod ?? null)
    } finally {
      if (loadId === fieldLoadId) {
        loadingYaml.value = false
      }
    }
  },
  { immediate: true },
)

const advancedSubTab = ref<'props' | 'yaml'>('props')
const defaultPanelTab = computed<PanelTab>(() => (slots.chat ? 'chat' : 'fields'))
const activePanelTab = ref<PanelTab>(props.activeTab || defaultPanelTab.value)
const activePodLabel = computed(() => props.pod?.label || props.pod?.slug || 'Pod')
const panelTabs = computed(() => [
  ...(slots.chat
    ? [
        {
          label: 'Pack chat',
          value: 'chat',
          icon: 'i-lucide-message-circle',
        },
      ]
    : []),
  {
    label: `${activePodLabel.value} fields`,
    value: 'fields',
    icon: 'i-lucide-sliders-horizontal',
  },
  ...(slots.timeline
    ? [
        {
          label: 'Timeline',
          value: 'timeline',
          icon: 'i-lucide-history',
        },
      ]
    : []),
  ...(slots.design
    ? [
        {
          label: 'Design',
          value: 'design',
          icon: 'i-lucide-palette',
        },
      ]
    : []),
])

watch(
  () => props.activeTab,
  (value) => {
    if (value && value !== activePanelTab.value) {
      activePanelTab.value = value
    }
  },
)

watch(activePanelTab, (value) => {
  emit('update:activeTab', value)
})

/**
 * Snap back to Fields when a tab targets a slot the host did not provide.
 *
 * Role: Prevents blank panel states when slots are omitted between shells or pack modes.
 */
watchEffect(() => {
  if (activePanelTab.value === 'chat' && !slots.chat) {
    activePanelTab.value = 'fields'
  }

  if (activePanelTab.value === 'design' && !slots.design) {
    activePanelTab.value = 'fields'
  }

  if (activePanelTab.value === 'timeline' && !slots.timeline) {
    activePanelTab.value = 'fields'
  }
})
</script>

<template>
  <div
    v-if="!collapsed"
    class="flex w-[352px] shrink-0 flex-col overflow-hidden pt-3.5 pb-3.5 pr-3.5 pl-0"
  >
    <div
      class="pods-player-field-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border"
      style="
        background: var(--pg-surface);
        border-color: var(--pg-border);
      "
    >
      <div class="shrink-0 px-4 pb-5 pt-4">
        <div class="flex min-w-0 items-baseline gap-2">
          <div
            class="min-w-0 truncate font-semibold tracking-tight"
            style="
              font-family: var(--pg-font-display);
              font-size: 20px;
              color: var(--pg-fg-primary);
            "
          >
            {{ pod?.label || 'Pod' }}
          </div>
          <div v-if="pod?.version" class="shrink-0 text-[11px]" style="color: var(--pg-fg-muted-warm)">
            {{ pod.version }}
          </div>
        </div>
        <p
          class="mt-1.5 h-[40px] overflow-hidden text-xs leading-relaxed"
          style="
            color: var(--pg-fg-body);
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
          "
        >
          {{ pod?.description || '' }}
        </p>
      </div>

      <div
        class="shrink-0 border-b px-2"
        style="border-color: var(--pg-hairline)"
      >
        <UTabs
          v-model="activePanelTab"
          :items="panelTabs"
          :content="false"
          color="neutral"
          variant="link"
          size="sm"
          class="w-full"
        />
      </div>

      <!-- v-show keeps Chat (and host-provided AI widgets) mounted while switching Fields / Design or pods. -->
      <div
        v-show="activePanelTab === 'chat'"
        class="min-h-0 flex-1 overflow-hidden"
      >
        <slot name="chat">
          <div class="px-4 py-3 text-xs" style="color: var(--pg-fg-meta)">
            Chat is unavailable in this editor shell.
          </div>
        </slot>
      </div>

      <div
        v-show="activePanelTab === 'fields'"
        class="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3"
      >
        <div class="mb-3 flex items-center gap-2">
          <span class="text-xs font-semibold" style="color: var(--pg-fg-primary)">
            {{ activePodLabel }} fields
          </span>
          <div class="flex-1" />
          <button
            type="button"
            class="flex items-center gap-1 text-[11px] font-medium"
            style="color: var(--pg-fg-muted-warm)"
            @click="emit('toggleAdvanced')"
          >
            <UIcon name="i-lucide-code-2" class="h-3 w-3" />
            Advanced
            <UIcon
              :name="advancedOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="h-3 w-3"
            />
          </button>
        </div>

        <div v-if="loadingYaml" class="space-y-4" aria-label="Loading form fields">
          <div v-for="index in 5" :key="index" class="space-y-2">
            <USkeleton class="h-3 w-24 rounded-full" />
            <USkeleton class="h-9 w-full rounded-lg" />
          </div>
        </div>
        <template v-else>
          <PodsPlayerBlockForm
            v-if="formFields.length > 0"
            :fields="formFields"
            :model-value="modelValue"
            :viewport="viewport || 'laptop'"
            :read-only="readOnly"
            @update:model-value="(payload) => !readOnly && emit('update:modelValue', payload)"
            @update:viewport="(val) => emit('update:viewport', val)"
          />
          <div v-else class="text-xs" style="color: var(--pg-fg-meta)">
            No form fields available for this pod.
          </div>
        </template>

        <template v-if="advancedOpen">
          <div v-if="showPropsTab || showYamlTab" class="mt-4 flex gap-2 border-t pt-4" style="border-color: var(--pg-hairline)">
            <button
              v-if="showPropsTab"
              type="button"
              class="rounded-md px-2 py-1 text-[11px] font-medium"
              :style="
                advancedSubTab === 'props'
                  ? { background: 'var(--pg-hover-surface)', color: 'var(--pg-fg-primary)' }
                  : { color: 'var(--pg-fg-muted-warm)' }
              "
              @click="advancedSubTab = 'props'"
            >
              Props
            </button>
            <button
              v-if="showYamlTab"
              type="button"
              class="rounded-md px-2 py-1 text-[11px] font-medium"
              :style="
                advancedSubTab === 'yaml'
                  ? { background: 'var(--pg-hover-surface)', color: 'var(--pg-fg-primary)' }
                  : { color: 'var(--pg-fg-muted-warm)' }
              "
              @click="advancedSubTab = 'yaml'"
            >
              YAML
            </button>
          </div>

          <div v-if="advancedOpen && showPropsTab && advancedSubTab === 'props'" class="mt-2">
            <div v-if="fixture" class="rounded-md p-3 text-xs" style="background: var(--pg-hover-surface)">
              <pre class="overflow-auto whitespace-pre-wrap font-mono" style="color: var(--pg-fg-secondary)">{{
                JSON.stringify(fixture, null, 2)
              }}</pre>
            </div>
            <div v-else class="text-xs" style="color: var(--pg-fg-meta)">No fixture data</div>
          </div>

          <div v-if="advancedOpen && showYamlTab && advancedSubTab === 'yaml'" class="mt-2">
            <div v-if="yamlContent" class="rounded-md p-3 text-xs" style="background: var(--pg-hover-surface)">
              <pre class="overflow-auto whitespace-pre-wrap font-mono" style="color: var(--pg-fg-secondary)">{{
                yamlContent
              }}</pre>
            </div>
            <div v-else class="text-xs" style="color: var(--pg-fg-meta)">YAML not available</div>
          </div>
        </template>
      </div>

      <div
        v-show="activePanelTab === 'timeline'"
        class="min-h-0 flex-1 overflow-hidden"
      >
        <slot name="timeline" />
      </div>

      <div
        v-show="activePanelTab === 'design'"
        class="min-h-0 flex-1 overflow-hidden"
      >
        <slot name="design" />
      </div>

      <div v-if="$slots.footer" class="shrink-0 border-t" style="border-color: var(--pg-hairline)">
        <div class="px-4 py-3">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </div>

  <div
    v-else
    class="flex w-9 shrink-0 flex-col items-center pt-3.5"
  >
    <button
      type="button"
      class="flex h-7 w-7 items-center justify-center rounded-md transition-colors"
      style="color: var(--pg-icon-muted)"
      title="Show fields"
      @click="emit('expand')"
    >
      <UIcon name="i-lucide-panel-right" class="h-3.5 w-3.5" />
    </button>
  </div>
</template>
