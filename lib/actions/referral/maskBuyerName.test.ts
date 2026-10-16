import { describe, expect, test } from 'vitest'
import { maskBuyerName } from './maskBuyerName'

describe('maskBuyerName', () => {
  test('hides the middle of each word and keeps the ends', () => {
    expect(maskBuyerName('Nguyen Van')).toBe('N****n V*n')
    expect(maskBuyerName('Minh')).toBe('M**h')
  })

  test('masks very short names', () => {
    expect(maskBuyerName('An')).toBe('A*')
    expect(maskBuyerName('A')).toBe('*')
  })

  test('uses Guest when the name is empty', () => {
    expect(maskBuyerName('   ')).toBe('Guest')
  })
})
