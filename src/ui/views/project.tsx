/**
 * Lentes do projeto — qual régua vale aqui, o que ela aponta e o que existe de teste.
 */
import { Alert, Badge, Button, Card, DataState, EmptyValue, MetricCard } from '@softize/opus/ui/react'
import { MetricGrid } from '../metric-grid.tsx'
import { useConformity, useProject, useSuiteRun, useTests } from '../data.ts'
import { DeclarationTable } from './table.tsx'

const mono = 'font-mono text-xs'

/** Versão ausente no marcador, no lockfile ou na main: cada uma tem seu próprio significado. */
const version = (value: string | null | undefined, label: string): React.ReactNode =>
  value === null || value === undefined ? <EmptyValue compact label={label} /> : value

/** Enquanto a leitura não chega, o card declara a ausência em vez de um travessão solto. */
const pending = (value: number | string | null | undefined): React.ReactNode =>
  value === undefined || value === null ? <EmptyValue compact label="Ainda não lido" /> : value

export function OpusView(): React.ReactElement {
  const { data, isLoading, error } = useProject()

  return (
    <div className="space-y-6">
      <DataState
        loading={isLoading}
        error={error}
        emptyMessage="Nenhuma informação disponível."
        errorMessage="Não foi possível ler o projeto. Tente novamente."
      >
        <>
          {(data?.missing.length ?? 0) > 0 && (
            <Alert
              context="danger"
              title="A configuração ainda não foi concluída"
              description={
                <>
                  Falta <code className={mono}>{data?.missing.join(', ')}</code>. Execute{' '}
                  <code className={mono}>opus setup</code> no aplicativo.
                </>
              }
            />
          )}
          <DeclarationTable
            rows={data?.packages ?? []}
            emptyMessage="Nenhum pacote declarado em base.json."
            columns={[
              { header: 'Pacote', cell: (p) => <span className={mono}>{p.name}</span> },
              {
                header: 'Aplicada',
                cell: (p) => <span className={mono}>{version(p.applied, 'Sem marcador')}</span>,
                className: 'w-32',
              },
              {
                header: 'Instalada',
                cell: (p) => (
                  <span className={mono}>
                    {version(p.installed, 'Não instalada')}
                    {p.installedFrom === 'lens' && (
                      <span className="ml-1 text-muted-foreground">(servidor)</span>
                    )}
                  </span>
                ),
                className: 'w-40',
              },
              {
                header: 'Adotada na main',
                cell: (p) => (
                  <span className={mono}>
                    {version(p.adopted, 'Não adotada')}
                    {p.adoptedRef !== null && (
                      <span className="ml-1 text-muted-foreground">{p.adoptedRef}</span>
                    )}
                  </span>
                ),
                className: 'w-56',
              },
              {
                header: 'Estado',
                cell: (p) =>
                  p.drift ? (
                    <Badge context="danger" variant="solid">
                      Reconciliar
                    </Badge>
                  ) : (
                    <Badge context="neutral" variant="solid">
                      Alinhada
                    </Badge>
                  ),
                className: 'w-32',
              },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            A referência é a branch que este clone já conhece, não o registro. A versão aplicada vem do
            marcador do aplicativo; a adotada é a versão definida na main.
          </p>
        </>
      </DataState>
    </div>
  )
}

export function ConformityView(): React.ReactElement {
  const { data, isLoading, error } = useConformity(true)

  return (
    <div className="space-y-6">
      <MetricGrid>
        <MetricCard label="Ações" value={pending(data?.actions)} />
        <MetricCard label="Arquivos analisados" value={pending(data?.files)} />
        <MetricCard label="Achados" value={pending(data?.findings.length)} />
        <MetricCard
          label="Régua"
          value={pending(data?.rulerVersion)}
          description={
            data === null || data === undefined ? undefined : `Resolvida a partir de ${data.rulerFrom}.`
          }
        />
      </MetricGrid>
      <DeclarationTable
        rows={data?.findings ?? []}
        loading={isLoading}
        error={(error as { message?: string } | null) ?? null}
        emptyMessage="Nenhuma violação encontrada."
        columns={[
          {
            header: 'Regra',
            cell: (f) => (
              <Badge variant="outline" className={mono}>
                {f.rule}
              </Badge>
            ),
            className: 'w-56',
          },
          { header: 'Ação', cell: (f) => <span className={mono}>{f.action}</span>, className: 'w-56' },
          {
            header: 'Local',
            cell: (f) => (
              <span className={mono}>
                {f.file}
                {f.line === undefined ? '' : `:${f.line}`}
              </span>
            ),
          },
          { header: 'Problema', cell: (f) => <span className="text-muted-foreground">{f.message}</span> },
        ]}
      />
    </div>
  )
}

/** O veredito da suíte: um bloco só, que muda de forma conforme o estado da execução. */
function SuiteRun(): React.ReactElement {
  const { state, start, starting } = useSuiteRun()
  const running = state?.status === 'running' || starting

  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Suíte</span>
          <p className="text-sm text-muted-foreground">
            Executa uma vez o comando de testes do projeto. A execução continua no servidor mesmo que você
            saia desta tela.
          </p>
        </div>
        {/* `busy` traz o Spinner e desabilita; o rótulo fica como texto puro, que é o que o
            inventário de copy consegue extrair. */}
        <Button className="ml-auto shrink-0" size="sm" busy={running} onClick={start}>
          {running ? 'Executando…' : 'Executar suíte'}
        </Button>
      </div>
      {state?.status === 'done' && (
        <>
          <div className="flex items-center gap-3">
            <Badge context={state.ok ? 'neutral' : 'danger'} variant="solid">
              {state.ok ? 'Aprovada' : 'Reprovada'}
            </Badge>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {Math.round((state.finishedAt - state.startedAt) / 1000)}s
              {state.exitCode === null ? ' · não executada' : ` · saída ${state.exitCode}`}
            </span>
          </div>
          {state.output !== '' && (
            <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
              {state.output}
            </pre>
          )}
        </>
      )}
    </Card>
  )
}

export function TestsView(): React.ReactElement {
  const { data, isLoading, error } = useTests()
  const actions = data?.actions ?? { total: 0, mentioned: 0, missing: [] }
  const entities = data?.entities ?? { total: 0, mentioned: 0, missing: [] }

  return (
    <div className="space-y-6">
      <MetricGrid>
        <MetricCard label="Arquivos de teste" value={pending(data?.total)} />
        <MetricCard
          label="Casos"
          value={pending(data?.cases)}
          description="Estimativa a partir de test() e it()."
        />
        <MetricCard label="Ações mencionadas" value={`${actions.mentioned}/${actions.total}`} />
        <MetricCard label="Entidades mencionadas" value={`${entities.mentioned}/${entities.total}`} />
      </MetricGrid>
      <SuiteRun />
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Uma declaração é considerada mencionada quando seu nome aparece em um arquivo de teste. Este é
          apenas um indício de cobertura ausente, não uma prova de que o comportamento foi testado. Nada é
          executado aqui.
        </p>
      </Card>
      <DeclarationTable
        rows={actions.missing.map((name) => ({ name }))}
        loading={isLoading}
        error={(error as { message?: string } | null) ?? null}
        search={(row) => row.name}
        emptyMessage="Todas as ações declaradas aparecem em algum teste."
        columns={[
          {
            header: 'Ação não mencionada em testes',
            cell: (row) => <span className={mono}>{row.name}</span>,
          },
        ]}
      />
    </div>
  )
}
