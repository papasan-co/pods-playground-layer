<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { filterCatalog, findByUrl, type MediaCatalogEntry, type MediaKind, type MediaOrientation } from '#pods-player/mediaCatalog'

type UiConstraint = {
  mediaKind?: MediaKind
  kind?: MediaKind
  orientation?: MediaOrientation
  roles?: string[]
}

type RuntimeMediaItem = {
  id?: string
  s3Key?: string
  url?: string
  name?: string
  originalName?: string
  title?: string
  altText?: string
  alt?: string
  mediaType?: string
  mime?: string
  width?: number
  height?: number
  roles?: string[]
  tags?: string[]
}

type PickerEntry = MediaCatalogEntry & {
  source: 'runtime' | 'fixture'
  id?: string
  s3Key?: string
  mediaType?: string
}

type SourceMode = 'cms' | 'playground'
type SourceScope = 'story' | 'library'

const props = defineProps<{
  modelValue?: string | Record<string, unknown> | null
  constraint?: UiConstraint
  mediaItems?: RuntimeMediaItem[]
  storyMediaItems?: RuntimeMediaItem[]
  libraryMediaItems?: RuntimeMediaItem[]
  sourceMode?: SourceMode
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const isOpen = ref(false)
const q = ref('')
const sourceScope = ref<SourceScope>('story')

const constraint = computed(() => props.constraint ?? {})
const kind = computed<MediaKind>(() => (constraint.value.mediaKind ?? constraint.value.kind ?? 'any') as MediaKind)
const orientation = computed<MediaOrientation>(() => (constraint.value.orientation ?? 'any') as MediaOrientation)
const roles = computed<string[]>(() => (Array.isArray(constraint.value.roles) ? constraint.value.roles : []))

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function orientationFromDimensions(width: number | null, height: number | null): Exclude<MediaOrientation, 'any'> | undefined {
  if (!width || !height) return undefined
  if (Math.abs(width - height) < 2) return 'square'
  return width > height ? 'landscape' : 'portrait'
}

function runtimeKind(item: RuntimeMediaItem): Exclude<MediaKind, 'any'> {
  const type = String(item.mediaType ?? '').toLowerCase().trim()
  const roleList = Array.isArray(item.roles) ? item.roles.map((role) => String(role).toLowerCase()) : []
  if (roleList.some((role) => role.includes('logo'))) return 'logo'
  if (type === 'image') return 'photo'
  if (type === 'video') return 'video'
  return 'file'
}

function runtimeTitle(item: RuntimeMediaItem): string {
  return String(item.originalName || item.name || item.title || item.id || 'Story media')
}

function runtimeFilename(item: RuntimeMediaItem): string {
  const direct = String(item.originalName || item.name || '').trim()
  if (direct) return direct
  const key = String(item.s3Key || '').trim()
  if (key) {
    const parts = key.split('/').filter(Boolean)
    return parts[parts.length - 1] || key
  }
  return String(item.id || 'media')
}

function runtimeEntries(input: RuntimeMediaItem[]): PickerEntry[] {
  return input
    .map((item) => {
      const s3Key = String(item?.s3Key || '').trim()
      const url = String(item?.url || '').trim()
      const src = s3Key || url
      if (!src) return null

      const width = toNumber(item.width)
      const height = toNumber(item.height)

      return {
        source: 'runtime' as const,
        id: typeof item.id === 'string' ? item.id : undefined,
        title: runtimeTitle(item),
        filename: runtimeFilename(item),
        alt: String(item.altText || item.alt || runtimeTitle(item)),
        orientation: orientationFromDimensions(width, height),
        kind: runtimeKind(item),
        roles: Array.isArray(item.roles) ? item.roles.map((role) => String(role).toLowerCase().trim()).filter(Boolean) : [],
        tags: Array.isArray(item.tags) ? item.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
        url: src,
        s3Key: s3Key || undefined,
        mediaType: String(item.mediaType || '').trim() || undefined,
      } satisfies PickerEntry
    })
    .filter((entry): entry is PickerEntry => !!entry)
}

const mode = computed<SourceMode>(() => (props.sourceMode === 'playground' ? 'playground' : 'cms'))
const storyRuntimeCatalog = computed(() => {
  const explicit = Array.isArray(props.storyMediaItems) ? props.storyMediaItems : []
  const fallback = Array.isArray(props.mediaItems) ? props.mediaItems : []
  return runtimeEntries(explicit.length ? explicit : fallback)
})
const libraryRuntimeCatalog = computed(() =>
  runtimeEntries(Array.isArray(props.libraryMediaItems) ? props.libraryMediaItems : []))
const runtimeCatalog = computed(() => {
  const deduped = new Map<string, PickerEntry>()
  for (const entry of [...storyRuntimeCatalog.value, ...libraryRuntimeCatalog.value]) {
    const key = String(entry.id || entry.s3Key || entry.url)
    if (!key || deduped.has(key)) continue
    deduped.set(key, entry)
  }
  return Array.from(deduped.values())
})
const scopedRuntimeCatalog = computed(() =>
  sourceScope.value === 'library' ? libraryRuntimeCatalog.value : storyRuntimeCatalog.value)
const usingRuntimeCatalog = computed(() => runtimeCatalog.value.length > 0)

watch(
  () => [storyRuntimeCatalog.value.length, libraryRuntimeCatalog.value.length] as const,
  ([storyCount, libraryCount]) => {
    if (sourceScope.value === 'story' && storyCount > 0) return
    if (sourceScope.value === 'library' && libraryCount > 0) return
    if (storyCount > 0) sourceScope.value = 'story'
    else if (libraryCount > 0) sourceScope.value = 'library'
  },
  { immediate: true },
)

const selected = computed<PickerEntry | null>(() => {
  const rawValue = props.modelValue
  const value = typeof rawValue === 'string'
    ? rawValue.trim()
    : (rawValue && typeof rawValue === 'object'
        ? String((rawValue as Record<string, unknown>).s3Key || (rawValue as Record<string, unknown>).src || (rawValue as Record<string, unknown>).url || (rawValue as Record<string, unknown>).id || '').trim()
        : '')
  if (!value) return null

  if (usingRuntimeCatalog.value) {
    return runtimeCatalog.value.find((entry) =>
      value === String(entry.s3Key || '')
      || value === String(entry.url || '')
      || value === String(entry.id || ''),
    ) ?? null
  }

  return findByUrl(props.modelValue)
})

function shortNameFromUrl(raw: string | undefined): string {
  const v = String(raw || '').trim()
  if (!v) return ''
  try {
    const u = new URL(v, window?.location?.origin || 'http://localhost')
    const path = u.pathname || ''
    const last = path.split('/').filter(Boolean).pop() || ''
    return last || v
  } catch {
    // best-effort for non-URL values
    const noHash = v.split('#')[0] || v
    const noQuery = noHash.split('?')[0] || noHash
    const last = noQuery.split('/').filter(Boolean).pop() || ''
    return last || v
  }
}

const displaySecondary = computed(() => (selected.value ? selected.value.filename : shortNameFromUrl(props.modelValue)))

function runtimeMatchesRoles(entry: PickerEntry, requested: string[]): boolean {
  if (!requested.length) return true
  const entryRoles = Array.isArray(entry.roles) ? entry.roles.map((role) => String(role).toLowerCase().trim()).filter(Boolean) : []
  // Runtime media rarely carries role metadata; don't hide valid items when missing.
  if (entryRoles.length === 0) return true
  const roleSet = new Set(entryRoles)
  return requested.some((role) => roleSet.has(String(role).toLowerCase().trim()))
}

const items = computed<PickerEntry[]>(() => {
  const runtimeSource = mode.value === 'cms' ? scopedRuntimeCatalog.value : runtimeCatalog.value
  if (!runtimeSource.length) {
    if (mode.value === 'cms') {
      return []
    }
    return filterCatalog({
      kind: kind.value,
      orientation: orientation.value,
      roles: roles.value,
      q: q.value,
    }).map((entry) => ({ ...entry, source: 'fixture' as const }))
  }

  const requestedRoles = roles.value.map((role) => String(role).toLowerCase().trim()).filter(Boolean)
  const query = String(q.value || '').trim().toLowerCase()

  return runtimeSource.filter((entry) => {
    if (kind.value !== 'any' && entry.kind && entry.kind !== kind.value) return false
    if (orientation.value !== 'any' && entry.orientation && entry.orientation !== orientation.value) return false
    if (!runtimeMatchesRoles(entry, requestedRoles)) return false

    if (!query) return true
    const hay = [entry.title, entry.filename, ...(entry.tags ?? []), ...(entry.roles ?? [])]
      .join(' ')
      .toLowerCase()

    return hay.includes(query)
  })
})

// Image fields should always have a selection; default to first matching item.
watch(
  () => [props.modelValue, items.value.length, kind.value] as const,
  () => {
    if (props.modelValue) return
    if (kind.value !== 'photo' && kind.value !== 'logo') return
    const first = items.value[0]
    if (!first) return
    emit('update:modelValue', first.s3Key || first.url)
  },
  { immediate: true },
)

function choose(it: PickerEntry) {
  emit('update:modelValue', it.s3Key || it.url)
  isOpen.value = false
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2 max-w-full">
      <button
        type="button"
        data-testid="media-picker-trigger"
        class="flex-1 max-w-full overflow-hidden rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        @click="isOpen = true"
      >
        <div class="flex items-center gap-3 max-w-full overflow-hidden">
          <div
            class="w-10 h-10 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden shrink-0"
          >
            <nuxt-img
              v-if="selected && selected.s3Key"
              :src="selected.s3Key"
              provider="aws"
              fit="cover"
              format="webp"
              sizes="40px"
              densities="x1 x2"
              :alt="selected.alt || selected.title"
              class="w-full h-full object-cover"
              :placeholder="[40, 40]"
            />
            <img
              v-else-if="selected"
              :src="selected.url"
              :alt="selected.alt || selected.title"
              class="w-full h-full object-cover"
              loading="lazy"
            />
          </div>

          <div class="min-w-0 max-w-full overflow-hidden">
            <div class="text-sm font-medium text-gray-700 dark:text-gray-200">
              {{ selected ? selected.title : 'Choose media…' }}
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-400 font-mono truncate max-w-full">
              {{ displaySecondary }}
            </div>
          </div>
        </div>
      </button>
    </div>

    <!-- Hide URL editing for image/logo fields (picker-only); keep for non-image media kinds. -->
    <UInput
      v-if="kind !== 'photo' && kind !== 'logo'"
      size="sm"
      class="w-full"
      placeholder="Paste media URL"
      :model-value="modelValue"
      @update:model-value="(v) => emit('update:modelValue', String(v || ''))"
    />

    <div v-if="isOpen" class="fixed inset-0 z-50">
      <button
        type="button"
        class="absolute inset-0 bg-black/40"
        aria-label="Close media picker"
        @click="isOpen = false"
      />

      <div class="absolute inset-0 flex items-center justify-center p-4">
        <div class="w-full max-w-4xl rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden">
          <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-gray-900 dark:text-gray-100">Select media</div>
              <div class="text-xs text-gray-600 dark:text-gray-400 truncate">
                Filter: kind={{ kind }} orientation={{ orientation }} roles={{ roles.join(', ') || 'any' }}
              </div>
            </div>
            <UButton type="button" color="neutral" variant="ghost" size="sm" icon="i-lucide-x" @click="isOpen = false" />
          </div>

          <div class="p-4 border-b border-gray-200 dark:border-gray-700">
            <div v-if="mode === 'cms'" class="mb-3 flex items-center gap-2">
              <UButton
                type="button"
                data-testid="media-source-story"
                size="xs"
                :variant="sourceScope === 'story' ? 'solid' : 'soft'"
                color="neutral"
                @click="sourceScope = 'story'"
              >
                Story ({{ storyRuntimeCatalog.length }})
              </UButton>
              <UButton
                type="button"
                data-testid="media-source-library"
                size="xs"
                :variant="sourceScope === 'library' ? 'solid' : 'soft'"
                color="neutral"
                @click="sourceScope = 'library'"
              >
                Media Library ({{ libraryRuntimeCatalog.length }})
              </UButton>
            </div>
            <UInput v-model="q" size="sm" placeholder="Search by title, tags, role, filename…" />
          </div>

          <div class="p-4 max-h-[70vh] overflow-auto">
            <div v-if="items.length === 0" class="text-sm text-gray-500">
              {{ mode === 'cms' ? 'No matching media in this source.' : 'No matching media in catalog.' }}
            </div>

            <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <button
                v-for="it in items"
                :key="it.url"
                type="button"
                class="text-left rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
                @click="choose(it)"
              >
                <div class="aspect-[4/3] bg-gray-50 dark:bg-gray-800 overflow-hidden">
                  <nuxt-img
                    v-if="it.s3Key"
                    :src="it.s3Key"
                    provider="aws"
                    fit="cover"
                    format="webp"
                    sizes="sm:250px md:300px"
                    densities="x1 x2"
                    :alt="it.alt || it.title"
                    class="w-full h-full object-cover"
                    :placeholder="[50, 32]"
                  />
                  <img
                    v-else
                    :src="it.url"
                    :alt="it.alt || it.title"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div class="p-2">
                  <div class="text-xs font-semibold text-gray-800 dark:text-gray-200 line-clamp-2">
                    {{ it.title }}
                  </div>
                  <div class="text-[10px] text-gray-500 font-mono truncate">{{ it.filename }}</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

