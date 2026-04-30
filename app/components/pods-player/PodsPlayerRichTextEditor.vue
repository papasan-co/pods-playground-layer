<script setup lang="ts">
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
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: 'Bulleted list' } },
    { kind: 'undo', icon: 'i-lucide-undo-2', tooltip: { text: 'Undo' } },
    { kind: 'redo', icon: 'i-lucide-redo-2', tooltip: { text: 'Redo' } },
  ],
]
</script>

<template>
  <div class="pg-rte overflow-hidden rounded-md border" style="border-color: var(--pg-control-border)">
    <UEditor
      v-slot="{ editor }"
      v-model="value"
      content-type="html"
      :editable="!disabled"
      :placeholder="{
        placeholder: placeholder || 'Write formatted body copy…',
        mode: 'firstLine',
      }"
      :starter-kit="{
        heading: { levels: [2] },
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
      }"
      :ui="{
        root: 'pg-rte-root',
        content: 'pg-rte-content',
        base: 'pg-rte-base',
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
          root: 'pg-rte-toolbar-root',
          base: 'pg-rte-toolbar-base',
        }"
      />
    </UEditor>
  </div>
</template>

<style>
.pg-rte {
  background: var(--pg-control-bg);
}

.pg-rte .pg-rte-toolbar-root {
  background: var(--pg-control-bg-muted);
  border-bottom: 1px solid var(--pg-control-border);
  padding: 4px;
}

.pg-rte .pg-rte-content {
  min-height: 144px;
}

.pg-rte .pg-rte-base {
  color: var(--pg-control-fg);
  font-size: 13px;
  line-height: 1.55;
  min-height: 144px;
  padding: 8px 12px;
}

.pg-rte .pg-rte-base:focus {
  outline: none;
}

.pg-rte .pg-rte-base h2 {
  color: var(--pg-control-fg);
  font-family: var(--pg-font-display);
  font-size: 28px;
  font-weight: 600;
  line-height: 1.05;
  margin: 0 0 10px;
}

.pg-rte .pg-rte-base p {
  margin: 0 0 10px;
}

.pg-rte .pg-rte-base ul {
  list-style: disc;
  margin: 0 0 10px;
  padding-left: 20px;
}

.pg-rte .pg-rte-base li {
  margin: 0 0 5px;
}

.pg-rte .pg-rte-base .is-editor-empty:first-child::before,
.pg-rte .pg-rte-base .is-empty::before {
  color: var(--pg-control-placeholder);
}
</style>
