<script setup lang="ts">
/**
 * pods-player-layer.app.components.pods-player.PodsPlayerWebComponentMount
 *
 * Vue renders unknown custom elements as DOM nodes and will generally pass `v-bind`
 * values as **string attributes**, which breaks booleans/objects and can also
 * collide with native DOM properties (e.g. `prefix` is a read-only Element prop).
 *
 * This component mounts the custom element and then assigns props via:
 * - DOM properties when writable (preferred; preserves types)
 * - attributes as a fallback (for collisions / read-only props)
 */

const props = defineProps<{
  tag: string
  props: Record<string, unknown>
}>()

const hostRef = ref<HTMLElement | null>(null)
let el: HTMLElement | null = null

function toKebabCase(input: string) {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase()
}

function setPropOrAttr(el: HTMLElement, key: string, value: unknown) {
  // Remove when undefined/null.
  if (value == null) {
    el.removeAttribute(toKebabCase(key))
    // Best-effort clear property too.
    try {
      ;(el as any)[key] = undefined
    } catch {}
    return
  }

  // Prefer property assignment (preserves types). Fall back to attributes if it throws.
  const attr = toKebabCase(key)
  // Always set attributes for primitives so VueCustomElement sees them immediately.
  if (typeof value === 'string' || typeof value === 'number') {
    el.setAttribute(attr, String(value))
    try {
      ;(el as any)[key] = value
    } catch {}
    return
  }

  if (typeof value === 'boolean') {
    // Boolean attrs are presence-based: do NOT write "false" as a string.
    if (value) el.setAttribute(attr, '')
    else el.removeAttribute(attr)
    try {
      ;(el as any)[key] = value
    } catch {}
    return
  }

  // Complex values: prefer property assignment, but keep a serialized attribute as a fallback/debug aid.
  try {
    ;(el as any)[key] = value
    el.removeAttribute(attr)
  } catch {
    el.setAttribute(attr, JSON.stringify(value))
  }
}

async function syncAll() {
  const host = hostRef.value
  if (!host) return

  const obj = props.props || {}
  const entries = Object.entries(obj)

  // Avoid mounting an "empty" web component; many pods have required props (e.g. `src`).
  if (entries.length === 0) {
    host.innerHTML = ''
    el = null
    return
  }

  // If the tag changed, rebuild the element.
  const isNew = !el || el.tagName.toLowerCase() !== props.tag.toLowerCase()
  if (!el || el.tagName.toLowerCase() !== props.tag.toLowerCase()) {
    host.innerHTML = ''
    el = document.createElement(props.tag) as HTMLElement
  }

  if (el.parentElement !== host) {
    host.innerHTML = ''
    host.appendChild(el)
  }

  // Best-effort: if this is a VueCustomElement, its prop accessors are defined as OWN props after upgrade.
  const probeKey = entries.length ? entries[0]![0] : null
  if (isNew && probeKey) {
    for (let i = 0; i < 50; i++) {
      const d = Object.getOwnPropertyDescriptor(el, probeKey)
      if (d && typeof (d as any).set === 'function') break
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  for (const [k, v] of entries) {
    setPropOrAttr(el, k, v)
  }

  // Second pass for complex props after microtask (helps VueCustomElement upgrade timing).
  await new Promise((r) => setTimeout(r, 0))
  for (const [k, v] of entries) {
    if (v && typeof v === 'object') {
      try {
        ;(el as any)[k] = v
        el.removeAttribute(toKebabCase(k))
      } catch {}
    }
  }
}

watch(
  () => [props.tag, props.props] as const,
  () => void syncAll(),
  { deep: true, immediate: true, flush: 'post' },
)

onMounted(() => {
  void syncAll()
})
</script>

<template>
  <div ref="hostRef" class="w-full h-full overflow-hidden" />
</template>

