import { Extension, Mark, commands, mergeAttributes } from '@tiptap/core'

// Keep the existing shared UEditor and its safe link parser. These marks only
// add the inline semantics carried by imported, editable website copy.
const Superscript = Mark.create({
  name: 'superscript',
  excludes: 'subscript',
  parseHTML: () => [{ tag: 'sup' }],
  renderHTML: ({ HTMLAttributes }) => ['sup', mergeAttributes(HTMLAttributes), 0],
})

const Subscript = Mark.create({
  name: 'subscript',
  excludes: 'superscript',
  parseHTML: () => [{ tag: 'sub' }],
  renderHTML: ({ HTMLAttributes }) => ['sub', mergeAttributes(HTMLAttributes), 0],
})

const Citation = Mark.create({
  name: 'citation',
  parseHTML: () => [{ tag: 'cite' }],
  renderHTML: ({ HTMLAttributes }) => ['cite', mergeAttributes(HTMLAttributes), 0],
})

const AuthoredAttributes = Extension.create({
  name: 'authoredRichTextAttributes',
  priority: 90,
  addCommands() {
    return {
      // Core honors keepOnSplit at the end of a paragraph, but a middle
      // split inherits its attributes. Only the newly split node loses the
      // copied ID; existing authored duplicates remain untouched.
      splitBlock: options => (props) => {
        const originalId = props.tr.selection.$from.parent.attrs.id
        const split = commands.splitBlock(options)(props)
        const next = props.tr.selection.$from
        if (split && props.dispatch && originalId && next.parent.attrs.id === originalId) {
          props.tr.setNodeMarkup(next.before(), undefined, { ...next.parent.attrs, id: null })
        }
        return split
      },
    }
  },
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem'],
        attributes: {
          id: {
            default: null,
            keepOnSplit: false,
            parseHTML: element => {
              const id = element.getAttribute('id')
              return id && !/\s/u.test(id) ? id : null
            },
          },
        },
      },
      {
        types: ['link'],
        attributes: {
          title: { default: null },
        },
      },
    ]
  },
})

export const podRichTextExtensions = [Superscript, Subscript, Citation, AuthoredAttributes]

export const podRichTextStarterKit = {
  heading: { levels: [2] as [2] },
  blockquote: false,
  codeBlock: false,
  horizontalRule: false,
  link: {
    openOnClick: false,
    autolink: false,
    linkOnPaste: false,
    HTMLAttributes: { target: null, rel: null },
  },
} as const

/**
 * An inline rich-text field (`inline: true`, a heading's words) edits as one
 * paragraph of marks: no headings or lists, and its value holds no `<p>`, so
 * it can render inside the heading it belongs to.
 */
export const podInlineRichTextStarterKit = {
  ...podRichTextStarterKit,
  heading: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
} as const

/** Give the editor an inline field's value as the one paragraph it edits. */
export function toInlineEditorHtml(value: string): string {
  return `<p>${value}</p>`
}

/** Keep an inline field's words and marks without paragraphs; a new line becomes a line break. */
export function fromInlineEditorHtml(html: string): string {
  return html
    .trim()
    .replace(/^<p[^>]*>/, '')
    .replace(/<\/p>$/, '')
    .replace(/<\/p>\s*<p[^>]*>/g, '<br>')
}
