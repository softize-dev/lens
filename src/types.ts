/**
 * Tipos do registro da lente — o que uma requisição fez, do ponto de vista das portas
 * do runtime (ADR 0054).
 *
 * O registro é o agrupamento primário: uma execução de topo e tudo que ela causou.
 * Cada entrada guarda a duração e o desfecho porque a pergunta do loop de
 * desenvolvimento é quase sempre "o que demorou" ou "o que falhou", não "o que existe".
 */
import type { Provenance, TraceContext } from '@softize/opus/core'

export type LensOutcome = 'success' | 'error'

export interface LensExecutionEntry {
  kind: 'action' | 'reaction'
  name: string
  /** Início da execução em epoch ms. */
  at: number
  durationMs: number
  outcome: LensOutcome
  /** `kind` declarado da action (simple, form, list, view), quando conhecido. */
  actionKind?: string
  error?: { code: string; message: string }
  trace?: TraceContext
}

export interface LensQueryEntry {
  kind: 'query'
  sql: string
  at: number
  durationMs: number
  /**
   * Parâmetros ficam de fora por padrão: são o caminho mais curto entre uma consulta
   * comum e dado pessoal gravado em disco. `includeQueryParams` liga quando a
   * investigação precisar deles.
   */
  params?: readonly unknown[]
  error?: string
}

export interface LensJobEntry {
  kind: 'job'
  /** Action que o job executa. */
  action: string
  jobId: string
  queue?: string
  at: number
  status: string
}

export interface LensEventEntry {
  kind: 'event'
  type: string
  at: number
  sourceActionId?: string
}

export interface LensCacheEntry {
  kind: 'cache'
  operation: 'get' | 'set' | 'delete'
  key: string
  /** Só na leitura: acertou o cache ou não. O miss é o `null` que a porta devolve. */
  hit?: boolean
  at: number
  durationMs: number
  ttlSeconds?: number
}

export interface LensAiEntry {
  kind: 'ai'
  operation: 'complete' | 'extract'
  model?: string
  at: number
  durationMs: number
  outcome: LensOutcome
}

export type LensEntry =
  | LensExecutionEntry
  | LensCacheEntry
  | LensQueryEntry
  | LensJobEntry
  | LensEventEntry
  | LensAiEntry

export interface LensRecord {
  id: string
  /** Nome da execução de topo — o rótulo do registro na listagem. */
  root: string
  startedAt: number
  durationMs: number
  outcome: LensOutcome
  /**
   * Identificador da requisição HTTP, quando a origem foi humana. É o mesmo valor que
   * o `ResultMeta` devolve, então o endereço `/lens/r/<requestId>` alcança o registro.
   */
  requestId?: string
  /**
   * Trace da execução de topo. Efeitos que rodam fora desta requisição — um job em
   * segundo plano, por exemplo — carregam o mesmo `traceId` e por ele a interface
   * reconstrói a cadeia entre registros separados.
   */
  traceId?: string
  provenance?: Provenance
  entries: LensEntry[]
}

/** Cabeçalho de um registro, para a listagem não precisar ler as entradas. */
export interface LensRecordSummary {
  id: string
  root: string
  startedAt: number
  durationMs: number
  outcome: LensOutcome
  entryCount: number
  /** Presente quando a origem foi HTTP; é a chave do endereço `/lens/r/<requestId>`. */
  requestId?: string
}
