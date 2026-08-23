/**
 * Lente de desenvolvimento — o que uma requisição fez, do enfileiramento à consulta.
 *
 * A montagem é uma linha no ponto em que o app registra os adapters do runtime. Sem
 * ativação explícita nada é decorado e nada é gravado: a lente devolve os mesmos adapters
 * que recebeu, então deixá-la montada não muda o comportamento do serviço.
 *
 * Ver ADR 0054 para a fronteira entre esta lente, o Maestro e o Opus.
 */
import { join } from 'node:path'
import type { LogEvent } from 'kysely'
import type {
  AiAdapter,
  AuditSink,
  EventBusAdapter,
  ObservabilityAdapter,
  QueueAdapter,
} from '@softize/opus/core'
import { lensAi, lensAudit, lensEvents, lensObservability, lensQueue } from './adapters.ts'
import { fileStore, type LensStore } from './store.ts'
import { lensKyselyLog, type KyselyLogOptions } from './kysely.ts'
import { readStructure, type Structure } from './structure.ts'

export type { LensStore } from './store.ts'
export type { KyselyLogOptions } from './kysely.ts'
export * from './types.ts'
export { lensKyselyLog } from './kysely.ts'
export { findRecord, listRecords } from './api.ts'
export { docCoverage, readStructure } from './structure.ts'
export type * from './structure.ts'
export { renderPanel } from './panel.ts'

/** Os adapters que a lente sabe observar. Os demais seguem intactos. */
export interface InstrumentableAdapters {
  observability?: ObservabilityAdapter | undefined
  audit?: AuditSink | undefined
  queue?: QueueAdapter | undefined
  eventBus?: EventBusAdapter | undefined
  ai?: AiAdapter | undefined
}

export interface LensOptions {
  /** Diretório do buffer. Padrão: `.lens` na raiz do processo. */
  dir?: string
  /** Quantos registros o buffer mantém. */
  limit?: number
  /**
   * Caminho do `.opus/manifest.json` que descreve o projeto observado. Padrão: `.opus`
   * na raiz do processo, que é onde o `opus gen` publica a projeção.
   */
  manifest?: string
  /**
   * Ativação. Sem valor explícito, a lente lê `LENS_ENABLED` e permanece desligada em
   * produção mesmo que a variável esteja presente — a inspeção é ferramenta de
   * desenvolvimento e não acompanha um build de produção por acidente de ambiente.
   */
  enabled?: boolean
}

export interface Lens {
  enabled: boolean
  store: LensStore
  /** Declarações do projeto: actions, entidades, dicionários, reactions e schedules.
   *  `null` quando o manifest não existe — o projeto precisa rodar `opus gen`. */
  structure(): Structure | null
  /** Devolve os adapters decorados, ou os mesmos que recebeu quando desligada. */
  instrument<T extends InstrumentableAdapters>(adapters: T): T
  /** `log` para o construtor do Kysely; sem efeito quando a lente está desligada. */
  kyselyLog(options?: KyselyLogOptions): (event: LogEvent) => void
}

function resolveEnabled(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit
  if (process.env.NODE_ENV === 'production') return false
  return process.env.LENS_ENABLED === 'true'
}

export function createLens(options: LensOptions = {}): Lens {
  const enabled = resolveEnabled(options.enabled)
  const store = fileStore({
    dir: options.dir ?? join(process.cwd(), '.lens'),
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
  })

  const manifest = options.manifest ?? join(process.cwd(), '.opus', 'manifest.json')

  return {
    enabled,
    store,
    structure: () => readStructure(manifest),
    instrument(adapters) {
      if (!enabled) return adapters
      return {
        ...adapters,
        // Observabilidade e auditoria entram sempre: a primeira abre o registro e a
        // segunda informa a origem. Quando o app não registra as suas, a lente é a única.
        observability: lensObservability(store, adapters.observability),
        audit: lensAudit(adapters.audit),
        ...(adapters.queue !== undefined ? { queue: lensQueue(adapters.queue) } : {}),
        ...(adapters.eventBus !== undefined ? { eventBus: lensEvents(adapters.eventBus) } : {}),
        ...(adapters.ai !== undefined ? { ai: lensAi(adapters.ai) } : {}),
      }
    },
    kyselyLog(logOptions) {
      const log = lensKyselyLog(logOptions)
      return enabled ? log : (logOptions?.next ?? (() => {}))
    },
  }
}
