/**
 * Lentes de código — o que o projeto declara.
 *
 * A fonte é o manifest do Opus, então cada tela aqui mostra a declaração e a documentação
 * de negócio que vive colada nela. Sem manifest não há adivinhação: a tela pede `opus gen`.
 */
import type { Structure, StructureAction } from '../../index.ts'
import {
  Badge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  EmptyValue,
  MetricCard,
  PresentationInspector,
  Surface,
} from '@softize/opus/ui/react'
import { MetricGrid } from '../metric-grid.tsx'
import { useDocs, useStructure } from '../data.ts'
import { ManifestMissing } from './missing.tsx'
import { DeclarationTable, type Column } from './table.tsx'

const doc = (text?: string): React.ReactNode =>
  text === undefined ? (
    <EmptyValue compact label="Sem descrição" />
  ) : (
    <span className="text-muted-foreground">{text}</span>
  )

const mono = 'font-mono text-xs'

export function OverviewView(): React.ReactElement {
  const { data: structure } = useStructure()
  const { data: docs } = useDocs()

  if (structure === null || structure === undefined) {
    return <ManifestMissing />
  }
  const coverage =
    docs === null || docs === undefined || docs.total === 0
      ? 0
      : Math.round((docs.documented / docs.total) * 100)

  return (
    <div className="space-y-6">
      <MetricGrid>
        <MetricCard label="Domínios" value={structure.domains.length} />
        <MetricCard label="Ações" value={structure.actions.length} />
        <MetricCard label="Presentations" value={structure.presentations.length} />
        <MetricCard label="Entidades" value={structure.entities.length} />
        <MetricCard label="Dicionários" value={structure.dicts.length} />
        <MetricCard label="Reações" value={structure.reactions.length} />
        <MetricCard label="Agendamentos" value={structure.schedules.length} />
        <MetricCard
          label="Documentadas"
          value={`${coverage}%`}
          description={
            docs === null || docs === undefined
              ? undefined
              : `${docs.documented} de ${docs.total} declarações documentadas.`
          }
        />
        <MetricCard
          label="Opus"
          value={structure.opusVersion ?? <EmptyValue compact label="Versão desconhecida" />}
          description={`Lida de ${structure.source}.`}
        />
      </MetricGrid>
      <DeclarationTable<Structure['domains'][number]>
        columns={[
          { header: 'Domínio', cell: (d) => <span className={mono}>{d.name}</span> },
          {
            header: 'Ações',
            cell: (d) => <span className="tabular-nums">{d.actions}</span>,
            className: 'w-24 text-right',
          },
          {
            header: 'Entidades',
            cell: (d) => <span className="tabular-nums">{d.entities}</span>,
            className: 'w-24 text-right',
          },
          { header: 'Descrição', cell: (d) => doc(d.description) },
        ]}
        rows={structure.domains}
        search={(d) => d.name}
        emptyMessage="Nenhum domínio declarado."
      />
    </div>
  )
}

/** Envolve uma lente com a carga do manifest, que é comum a todas elas. */
function useDeclarations<T>(pick: (structure: Structure) => T[]): {
  rows: T[]
  loading: boolean
  error: { message?: string } | null
  missing: boolean
} {
  const { data, isLoading, error } = useStructure()
  return {
    rows: data === null || data === undefined ? [] : pick(data),
    loading: isLoading,
    error: (error as { message?: string } | null) ?? null,
    missing: !isLoading && (data === null || data === undefined),
  }
}

const EFFECT_LABEL = { read: 'Leitura', write: 'Escrita' } as const

/** Sim, não ou a ausência de declaração — a ausência é informação, não um "não". */
const declared = (value: boolean | undefined): React.ReactNode =>
  value === undefined ? <EmptyValue compact label="Não declarado" /> : value ? 'Sim' : 'Não'

