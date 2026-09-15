/**
 * Requisições — o que cada uma fez, do enfileiramento à consulta.
 *
 * A leitura central é a linha do tempo: cada efeito aparece posicionado dentro da duração
 * da requisição, então "onde o tempo foi" se responde olhando, sem somar coluna. É a
 * pergunta que traz alguém a esta tela.
 */
import { useEffect, useState } from 'react'
import type { LensEntry, LensRecord } from '../../index.ts'
import {
  Alert,
  Badge,
  DataState,
  EmptyValue,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@softize/opus/ui/react'
import { useRecord, useRecords } from '../data.ts'
import { dateTimeWithSeconds, duration, relativeTime } from '../format.ts'

/**
 * Cada tipo de efeito tem sua cor na linha do tempo; a legenda é a própria etiqueta, então a
 * cor só reforça. Os tokens de contexto são a paleta da casa — são sete tipos para cinco
 * contextos, e por isso reação e IA partilham o primário em intensidades diferentes.
 */
const TONE: Record<LensEntry['kind'], string> = {
  action: 'bg-foreground/70',
  reaction: 'bg-context-primary-emphasis',
  cache: 'bg-context-success-emphasis',
  query: 'bg-context-info-emphasis',
  job: 'bg-context-warning-emphasis',
  event: 'bg-context-neutral-emphasis',
  ai: 'bg-context-primary-emphasis/50',
}

const ENTRY_KIND_LABEL: Record<LensEntry['kind'], string> = {
  action: 'Ação',
  reaction: 'Reação',
  cache: 'Cache',
  query: 'Consulta',
  job: 'Tarefa',
  event: 'Evento',
  ai: 'IA',
}

const outcomeLabel = (outcome: LensRecord['outcome']): string => (outcome === 'success' ? 'Sucesso' : 'Falha')

/** Job e evento são marcos, não trechos de tempo: só alguns tipos têm duração. */
function entryDuration(entry: LensEntry): number | undefined {
  return 'durationMs' in entry ? entry.durationMs : undefined
}

function entryLabel(entry: LensEntry): string {
  // O acerto é o que se procura aqui: vem antes da chave, que costuma ser longa.
  if (entry.kind === 'cache') {
    const outcome = entry.operation === 'get' ? (entry.hit === true ? 'hit' : 'miss') : entry.operation
    return `${outcome} · ${entry.key}`
  }
  if (entry.kind === 'query') return entry.sql
  if (entry.kind === 'event') return entry.type
  if (entry.kind === 'job') return `${entry.action} · ${entry.jobId}`
  if (entry.kind === 'ai')
    return entry.model === undefined ? entry.operation : `${entry.operation} · ${entry.model}`
  return entry.name
}

function Fact({ term, children }: { term: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="truncate font-mono text-sm">{children}</dd>
    </div>
  )
}

function Timeline({ record }: { record: LensRecord }): React.ReactElement {
  const total = Math.max(record.durationMs, 1)
  return (
    <ol className="space-y-1">
      {record.entries.map((entry, index) => {
        const offset = Math.min(99, Math.max(0, ((entry.at - record.startedAt) / total) * 100))
        const width = Math.max(1.5, Math.min(100 - offset, ((entryDuration(entry) ?? 0) / total) * 100))
        const elapsed = entryDuration(entry)
        return (
          <li key={index} className="grid grid-cols-[5rem_1fr_9rem_4.5rem] items-center gap-3 text-sm">
            <Badge variant="outline" className="justify-center font-mono text-xs">
              {ENTRY_KIND_LABEL[entry.kind]}
            </Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <code className="truncate text-muted-foreground" tabIndex={0}>
                  {entryLabel(entry)}
                </code>
              </TooltipTrigger>
              <TooltipContent className="max-w-xl break-all font-mono">{entryLabel(entry)}</TooltipContent>
            </Tooltip>
            <div className="h-1.5 rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${TONE[entry.kind]}`}
                style={{ marginLeft: `${offset}%`, width: `${width}%` }}
              />
            </div>
            <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
              {elapsed === undefined ? <EmptyValue compact label="Sem duração" /> : duration(elapsed)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Detail({ recordKey }: { recordKey: string | null }): React.ReactElement {
  const { data: record, isLoading, error } = useRecord(recordKey)

  if (recordKey === null) {
    return (
      <p className="p-8 text-sm text-muted-foreground">Selecione uma requisição para ver o que ela fez.</p>
    )
  }
  return (
    <div className="p-6">
      <DataState
        loading={isLoading}
        error={error}
        empty={record === null || record === undefined}
        emptyMessage="Esta requisição não está mais no histórico temporário."
        errorMessage="Não foi possível carregar a requisição. Tente novamente."
      >
        {record !== null && record !== undefined && (
          <>
            <div className="mb-5 flex items-baseline gap-3">
              <h2 className="font-mono text-lg font-semibold tracking-tight">{record.root}</h2>
              <Badge context={record.outcome === 'success' ? 'neutral' : 'danger'} variant="solid">
                {outcomeLabel(record.outcome)}
              </Badge>
              <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
                {duration(record.durationMs)}
              </span>
            </div>
            <dl className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Fact term="Requisição">{record.requestId ?? <EmptyValue compact />}</Fact>
              <Fact term="Rastreamento">{record.traceId?.slice(0, 16) ?? <EmptyValue compact />}</Fact>
              <Fact term="Procedência">{record.provenance?.kind ?? <EmptyValue compact />}</Fact>
              <Fact term="Início">{dateTimeWithSeconds(record.startedAt)}</Fact>
            </dl>
            <Separator className="mb-5" />
            <Timeline record={record} />
            {record.entries.map((entry, index) =>
              'error' in entry && entry.error !== undefined ? (
                <Alert
                  key={index}
                  context="danger"
                  className="mt-4"
                  description={
                    <span className="font-mono">
                      {typeof entry.error === 'string'
                        ? entry.error
                        : `${entry.error.code}: ${entry.error.message}`}
                    </span>
                  }
                />
              ) : null,
            )}
          </>
        )}
      </DataState>
    </div>
  )
}

export function RequestsView({
  selected,
  onSelect,
}: {
  selected: string | null
  onSelect: (key: string | null) => void
}): React.ReactElement {
  const { data: records, isLoading, error } = useRecords()
  const [now, setNow] = useState(() => Date.now())

  // O "há quanto tempo" precisa envelhecer sozinho; sem isto a lista congela no primeiro render.
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, 15_000)
    return () => {
      clearInterval(timer)
    }
  }, [])

  return (
    <div className="grid h-full min-h-0 grid-cols-[20rem_1fr]">
      <div className="min-h-0 overflow-y-auto border-r border-border">
        <DataState
          loading={isLoading}
          error={error}
          empty={(records ?? []).length === 0}
          emptyMessage="Ainda não há requisições registradas. Use a plataforma e atualize esta tela."
          errorMessage="Não foi possível carregar o histórico temporário. Tente novamente."
        >
          <ul>
            {(records ?? []).map((record) => {
              const key = record.requestId ?? record.id
              const active = selected === key
              return (
                <li key={record.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(key)
                    }}
                    className={`w-full border-b border-border px-4 py-2.5 text-left transition-colors hover:bg-accent ${active ? 'bg-accent' : ''}`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="truncate font-mono text-sm font-medium">{record.root}</span>
                      <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                        {duration(record.durationMs)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-baseline gap-2 text-xs text-muted-foreground">
                      <span className={record.outcome === 'success' ? '' : 'text-context-danger-emphasis'}>
                        {outcomeLabel(record.outcome)}
                      </span>
                      <span>· {record.entryCount} registros</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="ml-auto tabular-nums" tabIndex={0}>
                            {relativeTime(new Date(record.startedAt), new Date(now))}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{dateTimeWithSeconds(record.startedAt)}</TooltipContent>
                      </Tooltip>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </DataState>
      </div>
      <div className="min-h-0 overflow-y-auto">
        <Detail recordKey={selected} />
      </div>
    </div>
  )
}
