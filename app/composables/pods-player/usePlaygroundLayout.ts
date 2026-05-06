/**
 * pods-playground-layer.app.composables.pods-player.usePlaygroundLayout
 *
 * Layout chrome: collapsible panels, scroll mode, overflow toggles, keyboard shortcuts.
 */

const LS_SCROLL_MODE = 'playground.scrollMode'

function readLs(key: string, fallback: boolean): boolean {
  if (!import.meta.client) return fallback
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return fallback
  }
}

function writeLs(key: string, value: boolean) {
  if (!import.meta.client) return
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function usePlaygroundLayout(options?: {
  onCmdK?: () => void
  onArrowLeft?: () => void
  onArrowRight?: () => void
}) {
  const podListCollapsed = ref(false)
  const fieldPanelCollapsed = ref(false)
  const scrollMode = ref(readLs(LS_SCROLL_MODE, false))

  const advancedFieldsOpen = ref(false)
  const showFixtures = ref(false)
  const showPropsTab = ref(false)
  const showYamlTab = ref(false)

  watch(scrollMode, (v) => writeLs(LS_SCROLL_MODE, v))

  function togglePodList() {
    podListCollapsed.value = !podListCollapsed.value
  }

  function toggleFieldPanel() {
    fieldPanelCollapsed.value = !fieldPanelCollapsed.value
  }

  function toggleScrollMode() {
    scrollMode.value = !scrollMode.value
  }

  function handleKeydown(ev: KeyboardEvent) {
    const tag = (ev.target as HTMLElement | null)?.tagName
    const inInput =
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      (ev.target as HTMLElement | null)?.isContentEditable

    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault()
      options?.onCmdK?.()
      return
    }

    if (inInput && !ev.metaKey && !ev.ctrlKey) return

    if (ev.key === '[') {
      ev.preventDefault()
      togglePodList()
      return
    }
    if (ev.key === ']') {
      ev.preventDefault()
      toggleFieldPanel()
      return
    }
    if (ev.key === 'ArrowLeft') {
      options?.onArrowLeft?.()
      return
    }
    if (ev.key === 'ArrowRight') {
      options?.onArrowRight?.()
      return
    }
  }

  onMounted(() => {
    if (import.meta.client) {
      window.addEventListener('keydown', handleKeydown)
    }
  })

  onUnmounted(() => {
    if (import.meta.client) {
      window.removeEventListener('keydown', handleKeydown)
    }
  })

  return {
    podListCollapsed,
    fieldPanelCollapsed,
    scrollMode,
    advancedFieldsOpen,
    showFixtures,
    showPropsTab,
    showYamlTab,
    togglePodList,
    toggleFieldPanel,
    toggleScrollMode,
  }
}