function aiCell(action: StructureAction): React.ReactNode {
  // Manifesto gerado antes de o Opus projetar `ai`: não dá para dizer se a action é publicada.
  if (action.ai === undefined) return <EmptyValue compact label="O manifesto não informa" />
  if (!action.ai.enabled) return 'Não'
  const guard = action.ai.destructive ? 'Destrutiva' : action.ai.requiresConfirmation ? 'Pede confirmação' : null
  return (
    <div>
      <div>Publicada</div>
      {guard !== null && <div className="text-xs text-muted-foreground">{guard}</div>}
    </div>
  )
}

export function ActionsView(): React.ReactElement {
  const { rows, loading, error, missing } = useDeclarations((s) => s.actions)
  if (missing) return <ManifestMissing />
  const columns: Column<(typeof rows)[number]>[] = [
    { header: 'Ação', cell: (a) => <span className={mono}>{a.name}</span> },
    {
      header: 'Tipo',
      cell: (a) => (
        <Badge variant="outline" className={mono}>
          {a.kind}
        </Badge>
      ),
      className: 'w-24',
    },
    {
      header: 'Domínio',
      cell: (a) => <span className="text-muted-foreground">{a.domain}</span>,
      className: 'w-40',
    },
    {
      header: 'Permissão',
      cell: (a) =>
        a.permission === undefined ? doc(undefined) : <span className={mono}>{a.permission}</span>,
      className: 'w-40',
    },
    {
      header: 'Efeito',
      cell: (a) => (a.effect === undefined ? <EmptyValue compact label="Não declarado" /> : EFFECT_LABEL[a.effect]),
      className: 'w-24',
    },
    { header: 'Dado pessoal', cell: (a) => declared(a.personalData), className: 'w-28' },
    { header: 'IA', cell: aiCell, className: 'w-36' },
    {
      header: 'Assistente',
      cell: (a) =>
        a.assistant !== undefined ? (
          <span className={mono}>{a.assistant.resource}</span>
        ) : a.ai === undefined ? (
          // O assistente chega junto com `ai` no manifesto (Opus 25.2); sem `ai`, a ausência não diz nada.
          <EmptyValue compact label="O manifesto não informa" />
        ) : (
          <EmptyValue compact label="Sem assistente" />
        ),
      className: 'w-40',
    },
    {
      header: 'Emite / invalida',
      cell: (a) => <span className="tabular-nums text-muted-foreground">{a.invalidates.length}</span>,
      className: 'w-32 text-right',
    },
    { header: 'Descrição', cell: (a) => doc(a.description) },
  ]
  return (
    <DeclarationTable
      rows={rows}
      columns={columns}
      loading={loading}
      error={error}
      search={(a) => `${a.name} ${a.domain} ${a.description ?? ''} ${a.assistant?.resource ?? ''}`}
      emptyMessage="Nenhuma ação declarada."
    />
  )
}

/**
 * Os assistentes de recurso: a action dona de cada tipo, a Habilidade que a IA segue e os campos
 * que o host pode entregar ao modelo (ADR 0053 do Opus).
 */
