import { describe, expect, it } from 'vitest'
import previewSource from '../../app/components/pods-player/PodsPlayerPreview.vue?raw'

// Static wiring guards, not a mounted parent lifecycle test. Real compiled
// capture must still prove that the selected identity matches the iframe.
describe('PodsPlayerPreview document profile selection wiring', () => {
  it('includes the document profile before render-transaction invalidation and reload', () => {
    const source = previewSource
    const profileDependencySource =
      'props.documentFlowPresentation?.profileHash ?? null,'
    const profileDependencyOffset = source.indexOf(profileDependencySource)
    const selectionWatcherStart = source.lastIndexOf(
      '\nwatch(',
      profileDependencyOffset,
    )
    const selectionWatcher = source.slice(
      selectionWatcherStart,
      source.indexOf('\n\nwatch(', profileDependencyOffset),
    )

    const viewportDependency = selectionWatcher.indexOf('props.viewport,')
    const profileDependency = selectionWatcher.indexOf(
      profileDependencySource,
    )
    const selectionCommit = selectionWatcher.indexOf(
      'renderIdentityCommits.begin(selection.generation)',
    )
    const runtimeLoad = selectionWatcher.indexOf('await loadVueRuntimePreview(')

    expect(viewportDependency).toBeGreaterThanOrEqual(0)
    expect(profileDependency).toBeGreaterThan(viewportDependency)
    expect(selectionCommit).toBeGreaterThan(profileDependency)
    expect(runtimeLoad).toBeGreaterThan(selectionCommit)
  })

  it('routes identity creation through the current presentation viewport', () => {
    const source = previewSource
    const identityCreation = source.slice(
      source.indexOf('createPodRenderTransactionIdentity({'),
      source.indexOf('\n  })', source.indexOf('createPodRenderTransactionIdentity({')),
    )

    expect(identityCreation).toContain('viewport: renderViewport(),')
  })
})
