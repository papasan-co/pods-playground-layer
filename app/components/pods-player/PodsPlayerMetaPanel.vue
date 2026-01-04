<script setup lang="ts">
import type { PodDetails, PodsPlayerViewport } from '#pods-player/types'
import type { FormField } from '#pods-player/formMapper'
import { schemaToFields } from '#pods-player/schemaToFields'
import { usePodsPlayerRuntime } from '#pods-player-runtime'
import PodsPlayerBlockForm from './PodsPlayerBlockForm.vue'

/**
 * pods-player-layer.app.components.pods-player.PodsPlayerMetaPanel
 *
 * Right-side panel shown in the pod playground:
 * - metadata (slug/version/category)
 * - tabs: Form / Props / YAML
 *
 * The host runtime provides YAML text; the layer parses it into `fields[]` and
 * renders a consistent YAML-driven form.
 */

const props = defineProps<{
  pod: PodDetails | null
  schema: unknown
  fixture: Record<string, unknown> | null
  modelValue: Record<string, unknown>
  viewport?: PodsPlayerViewport
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', payload: { field: string; value: unknown }): void
  (e: 'update:viewport', value: PodsPlayerViewport): void
}>()

const runtime = usePodsPlayerRuntime()

const activeTab = ref<'form' | 'props' | 'yaml'>('form')
const yamlContent = ref<string | null>(null)
const formFields = ref<FormField[]>([])
const loadingYaml = ref(false)

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

watch(
  () => props.pod?.slug,
  async (slug) => {
    if (!slug) return
    loadingYaml.value = true
    try {
      const yaml = (await runtime.getYaml?.(slug)) ?? null
      yamlContent.value = yaml
      formFields.value = fieldsFromPod(props.pod ?? null)

      // Fallback (CMS v1): derive fields from schema if YAML isn't available.
      if (formFields.value.length === 0 && props.schema) {
        formFields.value = schemaToFields(props.schema) as any
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
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="border-b border-gray-200 dark:border-gray-800 p-4">
      <h3 class="text-sm font-semibold mb-1">
        {{ pod?.label || 'Pod' }}
      </h3>
      <div v-if="pod" class="text-xs text-gray-500 space-y-1">
        <div>Slug: {{ pod.slug }}</div>
        <div v-if="pod.version">Version: {{ pod.version }}</div>
        <div v-if="pod.category">Category: {{ pod.category }}</div>
      </div>
    </div>

    <div class="flex-1 overflow-auto flex flex-col">
      <UTabs
        v-model="activeTab"
        :items="[
          { label: 'Form', value: 'form' },
          { label: 'Props', value: 'props' },
          { label: 'YAML', value: 'yaml' },
        ]"
        class="p-4 border-b"
      />

      <div class="flex-1 overflow-auto p-4">
        <div v-if="activeTab === 'form'">
          <div v-if="loadingYaml" class="text-sm text-gray-500">Loading form fields...</div>
          <div v-else-if="formFields.length > 0">
            <PodsPlayerBlockForm
              :fields="formFields"
              :model-value="modelValue"
              :viewport="viewport || 'laptop'"
              @update:model-value="(payload) => emit('update:modelValue', payload)"
              @update:viewport="(val) => emit('update:viewport', val)"
            />
          </div>
          <div v-else class="text-sm text-gray-500">
            No form fields available. Pod may not have a YAML file with fields defined.
          </div>
        </div>

        <div v-else-if="activeTab === 'props'">
          <div v-if="fixture" class="bg-gray-50 dark:bg-gray-800 rounded p-3 overflow-auto">
            <pre class="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap"><code>{{ JSON.stringify(fixture, null, 2) }}</code></pre>
          </div>
          <div v-else class="text-sm text-gray-500">No fixture data available</div>
        </div>

        <div v-else-if="activeTab === 'yaml'">
          <div v-if="loadingYaml" class="text-sm text-gray-500">Loading YAML...</div>
          <div v-else-if="yamlContent" class="bg-gray-50 dark:bg-gray-800 rounded p-3 overflow-auto">
            <pre class="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap"><code>{{ yamlContent }}</code></pre>
          </div>
          <div v-else class="text-sm text-gray-500">YAML not available</div>
        </div>
      </div>
    </div>
  </div>
</template>