export function AssistantsView(): React.ReactElement {
  const { data } = useStructure()
  const { rows, loading, error, missing } = useDeclarations((s) =>
    s.actions.flatMap((action) =>
      action.assistant === undefined ? [] : [{ action, assistant: action.assistant }],
    ),
  )
  if (missing) return <ManifestMissing />
  if (!loading && error === null && rows.length === 0) {
    // Só um manifesto com actions e nenhuma `ai` é anterior ao Opus 25.2; sem actions, não há o que
    // dizer sobre a versão.
    const actions = data?.actions ?? []
    const predatesAi = actions.length > 0 && actions.every((action) => action.ai === undefined)
    return (
      <Empty>
        <EmptyHeader>
          {predatesAi ? (
            <>
              <EmptyTitle>O manifesto não informa os assistentes</EmptyTitle>
              <EmptyDescription>
                Ele foi gerado por uma versão do Opus anterior à 25.2, que não projeta a publicação para a
                IA nem os assistentes. Atualize o Opus e execute{' '}
                <code className="font-mono text-xs">opus gen</code>.
              </EmptyDescription>
            </>
          ) : (
            <>
              <EmptyTitle>Nenhuma ação declara assistente</EmptyTitle>
              <EmptyDescription>
                Uma ação <code className="font-mono text-xs">view</code> passa a ser a dona de um tipo de
                recurso quando declara <code className="font-mono text-xs">assistant</code> no contrato.
              </EmptyDescription>
            </>
          )}
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <DeclarationTable
      rows={rows}
      loading={loading}
      error={error}
      search={({ action, assistant }) =>
        `${assistant.resource} ${assistant.label} ${assistant.skill} ${action.name} ${assistant.context.join(' ')}`
      }
      emptyMessage="Nenhuma ação declara assistente."
      columns={[
        {
          header: 'Recurso',
          cell: ({ assistant }) => <span className={mono}>{assistant.resource}</span>,
          className: 'w-40',
        },
        { header: 'Assistente', cell: ({ assistant }) => assistant.label, className: 'w-48' },
        {
          header: 'Ação dona',
          cell: ({ action }) => <span className={mono}>{action.name}</span>,
          className: 'w-56',
        },
        {
          header: 'Habilidade',
          cell: ({ assistant }) => <span className={mono}>{assistant.skill}</span>,
          className: 'w-48',
        },
        {
          header: 'Título',
          cell: ({ assistant }) => <span className={mono}>{assistant.title}</span>,
          className: 'w-32',
        },
        {
          header: 'Campos enviados ao modelo',
          cell: ({ assistant }) =>
            assistant.context.length === 0 ? (
              <EmptyValue compact label="Nenhum campo" />
            ) : (
              <div className="flex flex-wrap gap-1">
                {assistant.context.map((path) => (
                  <Badge key={path} context="neutral" variant="solid" className={mono}>
                    {path}
                  </Badge>
                ))}
              </div>
            ),
        },
        {
          header: 'Teto',
          cell: ({ assistant }) =>
            assistant.maxContextChars === undefined ? (
              <EmptyValue compact label="O manifesto não informa" />
            ) : (
              <span className="tabular-nums">{assistant.maxContextChars.toLocaleString('pt-BR')}</span>
            ),
          className: 'w-24 text-right',
        },
        { header: 'Dado pessoal', cell: ({ action }) => declared(action.personalData), className: 'w-28' },
      ]}
    />
  )
}

export function PresentationsView(): React.ReactElement {
  const { rows, loading, error, missing } = useDeclarations((s) => s.presentations)
  if (missing) return <ManifestMissing />
  return (
    <DeclarationTable
      rows={rows}
      loading={loading}
      error={error}
      search={(presentation) =>
        `${presentation.id} ${presentation.title} ${presentation.body} ${presentation.actions.join(' ')}`
      }
      emptyMessage="Nenhuma Presentation registrada no manifest."
      columns={[
        {
          header: 'Presentation',
          cell: (presentation) => <span className={mono}>{presentation.id}</span>,
          className: 'w-64',
        },
        { header: 'Título', cell: (presentation) => presentation.title },
        {
          header: 'Corpo',
          cell: (presentation) => <span className={mono}>{presentation.body}</span>,
          className: 'w-56',
        },
        {
          header: 'Ações',
          cell: (presentation) => (
            <span className="tabular-nums text-muted-foreground">{presentation.actions.length}</span>
          ),
          className: 'w-20 text-right',
        },
        {
          header: '',
          cell: (presentation) => (
            <PresentationInspector
              definition={presentation.definition}
              triggerLabel={`Ver JSON de ${presentation.title}`}
              title={presentation.title}
            />
          ),
          className: 'w-12 text-right',
        },
      ]}
    />
  )
}

export function EntitiesView(): React.ReactElement {
  const { rows, loading, error, missing } = useDeclarations((s) => s.entities)
  if (missing) return <ManifestMissing />
  return (
    <DeclarationTable
      rows={rows}
      loading={loading}
      error={error}
      search={(e) => `${e.name} ${e.table ?? ''} ${e.domain}`}
      emptyMessage="Nenhuma entidade declarada."
      columns={[
        { header: 'Entidade', cell: (e) => <span className={mono}>{e.name}</span> },
        {
          header: 'Tabela',
          cell: (e) =>
            e.table === undefined ? (
              <EmptyValue compact label="Sem tabela" />
            ) : (
              <span className="font-mono text-xs text-muted-foreground">{e.table}</span>
            ),
          className: 'w-56',
        },
        {
          header: 'Campos',
          cell: (e) => <span className="tabular-nums">{e.fields.length}</span>,
          className: 'w-20 text-right',
        },
        {
          header: 'Relações',
          cell: (e) => <span className="tabular-nums">{e.relationCount}</span>,
          className: 'w-24 text-right',
        },
        { header: 'Descrição', cell: (e) => doc(e.description) },
      ]}
    />
  )
}

export function FieldsView(): React.ReactElement {
  const { rows, loading, error, missing } = useDeclarations((s) =>
    s.entities.flatMap((entity) => entity.fields.map((field) => ({ entity: entity.name, ...field }))),
  )
  if (missing) return <ManifestMissing />
  return (
    <DeclarationTable
      rows={rows}
      loading={loading}
      error={error}
      search={(f) => `${f.entity} ${f.name} ${f.type}`}
      emptyMessage="Nenhum campo declarado."
      columns={[
        {
          header: 'Entidade',
          cell: (f) => <span className="font-mono text-xs text-muted-foreground">{f.entity}</span>,
          className: 'w-48',
        },
        { header: 'Campo', cell: (f) => <span className={mono}>{f.name}</span>, className: 'w-48' },
        {
          header: 'Tipo',
          cell: (f) => (
            <span className="font-mono text-xs">
              {f.type}
              {f.pk ? ' · pk' : ''}
            </span>
          ),
          className: 'w-40',
        },
        {
          header: 'Nulo',
          cell: (f) => <span className="text-muted-foreground">{f.nullable ? 'Sim' : 'Não'}</span>,
          className: 'w-20',
        },
        { header: 'Documentação', cell: (f) => doc(f.doc) },
      ]}
    />
  )
}

export function ReactionsView(): React.ReactElement {
  const { rows, loading, error, missing } = useDeclarations((s) => s.reactions)
  if (missing) return <ManifestMissing />
  return (
    <DeclarationTable
      rows={rows}
      loading={loading}
      error={error}
      search={(r) => `${r.name} ${r.on.join(' ')}`}
      emptyMessage="Nenhuma reação declarada. Reações são acionadas quando uma ação publica um evento de domínio."
      columns={[
        { header: 'Reação', cell: (r) => <span className={mono}>{r.name}</span>, className: 'w-64' },
        {
          header: 'Acionada por',
          cell: (r) => (
            <div className="flex flex-wrap gap-1">
              {r.on.map((event) => (
                <Badge key={event} context="neutral" variant="solid" className={mono}>
                  {event}
                </Badge>
              ))}
            </div>
          ),
        },
        { header: 'Descrição', cell: (r) => doc(r.description) },
      ]}
    />
  )
}

export function SchedulesView(): React.ReactElement {
  const { rows, loading, error, missing } = useDeclarations((s) => s.schedules)
  if (missing) return <ManifestMissing />
  return (
    <DeclarationTable
      rows={rows}
      loading={loading}
      error={error}
      emptyMessage="Nenhum agendamento declarado. Agendamentos são ações disparadas pelo relógio."
      columns={[
        { header: 'Agendamento', cell: (s) => <span className={mono}>{s.name}</span>, className: 'w-64' },
        { header: 'Executa', cell: (s) => <span className={mono}>{s.action}</span>, className: 'w-64' },
        { header: 'Quando', cell: (s) => <span className={mono}>{s.when}</span>, className: 'w-40' },
        {
          header: 'Ativo',
          cell: (s) => (
            <Badge context="neutral" variant={s.enabled ? 'solid' : 'outline'}>
              {s.enabled ? 'Sim' : 'Não'}
            </Badge>
          ),
          className: 'w-24',
        },
        { header: 'Descrição', cell: (s) => doc(s.description) },
      ]}
    />
  )
}

export function DictsView(): React.ReactElement {
  const { rows, loading, error, missing } = useDeclarations((s) => s.dicts)
  if (missing) return <ManifestMissing />
  return (
    <DeclarationTable
      rows={rows}
      loading={loading}
      error={error}
      emptyMessage="Nenhum dicionário declarado. Um domínio lista em `dicts` os vocabulários compartilhados usados pelos contratos."
      columns={[
        { header: 'Dicionário', cell: (d) => <span className={mono}>{d.name}</span>, className: 'w-64' },
        {
          header: 'Domínio',
          cell: (d) => <span className="text-muted-foreground">{d.domain}</span>,
          className: 'w-48',
        },
        {
          header: 'Entradas',
          cell: (d) => <span className="tabular-nums">{d.entryCount}</span>,
          className: 'w-24 text-right',
        },
        { header: 'Descrição', cell: (d) => doc(d.description) },
      ]}
    />
  )
}

export function PermissionsView(): React.ReactElement {
  const { rows, loading, error, missing } = useDeclarations((s) => s.permissions)
  if (missing) return <ManifestMissing />
  return (
    <DeclarationTable
      rows={rows}
      loading={loading}
      error={error}
      search={(p) => `${p.name} ${p.actions.join(' ')}`}
      emptyMessage="Nenhuma ação declara uma permissão."
      columns={[
        { header: 'Permissão', cell: (p) => <span className={mono}>{p.name}</span>, className: 'w-56' },
        {
          header: 'Ações',
          cell: (p) => <span className="tabular-nums">{p.actions.length}</span>,
          className: 'w-24 text-right',
        },
        {
          header: 'Protege',
          cell: (p) => (
            <div className="flex flex-wrap gap-1">
              {p.actions.map((action) => (
                <Badge key={action} context="neutral" variant="solid" className={mono}>
                  {action}
                </Badge>
              ))}
            </div>
          ),
        },
      ]}
    />
  )
}

export function DocsView(): React.ReactElement {
  const { data: docs, isLoading, error } = useDocs()
  if (!isLoading && (docs === null || docs === undefined)) return <ManifestMissing />
  const percent =
    docs === null || docs === undefined || docs.total === 0
      ? 0
      : Math.round((docs.documented / docs.total) * 100)
  const fields = docs?.fields ?? { total: 0, documented: 0 }
  const fieldPercent = fields.total === 0 ? 0 : Math.round((fields.documented / fields.total) * 100)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Declarações"
          value={`${percent}%`}
          description={
            <>
              <div className="mb-1.5 h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full bg-foreground/70" style={{ width: `${percent}%` }} />
              </div>
              {docs?.documented ?? 0} de {docs?.total ?? 0} ações e entidades têm descrição.
            </>
          }
        />
        <MetricCard
          label="Campos das entidades"
          value={`${fieldPercent}%`}
          description={
            <>
              <div className="mb-1.5 h-1.5 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-context-info-emphasis"
                  style={{ width: `${fieldPercent}%` }}
                />
              </div>
              {fields.documented} de {fields.total} campos documentados.
            </>
          }
        />
      </div>
      {(docs?.gaps.length ?? 0) === 0 ? (
        // Sem lacuna, uma tabela de lacunas é só um cabeçalho mudo: o estado positivo é a resposta.
        <Surface framed elevation="raised" className="p-5">
          <p className="text-sm text-muted-foreground">
            Todas as ações, entidades e campos declarados têm descrição.
          </p>
        </Surface>
      ) : (
        <DeclarationTable
          rows={docs?.gaps ?? []}
          loading={isLoading}
          error={(error as { message?: string } | null) ?? null}
          search={(gap) => `${gap.name} ${gap.domain}`}
          emptyMessage="Nenhum resultado corresponde ao filtro."
          columns={[
            { header: 'Tipo', cell: (gap) => <Badge variant="outline">{gap.kind}</Badge>, className: 'w-28' },
            {
              header: 'Domínio',
              cell: (gap) => <span className="text-muted-foreground">{gap.domain}</span>,
              className: 'w-48',
            },
            { header: 'Sem descrição', cell: (gap) => <span className={mono}>{gap.name}</span> },
          ]}
        />
      )}
    </div>
  )
}
