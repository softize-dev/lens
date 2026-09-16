import { describe, expect, it } from 'vitest'
import { trimSlash } from './base-path.js'

describe('normalização de prefixo', () => {
  it('trata `/lens` e `/lens/` como o mesmo prefixo', () => {
    expect(trimSlash('/lens')).toBe('/lens')
    expect(trimSlash('/lens/')).toBe('/lens')
    expect(trimSlash('/maestro/lens//')).toBe('/maestro/lens')
  })

  it('preserva a raiz, que reduzida a vazio casaria qualquer caminho', () => {
    expect(trimSlash('/')).toBe('/')
  })
})
