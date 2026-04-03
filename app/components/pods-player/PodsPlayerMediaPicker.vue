<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { filterCatalog, findByUrl, type MediaCatalogEntry, type MediaKind, type MediaOrientation } from '#pods-player/mediaCatalog'

type UiConstraint = {
  mediaKind?: MediaKind
  kind?: MediaKind
  orientation?: MediaOrientation
  roles?: string[]
}

type MediaValue = string | { src?: string; url?: string; alt?: string; decorative?: boolean } | undefined

const props = defineProps<{
  modelValue?: MediaValue
  constraint?: UiConstraint
  emitObject?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | { src: string; url: string; alt?: string }): void
}>()

const isOpen = ref(false)
const q = ref('')

const constraint = computed(() => props.constraint ?? {})
const kind = computed<MediaKind>(() => (constraint.value.mediaKind ?? constraint.value.kind ?? 'any') as MediaKind)
const orientation = computed<MediaOrientation>(() => (constraint.value.orientation ?? 'any') as MediaOrientation)
const roles = computed<string[]>(() => (Array.isArray(constraint.value.roles) ? constraint.value.roles : []))

const currentUrl = computed(() => {
  if (typeof props.modelValue === 'string') return props.modelValue
  return props.modelValue?.src || props.modelValue?.url || ''
})

const selected = computed(() => findByUrl(currentUrl.value))

function isVideoEntry(entry: MediaCatalogEntry | null | undefined): boolean {
  return entry?.kind === 'video'
}

function toEmittedValue(url: string, alt?: string) {
  if (props.emitObject) {
    return { src: url, url, ...(alt ? { alt } : {}) }
  }
  return url
}

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

const displaySecondary = computed(() => (selected.value ? selected.value.filename : shortNameFromUrl(currentUrl.value)))

const items = computed<MediaCatalogEntry[]>(() =>
  filterCatalog({
    kind: kind.value,
    orientation: orientation.value,
    roles: roles.value,
    q: q.value,
  }),
)

// Visual media fields should always have a selection; default to first matching item.
watch(
  () => [currentUrl.value, items.value.length, kind.value] as const,
  () => {
    if (currentUrl.value) return
    if (kind.value !== 'photo' && kind.value !== 'logo' && kind.value !== 'video') return
    const first = items.value[0]
    if (first?.url) emit('update:modelValue', toEmittedValue(first.url, first.alt || first.title))
  },
  { immediate: true },
)

function choose(it: MediaCatalogEntry) {
  emit('update:modelValue', toEmittedValue(it.url, it.alt || it.title))
  isOpen.value = false
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2 max-w-full">
      <button
        type="button"
        class="flex-1 max-w-full overflow-hidden rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        @click="isOpen = true"
      >
        <div class="flex items-center gap-3 max-w-full overflow-hidden">
          <div
            class="w-10 h-10 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden shrink-0"
          >
            <template v-if="selected">
              <video
                v-if="isVideoEntry(selected)"
                :src="selected.url"
                :poster="selected.thumbnailUrl"
                class="w-full h-full object-cover"
                muted
                playsinline
                preload="metadata"
                aria-hidden="true"
              />
              <img
                v-else
                :src="selected.url"
                :alt="selected.alt || selected.title"
                class="w-full h-full object-cover"
                loading="lazy"
              />
            </template>
            <div
              v-else-if="kind === 'video'"
              class="flex h-full w-full items-center justify-center text-gray-400 dark:text-gray-500"
              aria-hidden="true"
            >
              <UIcon name="i-lucide-video" class="h-5 w-5" />
            </div>
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
      :model-value="currentUrl"
      @update:model-value="(v) => emit('update:modelValue', toEmittedValue(String(v || '')))"
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
            <UInput v-model="q" size="sm" placeholder="Search by title, tags, role, filename…" />
          </div>

          <div class="p-4 max-h-[70vh] overflow-auto">
            <div v-if="items.length === 0" class="text-sm text-gray-500">
              No matching media in catalog.
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
                  <video
                    v-if="isVideoEntry(it)"
                    :src="it.url"
                    :poster="it.thumbnailUrl"
                    class="w-full h-full object-cover"
                    muted
                    playsinline
                    preload="metadata"
                    aria-hidden="true"
                  />
                  <img v-else :src="it.url" :alt="it.alt || it.title" class="w-full h-full object-cover" loading="lazy" />
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

