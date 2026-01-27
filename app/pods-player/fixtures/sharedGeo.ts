/**
 * pods-playground-layer/app/pods-player/fixtures/sharedGeo.ts
 *
 * Shared geo assets used by fixtures. These are served from the layer's public
 * folder under `/pods-player-assets/geo/*`.
 */

export const sharedGeo = {
  neighborhoods: '/pods-player-assets/geo/neighborhoods.geojson',
  highlightArea: '/pods-player-assets/geo/highlight-area.geojson',
  usStates: '/pods-player-assets/geo/us-states.json',
  usCounties: '/pods-player-assets/geo/us-counties.json',
} as const

