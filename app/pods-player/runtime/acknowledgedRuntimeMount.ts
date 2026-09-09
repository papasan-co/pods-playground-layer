/** Claim an acknowledged load event; replay only when its current document has an empty mount. */
export function replayAcknowledgedRuntimeMount(input: {
  ready: boolean
  currentLoadKey: string
  acknowledgedLoadKey: string
  payloadIsCurrent: boolean
  renderIdentityIsCurrent: boolean
  mount: Element | null
  replay: () => void
}): boolean {
  if (
    !input.ready ||
    !input.currentLoadKey ||
    input.acknowledgedLoadKey !== input.currentLoadKey ||
    !input.payloadIsCurrent ||
    !input.renderIdentityIsCurrent
  ) {
    return false
  }

  if (input.mount && input.mount.childNodes.length === 0) input.replay()
  return true
}

/** Release a replaced owner without asking a discarded iframe document to find its removed mount. */
export function unmountReplacedRuntimeOwner(input: {
  ownerApi: { unmount?: (input: { mountSelector: string }) => void }
  ownerWindow: Window
  currentApi: object
  currentWindow: Window
  mountSelector: string
}): boolean {
  if (input.ownerApi === input.currentApi && input.ownerWindow === input.currentWindow) return false
  if (input.ownerWindow.document.querySelector(input.mountSelector)) {
    input.ownerApi.unmount?.({ mountSelector: input.mountSelector })
  }
  return true
}
