/**
 * pods-playground-layer/app/pods-player/fixtures/sharedMedia.ts
 *
 * Shared fixture assets that both the CMS and the components playground can use
 * for initial preview defaults.
 *
 * These files live in the layer at `public/pods-player-assets/*` and are served
 * from `/pods-player-assets/*` at runtime.
 */

export const sharedMedia = {
  heroImage: '/pods-player-assets/images/hero-image.jpg',
  logoDark: '/pods-player-assets/images/logo-dark.png',
  logoLight: '/pods-player-assets/images/logo-light.png',
  heroVideo: '/pods-player-assets/video/hero-video.mp4',
  heroVideoSound: '/pods-player-assets/video/hero-video-sound.mp4',
  transcriptionExample: '/pods-player-assets/video/transcription-example.json',
  heroVideoSoundTranscription: '/pods-player-assets/video/hero-video-sound.json',
} as const

