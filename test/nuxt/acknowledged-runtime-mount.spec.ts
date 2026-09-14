import { describe, expect, it, vi } from 'vitest'
import {
  replayAcknowledgedRuntimeMount,
  unmountReplacedRuntimeOwner,
} from '../../app/pods-player/runtime/acknowledgedRuntimeMount'

function mountWithContent(content = false): Element {
  const mount = document.createElement('div')
  if (content) mount.appendChild(document.createElement('main'))
  return mount
}

describe('acknowledged runtime iframe replacement', () => {
  it('replays the current ready identity only into a new empty mount', () => {
    const replay = vi.fn()
    expect(replayAcknowledgedRuntimeMount({
      ready: true,
      currentLoadKey: 'current',
      acknowledgedLoadKey: 'current',
      payloadIsCurrent: true,
      renderIdentityIsCurrent: true,
      mount: mountWithContent(),
      replay,
    })).toBe(true)
    expect(replay).toHaveBeenCalledOnce()
  })

  it('does not repeat a populated mount or accept stale asset or render identity', () => {
    const replay = vi.fn()
    const base = {
      ready: true,
      currentLoadKey: 'current',
      acknowledgedLoadKey: 'current',
      payloadIsCurrent: true,
      renderIdentityIsCurrent: true,
      replay,
    }
    expect(replayAcknowledgedRuntimeMount({ ...base, mount: mountWithContent(true) })).toBe(true)
    expect(replayAcknowledgedRuntimeMount({ ...base, payloadIsCurrent: false, mount: mountWithContent() })).toBe(false)
    expect(replayAcknowledgedRuntimeMount({ ...base, renderIdentityIsCurrent: false, mount: mountWithContent() })).toBe(false)
    expect(replay).not.toHaveBeenCalled()
  })

  it('skips obsolete teardown after the old iframe mount is already gone', () => {
    const ownerDocument = document.implementation.createHTMLDocument()
    const ownerWindow = { document: ownerDocument } as Window
    const unmount = vi.fn()

    expect(unmountReplacedRuntimeOwner({
      ownerApi: { unmount },
      ownerWindow,
      currentApi: {},
      currentWindow: window,
      mountSelector: '[data-pods-vue-mount="1"]',
    })).toBe(true)
    expect(unmount).not.toHaveBeenCalled()
  })

  it('unmounts a replaced owner while its exact old mount still exists', () => {
    const ownerDocument = document.implementation.createHTMLDocument()
    const ownerWindow = { document: ownerDocument } as Window
    const mount = ownerDocument.createElement('div')
    mount.dataset.podsVueMount = '1'
    ownerDocument.body.appendChild(mount)
    const unmount = vi.fn()

    expect(unmountReplacedRuntimeOwner({
      ownerApi: { unmount },
      ownerWindow,
      currentApi: {},
      currentWindow: window,
      mountSelector: '[data-pods-vue-mount="1"]',
    })).toBe(true)
    expect(unmount).toHaveBeenCalledWith({ mountSelector: '[data-pods-vue-mount="1"]' })
  })
})
