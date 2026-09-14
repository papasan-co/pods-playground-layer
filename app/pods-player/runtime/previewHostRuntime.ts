type HostRuntime = Record<string, unknown> & {
  components?: Record<string, unknown>
}

/**
 * Copy host configuration into an isolated preview while retaining executable
 * component references. Vue components cannot pass through structuredClone;
 * copying their registry separately preserves the existing Autumn host bridge.
 */
export function copyPreviewHostRuntime(runtime: HostRuntime): HostRuntime {
  const { components, ...configuration } = runtime
  const copied = typeof structuredClone === 'function'
    ? structuredClone(configuration)
    : JSON.parse(JSON.stringify(configuration))

  return components
    ? { ...copied, components: { ...components } }
    : copied
}
