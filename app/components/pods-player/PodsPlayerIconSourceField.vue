<script setup lang="ts">
import { CURATED_STORY_ICONS } from './iconCatalog'

type IconSourceType = 'iconify' | 'svg' | 'media'

type IconSource = {
  type: IconSourceType
  value: string
  viewBox?: string
  title?: string
}

const props = defineProps<{
  modelValue?: unknown
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: IconSource): void
}>()

const sourceTypes = [
  { label: 'Library Icon', value: 'iconify' },
  { label: 'Custom SVG', value: 'svg' },
  { label: 'Media URL', value: 'media' },
] as const

function looksLikeSvg(value: string): boolean {
  return value.toLowerCase().includes('<svg')
}

function normalizeIconSource(value: unknown): IconSource {
  if (typeof value === 'string') {
    const raw = value.trim()
    if (looksLikeSvg(raw)) return { type: 'svg', value: raw }
    return { type: 'iconify', value: raw }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>
    const sourceType = typeof rec.type === 'string' ? rec.type.trim().toLowerCase() : ''
    const sourceValue = typeof rec.value === 'string' ? rec.value.trim() : ''
    const viewBox = typeof rec.viewBox === 'string' ? rec.viewBox.trim() : ''
    const title = typeof rec.title === 'string' ? rec.title.trim() : ''

    let type: IconSourceType = 'iconify'
    if (sourceType === 'svg' || sourceType === 'media' || sourceType === 'iconify') {
      type = sourceType
    } else if (looksLikeSvg(sourceValue)) {
      type = 'svg'
    }

    return {
      type,
      value: sourceValue,
      ...(viewBox ? { viewBox } : {}),
      ...(title ? { title } : {}),
    }
  }

  return { type: 'iconify', value: '' }
}

const source = ref<IconSource>(normalizeIconSource(props.modelValue))
const iconQuery = ref('')

watch(
  () => props.modelValue,
  (value) => {
    source.value = normalizeIconSource(value)
    if (!iconQuery.value) {
      iconQuery.value = source.value.type === 'iconify' ? source.value.value : ''
    }
  },
  { deep: true },
)

function updateSource(next: Partial<IconSource>) {
  source.value = {
    ...source.value,
    ...next,
  }

  emit('update:modelValue', {
    type: source.value.type,
    value: source.value.value,
    ...(source.value.viewBox ? { viewBox: source.value.viewBox } : {}),
    ...(source.value.title ? { title: source.value.title } : {}),
  })
}

const filteredIcons = computed(() => {
  const q = iconQuery.value.trim().toLowerCase()
  const haystack = q || source.value.value.trim().toLowerCase()

  if (!haystack) {
    return CURATED_STORY_ICONS.slice(0, 16)
  }

  return CURATED_STORY_ICONS
    .map((icon) => {
      let score = 0
      const token = icon.token.toLowerCase()
      const label = icon.label.toLowerCase()
      const tags = icon.tags.map((tag) => tag.toLowerCase())

      if (token === haystack) score += 100
      if (token.startsWith(haystack)) score += 60
      if (token.includes(haystack)) score += 35
      if (label.includes(haystack)) score += 30
      if (tags.some((tag) => tag.includes(haystack))) score += 20

      return { icon, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 24)
    .map((entry) => entry.icon)
})

function selectIcon(token: string) {
  iconQuery.value = token
  updateSource({ type: 'iconify', value: token })
}

function onIconifyValueChange(value: unknown) {
  const token = String(value ?? '')
  iconQuery.value = token
  updateSource({ value: token })
}
</script>

<template>
  <div class="space-y-2">
    <USelect
      class="w-full"
      size="sm"
      :disabled="disabled"
      :model-value="source.type"
      :items="sourceTypes as any"
      value-attribute="value"
      label-attribute="label"
      @update:model-value="(value) => updateSource({ type: value as IconSourceType })"
    />

    <template v-if="source.type === 'iconify'">
      <UInput
        class="w-full"
        size="sm"
        :disabled="disabled"
        :model-value="source.value"
        placeholder="Search or type icon token (e.g. lucide:rocket)"
        @update:model-value="onIconifyValueChange"
      />

      <div class="rounded-md border border-gray-200 dark:border-gray-700 p-2 space-y-2">
        <p class="text-[11px] text-gray-500 dark:text-gray-400">
          Curated single-color icons for presentation and sales stories.
        </p>
        <div class="max-h-52 overflow-y-auto space-y-1 pr-1">
          <button
            v-for="icon in filteredIcons"
            :key="icon.token"
            type="button"
            class="w-full text-left rounded-md border border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 px-2 py-1.5 flex items-center gap-2"
            :disabled="disabled"
            @click="selectIcon(icon.token)"
          >
            <Icon :name="icon.token" class="w-4 h-4 text-gray-800 dark:text-gray-200 shrink-0" />
            <span class="text-xs text-gray-800 dark:text-gray-100 truncate">{{ icon.label }}</span>
            <span class="text-[11px] text-gray-500 dark:text-gray-400 truncate ml-auto">{{ icon.token }}</span>
          </button>
        </div>
      </div>
    </template>

    <UTextarea
      v-else-if="source.type === 'svg'"
      class="w-full"
      size="sm"
      :disabled="disabled"
      autoresize
      :maxrows="4"
      :model-value="source.value"
      placeholder="<svg ...>...</svg>"
      @update:model-value="(value) => updateSource({ value: String(value ?? '') })"
    />

    <UInput
      v-else
      class="w-full"
      size="sm"
      :disabled="disabled"
      :model-value="source.value"
      placeholder="https://cdn.example.com/icon.svg"
      @update:model-value="(value) => updateSource({ value: String(value ?? '') })"
    />

    <UInput
      class="w-full"
      size="sm"
      :disabled="disabled"
      :model-value="source.title || ''"
      placeholder="Accessibility title (optional)"
      @update:model-value="(value) => updateSource({ title: String(value ?? '').trim() || undefined })"
    />

    <div
      v-if="source.type === 'svg' && source.value"
      class="rounded-md border border-gray-200 dark:border-gray-700 p-2"
    >
      <div class="pods-player-icon-preview" v-html="source.value" />
    </div>

    <div
      v-if="source.type === 'iconify' && source.value"
      class="rounded-md border border-gray-200 dark:border-gray-700 p-2 inline-flex"
    >
      <Icon :name="source.value" class="w-5 h-5" />
    </div>
  </div>
</template>

<style scoped>
.pods-player-icon-preview :deep(svg) {
  width: 1.25rem;
  height: 1.25rem;
  display: block;
}
</style>
