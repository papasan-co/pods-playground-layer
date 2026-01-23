<script setup lang="ts">
import { createApp, h } from 'vue'
import type { PodsPlayerViewport } from '#pods-player/types'

/**
 * pods-player-layer.app.components.pods-player.PodsPlayerPreviewDevice
 *
 * A lightweight iframe host that:
 * - isolates previews (avoids custom-element collisions)
 * - mirrors styles into the iframe (for consistent UI)
 * - optionally injects external scripts (e.g., PodPack bundle.js)
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
}>()

const emit = defineEmits<{
  (e: 'scriptsLoaded'): void
}>()

const frameStyle = computed(
  () =>
    ({
      laptop: { width: '1280px', height: '800px' },
      tablet: { width: '768px', height: '1024px' },
      phone: { width: '390px', height: '844px' },
    })[props.device],
)

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
function syncHead(from: Document, to: Document) {
  to.head.querySelectorAll(STYLE_SELECTOR).forEach((n) => n.remove())
  from.head.querySelectorAll(STYLE_SELECTOR).forEach((node) => {
    to.head.appendChild(node.cloneNode(true))
  })
}

function syncCSSVars(to: Document) {
  to.documentElement.style.cssText = document.documentElement.style.cssText
  // Keep HTML classes in sync so scoped runtime CSS (e.g. `.autumn-runtime`, `.dark`) applies.
  to.documentElement.className = document.documentElement.className
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
    if (win) syncRuntime(window, win)

    obs = new MutationObserver(() => syncHead(document, doc))
    obs.observe(document.head, { childList: true })

    applyScrollMode(doc, !!props.scrollable)

    miniApp = createApp({ render: () => slotVNode.value || null })
    miniApp.mount(doc.body)
  }

  applyScrollMode(doc, !!props.scrollable)
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
  <div
    class="preview-device self-start transition-all duration-300 ease-in-out rounded-md shadow-lg bg-gray-100 dark:bg-gray-800 max-w-full"
    :style="frameStyle"
  >
    <iframe
      ref="iframeRef"
      class="w-full h-full border-none rounded-md"
      sandbox="allow-same-origin allow-scripts"
      title="Pod preview"
    />
  </div>
</template>

<style scoped>
.preview-device {
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>

