import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLensHandler } from './http.ts'
import { fileStore, type LensStore } from './store.ts'
import type { Structure } from './structure.ts'

const STRUCTURE = {
  source: 'manifest',
  domains: [],
  actions: [],
  presentations: [],
  permissions: [],
  entities: [],
  dicts: [],
  reactions: [],
  schedules: [],
} as unknown as Structure

describe('handler das rotas do painel', () => {
  let dir: string
  let store: LensStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lens-http-'))
    store = fileStore({ dir, limit: 10 })
    store.save({ id: 'rec-1', root: 'lead.create', startedAt: 1, durationMs: 2, outcome: 'success', requestId: 'req/1', entries: [] })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function lens(overrides: Partial<Parameters<typeof createLensHandler>[0]> = {}): Parameters<typeof createLensHandler>[0] {
    return {
      enabled: true,
      store,
      structure: () => Promise.resolve(STRUCTURE),
      ai: () => ({ configured: false }) as never,
      project: () => ({ root: '/repo' }) as never,
      tests: () => ({ total: 0 }) as never,
      suite: { start: () => ({ status: 'running' }) as never, state: () => ({ status: 'idle' }) as never },
      conformity: () => Promise.resolve({ findings: [] } as never),
      ...overrides,
    }
  }

  const call = (handler: ReturnType<typeof createLensHandler>, path: string, method = 'GET') =>
    handler(new Request(`http://localhost${path}`, { method }))

  it('não responde nada quando a lente está desligada, para o host seguir adiante', async () => {
    const handler = createLensHandler(lens({ enabled: false }))

    expect(await call(handler, '/__lens/api/records')).toBeNull()
  })

  it('ignora caminhos fora do prefixo, inclusive os que só começam parecido', async () => {
    const handler = createLensHandler(lens())

    expect(await call(handler, '/api/records')).toBeNull()
    expect(await call(handler, '/__lens/apix/records')).toBeNull()
  })

  it('lista o buffer e encontra o registro pelo requestId codificado no endereço', async () => {
    const handler = createLensHandler(lens())

    const list = await call(handler, '/__lens/api/records')
    expect(list?.status).toBe(200)
    expect(await list?.json()).toHaveLength(1)

    const record = await call(handler, `/__lens/api/records/${encodeURIComponent('req/1')}`)
    expect(await record?.json()).toMatchObject({ id: 'rec-1' })
  })

  it('distingue registro ausente de manifest ausente no 404', async () => {
    const handler = createLensHandler(lens({ structure: () => Promise.resolve(null) }))

    const record = await call(handler, '/__lens/api/records/nada')
    expect(record?.status).toBe(404)
    expect(await record?.json()).toEqual({ error: 'not_found' })

    const structure = await call(handler, '/__lens/api/docs')
    expect(structure?.status).toBe(404)
    expect(await structure?.json()).toEqual({ error: 'no_manifest' })
  })

  it('dispara a suíte só no POST e acompanha no GET', async () => {
    const handler = createLensHandler(lens())

    expect(await (await call(handler, '/__lens/api/tests/run', 'POST'))?.json()).toEqual({ status: 'running' })
    expect(await (await call(handler, '/__lens/api/tests/run'))?.json()).toEqual({ status: 'idle' })
    expect((await call(handler, '/__lens/api/records', 'POST'))?.status).toBe(404)
  })

  it('devolve 503 com motivo quando a régua falha, e avisa o host', async () => {
    const onError = vi.fn()
    const handler = createLensHandler(lens({ conformity: () => Promise.reject(new Error('sem opus')) }), { onError })

    const response = await call(handler, '/__lens/api/conformity')

    expect(response?.status).toBe(503)
    expect(await response?.json()).toEqual({ error: 'check_failed' })
    expect(onError).toHaveBeenCalledWith('/conformity', expect.any(Error))
  })

  it('na raiz, atende as rotas da lente e devolve o resto ao host', async () => {
    const handler = createLensHandler(lens(), { apiBase: '/' })

    expect((await call(handler, '/records'))?.status).toBe(200)
    // Sem a guarda da raiz o prefixo viraria '' e o 404 da lente cobriria o site inteiro.
    expect(await call(handler, '/qualquer/coisa')).toBeNull()
  })

  it('aceita outro prefixo, com ou sem barra final', async () => {
    const handler = createLensHandler(lens(), { apiBase: '/maestro/__lens/api/' })

    expect((await call(handler, '/maestro/__lens/api/records'))?.status).toBe(200)
    expect(await call(handler, '/__lens/api/records')).toBeNull()
  })
})
