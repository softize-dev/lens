/**
 * Coletor por registro — o contexto que liga entradas soltas a uma execução de topo.
 *
 * O agrupamento usa `AsyncLocalStorage`: tudo que acontece dentro da execução observada
 * cai no mesmo registro, sem que consulta, evento ou chamada de modelo precisem receber
 * um identificador por parâmetro. Fora de uma execução observada, registrar é uma
 * operação sem efeito — assim uma consulta disparada por um script avulso não cria
 * registro órfão nem falha.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Provenance } from '@softize/opus/core'
import type { LensEntry, LensOutcome, LensRecord } from './types.ts'
import type { LensStore } from './store.ts'

interface Collector {
  id: string
  root: string
  startedAt: number
  traceId?: string
  requestId?: string
  provenance?: Provenance
  outcome: LensOutcome
  entries: LensEntry[]
}

const storage = new AsyncLocalStorage<Collector>()

/** Dados conhecidos no início da execução de topo. */
export interface RecordSeed {
  id: string
  root: string
  traceId?: string
}

/** O que só a auditoria sabe informar, já com a execução em andamento. */
export interface RecordAnnotation {
  provenance?: Provenance
  requestId?: string
  traceId?: string
  outcome?: LensOutcome
}

export function isCollecting(): boolean {
  return storage.getStore() !== undefined
}

export function addEntry(entry: LensEntry): void {
  storage.getStore()?.entries.push(entry)
}

export function annotate(annotation: RecordAnnotation): void {
  const collector = storage.getStore()
  if (collector === undefined) return
  if (annotation.provenance !== undefined) collector.provenance = annotation.provenance
  if (annotation.requestId !== undefined) collector.requestId = annotation.requestId
  if (annotation.traceId !== undefined) collector.traceId = annotation.traceId
  if (annotation.outcome !== undefined) collector.outcome = annotation.outcome
}

/**
 * Abre um registro, executa e grava o resultado. Registros aninhados não existem: uma
 * execução iniciada dentro de outra pertence ao registro já aberto.
 */
export async function collect<T>(seed: RecordSeed, store: LensStore, run: () => Promise<T>): Promise<T> {
  const collector: Collector = {
    id: seed.id,
    root: seed.root,
    startedAt: Date.now(),
    ...(seed.traceId !== undefined ? { traceId: seed.traceId } : {}),
    outcome: 'success',
    entries: [],
  }
  try {
    return await storage.run(collector, run)
  } finally {
    const record: LensRecord = {
      id: collector.id,
      root: collector.root,
      startedAt: collector.startedAt,
      durationMs: Date.now() - collector.startedAt,
      outcome: collector.outcome,
      ...(collector.requestId !== undefined ? { requestId: collector.requestId } : {}),
      ...(collector.traceId !== undefined ? { traceId: collector.traceId } : {}),
      ...(collector.provenance !== undefined ? { provenance: collector.provenance } : {}),
      entries: collector.entries,
    }
    store.save(record)
  }
}
