/**
 * Captura das consultas ao banco.
 *
 * Consultas não passam pelo runtime do Opus: o `DataAdapter` entrega a conexão e sai da
 * frente. Quem enxerga cada consulta é o Kysely, através do `log` que o app já pode
 * fornecer ao construir a instância. Por isso a lente entra aqui e não numa porta nova.
 */
import type { LogEvent } from 'kysely'
import { addEntry } from './collector.ts'

export interface KyselyLogOptions {
  /**
   * Grava também os parâmetros da consulta. Fica desligado por padrão: parâmetros são o
   * caminho mais curto entre uma consulta comum e dado pessoal gravado em disco.
   */
  includeParams?: boolean
  /** Log já existente do app, preservado. */
  next?: (event: LogEvent) => void
}

export function lensKyselyLog(options: KyselyLogOptions = {}): (event: LogEvent) => void {
  return (event) => {
    const at = Date.now()
    addEntry({
      kind: 'query',
      sql: event.query.sql,
      at,
      durationMs: Math.round(event.queryDurationMillis),
      ...(options.includeParams === true ? { params: event.query.parameters } : {}),
      ...(event.level === 'error'
        ? { error: event.error instanceof Error ? event.error.message : String(event.error) }
        : {}),
    })
    options.next?.(event)
  }
}
