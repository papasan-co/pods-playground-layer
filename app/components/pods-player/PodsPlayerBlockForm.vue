<script setup lang="ts">
import Sortable from 'sortablejs'
import type { FormField } from '#pods-player/formMapper'
import type { PodsPlayerViewport } from '#pods-player/types'

/**
 * pods-player-layer.app.components.pods-player.PodsPlayerBlockForm
 *
 * YAML-driven form renderer for pods. This powers the “Form” tab in the right
 * panel. It is promoted from the `cms-story-components` playground so the CMS
 * and the playground share the same authoring controls.
 */

defineOptions({ name: 'PodsPlayerBlockForm' })

const props = defineProps<{
  fields: FormField[]
  modelValue: Record<string, unknown>
  viewport?: PodsPlayerViewport
}>()

interface UpdatePayload {
  field: string
  value: unknown
}

const emit = defineEmits<{
  (e: 'update:modelValue', value: UpdatePayload): void
  (e: 'update:viewport', value: PodsPlayerViewport): void
}>()

function updateField(name: string, value: unknown, type: string) {
  const v = type === 'number' ? Number(value) : value
  emit('update:modelValue', { field: name, value: v })
}

interface Condition {
  field: string
  equals: unknown
}

function isVisible(field: FormField) {
  const cond = (field as { when?: Condition | Condition[] }).when
  if (!cond) return true
  const conditions = Array.isArray(cond) ? cond : [cond]
  return conditions.every((c) => props.modelValue[c.field] === c.equals)
}

function selectItems(field: FormField & { options?: Record<string, string> | string[] }) {
  if (field.type === 'color-select') {
    const keys = Array.isArray(field.options) ? field.options : Object.keys(field.options ?? {})
    return keys.map((key) => ({
      value: key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      chip: { style: `background: var(--color-${key}-500)` },
    }))
  }

  if (field.options && typeof field.options === 'object') {
    return Object.entries(field.options).map(([value, label]) => ({ value, label }))
  }

  return []
}

function makeKey() {
  // stable-enough for UI lists; fixture data can also include its own keys
  return Math.random().toString(36).slice(2, 8)
}

type RepeaterItem = Record<string, unknown> & { _key?: string; _removing?: boolean }

function normaliseRepeater(value: unknown): RepeaterItem[] {
  return (Array.isArray(value) ? value : []).map((v) => ({
    _key: (v as any)?._key ?? makeKey(),
    ...(v as Record<string, unknown>),
  }))
}

const lists = new Map<string, ReturnType<typeof shallowRef<RepeaterItem[]>>>()
function listFor(block: string) {
  if (!lists.has(block)) lists.set(block, shallowRef(normaliseRepeater(props.modelValue[block])))
  return lists.get(block)!
}

function saveLocal(block: string) {
  const data = JSON.stringify(listFor(block).value)
  localStorage.setItem(`PodsPlayerBlockForm:${block}`, data)
}

function initSortable(el: HTMLElement, name: string) {
  if ((el as any)._podsPlayerSortable) return
  ;(el as any)._podsPlayerSortable = true

  const list = listFor(name)
  Sortable.create(el, {
    animation: 150,
    handle: '.repeater-handle',
    draggable: '.repeater-card',
    ghostClass: 'opacity-40',
    filter: 'input, textarea, select, button, [contenteditable]',
    preventOnFilter: false,
    onEnd(evt) {
      if (evt.oldIndex == null || evt.newIndex == null) return
      const arr = [...list.value]
      const [moved] = arr.splice(evt.oldIndex, 1)
      arr.splice(evt.newIndex, 0, moved)
      list.value = arr
      emit('update:modelValue', { field: name, value: arr })
      saveLocal(name)
    },
  })
}

function initializeRepeater(field: FormField) {
  if (field.type !== 'repeater') return
  const modelValue = props.modelValue[field.name]

  if (modelValue && Array.isArray(modelValue) && modelValue.length > 0) {
    listFor(field.name).value = normaliseRepeater(modelValue)
    localStorage.removeItem(`PodsPlayerBlockForm:${field.name}`)
  } else {
    const cached = localStorage.getItem(`PodsPlayerBlockForm:${field.name}`)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        listFor(field.name).value = normaliseRepeater(parsed)
        emit('update:modelValue', { field: field.name, value: parsed })
      } catch {
        // ignore
      }
    }
  }
}

