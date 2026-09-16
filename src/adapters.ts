/**
 * Decoradores das portas do runtime.
 *
 * A lente não instrumenta o Opus: ela envolve os adapters que o app já registra. Cada
 * decorador acrescenta o registro e delega para o adapter original, que continua fazendo
 * o trabalho de verdade. Quando não existe adapter original — o caso comum em
 * desenvolvimento, onde a observabilidade OpenTelemetry fica desligada — o decorador de
 * observabilidade assume também a geração do contexto de trace, que o runtime espera.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import type {
  AiAdapter,
  CacheAdapter,
  CacheSetOptions,
  AuditRecord,
  AuditSink,
  DomainEvent,
  EventBusAdapter,
  JobHandle,
  JobSpec,
  ObservabilityAdapter,
  ObservabilityOperation,
  Provenance,
  QueueAdapter,
  TraceContext,
} from '@softize/opus/core'
import { addEntry, annotate, collect, isCollecting } from './collector.ts'
import type { LensStore } from './store.ts'
import type { LensOutcome } from './types.ts'

/** Trace no formato W3C, para quando não há adapter de observabilidade instalado. */
function newTrace(parent?: TraceContext): TraceContext {
  return {
    traceId: parent?.traceId ?? randomUUID().replace(/-/g, ''),
    spanId: randomBytes(8).toString('hex'),
  }
}

function requestIdOf(provenance: Provenance): string | undefined {
  return provenance.kind === 'http' ? provenance.requestId : undefined
}

/** Resultado de action carrega o desfecho no envelope; reaction só falha por rejeição. */
function outcomeOf(operation: ObservabilityOperation, value: unknown): {
  outcome: LensOutcome
  error?: { code: string; message: string }
} {
  if (operation.resultKind !== 'action-result') return { outcome: 'success' }
  const envelope = value as { ok?: boolean; error?: { code?: string; message?: string } } | undefined
  if (envelope?.ok !== false) return { outcome: 'success' }
  return {
    outcome: 'error',
    error: { code: envelope.error?.code ?? 'unknown', message: envelope.error?.message ?? '' },
  }
}

export function lensObservability(store: LensStore, inner?: ObservabilityAdapter): ObservabilityAdapter {
  return {
    ...inner,
    name: 'lens',
    kind: 'observability',
    async runInSpan<T>(operation: ObservabilityOperation, run: (trace: TraceContext) => Promise<T>): Promise<T> {
      const at = Date.now()
      // A raiz é decidida ANTES de o registro abrir: dentro do coletor toda execução
      // parece aninhada, e o desfecho do registro é o da execução de topo.
      const root = !isCollecting()
      const observed = async (trace: TraceContext): Promise<T> => {
        const startedAt = Date.now()
        try {
          const value = await run(trace)
          const { outcome, error } = outcomeOf(operation, value)
          addEntry({
            kind: operation.kind,
            name: operation.name,
            at,
            durationMs: Date.now() - startedAt,
            outcome,
            ...(error !== undefined ? { error } : {}),
            trace,
          })
          annotate({ traceId: trace.traceId, ...(root ? { outcome } : {}) })
          return value
        } catch (cause) {
          addEntry({
            kind: operation.kind,
            name: operation.name,
            at,
            durationMs: Date.now() - startedAt,
            outcome: 'error',
            error: { code: 'thrown', message: cause instanceof Error ? cause.message : String(cause) },
            trace,
          })
          annotate({ traceId: trace.traceId, ...(root ? { outcome: 'error' as const } : {}) })
          throw cause
        }
      }

      const delegate = (): Promise<T> =>
        inner === undefined ? observed(newTrace(operation.parent)) : inner.runInSpan(operation, observed)

      // Execução aninhada pertence ao registro já aberto; só a de topo abre um novo.
      if (isCollecting()) return delegate()
      const parentTraceId = operation.parent?.traceId
      return collect(
        { id: randomUUID(), root: operation.name, ...(parentTraceId !== undefined ? { traceId: parentTraceId } : {}) },
        store,
        delegate,
      )
    },
  }
}

