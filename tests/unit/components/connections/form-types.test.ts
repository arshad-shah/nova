import { describe, it, expect } from 'vitest'
import { driverTypeOption, fieldSpan } from '../../../../src/renderer/src/components/connections/form/types'
import type { PluginField, PluginDriver } from '../../../../src/renderer/src/components/connections/form/types'

describe('driverTypeOption', () => {
  it('capitalizes only the first letter, leaving the rest of the name as declared', () => {
    const driver: PluginDriver = { driverId: 'postgresql', driverName: 'postgreSQL', connectionFields: [] }
    expect(driverTypeOption(driver)).toEqual({ value: 'postgresql', label: 'PostgreSQL' })
  })

  it('keeps the raw driverId as the option value even when the display name differs', () => {
    const driver: PluginDriver = { driverId: 'mysql', driverName: 'MySQL', connectionFields: [] }
    expect(driverTypeOption(driver).value).toBe('mysql')
  })

  it('handles a single-character driver name without throwing', () => {
    const driver: PluginDriver = { driverId: 'x', driverName: 'x', connectionFields: [] }
    expect(driverTypeOption(driver).label).toBe('X')
  })
})

describe('fieldSpan', () => {
  it('spans select, file, file-path, and password fields across both grid columns', () => {
    const wide: PluginField['type'][] = ['select', 'file', 'file-path', 'password'] as unknown as PluginField['type'][]
    for (const type of wide) {
      expect(fieldSpan({ key: 'k', label: 'L', type })).toBe('col-span-2')
    }
  })

  it('leaves text, number, and boolean fields at their natural single-column width', () => {
    const narrow = ['text', 'number', 'boolean']
    for (const type of narrow) {
      expect(fieldSpan({ key: 'k', label: 'L', type })).toBe('')
    }
  })
})
