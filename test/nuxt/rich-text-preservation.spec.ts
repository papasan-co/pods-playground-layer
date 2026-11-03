import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { fromInlineEditorHtml, podInlineRichTextStarterKit, podRichTextExtensions, podRichTextStarterKit, toInlineEditorHtml } from '../../app/pods-player/runtime/richTextPreservation'

const passage = '<p>A complete <em>editable</em> passage preserves <strong>emphasis</strong>, a <a href="#citation" title="Source note">source link</a>, H<sub>2</sub>O and a citation<sup>1</sup>.</p><p id="citation"><cite>Field notes, synthetic edition.</cite> Every word belongs in the editable document.</p>'

function editorFor(content: string, onUpdate = () => {}) {
  return new Editor({
    element: document.createElement('div'),
    content,
    extensions: [StarterKit.configure(podRichTextStarterKit), ...podRichTextExtensions],
    onUpdate,
  })
}

describe('shared rich text preservation', () => {
  it('mounts, edits and reopens the complete passage without losing its semantics', () => {
    let updates = 0
    const editor = editorFor(passage, () => updates++)
    expect(updates).toBe(0)
    editor.commands.insertContentAt(editor.state.doc.content.size, '<p>Saved native edit.</p>')
    const saved = editor.getHTML()
    editor.destroy()
    const reopened = editorFor(saved)
    const dom = reopened.view.dom
    expect(dom.textContent).toContain('Saved native edit.')
    for (const tag of ['em', 'strong', 'a', 'cite', 'sup', 'sub']) expect(dom.querySelectorAll(tag)).toHaveLength(1)
    expect(dom.querySelector('a')?.getAttribute('href')).toBe('#citation')
    expect(dom.querySelector('a')?.getAttribute('title')).toBe('Source note')
    expect(dom.querySelector('a')?.getAttribute('target')).toBeNull()
    expect(dom.querySelector('a')?.getAttribute('rel')).toBeNull()
    expect(dom.querySelectorAll('p')).toHaveLength(3)
    expect(dom.querySelector('p#citation cite')?.textContent).toBe('Field notes, synthetic edition.')
    reopened.destroy()
  })

  it('retains authored allowed link attributes while refusing unsafe URLs and event attributes', () => {
    const editor = editorFor('<p id="safe" onclick="alert(1)"><a href="https://example.test/source" target="_blank" rel="noopener noreferrer" title="Reference">Safe</a> <a href="javascript:alert(1)" onclick="alert(2)">Unsafe</a></p>')
    const html = editor.getHTML()
    expect(html).toContain('id="safe"')
    expect(html).toContain('href="https://example.test/source"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('onclick')
    editor.destroy()
  })

  it('does not invent renamed identities for ambiguous duplicate authored IDs', () => {
    const editor = editorFor(passage + passage)
    expect(editor.view.dom.querySelectorAll('[id="citation"]')).toHaveLength(2)
    // This input fails the whole-page uniqueness gate; preservation must not
    // silently rewrite the author's IDs into a different reference scheme.
    expect(editor.getHTML()).not.toContain('citation-2')
    editor.destroy()
  })

  it('keeps an existing paragraph ID once when an ordinary Enter splits its text', () => {
    const editor = editorFor('<p id="citation">Original citation text</p>')
    editor.commands.setTextSelection(10)
    editor.commands.splitBlock()
    expect(editor.view.dom.querySelectorAll('p')).toHaveLength(2)
    expect(editor.view.dom.querySelectorAll('[id="citation"]')).toHaveLength(1)
    expect(editor.view.dom.textContent).toBe('Original citation text')
    editor.destroy()
  })
})

// Jon, 2 November: a heading with bold, superscript or subscript edits in the rich text editor.
describe('inline rich text for headings', () => {
  it('edits a heading as marks only and saves it without paragraphs', () => {
    const heading = 'Why H<sub>2</sub>O <strong>matters</strong>'
    const editor = new Editor({
      element: document.createElement('div'),
      content: toInlineEditorHtml(heading),
      extensions: [StarterKit.configure(podInlineRichTextStarterKit), ...podRichTextExtensions],
    })
    expect(fromInlineEditorHtml(editor.getHTML())).toBe(heading)
    // Pasted block structure is flattened to marks: the inline kit has no headings or lists.
    editor.commands.setContent(toInlineEditorHtml('<h2>A</h2><ul><li>B</li></ul>'))
    expect(editor.view.dom.querySelectorAll('ul, ol, li, h2')).toHaveLength(0)
    expect(editor.view.dom.textContent).toContain('A')
    expect(editor.view.dom.textContent).toContain('B')
    editor.destroy()
    expect(fromInlineEditorHtml('<p>First line</p><p>second <em>line</em></p>')).toBe('First line<br>second <em>line</em>')
  })
})
