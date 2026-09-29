import { describe, expect, it } from 'vitest'
import { baseName } from './download'

describe('baseName', () => {
  it('makes file names safe', () => {
    expect(baseName('Acme Logo (final).svg')).toBe('Acme-Logo-final')
    expect(baseName('Café Niño.png')).toBe('Cafe-Nino')
    expect(baseName('.png')).toBe('logo')
  })
})
