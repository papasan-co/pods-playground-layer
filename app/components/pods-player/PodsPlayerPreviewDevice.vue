<script setup lang="ts">
import { createApp, h } from 'vue'
import type { PodsPlayerViewport } from '#pods-player/types'

/**
 * pods-playground-layer.app.components.pods-player.PodsPlayerPreviewDevice
 *
 * A lightweight iframe host that:
 * - isolates previews (avoids custom-element collisions)
 * - mirrors styles into the iframe (for consistent UI)
 * - optionally injects external scripts (e.g., runtime bundles)
 *
 * This is a shared primitive used by both preview modes.
 */

const props = defineProps<{
  device: PodsPlayerViewport
  /**
   * Scripts to inject into the iframe.
   * The component dedupes by URL and awaits load before emitting `scriptsLoaded`.
   */
  scripts?: string[]
  /**
   * Module scripts (ESM) to inject into the iframe.
   * Used by the Vue-CDN runtime bundle.
   */
  moduleScripts?: string[]
  /**
   * If false, the slot will not be mounted (useful when waiting on script readiness).
   */
  ready?: boolean
  /**
   * If true, allow the iframe document to scroll (used for StoryScrollyPage).
   * Default is false (pod previews are typically non-scrolling).
   */
  scrollable?: boolean
  /**
   * Optional CSS vars to apply to iframe root. Applied after base variable sync.
   */
  cssVars?: Record<string, string> | null
  /**
   * Additional stylesheet URLs injected directly into iframe head.
   */
  extraStylesheets?: string[]
  /**
   * Extra classes applied to iframe document root.
   */
  rootClasses?: string[]
}>()

const emit = defineEmits<{
  (e: 'scriptsLoaded'): void
}>()

const frameSize = computed(() => ({
  laptop: { width: 1662, height: 1066 },
  tablet: { width: 900, height: 1200 },
  phone: { width: 440, height: 860 },
})[props.device])

const frameStyle = computed(() => ({
  width: `${frameSize.value.width}px`,
  height: `${frameSize.value.height}px`,
}))

const hostRef = ref<HTMLDivElement | null>(null)
const hostSize = ref({ width: 0, height: 0 })

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!hostRef.value || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    hostSize.value = {
      width: entry.contentRect.width,
      height: entry.contentRect.height,
    }
  })
  resizeObserver.observe(hostRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

const scale = computed(() => {
  const { width: hostW, height: hostH } = hostSize.value
  const { width: deviceW, height: deviceH } = frameSize.value
  if (!hostW || !hostH) return 1
  // Keep the device's aspect ratio, only shrinking (never upscaling).
  return Math.min(hostW / deviceW, hostH / deviceH, 1)
})

const scaledSize = computed(() => ({
  width: Math.round(frameSize.value.width * scale.value),
  height: Math.round(frameSize.value.height * scale.value),
}))

const iframeRef = ref<HTMLIFrameElement>()
const slotVNode = shallowRef()
const slots = useSlots()

let obs: MutationObserver | null = null
let miniApp: ReturnType<typeof createApp> | null = null

onBeforeUnmount(() => {
  obs?.disconnect()
  miniApp?.unmount()
})

const STYLE_SELECTOR = 'style,link[rel="stylesheet"]'
const SYNCED_HEAD_SELECTOR = '[data-pods-head-sync="1"]'

function syncHead(from: Document, to: Document) {
  to.head.querySelectorAll(SYNCED_HEAD_SELECTOR).forEach((n) => n.remove())
  from.head.querySelectorAll(STYLE_SELECTOR).forEach((node) => {
    const cloned = node.cloneNode(true) as HTMLElement
    cloned.dataset.podsHeadSync = '1'
    to.head.appendChild(cloned)
  })
}

function syncCSSVars(to: Document) {
  to.documentElement.style.cssText = document.documentElement.style.cssText

  const vars = props.cssVars
  if (vars && typeof vars === 'object') {
    for (const [key, value] of Object.entries(vars)) {
      if (typeof key !== 'string' || !key.trim()) continue
      if (typeof value !== 'string' || !value.trim()) continue
      to.documentElement.style.setProperty(key, value)
    }
  }

  // Keep host classes in sync so dark mode works, then append caller-provided runtime classes.
  const classSet = new Set(
    document.documentElement.className
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean),
  )

  for (const className of props.rootClasses ?? []) {
    if (typeof className !== 'string') continue
    const trimmed = className.trim()
    if (!trimmed) continue
    classSet.add(trimmed)
  }

  to.documentElement.className = Array.from(classSet).join(' ')
}

function syncRuntime(fromWin: Window, toWin: Window) {
  try {
    const rt = (fromWin as any).__AUTUMN_RUNTIME__
    if (!rt || typeof rt !== 'object') return
    // Copy-by-value so the iframe can't accidentally mutate the parent runtime config.
    const cloned =
      typeof (fromWin as any).structuredClone === 'function'
        ? (fromWin as any).structuredClone(rt)
        : JSON.parse(JSON.stringify(rt))
    ;(toWin as any).__AUTUMN_RUNTIME__ = cloned
  } catch {
    // ignore
  }
}