/**
 * A auditoria é a única porta que expõe a proveniência de cada execução, e é dela que o
 * registro aprende quem originou a requisição. O record chega com `redact` e `fields` da
 * action já aplicados pelo emissor do Opus; a lente não reabre esse recorte.
 *
 * A execução de topo emite por último, então a última anotação é a que descreve a origem
 * do registro. Um registro cuja action de topo não tem auditoria fica com a proveniência
 * da execução aninhada mais recente, que ainda preserva a cadeia em `originalProvenance`.
 */
export function lensAudit(inner?: AuditSink): AuditSink {
  return {
    ...inner,
    name: 'lens',
    kind: 'audit',
    async emit(record: AuditRecord): Promise<void> {
      const requestId = requestIdOf(record.provenance)
      annotate({ provenance: record.provenance, ...(requestId !== undefined ? { requestId } : {}) })
      await inner?.emit(record)
    },
  }
}

/**
 * Cache: a leitura entra no registro dizendo se acertou. O acerto se lê do retorno da
 * porta — `null` é o miss —, então a lente não precisa de métrica declarada por fora, e o
 * driver não precisa saber que está sendo observado.
 */
export function lensCache(inner: CacheAdapter): CacheAdapter {
  const observe = async <T>(
    operation: 'get' | 'set' | 'delete',
    key: string,
    run: () => Promise<T>,
    extra: { ttlSeconds?: number } = {},
  ): Promise<T> => {
    const at = Date.now()
    const value = await run()
    addEntry({
      kind: 'cache',
      operation,
      key,
      ...(operation === 'get' ? { hit: value !== null } : {}),
      ...(extra.ttlSeconds !== undefined ? { ttlSeconds: extra.ttlSeconds } : {}),
      at,
      durationMs: Date.now() - at,
    })
    return value
  }
  return {
    ...inner,
    name: 'lens',
    kind: 'cache',
    get: <T>(key: string) => observe('get', key, () => inner.get<T>(key)),
    set: <T>(key: string, value: T, opts?: CacheSetOptions) =>
      observe('set', key, () => inner.set(key, value, opts), opts ?? {}),
    delete: (key: string) => observe('delete', key, () => inner.delete(key)),
  }
}

/** Fila: o enfileiramento entra no registro da requisição que o originou. */
export function lensQueue(inner: QueueAdapter): QueueAdapter {
  return {
    ...inner,
    name: 'lens',
    kind: 'queue',
    async enqueue(spec: JobSpec): Promise<JobHandle> {
      const handle = await inner.enqueue(spec)
      addEntry({
        kind: 'job',
        action: spec.action,
        jobId: handle.jobId,
        ...(spec.config.queue !== undefined ? { queue: spec.config.queue } : {}),
        at: Date.now(),
        status: handle.status,
      })
      return handle
    },
  }
}

export function lensEvents(inner: EventBusAdapter): EventBusAdapter {
  return {
    ...inner,
    name: 'lens',
    kind: 'eventbus',
    publish(event: DomainEvent): Promise<void> | void {
      addEntry({ kind: 'event', type: event.type, at: Date.now(), sourceActionId: event.source.actionId })
      return inner.publish(event)
    },
  }
}

/**
 * Chamadas de modelo entram no registro com duração e desfecho. Prompt e resposta ficam
 * de fora: são o conteúdo mais volumoso e mais sensível do fluxo, e a pergunta que motiva
 * o painel é quanto tempo custou e se funcionou.
 */
export function lensAi(inner: AiAdapter): AiAdapter {
  async function observe<T>(operation: 'complete' | 'extract', model: string | undefined, run: () => Promise<T>): Promise<T> {
    const at = Date.now()
    try {
      const value = await run()
      addEntry({ kind: 'ai', operation, ...(model !== undefined ? { model } : {}), at, durationMs: Date.now() - at, outcome: 'success' })
      return value
    } catch (cause) {
      addEntry({ kind: 'ai', operation, ...(model !== undefined ? { model } : {}), at, durationMs: Date.now() - at, outcome: 'error' })
      throw cause
    }
  }
  return {
    ...inner,
    name: 'lens',
    kind: 'ai',
    complete: (prompt, opts) => observe('complete', opts?.model, () => inner.complete(prompt, opts)),
    extract: (prompt, schema, opts) => observe('extract', opts?.model, () => inner.extract(prompt, schema, opts)),
  }
}
