/**
 * pods-playground-layer.app.pods-player.linkTarget
 *
 * What a `link` field stores, and what it may point at.
 *
 * A link is a typed reference rather than an address someone typed, so it
 * survives a page being renamed, renders correctly in every language, and can
 * be reported broken before it is published. The host resolves a reference to
 * a URL; nothing here knows what a URL looks like.
 *
 * These live outside the component because a `<script setup>` block cannot
 * export, and because the host needs the same shapes to supply candidates.
 */

/** A band on a page that a link can jump to. */
export type LinkSection = {
  id: string
  label: string
}

/** Something on the site a link may point at. */
export type LinkTarget = {
  kind: 'page' | 'entry' | 'form'
  id: string
  title: string
  /** Absent for a form, which opens in place and has no address. */
  path?: string
  status?: 'published' | 'draft'
  /** Entry only: which collection it belongs to. */
  collection?: string
  /** Page only: the bands on it a link can jump to. */
  sections?: LinkSection[]
}

/**
 * The stored value.
 *
 * The kind is the only thing a consumer may read the branch from — a populated
 * key on an unchosen branch is the rot this shape exists to prevent.
 */
export type LinkValue =
  | { kind: 'page', page: string, section?: string }
  | { kind: 'entry', collection: string, entry: string }
  | { kind: 'form', form: string }
  | { kind: 'url', url: string, newTab?: boolean }
