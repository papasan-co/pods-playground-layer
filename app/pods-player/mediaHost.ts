import type { InjectionKey } from 'vue'

/**
 * What a host CMS can offer the media picker beyond choosing from a list.
 *
 * The layer has no API of its own, so uploading a file and adjusting an image
 * are supplied by the host (`provide(PODS_PLAYER_MEDIA_HOST, ...)`). The picker
 * shows "Upload" and "Adjust" only when the matching capability is present.
 */
export type PodsPlayerMediaHost = {
  /**
   * Upload one file into the host's media library and return the created item.
   * Rejects with a readable message when the upload or the media record fails.
   */
  upload?: (file: File, options: { onProgress: (percent: number) => void }) => Promise<PodsPlayerUploadedMedia>
  /**
   * Open the host's image editor for a field value. Resolves with the adjusted
   * value, or `null` when the editor is cancelled.
   */
  adjust?: (value: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

/** The media item a host returns after an upload, in the picker's runtime-item shape. */
export type PodsPlayerUploadedMedia = {
  id: string
  s3Key: string
  url?: string
  originalName?: string
  altText?: string
  mediaType?: string
  width?: number
  height?: number
}

export const PODS_PLAYER_MEDIA_HOST: InjectionKey<PodsPlayerMediaHost> = Symbol('pods-player-media-host')

/** The recipe keys a media field value carries alongside its identity. */
export const MEDIA_RECIPE_KEYS = ['crop', 'adjustments'] as const

/** File types the picker accepts for a field's media kind; `undefined` accepts anything. */
export function acceptedUploadTypes(kind: string): string | undefined {
  if (kind === 'photo' || kind === 'logo' || kind === 'illustration') return 'image/*,.heic,.heif'
  if (kind === 'video') return 'video/*'
  return undefined
}

/** Whether a picked file suits the field's media kind, before anything is uploaded. */
export function fileSuitsMediaKind(file: File, kind: string): boolean {
  if (kind === 'video') return file.type.startsWith('video/')
  if (kind === 'photo' || kind === 'logo' || kind === 'illustration') {
    return file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name)
  }
  return true
}
