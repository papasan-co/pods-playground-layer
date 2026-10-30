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
