import raw from './mediaCatalog.json'

export type MediaOrientation = 'landscape' | 'portrait' | 'square' | 'any'
export type MediaKind = 'photo' | 'logo' | 'video' | 'file' | 'any'

export type MediaCatalogItem = {
  filename: string
  title: string
  orientation?: Exclude<MediaOrientation, 'any'>
  kind?: Exclude<MediaKind, 'any'>
  thumbnailFilename?: string
  roles?: string[]
  alt?: string
  tags?: string[]
  safeForTextOverlay?: boolean
}

export type MediaCatalogEntry = MediaCatalogItem & {
  url: string
  thumbnailUrl?: string
}

const BASE_BY_KIND: Record<Exclude<MediaKind, 'any'>, string> = {
  photo: '/pods-player-assets/images/',
  logo: '/pods-player-assets/images/',
  video: '/pods-player-assets/video/',
  file: '/pods-player-assets/',
}

function normalizeRole(r: string): string {
  return String(r || '').trim().toLowerCase()
}

export function mediaCatalog(): MediaCatalogEntry[] {
  const arr = Array.isArray(raw) ? (raw as MediaCatalogItem[]) : []
  return arr
    .filter((x) => x && typeof x.filename === 'string' && x.filename.length > 0)
    .map((x) => {
      const kind = x.kind ?? 'file'
      const base = BASE_BY_KIND[kind]
      return {
        ...x,
        roles: Array.isArray(x.roles) ? x.roles.map(normalizeRole).filter(Boolean) : [],
        tags: Array.isArray(x.tags) ? x.tags.map((t) => String(t).trim()).filter(Boolean) : [],
        url: `${base}${x.filename}`,
        thumbnailUrl: x.thumbnailFilename ? `${BASE_BY_KIND.photo}${x.thumbnailFilename}` : undefined,
      }
    })
}

export function findByUrl(url: string | undefined | null): MediaCatalogEntry | null {
  if (!url) return null
  const u = String(url)
  return mediaCatalog().find((x) => x.url === u) ?? null
}

export function filterCatalog(opts: {
  kind?: MediaKind
  orientation?: MediaOrientation
  roles?: string[]
  q?: string
}): MediaCatalogEntry[] {
  const kind = opts.kind ?? 'any'
  const orientation = opts.orientation ?? 'any'
  const roles = Array.isArray(opts.roles) ? opts.roles.map(normalizeRole).filter(Boolean) : []
  const q = String(opts.q ?? '').trim().toLowerCase()

  return mediaCatalog().filter((it) => {
    if (kind !== 'any' && it.kind && it.kind !== kind) return false
    if (orientation !== 'any' && it.orientation && it.orientation !== orientation) return false
    if (roles.length) {
      const set = new Set((it.roles ?? []).map(normalizeRole))
      if (!roles.every((r) => set.has(r))) return false
    }
    if (q) {
      const hay = [it.title, it.filename, ...(it.tags ?? []), ...(it.roles ?? [])]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

