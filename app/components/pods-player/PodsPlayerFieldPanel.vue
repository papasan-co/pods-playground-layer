<script setup lang="ts">
import type { PodDetails, PodsPlayerViewport } from '#pods-player/types'
import type { FormField } from '#pods-player/formMapper'
import { schemaToFields } from '#pods-player/schemaToFields'
import { usePodsPlayerRuntime } from '#pods-player-runtime'
import PodsPlayerBlockForm from './PodsPlayerBlockForm.vue'

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
}>()

const emit = defineEmits<{
  'update:modelValue': [payload: { field: string; value: unknown }]
  'update:viewport': [value: PodsPlayerViewport]
  toggleAdvanced: []
  expand: []
}>()

const runtime = usePodsPlayerRuntime()

const yamlContent = ref<string | null>(null)
const formFields = ref<FormField[]>([])
const loadingYaml = ref(false)

type PodDetailsWithCompiledContract = PodDetails & {
  compiled_contract?: Record<string, unknown> | null
}

function fieldsFromPod(p: PodDetails | null): FormField[] {
  if (!p) return []

  const direct = Array.isArray(p.fields) ? p.fields : null
  if (direct) return direct as FormField[]

  const podWithContract = p as PodDetailsWithCompiledContract
  const compiledContract = podWithContract.compiledContract ?? podWithContract.compiled_contract ?? null
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

watch(
  () => props.pod?.slug,
  async (slug) => {
    if (!slug) return
    loadingYaml.value = true
    try {
      const yaml = (await runtime.getYaml?.(slug)) ?? null
      yamlContent.value = yaml
      formFields.value = fieldsFromPod(props.pod ?? null)

      if (formFields.value.length === 0 && props.schema) {
        formFields.value = schemaToFields(props.schema) as FormField[]
      }
    } catch {
      yamlContent.value = null
      formFields.value = fieldsFromPod(props.pod ?? null)
    } finally {
      loadingYaml.value = false
    }
  },
  { immediate: true },
)

const advancedSubTab = ref<'props' | 'yaml'>('props')
</script>

<template>
  <div
    v-if="!collapsed"
    class="flex w-[308px] shrink-0 flex-col overflow-hidden pt-3.5 pb-3.5 pr-3.5 pl-0"
  >
    <div
      class="pods-player-field-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border"
      style="
        background: var(--pg-surface);
        border-color: var(--pg-border);
      "
    >
      <div class="px-4 pb-3 pt-4">
        <div class="flex items-baseline gap-2">
          <div
            class="font-semibold tracking-tight"
            style="
              font-family: var(--pg-font-display);
              font-size: 20px;
              color: var(--pg-fg-primary);
            "
          >
            {{ pod?.label || 'Pod' }}
          </div>
          <div v-if="pod?.version" class="text-[11px]" style="color: var(--pg-fg-muted-warm)">
            {{ pod.version }}
          </div>
        </div>
        <p v-if="pod?.description" class="mt-1.5 text-xs leading-relaxed" style="color: var(--pg-fg-body)">
          {{ pod.description }}
        </p>
      </div>

      <div class="mx-4 h-px shrink-0" style="background: var(--pg-hairline)" />

      <div class="flex items-center gap-2 px-4 pb-1 pt-2.5">
        <span class="text-xs font-semibold" style="color: var(--pg-fg-primary)">Fields</span>
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

      <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
        <div v-if="loadingYaml" class="text-xs" style="color: var(--pg-fg-meta)">Loading form…</div>
        <PodsPlayerBlockForm
          v-else-if="formFields.length > 0"
          :fields="formFields"
          :model-value="modelValue"
          :viewport="viewport || 'laptop'"
          @update:model-value="(payload) => emit('update:modelValue', payload)"
          @update:viewport="(val) => emit('update:viewport', val)"
        />
        <div v-else class="text-xs" style="color: var(--pg-fg-meta)">
          No form fields available for this pod.
        </div>

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
