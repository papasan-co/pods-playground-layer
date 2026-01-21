<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

type GeoPoint = { lat: number; lng: number }

const props = defineProps<{
  modelValue?: GeoPoint | null
  maptilerKey?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: GeoPoint): void
}>()

const tab = ref<'pick' | 'link' | 'manual'>('pick')
const tabItems = [
  { label: 'Pick', value: 'pick' },
  { label: 'Link', value: 'link' },
  { label: 'Manual', value: 'manual' },
] as const

const lat = computed<number>(() => Number(props.modelValue?.lat ?? 0))
const lng = computed<number>(() => Number(props.modelValue?.lng ?? 0))
const hasValue = computed(() => Number.isFinite(lat.value) && Number.isFinite(lng.value) && !(lat.value === 0 && lng.value === 0))

const linkInput = ref('')
const linkError = ref<string | null>(null)

const manualLat = ref<number>(0)
const manualLng = ref<number>(0)

watch(
  () => props.modelValue,
  (mv) => {
    manualLat.value = Number(mv?.lat ?? 0)
    manualLng.value = Number(mv?.lng ?? 0)
  },
  { immediate: true, deep: false },
)

function normalizeLng(v: number) {
  // Keep in [-180, 180] range.
  let x = v
  while (x > 180) x -= 360
  while (x < -180) x += 360
  return x
}

function clampLat(v: number) {
  return Math.max(-90, Math.min(90, v))
}

function toFixed6(n: number) {
  if (!Number.isFinite(n)) return ''
  return String(Math.round(n * 1_000_000) / 1_000_000)
}

function setPoint(p: GeoPoint) {
  const next: GeoPoint = {
    lat: clampLat(Number(p.lat)),
    lng: normalizeLng(Number(p.lng)),
  }
  emit('update:modelValue', next)
}

function tryParseLatLngText(s: string): GeoPoint | null {
  const m = String(s || '')
    .trim()
    .match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  // Assume input is "lat,lng" (human-friendly).
  return { lat: a, lng: b }
}

function tryParseGoogleMapsUrl(url: string): GeoPoint | null {
  const u = String(url || '').trim()
  if (!u) return null
  // Support common patterns:
  // - .../@lat,lng,zoomz
  // - ...?q=lat,lng
  // - ...!3dLAT!4dLNG
  const at = u.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) }

  const q = u.match(/[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
  if (q) return { lat: Number(q[1]), lng: Number(q[2]) }

  const bang = u.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (bang) return { lat: Number(bang[1]), lng: Number(bang[2]) }

  return null
}

function applyLink() {
  linkError.value = null
  const raw = linkInput.value
  const p = tryParseGoogleMapsUrl(raw) || tryParseLatLngText(raw)
  if (!p) {
    linkError.value = 'Paste a Google Maps link.'
    return
  }
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) {
    linkError.value = 'Could not read coordinates from link.'
    return
  }
  setPoint(p)
}

function runtimeMaptilerKey(): string {
  if (props.maptilerKey) return props.maptilerKey
  if (!import.meta.client) return ''
  const k = (window as any)?.__AUTUMN_RUNTIME__?.maps?.maptiler?.key
  return typeof k === 'string' ? k : ''
}

const mapEl = ref<HTMLDivElement | null>(null)
let maplibregl: any = null
let map: any = null
let marker: any = null

const addressQuery = ref('')
const addressBusy = ref(false)
const addressError = ref<string | null>(null)
const addressResults = ref<Array<{ id: string; label: string; lat: number; lng: number }>>([])

const hasMaptilerKey = computed(() => Boolean(runtimeMaptilerKey()))

