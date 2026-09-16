/**
 * Ativação — os três degraus que o README descreve.
 *
 * É a regra que decide se a lente observa ou não, e ela não é óbvia: a variável de
 * ambiente não vence produção, e o valor explícito vence os dois. Sem este teste, apagar
 * a linha de produção não falharia em lugar nenhum.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createLens } from './index.ts'

const original = { node: process.env.NODE_ENV, lens: process.env.LENS_ENABLED }

function withEnv(node: string | undefined, lens: string | undefined): void {
  if (node === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = node
  if (lens === undefined) delete process.env.LENS_ENABLED
  else process.env.LENS_ENABLED = lens
}

afterEach(() => {
  // Atribuir `undefined` a `process.env.X` grava a string "undefined"; a restauração usa o
  // mesmo caminho do preparo, que apaga a variável quando ela não existia.
  withEnv(original.node, original.lens)
})

describe('ativação da lente', () => {
  it('fora de produção, segue a variável de ambiente', () => {
    withEnv('development', 'true')
    expect(createLens().enabled).toBe(true)

    withEnv('development', undefined)
    expect(createLens().enabled).toBe(false)
  })

  it('em produção, fica desligada mesmo com a variável ligada', () => {
    withEnv('production', 'true')

    expect(createLens().enabled).toBe(false)
  })

  it('o valor explícito decide sozinho, inclusive em produção', () => {
    withEnv('production', undefined)
    expect(createLens({ enabled: true }).enabled).toBe(true)

    withEnv('development', 'true')
    expect(createLens({ enabled: false }).enabled).toBe(false)
  })
})