onMounted(() => {
  for (const field of props.fields) initializeRepeater(field)
})

watch(
  () => props.modelValue,
  (newValue) => {
    for (const field of props.fields) {
      if (field.type === 'repeater') {
        const mv = newValue[field.name]
        if (mv && Array.isArray(mv) && mv.length > 0) {
          listFor(field.name).value = normaliseRepeater(mv)
          localStorage.removeItem(`PodsPlayerBlockForm:${field.name}`)
        }
      }
    }
  },
  { deep: true, immediate: false },
)

function updateRepeaterItem(block: string, idx: number, child: string, value: unknown) {
  const list = listFor(block)
  list.value = list.value.map((it, i) => (i === idx ? { ...it, [child]: value } : it))
  emit('update:modelValue', { field: block, value: list.value })
  saveLocal(block)
}

function addRepeaterItem(block: string, blueprint = {}) {
  const list = listFor(block)
  const newItem = { _key: makeKey(), ...(blueprint as any) }
  list.value = [...list.value, newItem]
  emit('update:modelValue', { field: block, value: list.value })
  saveLocal(block)
}

function removeRepeaterItem(block: string, idx: number) {
  const list = listFor(block)
  list.value = list.value.map((it, i) => (i === idx ? { ...it, _removing: true } : it))
  setTimeout(() => {
    list.value = list.value.filter((_, i) => i !== idx)
    emit('update:modelValue', { field: block, value: list.value })
    saveLocal(block)
  }, 300)
}
</script>

