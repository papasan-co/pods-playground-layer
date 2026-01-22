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

function hasOwnSetter(el: HTMLElement, key: string) {
  const d = Object.getOwnPropertyDescriptor(el, key)
  return Boolean(d && typeof (d as any).set === 'function')
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
  const isUpgraded = hasOwnSetter(el, key)

  // Primitives: in WC mode, attributes are always strings and can coerce Vue CE props.
  // Prefer setting via property once the element is upgraded; use attrs only as a fallback.
  if (typeof value === 'string') {
    try {
      ;(el as any)[key] = value
      if (isUpgraded) el.removeAttribute(attr)
      else el.setAttribute(attr, value)
    } catch {
      el.setAttribute(attr, value)
    }
    return
  }

  if (typeof value === 'number') {
    try {
      ;(el as any)[key] = value
      if (isUpgraded) el.removeAttribute(attr)
      else el.setAttribute(attr, String(value))
    } catch {
      el.setAttribute(attr, String(value))
    }
    return
  }

  if (typeof value === 'boolean') {
    try {
      ;(el as any)[key] = value
      if (isUpgraded) el.removeAttribute(attr)
      else {
        // Boolean attrs are presence-based: do NOT write "false" as a string.
        if (value) el.setAttribute(attr, '')
        else el.removeAttribute(attr)
      }
    } catch {
      if (value) el.setAttribute(attr, '')
      else el.removeAttribute(attr)
    }
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
    // Mark for runtime CSS (PodPack) to style the host element.
    // Avoid setting `display` inline: Vue Custom Element rendering can effectively forward
    // inline styles onto the component root, which can override Tailwind classes (e.g. `flex`).
    ;(el as any).dataset.autumnPod = '1'
    el.style.width = '100%'
    el.style.height = '100%'
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
    if (v == null) continue
    try {
      ;(el as any)[k] = v
    } catch {
      // keep attr fallback
    }
    // Only remove attributes once the element is upgraded (prevents losing pre-upgrade fallback attrs).
    if (hasOwnSetter(el, k)) {
      el.removeAttribute(toKebabCase(k))
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

