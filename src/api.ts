/**
 * Leitura do buffer para o painel.
 *
 * O endereço de um registro aceita tanto o identificador interno quanto o `requestId` da
 * requisição HTTP, porque é esse segundo que a pessoa tem em mãos: ele viaja no
 * `ResultMeta` de qualquer resposta do runtime.
 */
import type { LensStore } from './store.ts'
import type { LensRecord, LensRecordSummary } from './types.ts'

export function listRecords(store: LensStore): LensRecordSummary[] {
  return store.list()
}

export function findRecord(store: LensStore, key: string): LensRecord | null {
  const direct = store.get(key)
  if (direct !== null) return direct
  const match = store.list().find((summary) => summary.requestId === key)
  return match === undefined ? null : store.get(match.id)
}
