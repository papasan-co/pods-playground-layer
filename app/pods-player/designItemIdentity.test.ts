import { describe, expect, it } from 'vitest'

import {
  identifyRepeaterBlueprint,
  mintDesignItemIdentity,
  repeaterIdentityFields,
} from './designItemIdentity'

const field = {
  type: 'repeater',
  name: 'artists',
  'x-ui': { itemIdentity: '_design_item_key' },
}

describe('design item repeater identity', () => {
  it('recognizes only governed hidden identity field names', () => {
    expect(repeaterIdentityFields(field)).toEqual(['_design_item_key'])
    expect(
      repeaterIdentityFields({
        ...field,
        'x-ui': {
          itemIdentities: ['_design_item_key', '_label_design_item_key'],
        },
      }),
    ).toEqual(['_design_item_key', '_label_design_item_key'])
    expect(repeaterIdentityFields({ ...field, 'x-ui': { itemIdentity: 'label' } })).toEqual([])
  })

  it('mints opaque lowercase keys and never reuses a blueprint key', () => {
    expect(mintDesignItemIdentity(() => 'ABC-123')).toBe('design-item-abc-123')
    const blueprint = {
      label: 'New artist',
      _design_item_key: 'design-item-stale',
    }
    const inserted = identifyRepeaterBlueprint(field, blueprint, () => 'FRESH-456')

    expect(inserted).toEqual({
      label: 'New artist',
      _design_item_key: 'design-item-fresh-456',
    })
    expect(blueprint._design_item_key).toBe('design-item-stale')
  })
})
