import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileStore } from './store.ts'
import type { LensRecord } from './types.ts'

function record(id: string, startedAt: number): LensRecord {
  return { id, root: `action.${id}`, startedAt, durationMs: 5, outcome: 'success', entries: [] }
}

describe('fileStore', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lens-store-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('descarta o registro mais antigo ao passar do limite', () => {
    const store = fileStore({ dir, limit: 2 })

    store.save(record('a', 1_000))
    store.save(record('b', 2_000))
    store.save(record('c', 3_000))

    expect(readdirSync(dir)).toHaveLength(2)
    expect(store.list().map((entry) => entry.id)).toEqual(['c', 'b'])
    expect(store.get('a')).toBeNull()
  })

  it('lista do mais recente para o mais antigo e recupera um registro por identificador', () => {
    const store = fileStore({ dir, limit: 10 })

    store.save(record('primeiro', 1_000))
    store.save(record('segundo', 2_000))

    expect(store.list().map((entry) => entry.id)).toEqual(['segundo', 'primeiro'])
    expect(store.get('primeiro')?.root).toBe('action.primeiro')
  })

  it('não interrompe a requisição quando o diretório não pode ser escrito', () => {
    // Um arquivo comum no lugar do diretório: a escrita falha com ENOTDIR em qualquer
    // sistema de arquivos, sem depender de permissão de um caminho específico.
    const blocked = join(dir, 'arquivo')
    writeFileSync(blocked, 'x')
    const store = fileStore({ dir: join(blocked, 'registros'), limit: 2 })

    expect(() => store.save(record('a', 1_000))).not.toThrow()
    expect(store.list()).toEqual([])
  })
})
