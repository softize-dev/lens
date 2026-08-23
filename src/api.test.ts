import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findRecord, listRecords } from './api.ts'
import { fileStore, type LensStore } from './store.ts'
import type { LensRecord } from './types.ts'

const record = (id: string, requestId?: string): LensRecord => ({
  id,
  root: 'lead.create',
  startedAt: 1_000,
  durationMs: 12,
  outcome: 'success',
  ...(requestId !== undefined ? { requestId } : {}),
  entries: [],
})

describe('leitura do painel', () => {
  let dir: string
  let store: LensStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lens-api-'))
    store = fileStore({ dir, limit: 10 })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('encontra o registro pelo identificador da requisição, não só pelo interno', () => {
    store.save(record('interno-1', 'req-42'))

    expect(findRecord(store, 'interno-1')?.id).toBe('interno-1')
    expect(findRecord(store, 'req-42')?.id).toBe('interno-1')
    expect(findRecord(store, 'inexistente')).toBeNull()
  })

  it('expõe o identificador da requisição já na listagem', () => {
    store.save(record('interno-1', 'req-42'))

    expect(listRecords(store)[0]).toMatchObject({ id: 'interno-1', requestId: 'req-42' })
  })
})
