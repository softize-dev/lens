/**
 * Lentes de IA — o que este repositório entrega a um agente ao ser aberto.
 *
 * A fonte é o repositório, não um cadastro: agente, skill, instrução, hook e MCP server
 * são arquivos versionados. Serve inclusive a um projeto que não usa Opus.
 */
import {
  Badge,
  DataState,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  EmptyValue,
  MetricCard,
} from '@softize/opus/ui/react'
import { useAi } from '../data.ts'
import { DeclarationTable } from './table.tsx'

const mono = 'font-mono text-xs'

function NotConfigured(): React.ReactElement {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Nenhuma configuração de agente</EmptyTitle>
        <EmptyDescription>
          Este repositório não contém o diretório <code className={mono}>.claude/</code>. Por isso, um agente
          que o abrir não receberá instruções, habilidades ou gatilhos próprios.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function useDocs(kind: 'agents' | 'skills'): {
  rows: { name: string; description: string; file: string }[]
  loading: boolean
  error: { message?: string } | null
  configured: boolean
} {
  const { data, isLoading, error } = useAi()
  return {
    rows: data?.[kind] ?? [],
    loading: isLoading,
    error: (error as { message?: string } | null) ?? null,
    configured: data?.configured !== false,
  }
}

function DocsTable({ kind, empty }: { kind: 'agents' | 'skills'; empty: string }): React.ReactElement {
  const { rows, loading, error, configured } = useDocs(kind)
  if (!configured) return <NotConfigured />
  return (
    <DeclarationTable
      rows={rows}
      loading={loading}
      error={error}
      search={(row) => `${row.name} ${row.description}`}
      emptyMessage={empty}
      columns={[
        { header: 'Nome', cell: (row) => <span className={mono}>{row.name}</span>, className: 'w-56' },
        {
          header: 'Descrição',
          cell: (row) => <span className="text-muted-foreground">{row.description}</span>,
        },
        {
          header: 'Arquivo',
          cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.file}</span>,
          className: 'w-80',
        },
      ]}
    />
  )
}

export function AgentsView(): React.ReactElement {
  return <DocsTable kind="agents" empty="Nenhum agente está versionado neste repositório." />
}

export function SkillsView(): React.ReactElement {
  return <DocsTable kind="skills" empty="Nenhuma habilidade está versionada neste repositório." />
}

export function InstructionsView(): React.ReactElement {
  const { data, isLoading, error } = useAi()
  if (data?.configured === false && data.instructions.length === 0) return <NotConfigured />

  return (
    <div className="space-y-6">
      <MetricCard
        loading={isLoading}
        label="Custo do contexto inicial"
        value={
          data === null || data === undefined ? (
            <EmptyValue compact label="Ainda não lido" />
          ) : (
            `${data.contextTokens} tokens`
          )
        }
        description="Estimativa do que cada sessão de agente carrega antes de começar, considerando quatro caracteres por token. Use este valor para identificar instruções que podem ser reduzidas; ele não bloqueia a execução."
      />
      <DataState
        loading={isLoading}
        error={error}
        emptyMessage="Nenhuma instrução declarada."
        errorMessage="Não foi possível ler as instruções. Tente novamente."
      >
        <DeclarationTable
          rows={data?.instructions ?? []}
          emptyMessage="Nenhum arquivo de instruções encontrado."
          columns={[
            { header: 'Arquivo', cell: (row) => <span className={mono}>{row.file}</span> },
            {
              header: 'Tokens',
              cell: (row) => <span className="tabular-nums">{row.tokens}</span>,
              className: 'w-28 text-right',
            },
          ]}
        />
      </DataState>
    </div>
  )
}

export function HooksView(): React.ReactElement {
  const { data, isLoading, error } = useAi()
  if (data?.configured === false) return <NotConfigured />

  return (
    <div className="space-y-4">
      {(data?.hookSources.length ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          Lidos de <code className={mono}>{data?.hookSources.join(' · ')}</code>
        </p>
      )}
      <DeclarationTable
        rows={data?.hooks ?? []}
        loading={isLoading}
        error={(error as { message?: string } | null) ?? null}
        emptyMessage="Nenhum gatilho configurado."
        columns={[
          {
            header: 'Evento',
            cell: (row) => (
              <Badge variant="outline" className={mono}>
                {row.event}
              </Badge>
            ),
            className: 'w-56',
          },
          {
            header: 'Correspondência',
            cell: (row) =>
              row.matcher === '' ? (
                <EmptyValue compact label="Sem filtro" />
              ) : (
                <span className={mono}>{row.matcher}</span>
              ),
            className: 'w-40',
          },
          { header: 'Executa', cell: (row) => <code className="text-xs">{row.command}</code> },
        ]}
      />
    </div>
  )
}

export function McpView(): React.ReactElement {
  const { data, isLoading, error } = useAi()
  return (
    <DeclarationTable
      rows={data?.mcp ?? []}
      loading={isLoading}
      error={(error as { message?: string } | null) ?? null}
      emptyMessage="Nenhum servidor MCP declarado em .mcp.json."
      columns={[
        { header: 'Servidor', cell: (row) => <span className={mono}>{row.name}</span>, className: 'w-56' },
        {
          header: 'Transporte',
          cell: (row) => (
            <Badge context="neutral" variant="solid">
              {row.kind}
            </Badge>
          ),
          className: 'w-32',
        },
        { header: 'Configuração', cell: (row) => <code className="text-xs">{row.spec}</code> },
      ]}
    />
  )
}
