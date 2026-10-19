/**
 * pods-playground-layer.app.pods-player.fieldSource
 *
 * A field filled from somewhere else rather than typed.
 *
 * A page that draws many records with one design (a collection's Entry page)
 * stores, in place of a field's text, a reference to the record's value:
 * `{"$from": "entry.title"}`. The host fills it when it draws the page. The
 * form must show such a field as filled — never as an input whose first
 * keystroke would replace the reference with text — and let a person change
 * where it is filled from, or write their own text, on purpose.
 *
 * The host says what a field may be filled from, and what to call it; the
 * form knows nothing about collections.
 */

/** A value a field can be filled from. */
export type FieldSourceField = {
  /** The name after the scope: `title` in `entry.title`. */
  name: string
  /** What people call it: "Title". */
  label: string
  /** What it holds on the page being shown, when there is one to show. */
  sample?: string
}

/** Where fields on this page may be filled from. */
export type FieldSource = {
  /** The reference's scope: `entry` in `entry.title`. */
  scope: string
  /** How a filled field reads, before the value's label: "From the entry". */
  label: string
  fields: FieldSourceField[]
  /**
   * Whether the page is shown with a real record, so a field without a
   * sample is empty on it rather than unknown.
   */
  sampled?: boolean
}

/** A stored reference: an object whose only key is `$from`. */
export type FieldReference = { $from: string }

/** Return the reference a stored value holds, or null for an ordinary value. */
export function fieldReference(value: unknown): FieldReference | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const keys = Object.keys(value)
  const from = (value as { $from?: unknown }).$from
  return keys.length === 1 && typeof from === 'string' ? { $from: from } : null
}

/** Build the value that fills a field from one of a source's fields. */
export function referenceTo(source: FieldSource, name: string): FieldReference {
  return { $from: `${source.scope}.${name}` }
}

/**
 * Name what a reference fills a field with.
 *
 * Returns the source's field when the reference is in its scope, else null:
 * a reference this host cannot describe is still shown as filled, by its raw
 * name, and still protected from typing.
 */
export function referencedField(source: FieldSource | null | undefined, reference: FieldReference): FieldSourceField | null {
  if (!source) return null
  const prefix = `${source.scope}.`
  if (!reference.$from.startsWith(prefix)) return null
  const name = reference.$from.slice(prefix.length)
  return source.fields.find(field => field.name === name) ?? null
}