<template>
  <template v-for="field in fields" :key="field.name">
    <div v-if="field.type === 'group' && isVisible(field)">
      <div class="rounded-md border border-gray-200 dark:border-gray-700 p-4 space-y-4">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {{ field.label }}
        </h3>

        <PodsPlayerBlockForm
          v-if="field.children?.length"
          :fields="field.children"
          :model-value="(modelValue[field.name] ?? {}) as any"
          :viewport="viewport"
          @update:model-value="
            ({ field: child, value }) =>
              updateField(field.name, { ...(modelValue[field.name] ?? {}), [child]: value }, 'group')
          "
          @update:viewport="(val) => emit('update:viewport', val)"
        />
      </div>
    </div>

    <PodsPlayerResponsiveField
      v-else-if="field.responsive"
      v-show="isVisible(field)"
      :field="field"
      :model-value="modelValue"
      :viewport="viewport || 'laptop'"
      @update:model-value="({ field: name, value }) => updateField(name, value, field.type)"
      @update:viewport="(val) => emit('update:viewport', val)"
    />

    <UFormField
      v-else
      v-show="isVisible(field)"
      :label="field.label"
      class="mb-4"
    >
      <UInput
        v-if="field.type === 'input'"
        class="w-full"
        size="sm"
        :model-value="modelValue[field.name]"
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      />
      <UTextarea
        v-else-if="field.type === 'textarea'"
        class="w-full"
        size="sm"
        :model-value="modelValue[field.name]"
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      />
      <USelect
        v-else-if="field.type === 'select'"
        class="w-full"
        size="sm"
        :model-value="modelValue[field.name]"
        :placeholder="field.placeholder as any"
        :items="selectItems(field as any)"
        value-attribute="value"
        label-attribute="label"
        arrow
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      />
      <USelect
        v-else-if="field.type === 'color-select'"
        class="w-full"
        size="sm"
        :model-value="modelValue[field.name]"
        :items="selectItems(field as any)"
        value-attribute="value"
        label-attribute="label"
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      >
        <template #leading="{ modelValue: mv }">
          <span
            v-if="mv"
            class="inline-block h-3 w-3 rounded-full mr-1"
            :style="`background: var(--color-${mv}-500)`"
          />
        </template>
        <template #item="{ item }">
          <div class="flex items-center gap-2">
            <span class="inline-block h-3 w-3 rounded-full" :style="`background: var(--color-${item.value}-500)`" />
            <span>{{ item.label }}</span>
          </div>
        </template>
      </USelect>
      <UInputNumber
        v-else-if="field.type === 'input-number'"
        class="w-full"
        size="sm"
        :model-value="Number(modelValue[field.name]) || 0"
        :min="(field.min as number) ?? undefined"
        :max="(field.max as number) ?? undefined"
        :step="(field.step as number) ?? 1"
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      />
      <UInput
        v-else-if="field.type === 'number'"
        class="w-full"
        type="number"
        size="sm"
        :model-value="modelValue[field.name]"
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      />
      <USwitch
        v-else-if="field.type === 'toggle'"
        class="w-full"
        size="sm"
        :model-value="modelValue[field.name]"
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      />
      <USlider
        v-else-if="field.type === 'slider'"
        class="w-full"
        size="sm"
        :model-value="Number(modelValue[field.name]) || 0"
        :min="(field.min as number) ?? 0"
        :max="(field.max as number) ?? 100"
        :step="(field.step as number) ?? 1"
        :tooltip="true"
        @update:model-value="(val) => updateField(field.name, Array.isArray(val) ? val[0] : val, field.type)"
      />
      <PodsPlayerBrandColorPicker
        v-else-if="field.type === 'background-color' || field.type === 'brand-color-picker'"
        :model-value="modelValue[field.name] as string"
        @update:model-value="(val) => updateField(field.name, val, field.type)"
      />
      <div v-else-if="field.type === 'medias'" class="text-sm text-gray-500">
        Media picker not yet implemented
      </div>

      <!-- Repeater -->
      <div v-else-if="field.type === 'repeater'">
        <div
          class="space-y-3"
          :ref="(el) => el && initSortable(el as HTMLElement, field.name)"
        >
          <div
            v-for="(item, idx) in listFor(field.name).value"
            :key="(item as any)._key || idx"
            class="repeater-card rounded-md border border-gray-200 dark:border-gray-700 p-3 transition-opacity"
            :class="{ 'opacity-30': (item as any)._removing }"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="repeater-handle cursor-grab text-gray-400">
                  <UIcon name="i-lucide-grip-vertical" class="w-4 h-4" />
                </span>
                <span class="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {{ field.label }} #{{ idx + 1 }}
                </span>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-trash"
                @click="removeRepeaterItem(field.name, idx)"
              />
            </div>

            <div class="space-y-3">
              <template v-for="child in field.fields || []" :key="child.name">
                <UFormField :label="child.label" class="mb-2">
                  <UInput
                    v-if="child.type === 'input'"
                    size="sm"
                    :model-value="(item as any)[child.name]"
                    @update:model-value="(val) => updateRepeaterItem(field.name, idx, child.name, val)"
                  />
                  <UTextarea
                    v-else-if="child.type === 'textarea'"
                    size="sm"
                    :model-value="(item as any)[child.name]"
                    @update:model-value="(val) => updateRepeaterItem(field.name, idx, child.name, val)"
                  />
                  <UInputNumber
                    v-else-if="child.type === 'input-number'"
                    size="sm"
                    :model-value="Number((item as any)[child.name]) || 0"
                    @update:model-value="(val) => updateRepeaterItem(field.name, idx, child.name, val)"
                  />
                  <USwitch
                    v-else-if="child.type === 'toggle'"
                    size="sm"
                    :model-value="(item as any)[child.name]"
                    @update:model-value="(val) => updateRepeaterItem(field.name, idx, child.name, val)"
                  />
                  <UInput
                    v-else
                    size="sm"
                    :model-value="(item as any)[child.name]"
                    @update:model-value="(val) => updateRepeaterItem(field.name, idx, child.name, val)"
                  />
                </UFormField>
              </template>
            </div>
          </div>
        </div>

        <UButton
          class="mt-3"
          size="sm"
          variant="outline"
          icon="i-lucide-plus"
          @click="addRepeaterItem(field.name, (field.blueprint as any) || {})"
        >
          Add {{ field.label }}
        </UButton>
      </div>
    </UFormField>
  </template>
</template>

<style scoped>
.repeater-card {
  transition: opacity 0.3s ease;
}
</style>

