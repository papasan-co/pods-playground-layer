<script setup lang="ts">
import type { PodsPlayerMode, PodsPlayerViewport } from '#pods-player/types'

const props = defineProps<{
  packLabel: string
  podLabel: string
  viewport: PodsPlayerViewport
  podListCollapsed: boolean
  fieldPanelCollapsed: boolean
  scrollMode: boolean
  hasChanges: boolean
  mode: PodsPlayerMode
  supportedModes: PodsPlayerMode[]
  showFixtures: boolean
  showPropsTab: boolean
  showYamlTab: boolean
  /** Show the "Play" affordance (packs with a playable reel). */
  canPlayPack?: boolean
}>()

const emit = defineEmits<{
  'update:viewport': [value: PodsPlayerViewport]
  'update:mode': [value: PodsPlayerMode]
  togglePodList: []
  toggleFieldPanel: []
  reload: []
  toggleScrollMode: []
  'update:showFixtures': [value: boolean]
  'update:showPropsTab': [value: boolean]
  'update:showYamlTab': [value: boolean]
  playPack: []
}>()

const devices: { key: PodsPlayerViewport; icon: string }[] = [
  { key: 'laptop', icon: 'i-lucide-laptop' },
  { key: 'tablet', icon: 'i-lucide-tablet' },
  { key: 'phone', icon: 'i-lucide-smartphone' },
]

const showFixturesProxy = computed({
  get: () => props.showFixtures,
  set: (v: boolean) => emit('update:showFixtures', v),
})

const showPropsProxy = computed({
  get: () => props.showPropsTab,
  set: (v: boolean) => emit('update:showPropsTab', v),
})

const showYamlProxy = computed({
  get: () => props.showYamlTab,
  set: (v: boolean) => emit('update:showYamlTab', v),
})
</script>

<template>
  <div
    class="relative flex h-11 shrink-0 items-center px-2.5"
    style="color: var(--pg-fg-secondary)"
  >
    <button
      type="button"
      class="flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-[var(--pg-duration-quick)] hover:bg-[var(--pg-hover-surface)]"
      style="color: var(--pg-icon-muted)"
      :title="podListCollapsed ? 'Show pod list' : 'Hide pod list'"
      @click="emit('togglePodList')"
    >
      <UIcon name="i-lucide-panel-left" class="h-3.5 w-3.5" />
    </button>

    <div class="mx-2 h-4 w-px shrink-0" style="background: var(--pg-border)" />

    <div class="flex min-w-0 items-center gap-1.5 text-xs">
      <span style="color: var(--pg-fg-meta)">{{ packLabel }}</span>
      <UIcon name="i-lucide-chevron-right" class="h-3 w-3 shrink-0 opacity-40" />
      <span class="truncate font-semibold" style="color: var(--pg-fg-primary)">{{ podLabel }}</span>
    </div>

    <div
      class="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-0.5 rounded-lg border p-0.5"
      style="
        background: var(--pg-surface);
        border-color: var(--pg-border);
      "
    >
      <button
        v-for="d in devices"
        :key="d.key"
        type="button"
        class="flex h-6 w-[30px] items-center justify-center rounded-md transition-colors duration-[var(--pg-duration-quick)]"
        :style="
          viewport === d.key
            ? { background: 'var(--pg-hover-surface)', color: 'var(--pg-fg-primary)' }
            : { background: 'transparent', color: 'var(--pg-icon-muted)' }
        "
        :title="d.key"
        @click="emit('update:viewport', d.key)"
      >
        <UIcon :name="d.icon" class="h-3.5 w-3.5" />
      </button>
    </div>

    <div class="ml-auto flex items-center gap-0.5">
      <button
        v-if="canPlayPack"
        type="button"
        data-testid="playground-play-pack"
        class="mr-1 inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors duration-[var(--pg-duration-quick)]"
        style="background: var(--pg-fg-primary); color: var(--pg-bg)"
        title="Play this pack"
        @click="emit('playPack')"
      >
        <UIcon name="i-lucide-play" class="h-3 w-3" />
        Play
      </button>

      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-[var(--pg-duration-quick)] hover:bg-[var(--pg-hover-surface)]"
        style="color: var(--pg-fg-secondary)"
        title="Reload preview"
        @click="emit('reload')"
      >
        <UIcon
          name="i-lucide-refresh-cw"
          class="h-3.5 w-3.5"
          :class="hasChanges ? 'text-primary' : ''"
        />
      </button>

      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-[var(--pg-duration-quick)] hover:bg-[var(--pg-hover-surface)]"
        :style="scrollMode ? { color: 'var(--pg-fg-secondary)' } : { color: 'var(--pg-icon-muted)' }"
        title="Scroll mode"
        @click="emit('toggleScrollMode')"
      >
        <UIcon name="i-lucide-scroll-text" class="h-3.5 w-3.5" />
      </button>

      <UPopover :popper="{ placement: 'bottom-end' }">
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-[var(--pg-duration-quick)] hover:bg-[var(--pg-hover-surface)]"
          style="color: var(--pg-fg-secondary)"
          title="More"
        >
          <UIcon name="i-lucide-more-horizontal" class="h-3.5 w-3.5" />
        </button>

        <template #content>
          <div
            class="w-64 space-y-3 p-3 text-sm"
            style="background: var(--pg-surface); color: var(--pg-fg-primary)"
          >
            <div class="font-medium">Preview</div>
            <URadioGroup
              :model-value="mode"
              :items="[
                { label: 'SFC', value: 'sfc', disabled: !supportedModes.includes('sfc') },
                {
                  label: 'Vue Runtime',
                  value: 'vue',
                  disabled: !supportedModes.includes('vue'),
                },
              ]"
              @update:model-value="emit('update:mode', $event as PodsPlayerMode)"
            />
            <USwitch v-model="showFixturesProxy" label="Show fixtures" />
            <USwitch v-model="showPropsProxy" label="Show Props tab" />
            <USwitch v-model="showYamlProxy" label="Show YAML tab" />
          </div>
        </template>
      </UPopover>

      <div class="mx-1 h-4 w-px shrink-0" style="background: var(--pg-border)" />

      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-[var(--pg-duration-quick)] hover:bg-[var(--pg-hover-surface)]"
        style="color: var(--pg-icon-muted)"
        :title="fieldPanelCollapsed ? 'Show fields' : 'Hide fields'"
        @click="emit('toggleFieldPanel')"
      >
        <UIcon name="i-lucide-panel-right" class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>