async function ensureMap() {
  if (!import.meta.client) return
  if (map) return
  if (!mapEl.value) return

  // Lazy-load to avoid forcing hosts to bundle MapLibre unless this control is used.
  await import('maplibre-gl/dist/maplibre-gl.css')
  const mod = await import('maplibre-gl')
  maplibregl = (mod as any).default || mod

  const key = runtimeMaptilerKey()
  const styleUrl = key
    ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(key)}`
    : 'https://demotiles.maplibre.org/style.json'

  const start: GeoPoint = hasValue.value ? { lat: lat.value, lng: lng.value } : { lat: 39.2904, lng: -76.6122 }

  map = new maplibregl.Map({
    container: mapEl.value,
    style: styleUrl,
    center: [start.lng, start.lat],
    zoom: hasValue.value ? 10 : 4,
    interactive: true,
    scrollZoom: true,
    attributionControl: false,
  })

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

  marker = new maplibregl.Marker({ color: '#0f766e' }).setLngLat([start.lng, start.lat]).addTo(map)

  map.on('click', (e: any) => {
    const p: GeoPoint = { lat: Number(e?.lngLat?.lat), lng: Number(e?.lngLat?.lng) }
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return
    marker?.setLngLat?.([p.lng, p.lat])
    setPoint(p)
  })

  // Resize after layout settles (panel transitions can otherwise create a tiny map).
  setTimeout(() => {
    try { map?.resize?.() } catch {}
  }, 50)
}

watch(
  () => tab.value,
  async (t) => {
    if (t !== 'pick') return
    await nextTick()
    await ensureMap()
    // When the map container was hidden, MapLibre often needs an explicit resize.
    setTimeout(() => {
      try { map?.resize?.() } catch {}
    }, 50)
  },
)

watch(
  () => [lat.value, lng.value] as const,
  ([a, b]) => {
    if (!map || !marker) return
    if (!Number.isFinite(a) || !Number.isFinite(b)) return
    try {
      marker.setLngLat([b, a])
    } catch {}
  },
)

async function searchAddress() {
  addressError.value = null
  addressResults.value = []
  const key = runtimeMaptilerKey()
  if (!key) return
  const q = addressQuery.value.trim()
  if (!q) return
  addressBusy.value = true
  try {
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?limit=6&key=${encodeURIComponent(key)}`
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`)
    const data = (await res.json()) as any
    const feats = Array.isArray(data?.features) ? data.features : []
    addressResults.value = feats
      .map((f: any) => {
        const id = String(f?.id ?? f?.place_name ?? Math.random())
        const label = String(f?.place_name ?? f?.text ?? 'Result')
        const center = Array.isArray(f?.center) ? f.center : null
        const lng = center && center.length >= 2 ? Number(center[0]) : NaN
        const lat = center && center.length >= 2 ? Number(center[1]) : NaN
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
        return { id, label, lat, lng }
      })
      .filter(Boolean)
  } catch (e: any) {
    addressError.value = e?.message ? String(e.message) : 'Search failed.'
  } finally {
    addressBusy.value = false
  }
}

function chooseAddress(r: { lat: number; lng: number }) {
  setPoint({ lat: r.lat, lng: r.lng })
  addressResults.value = []
  // Recenter map if available
  try {
    map?.flyTo?.({ center: [r.lng, r.lat], zoom: 12 })
  } catch {}
}

onMounted(() => {
  // Ensure map is ready on first paint (default tab is Pick).
  // We rely on the map DOM being mounted (see template v-show).
  nextTick().then(() => ensureMap())
})

onBeforeUnmount(() => {
  try {
    map?.remove?.()
  } catch {}
  map = null
  marker = null
  maplibregl = null
})
</script>

<template>
  <div class="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
    <div class="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
      <UTabs
        :model-value="tab"
        :items="tabItems as any"
        size="sm"
        variant="pill"
        :content="false"
        @update:model-value="tab = $event as any"
      />
    </div>

    <div class="p-3 space-y-3">
      <!-- Pick (keep mounted to preserve MapLibre instance) -->
      <div v-show="tab === 'pick'" class="space-y-2">
        <div v-if="hasMaptilerKey" class="space-y-2">
          <div class="text-xs text-gray-600 dark:text-gray-400">
            Search by address (optional), or click on the map to set the pin.
          </div>
          <div class="flex items-center gap-2">
            <UInput
              v-model="addressQuery"
              size="sm"
              class="flex-1"
              placeholder="Search address…"
              @keydown.enter.prevent="searchAddress"
            />
            <UButton type="button" size="sm" color="primary" :loading="addressBusy" @click="searchAddress">Search</UButton>
          </div>
          <div v-if="addressError" class="text-xs text-red-600">{{ addressError }}</div>
          <div v-if="addressResults.length" class="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              v-for="r in addressResults"
              :key="r.id"
              type="button"
              class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
              @click="chooseAddress(r)"
            >
              <div class="text-gray-800 dark:text-gray-200 truncate">{{ r.label }}</div>
              <div class="text-xs text-gray-600 dark:text-gray-400 font-mono">
                Lat: {{ toFixed6(r.lat) }} · Long: {{ toFixed6(r.lng) }}
              </div>
            </button>
          </div>
        </div>
        <div v-else class="text-xs text-gray-600 dark:text-gray-400">
          Click on the map to set the pin.
        </div>
        <div
          ref="mapEl"
          class="w-full h-[280px] rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-100 dark:bg-gray-800"
        />
        <div class="text-xs text-gray-600 dark:text-gray-400 font-mono">
          {{ hasValue ? `Lat: ${toFixed6(lat)}  Long: ${toFixed6(lng)}` : 'No location selected yet.' }}
        </div>
      </div>

      <!-- Link -->
      <div v-show="tab === 'link'" class="space-y-3">
        <div class="text-xs text-gray-600 dark:text-gray-400">
          Enter a Google Maps link.
        </div>
        <UInput
          v-model="linkInput"
          size="sm"
          class="w-full"
          placeholder="Paste Google Maps link"
          @keydown.enter.prevent="applyLink"
        />
        <div class="flex gap-6">
          <div class="flex-1">
            <div class="text-xs text-gray-500 dark:text-gray-400">Lat</div>
            <div class="text-sm font-mono text-gray-800 dark:text-gray-200">{{ hasValue ? toFixed6(lat) : '—' }}</div>
          </div>
          <div class="flex-1">
            <div class="text-xs text-gray-500 dark:text-gray-400">Long</div>
            <div class="text-sm font-mono text-gray-800 dark:text-gray-200">{{ hasValue ? toFixed6(lng) : '—' }}</div>
          </div>
        </div>
        <UButton type="button" size="sm" color="primary" class="w-full" @click="applyLink">Use location</UButton>
        <div v-if="linkError" class="text-xs text-red-600">{{ linkError }}</div>
      </div>

      <!-- Manual -->
      <div v-show="tab === 'manual'" class="space-y-3">
        <div class="flex gap-3">
          <UFormField label="Latitude" class="flex-1">
            <UInput
              size="sm"
              type="number"
              :model-value="manualLat"
              inputmode="decimal"
              min="-90"
              max="90"
              step="0.000001"
              @update:model-value="(v) => { manualLat = Number(v); setPoint({ lat: manualLat, lng: manualLng }) }"
            />
          </UFormField>
          <UFormField label="Longitude" class="flex-1">
            <UInput
              size="sm"
              type="number"
              :model-value="manualLng"
              inputmode="decimal"
              min="-180"
              max="180"
              step="0.000001"
              @update:model-value="(v) => { manualLng = Number(v); setPoint({ lat: manualLat, lng: manualLng }) }"
            />
          </UFormField>
        </div>
        <div class="text-xs text-gray-600 dark:text-gray-400">
          Tip: you can still paste a Google Maps link in the Link tab.
        </div>
      </div>
    </div>
  </div>
</template>

