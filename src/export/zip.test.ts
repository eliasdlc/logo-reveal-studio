import { describe, expect, it } from 'vitest'
import { numberedNames } from './zip'

describe('numberedNames', () => {
  it('keeps list order and makes duplicates unique', () => {
    expect(numberedNames(['Acme', 'Beta', 'Acme'], '_1080p60.mp4')).toEqual([
      '01-Acme_1080p60.mp4',
      '02-Beta_1080p60.mp4',
      '03-Acme-2_1080p60.mp4',
    ])
  })

  it('pads to the number of files', () => {
    expect(numberedNames(Array(120).fill('x'), '.mp4')[0]).toBe('001-x.mp4')
  })
})