function applyScrollMode(doc: Document, scrollable: boolean) {
  const html = doc.documentElement
  const body = doc.body
  if (!html || !body) return

  if (scrollable) {
    // IMPORTANT: don't force a scroll container on html/body.
    // Browsers handle iframe document scrolling naturally; forcing overflow
    // can break `position: sticky` inside the scrolly layout.
    html.style.overflow = ''
    body.style.overflow = ''
    html.style.height = ''
    body.style.height = ''
  } else {
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    html.style.height = '100%'
    body.style.height = '100%'
  }

  body.style.margin = '0'
  body.style.padding = '0'
}

async function ensureScripts(doc: Document, urls: string[]) {
  const unique = [...new Set(urls)].filter(Boolean)
  if (unique.length === 0) return

  const existing = new Set(
    Array.from(doc.querySelectorAll('script[data-pods-player-script="1"]')).map((s) =>
      (s as HTMLScriptElement).src,
    ),
  )

  for (const url of unique) {
    if (existing.has(url)) continue
    await new Promise<void>((resolve, reject) => {
      const s = doc.createElement('script')
      s.type = 'text/javascript'
      s.src = url
      s.async = false
      s.dataset.podsPlayerScript = '1'
      s.onload = () => resolve()
      s.onerror = () => reject(new Error(`Failed to load script: ${url}`))
      doc.head.appendChild(s)
    })
  }
}

async function ensureModuleScripts(doc: Document, urls: string[]) {
  const unique = [...new Set(urls)].filter(Boolean)
  if (unique.length === 0) return

  const existing = new Set(
    Array.from(doc.querySelectorAll('script[data-pods-player-module="1"]')).map((s) => (s as HTMLScriptElement).src),
  )

  for (const url of unique) {
    if (existing.has(url)) continue
    await new Promise<void>((resolve, reject) => {
      const s = doc.createElement('script')
      s.type = 'module'
      s.src = url
      s.async = false
      s.dataset.podsPlayerModule = '1'
      s.onload = () => resolve()
      s.onerror = () => reject(new Error(`Failed to load module script: ${url}`))
      doc.head.appendChild(s)
    })
  }
}

function syncExtraStylesheets(doc: Document, urls: string[]) {
  const wanted = [...new Set(urls)]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())

  const existingNodes = Array.from(doc.querySelectorAll('link[data-pods-extra-style="1"]')) as HTMLLinkElement[]
  const existingMap = new Map(existingNodes.map((node) => [node.href, node]))

  for (const node of existingNodes) {
    if (!wanted.includes(node.href)) {
      node.remove()
    }
  }

  for (const href of wanted) {
    if (existingMap.has(href)) continue
    const link = doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.podsExtraStyle = '1'
    doc.head.appendChild(link)
  }
}

async function bootIframe() {
  const iframe = iframeRef.value
  if (!iframe) return

  const doc = iframe.contentDocument
  if (!doc) return
  const win = iframe.contentWindow

  if (!miniApp) {
    doc.open()
    doc.write(`
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width,initial-scale=1">
          <style>html,body{margin:0;width:100%;}</style>
        </head>
        <body></body>
      </html>
    `)
    doc.close()
    await nextTick()

    syncHead(document, doc)
    syncCSSVars(doc)
    syncExtraStylesheets(doc, props.extraStylesheets ?? [])
    if (win) syncRuntime(window, win)

    obs = new MutationObserver(() => syncHead(document, doc))
    obs.observe(document.head, { childList: true })

    applyScrollMode(doc, !!props.scrollable)

    miniApp = createApp({ render: () => slotVNode.value || null })
    miniApp.mount(doc.body)
  }

  applyScrollMode(doc, !!props.scrollable)
  syncCSSVars(doc)
  syncExtraStylesheets(doc, props.extraStylesheets ?? [])
  if (win) syncRuntime(window, win)

  if (props.moduleScripts?.length) {
    await ensureModuleScripts(doc, props.moduleScripts)
    emit('scriptsLoaded')
  }

  if (props.scripts?.length) {
    await ensureScripts(doc, props.scripts)
    emit('scriptsLoaded')
  }
}

watchEffect(() => {
  void props.device
  // Ensure script injection runs when the script list changes (WC mode).
  void props.scripts
  void props.moduleScripts
  void props.ready
  void props.scrollable
  void props.cssVars
  void props.extraStylesheets
  void props.rootClasses
  slotVNode.value =
    props.ready === false
      ? null
      : h(
          'div',
          /**
           * Scroll mode: do NOT force a fixed height or overflow-hidden on the root wrapper.
           * The iframe document should be able to grow and scroll naturally.
           */
          { class: props.scrollable ? 'w-full min-h-full' : 'w-full h-full overflow-hidden' },
          slots.default?.(),
        )
  void bootIframe()
})
</script>

<template>
  <div ref="hostRef" class="preview-device-host w-full h-full flex items-center justify-center">
    <div class="preview-device-slot" :style="{ width: `${scaledSize.width}px`, height: `${scaledSize.height}px` }">
      <div
        class="preview-device transition-all duration-300 ease-in-out rounded-md shadow-lg bg-gray-100 dark:bg-gray-800"
        :style="[
          frameStyle,
          {
            position: 'absolute',
            top: '0px',
            left: '0px',
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          },
        ]"
      >
        <iframe
          ref="iframeRef"
          class="w-full h-full border-none rounded-md"
          sandbox="allow-same-origin allow-scripts"
          title="Pod preview"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-device {
  overflow: hidden;
}
.preview-device-slot {
  position: relative;
}
</style>
