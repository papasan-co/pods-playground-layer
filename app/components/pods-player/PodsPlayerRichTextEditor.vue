<script setup lang="ts">
import { podRichTextExtensions, podRichTextStarterKit } from '#pods-player/runtime/richTextPreservation'

const props = defineProps<{
  modelValue?: string
  disabled?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const value = computed({
  get: () => props.modelValue || '',
  set: (next: string | null) => emit('update:modelValue', next || ''),
})

const toolbarItems = [
  [
    { kind: 'paragraph', label: 'Body' },
    { kind: 'heading', level: 2, label: 'Display' },
  ],
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Bold' } },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Italic' } },
    { kind: 'mark', mark: 'superscript', icon: 'i-lucide-superscript', tooltip: { text: 'Superscript (citation)' } },
    { kind: 'mark', mark: 'subscript', icon: 'i-lucide-subscript', tooltip: { text: 'Subscript' } },
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: 'Bulleted list' } },
    { kind: 'undo', icon: 'i-lucide-undo-2', tooltip: { text: 'Undo' } },
    { kind: 'redo', icon: 'i-lucide-redo-2', tooltip: { text: 'Redo' } },
  ],
]
</script>

<template>
  <!--
    Dressed as the form's other fields are (Nuxt UI's soft input: a filled
    box, no outline, darker on hover and focus), with the formatting buttons
    on their own row above a divider, so they never sit on the text.
  -->
  <div
    class="pg-rte overflow-hidden rounded-md bg-elevated/50 transition-colors hover:bg-elevated focus-within:bg-elevated"
    :class="disabled ? 'pointer-events-none opacity-75' : ''"
  >
    <UEditor
      v-slot="{ editor }"
      v-model="value"
      content-type="html"
      :extensions="podRichTextExtensions"
      :editable="!disabled"
      :placeholder="{
        placeholder: placeholder || 'Write formatted body copy…',
        mode: 'firstLine',
      }"
      :starter-kit="podRichTextStarterKit"
      :ui="{
        root: 'flex flex-col',
        content: 'min-h-36',
        base: 'pg-rte-base min-h-36 px-3 py-2.5 text-sm/6 text-highlighted focus:outline-none',
      }"
    >
      <UEditorToolbar
        :editor="editor"
        :items="toolbarItems"
        color="neutral"
        active-color="neutral"
        variant="ghost"
        active-variant="soft"
        size="xs"
        :ui="{
          base: 'border-b border-default px-1.5 py-1',
        }"
      />
    </UEditor>
  </div>
</template>

<style>
/* What the editor's own text needs that utility classes cannot reach. */
.pg-rte .pg-rte-base h2 {
  font-family: var(--pg-font-display, inherit);
  font-size: 28px;
  font-weight: 600;
  line-height: 1.05;
  margin: 0 0 10px;
}

.pg-rte .pg-rte-base p {
  margin: 0 0 0.5rem;
}

.pg-rte .pg-rte-base ul {
  list-style: disc;
  margin: 0 0 0.5rem;
  padding-left: 1.25rem;
}

.pg-rte .pg-rte-base li {
  margin: 0 0 0.25rem;
}

.pg-rte .pg-rte-base > :last-child {
  margin-bottom: 0;
}

.pg-rte .pg-rte-base .is-editor-empty:first-child::before,
.pg-rte .pg-rte-base .is-empty::before {
  color: var(--ui-text-dimmed);
}
</style>
