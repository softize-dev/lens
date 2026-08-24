import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AuditRecord, ObservabilityOperation, QueueAdapter, TraceContext } from '@softize/opus/core'
import type { LogEvent } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { lensAudit, lensCache, lensObservability, lensQueue } from './adapters.ts'
import { createLens } from './index.ts'
import { lensKyselyLog } from './kysely.ts'
import { fileStore, type LensStore } from './store.ts'

const actionSpan = (name: string): ObservabilityOperation => ({
  name,
  kind: 'action',
  resultKind: 'action-result',
})

const auditRecord = (overrides: Partial<AuditRecord>): AuditRecord =>
  ({
    id: 'audit-1',
    timestamp: new Date(0).toISOString(),
    action: 'lead.create',
    outcome: 'success',
    durationMs: 3,
    provenance: { kind: 'http', userId: 'u1', requestId: 'req-42' },
    ...overrides,
  }) as AuditRecord

const queryEvent = (sql: string): LogEvent =>
  ({ level: 'query', query: { sql, parameters: ['sigiloso'] }, queryDurationMillis: 4.6 }) as unknown as LogEvent

describe('decoradores da lente', () => {
  let dir: string
  let store: LensStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lens-adapters-'))
    store = fileStore({ dir, limit: 10 })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('abre um registro na execução de topo e guarda a entrada da action', async () => {
    const observability = lensObservability(store)

    await observability.runInSpan(actionSpan('lead.create'), async () => ({ ok: true, data: {} }))

    const [summary] = store.list()
    expect(summary?.root).toBe('lead.create')
    expect(summary?.outcome).toBe('success')
    const record = store.get(summary!.id)
    expect(record?.entries).toHaveLength(1)
    expect(record?.entries[0]).toMatchObject({ kind: 'action', name: 'lead.create', outcome: 'success' })
    expect(record?.traceId).toEqual(expect.any(String))
  })

  it('mantém a execução aninhada dentro do registro já aberto', async () => {
    const observability = lensObservability(store)

    await observability.runInSpan(actionSpan('lead.create'), async () => {
      await observability.runInSpan(actionSpan('person.upsert'), async () => ({ ok: true, data: {} }))
      return { ok: true, data: {} }
    })

    expect(store.list()).toHaveLength(1)
    const record = store.get(store.list()[0]!.id)
    expect(record?.entries.map((entry) => 'name' in entry && entry.name)).toEqual(['person.upsert', 'lead.create'])
  })

  it('marca o registro como erro quando o envelope da action de topo falha', async () => {
    const observability = lensObservability(store)

    await observability.runInSpan(actionSpan('lead.create'), async () => ({
      ok: false,
      error: { code: 'validation.failed', message: 'Informe o telefone.' },
    }))

    const record = store.get(store.list()[0]!.id)
    expect(record?.outcome).toBe('error')
    expect(record?.entries[0]).toMatchObject({
      outcome: 'error',
      error: { code: 'validation.failed', message: 'Informe o telefone.' },
    })
  })

  it('delega ao adapter de observabilidade existente sem perder o registro', async () => {
    const seen: string[] = []
    const inner = {
      name: 'otel',
      kind: 'observability' as const,
      async runInSpan<T>(operation: ObservabilityOperation, run: (trace: TraceContext) => Promise<T>): Promise<T> {
        seen.push(operation.name)
        return run({ traceId: 'trace-do-otel', spanId: 'span-1' })
      },
    }

    await lensObservability(store, inner).runInSpan(actionSpan('lead.create'), async () => ({ ok: true, data: {} }))

    expect(seen).toEqual(['lead.create'])
    expect(store.get(store.list()[0]!.id)?.traceId).toBe('trace-do-otel')
  })

  it('aprende a origem da requisição pela auditoria e preserva o sink do app', async () => {
    const emitted: AuditRecord[] = []
    const audit = lensAudit({
      name: 'db',
      kind: 'audit',
      emit: (record) => {
        emitted.push(record)
      },
    })

    await lensObservability(store).runInSpan(actionSpan('lead.create'), async () => {
      await audit.emit(auditRecord({}))
      return { ok: true, data: {} }
    })

    const record = store.get(store.list()[0]!.id)
    expect(record?.requestId).toBe('req-42')
    expect(record?.provenance).toMatchObject({ kind: 'http', userId: 'u1' })
    expect(emitted).toHaveLength(1)
  })

  it('registra o enfileiramento no registro da requisição que o originou', async () => {
    const inner: QueueAdapter = {
      name: 'bullmq',
      kind: 'queue',
      enqueue: async (spec) => ({
        jobId: spec.jobId,
        action: spec.action,
        status: 'queued',
        enqueuedAt: new Date(0).toISOString(),
        attempts: 0,
      }),
      status: async () => null,
      cancel: async () => false,
    }
    const queue = lensQueue(inner)

    await lensObservability(store).runInSpan(actionSpan('communication.send'), async () => {
      await queue.enqueue({
        jobId: 'job-1',
        action: 'communication-email.deliver',
        input: {},
        ctx: { userId: 'u1', tenantId: null },
        config: { queue: 'communications' },
      })
      return { ok: true, data: {} }
    })

    const record = store.get(store.list()[0]!.id)
    expect(record?.entries).toContainEqual(
      expect.objectContaining({ kind: 'job', jobId: 'job-1', queue: 'communications' }),
    )
  })

  it('registra acerto e ausência do cache pelo retorno da porta', async () => {
    const store2 = new Map<string, unknown>()
    const cache = lensCache({
      name: 'memory',
      kind: 'cache',
      get: async <T>(key: string) => (store2.has(key) ? (store2.get(key) as T) : null),
      set: async (key, value) => { store2.set(key, value) },
      delete: async (key) => { store2.delete(key) },
    })

    await lensObservability(store).runInSpan(actionSpan('lead.summary'), async () => {
      await cache.get('lead:1')
      await cache.set('lead:1', 'resumo', { ttlSeconds: 60 })
      await cache.get('lead:1')
      return { ok: true, data: {} }
    })

    const record = store.get(store.list()[0]!.id)
    const cacheEntries = record?.entries.filter((entry) => entry.kind === 'cache')
    expect(cacheEntries).toHaveLength(3)
    // O miss é o `null` da porta; o acerto é o valor. A lente não pede métrica ao driver.
    expect(cacheEntries?.[0]).toMatchObject({ operation: 'get', key: 'lead:1', hit: false })
    expect(cacheEntries?.[1]).toMatchObject({ operation: 'set', key: 'lead:1', ttlSeconds: 60 })
    expect(cacheEntries?.[2]).toMatchObject({ operation: 'get', hit: true })
  })

  it('guarda a consulta sem parâmetros por padrão e ignora consulta fora de registro', async () => {
    const log = lensKyselyLog()

    log(queryEvent('select 1'))
    expect(store.list()).toHaveLength(0)

    await lensObservability(store).runInSpan(actionSpan('lead.list'), async () => {
      log(queryEvent('select * from leads'))
      return { ok: true, data: [] }
    })

    const record = store.get(store.list()[0]!.id)
    const query = record?.entries.find((entry) => entry.kind === 'query')
    expect(query).toMatchObject({ sql: 'select * from leads', durationMs: 5 })
    expect(query && 'params' in query).toBe(false)
  })

  it('devolve os mesmos adapters quando está desligada', () => {
    const adapters = { observability: undefined, audit: undefined }
    const lens = createLens({ enabled: false, dir })

    expect(lens.instrument(adapters)).toBe(adapters)
    expect(lens.enabled).toBe(false)
  })
})
