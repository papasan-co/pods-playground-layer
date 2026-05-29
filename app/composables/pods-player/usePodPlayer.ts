/**
 * pods-playground-layer.app.composables.pods-player.usePodPlayer
 *
 * Shared reactive pod playground state (form, fixture, preview props, mode, viewport).
 * Extracted from PodsPlayerSingle so both the legacy layout and PodsPlayerPlaygroundShell
 * can share one implementation.
 */

import type { PodDetails, PodsPlayerMode, PodsPlayerViewport } from '#pods-player/types'
import type { FormField } from '#pods-player/formMapper'
import { flatFromFixture, rebuildPayload } from '#pods-player/formMapper'
import { schemaToFields } from '#pods-player/schemaToFields'
import { usePodsPlayerRuntime } from '#pods-player-runtime'
import { nextTick, toValue, type MaybeRefOrGetter } from 'vue'

type PodDetailsWithCompiledContract = PodDetails & {
  compiled_contract?: Record<string, unknown> | null
}

export function usePodPlayer(slug: MaybeRefOrGetter<string>) {
  const runtime = usePodsPlayerRuntime()
  const route = useRoute()
  const activeSourcePreviewId = useState<string>('pod-studio.activeSourcePreviewId', () => '')
  const activeSourcePreviewPodSlug = useState<string>(
    'pod-studio.activeSourcePreviewPodSlug',
    () => '',
  )
  const activeSourcePreviewDraftPackId = useState<string>(
    'pod-studio.activeSourcePreviewDraftPackId',
    () => '',
  )
  const activeSourcePreviewRevision = useState<number>(
    'pod-studio.activeSourcePreviewRevision',
    () => 0,
  )

  function requestedModeFromRoute(): PodsPlayerMode | null {
    const requested = route.query.mode
    if (typeof requested !== 'string') return null
    return runtime.supportedModes.includes(requested as PodsPlayerMode)
      ? (requested as PodsPlayerMode)
      : null
  }

  function requestedSourcePreviewFromRoute(): string {
    if (
      activeSourcePreviewId.value &&
      activeSourcePreviewPodSlug.value === toValue(slug) &&
      activeSourcePreviewDraftPackId.value === requestedDraftPackFromRoute()
    ) {
      return activeSourcePreviewId.value
    }

    if (typeof route.query.sourcePreview === 'string') return route.query.sourcePreview
    if (typeof route.query.sourcePreviewId === 'string') return route.query.sourcePreviewId

    return ''
  }

  function requestedDraftPackFromRoute(): string {
    return typeof route.query.draftPack === 'string' ? route.query.draftPack : ''
  }

  function preferredModeFromRoute(): PodsPlayerMode {
    const requested = requestedModeFromRoute()
    if (requested) return requested

    if (requestedSourcePreviewFromRoute()) {
      return (runtime.supportedModes?.[0] ?? 'vue') as PodsPlayerMode
    }

    return (runtime.supportedModes?.[0] ?? 'sfc') as PodsPlayerMode
  }

  const pod = ref<PodDetails | null>(null)
  const mode = ref<PodsPlayerMode>(preferredModeFromRoute())
  const viewport = ref<PodsPlayerViewport>('laptop')

  const fixture = ref<Record<string, unknown> | null>(null)
  const schema = ref<unknown>(null)
  const loading = ref(true)
  const loadedSourcePreviewId = ref('')

  const reloadKey = ref(0)
  const initialFormValues = ref<Record<string, unknown>>({})
  const hydratedVariant = ref<string | null>(null)

  const flatForm = reactive<Record<string, unknown>>({})
  const formSchema = ref<FormField[]>([])

  function isRecord(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v)
  }

  function dotGet(obj: unknown, path: string): unknown {
    if (!isRecord(obj)) return undefined
    if (!path) return undefined
    const parts = path.split('.')
    let cur: unknown = obj
    for (const part of parts) {
      if (!isRecord(cur)) return undefined
      cur = cur[part]
    }
    return cur
  }

  function dotSet(obj: Record<string, unknown>, path: string, value: unknown) {
    const parts = path.split('.')
    let cur: Record<string, unknown> = obj
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]
      const next = cur[key]
      if (!isRecord(next)) cur[key] = {}
      cur = cur[key] as Record<string, unknown>
    }
    cur[parts[parts.length - 1]] = value
  }

  function fieldsFromPod(p: PodDetails | null): FormField[] {
    if (!p) return []

    const direct = Array.isArray(p.fields) ? p.fields : null
    if (direct) return direct as FormField[]

    const podWithContract = p as PodDetailsWithCompiledContract
    const compiledContract =
      podWithContract.compiledContract ?? podWithContract.compiled_contract ?? null
    const contract = compiledContract as {
      fields?: unknown
      ui?: { fields?: unknown }
    } | null

    const fromContract =
      contract && Array.isArray(contract.fields) ? (contract.fields as FormField[]) : null
    if (fromContract) return fromContract

    const uiFields =
      contract && Array.isArray(contract.ui?.fields) ? (contract.ui.fields as FormField[]) : null
    if (uiFields) return uiFields

    return []
  }

  function matchesWhen(when: FormField['when'], model: Record<string, unknown>): boolean {
    if (!when) return true
    const conditions = Array.isArray(when) ? when : [when]
    return conditions.every((condition) => dotGet(model, condition.field) === condition.equals)
  }

  function isUiOnlyGroupName(name: string | undefined): boolean {
    return !!name && name.startsWith('__')
  }

  function cloneDefault<T>(value: T): T {
    if (value == null || typeof value !== 'object') return value
    return JSON.parse(JSON.stringify(value)) as T
  }

  function defaultValueForField(field: FormField): unknown {
    if (field.responsive) {
      if (field.value) return cloneDefault(field.value)
      return {
        desktop: field.default ?? '',
        tablet: field.default ?? '',
        phone: field.default ?? '',
      }
    }

    if (field.default !== undefined) {
      return field.type === 'number' ? Number(field.default) : cloneDefault(field.default)
    }

    if (field.type === 'toggle') return false
    if (field.type === 'repeater') return []
    if (field.type === 'input') return ''

    return undefined
  }

  function ensureVisibleFieldDefaults(
    fields: FormField[],
    model: Record<string, unknown>,
  ): boolean {
    let changed = false

    const visit = (fs: FormField[], scope: Record<string, unknown>) => {
      for (const field of fs) {
        if (!matchesWhen(field.when, scope)) continue

        if (field.type === 'group' && field.children) {
          if (field.name && !isUiOnlyGroupName(field.name)) {
            if (!isRecord(scope[field.name])) {
              scope[field.name] = {}
              changed = true
            }
            visit(field.children, scope[field.name] as Record<string, unknown>)
          } else {
            visit(field.children, scope)
          }
          continue
        }

        if (field.type === 'row' && field.fields) {
          visit(field.fields, scope)
          continue
        }

        if (!field.name) continue

        if (scope[field.name] === undefined) {
          const nextDefault = defaultValueForField(field)
          if (nextDefault !== undefined) {
            scope[field.name] = nextDefault
            changed = true
          }
        }

        if (field.type === 'repeater' && field.fields) {
          const items = scope[field.name]
          if (Array.isArray(items)) {
            for (const item of items) {
              if (isRecord(item)) visit(field.fields, item)
            }
          }
        }
      }
    }

    visit(fields, model)
    return changed
  }

  function mergeMissingValues(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): boolean {
    let changed = false

    for (const [key, sourceValue] of Object.entries(source)) {
      const targetValue = target[key]
      if (targetValue === undefined) {
        target[key] = cloneDefault(sourceValue)
        changed = true
        continue
      }

      if (isRecord(targetValue) && isRecord(sourceValue)) {
        changed = mergeMissingValues(targetValue, sourceValue) || changed
      }
    }

    return changed
  }

  function mergePreviewPayload(
    base: Record<string, unknown>,
    override: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = JSON.parse(JSON.stringify(base || {}))

    for (const [key, value] of Object.entries(override || {})) {
      if (isRecord(value) && isRecord(merged[key])) {
        merged[key] = mergePreviewPayload(merged[key] as Record<string, unknown>, value)
      } else {
        merged[key] = value
      }
    }

    return merged
  }

  function extractResponsiveValue(value: unknown, vp: PodsPlayerViewport): unknown {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const viewportMap = {
        laptop: 'desktop',
        tablet: 'tablet',
        phone: 'phone',
      } as const
      const key = viewportMap[vp]
      if (key in (value as Record<string, unknown>)) return (value as Record<string, unknown>)[key]
    }
    return value
  }

  function applyResponsiveToPayload(
    payload: Record<string, unknown>,
    fields: FormField[],
    vp: PodsPlayerViewport,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = JSON.parse(JSON.stringify(payload || {}))

    const joinPath = (prefix: string, next: string) => (prefix ? `${prefix}.${next}` : next)

    const visit = (fs: FormField[], prefix: string) => {
      for (const f of fs) {
        if (f.type === 'group' && f.children) {
          const name = (f as { name?: string }).name as string | undefined
          const nextPrefix = name && !isUiOnlyGroupName(name) ? joinPath(prefix, name) : prefix
          visit(f.children, nextPrefix)
          continue
        }
        if (f.type === 'row' && f.fields) {
          visit(f.fields, prefix)
          continue
        }
        if (f.type === 'repeater' && f.fields && f.name) {
          const listPath = f.path || joinPath(prefix, f.name)
          const arr = dotGet(out, listPath)
          if (Array.isArray(arr)) {
            const next = arr.map((item) => {
              if (!isRecord(item)) return item
              const copy = JSON.parse(JSON.stringify(item))
              const applyInItem = (itemFields: FormField[]) => {
                for (const rf of itemFields) {
                  if (rf.type === 'group' && rf.children) {
                    applyInItem(rf.children)
                    continue
                  }
                  if (rf.type === 'row' && rf.fields) {
                    applyInItem(rf.fields)
                    continue
                  }
                  if (rf.responsive && rf.name) {
                    const p = rf.path || rf.name
                    const v = dotGet(copy, p)
                    if (v !== undefined) dotSet(copy, p, extractResponsiveValue(v, vp))
                  }
                }
              }
              applyInItem(f.fields!)
              return copy
            })
            dotSet(out, listPath, next)
          }
          continue
        }

        if (f.responsive && f.name) {
          const path = f.path || joinPath(prefix, f.name)
          const v = dotGet(out, path)
          if (v !== undefined) {
            dotSet(out, path, extractResponsiveValue(v, vp))
          }
        }
      }
    }

    visit(fields, '')
    return out
  }

  const previewProps = computed(() => {
    if (formSchema.value.length === 0) return fixture.value || {}
    const payload = rebuildPayload(formSchema.value, flatForm)
    const merged = fixture.value ? mergePreviewPayload(fixture.value, payload) : payload

    return applyResponsiveToPayload(merged, formSchema.value, viewport.value)
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

  function reloadComponent() {
    reloadKey.value++
    initialFormValues.value = JSON.parse(JSON.stringify(flatForm))
  }

  async function loadPodData() {
    const s = toValue(slug)
    const sourcePreviewId = requestedSourcePreviewFromRoute()
    loading.value = true
    loadedSourcePreviewId.value = ''
    try {
      const preferredMode = preferredModeFromRoute()
      if (preferredMode !== mode.value) {
        mode.value = preferredMode
      }

      const nextPod = await runtime.getPod(s)
      if (!nextPod) {
        if (sourcePreviewId && pod.value?.slug === s) {
          return
        }

        pod.value = null
        fixture.value = null
        schema.value = null
        formSchema.value = []
        Object.keys(flatForm).forEach((key) => Reflect.deleteProperty(flatForm, key))
        initialFormValues.value = {}
        hydratedVariant.value = null
        loadedSourcePreviewId.value = ''
        return
      }

      if (!runtime.supportedModes.includes(mode.value)) {
        mode.value = runtime.supportedModes[0] ?? 'sfc'
      }

      const nextFixture =
        nextPod.fixture ?? (runtime.getFixture ? await runtime.getFixture(s) : null) ?? null
      const nextSchema =
        nextPod.schema ?? (runtime.getSchema ? await runtime.getSchema(s) : null) ?? null
      let nextFormSchema = fieldsFromPod(nextPod)

      if (nextFormSchema.length === 0 && nextSchema) {
        nextFormSchema = schemaToFields(nextSchema)
      }

      const nextFlatForm: Record<string, unknown> = {}
      let nextInitialFormValues: Record<string, unknown> = {}
      let nextHydratedVariant: string | null = null

      if (nextFormSchema.length > 0) {
        const flat = flatFromFixture(nextFormSchema, nextFixture || {})
        Object.assign(nextFlatForm, flat)
        ensureVisibleFieldDefaults(nextFormSchema, nextFlatForm)
        nextInitialFormValues = JSON.parse(JSON.stringify(nextFlatForm))
        nextHydratedVariant = typeof nextFlatForm.type === 'string' ? nextFlatForm.type : null
      }

      fixture.value = nextFixture
      schema.value = nextSchema
      formSchema.value = nextFormSchema
      Object.keys(flatForm).forEach((key) => Reflect.deleteProperty(flatForm, key))
      if (nextFormSchema.length > 0) {
        Object.assign(flatForm, nextFlatForm)
      }
      initialFormValues.value = nextInitialFormValues
      hydratedVariant.value = nextHydratedVariant
      pod.value = nextPod
      await nextTick()
      loadedSourcePreviewId.value = sourcePreviewId
    } finally {
      loading.value = false
    }
  }

  watch(
    () =>
      [
        toValue(slug),
        requestedSourcePreviewFromRoute(),
        route.query.draftPack,
        route.query.draftArtifact,
        activeSourcePreviewRevision.value,
        route.query.fixtureVariant,
      ] as const,
    async () => {
      await loadPodData()
    },
    { immediate: true },
  )

  watch(
    () => route.query.mode,
    () => {
      mode.value = preferredModeFromRoute()
    },
  )

  watchEffect(() => {
    if (loading.value) return
    if (formSchema.value.length === 0) return
    ensureVisibleFieldDefaults(formSchema.value, flatForm)
  })

  watch(
    () => (typeof flatForm.type === 'string' ? flatForm.type : null),
    (nextVariant) => {
      if (loading.value) return
      if (!nextVariant) return
      if (nextVariant === hydratedVariant.value) return
      const variantFixture = pod.value?.fixtureVariants?.[nextVariant]
      if (!variantFixture || formSchema.value.length === 0) {
        hydratedVariant.value = nextVariant
        return
      }

      const variantFlat = flatFromFixture(formSchema.value, variantFixture)
      mergeMissingValues(flatForm, variantFlat)
      ensureVisibleFieldDefaults(formSchema.value, flatForm)
      hydratedVariant.value = nextVariant
    },
  )

  function applyFormUpdate(payload: { field: string; value: unknown }) {
    flatForm[payload.field] = payload.value
  }

  return {
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
    loadPodData,
  }
}
