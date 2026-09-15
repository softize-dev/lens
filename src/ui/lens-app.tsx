/**
 * Lens — a casca do painel.
 *
 * Duas leituras sobre o mesmo projeto: o que uma requisição FEZ e o que o projeto
 * DECLARA. A navegação espelha essa divisão, e a rota mora no endereço para que qualquer
 * tela possa ser colada num chat ou num commit — inclusive uma requisição específica.
 *
 * A interface é em pt-BR. Identificadores, comandos e dados técnicos permanecem na forma
 * declarada pelo projeto.
 */
import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  Bot,
  BookMarked,
  Boxes,
  Clock,
  Columns3,
  Database,
  GitBranch,
  GraduationCap,
  FileText,
  FlaskConical,
  KeyRound,
  LayoutTemplate,
  Package,
  Plug,
  RefreshCw,
  Radio,
  ScrollText,
  ShieldCheck,
  Webhook,
  Zap,
} from 'lucide-react'
import { Button, PaneBody, PaneHeader, Sidebar, SidebarNav } from '@softize/opus/ui/react'
import { RequestsView } from './views/requests.tsx'
import {
  ActionsView,
  DictsView,
  DocsView,
  EntitiesView,
  FieldsView,
  OverviewView,
  PermissionsView,
  PresentationsView,
  ReactionsView,
  SchedulesView,
} from './views/code.tsx'
import { ConformityView, OpusView, TestsView } from './views/project.tsx'
import { WiringView } from './views/wiring.tsx'
import { AgentsView, HooksView, InstructionsView, McpView, SkillsView } from './views/ai.tsx'
import { useLensAddress } from './config.tsx'

interface ViewSpec {
  id: string
  label: string
  title: string
  description: string
  icon: React.ReactNode
  render: () => React.ReactElement
}

const size = 'size-4'

const TELEMETRY: ViewSpec[] = [
  {
    id: 'requests',
    label: 'Requisições',
    title: 'Requisições',
    description: 'O que cada requisição fez — ações, consultas, tarefas, eventos e chamadas de modelo.',
    icon: <Activity className={size} />,
    render: () => <></>,
  },
]

const CODE: ViewSpec[] = [
  {
    id: 'overview',
    label: 'Visão geral',
    title: 'Visão geral',
    description: 'O que este projeto declara, reunido em uma tela.',
    icon: <Boxes className={size} />,
    render: () => <OverviewView />,
  },
  {
    id: 'wiring',
    label: 'Encadeamento',
    title: 'Encadeamento',
    description: 'O que dispara o quê: relógio → ação → evento → reação.',
    icon: <GitBranch className={size} />,
    render: () => <WiringView />,
  },
  {
    id: 'actions',
    label: 'Ações',
    title: 'Ações',
    description: 'Todas as ações que a plataforma pode executar.',
    icon: <Zap className={size} />,
    render: () => <ActionsView />,
  },
  {
    id: 'presentations',
    label: 'Presentations',
    title: 'Presentations',
    description: 'Recursos declarativos que podem ocupar Page, Dialog ou Drawer.',
    icon: <LayoutTemplate className={size} />,
    render: () => <PresentationsView />,
  },
  {
    id: 'entities',
    label: 'Entidades',
    title: 'Entidades',
    description: 'As estruturas que chegam ao armazenamento.',
    icon: <Database className={size} />,
    render: () => <EntitiesView />,
  },
  {
    id: 'fields',
    label: 'Campos',
    title: 'Campos',
    description: 'Todos os campos das entidades, com a documentação de negócio correspondente.',
    icon: <Columns3 className={size} />,
    render: () => <FieldsView />,
  },
  {
    id: 'reactions',
    label: 'Reações',
    title: 'Reações',
    description: 'O que é acionado quando um evento de domínio é publicado.',
    icon: <Radio className={size} />,
    render: () => <ReactionsView />,
  },
  {
    id: 'schedules',
    label: 'Agendamentos',
    title: 'Agendamentos',
    description: 'Ações disparadas pelo relógio.',
    icon: <Clock className={size} />,
    render: () => <SchedulesView />,
  },
  {
    id: 'dicts',
    label: 'Dicionários',
    title: 'Dicionários',
    description: 'Vocabulários compartilhados usados pelos contratos.',
    icon: <BookMarked className={size} />,
    render: () => <DictsView />,
  },
  {
    id: 'permissions',
    label: 'Permissões',
    title: 'Permissões',
    description: 'Quais permissões protegem cada ação.',
    icon: <KeyRound className={size} />,
    render: () => <PermissionsView />,
  },
  {
    id: 'docs',
    label: 'Documentação',
    title: 'Documentação',
    description: 'Quais declarações ainda não têm descrição.',
    icon: <FileText className={size} />,
    render: () => <DocsView />,
  },
  {
    id: 'conformity',
    label: 'Conformidade',
    title: 'Conformidade',
    description: 'A régua do Opus aplicada a este código e os problemas encontrados.',
    icon: <ShieldCheck className={size} />,
    render: () => <ConformityView />,
  },
  {
    id: 'tests',
    label: 'Testes',
    title: 'Testes',
    description: 'Quais testes existem e quais declarações eles não mencionam.',
    icon: <FlaskConical className={size} />,
    render: () => <TestsView />,
  },
  {
    id: 'opus',
    label: 'Opus',
    title: 'Opus',
    description: 'Versões aplicada, instalada e adotada, que podem divergir.',
    icon: <Package className={size} />,
    render: () => <OpusView />,
  },
]

const AI: ViewSpec[] = [
  {
    id: 'agents',
    label: 'Agentes',
    title: 'Agentes',
    description: 'Agentes que este repositório oferece a quem o abre.',
    icon: <Bot className={size} />,
    render: () => <AgentsView />,
  },
  {
    id: 'skills',
    label: 'Habilidades',
    title: 'Habilidades',
    description: 'Habilidades versionadas com o código.',
    icon: <GraduationCap className={size} />,
    render: () => <SkillsView />,
  },
  {
    id: 'instructions',
    label: 'Instruções',
    title: 'Instruções',
    description: 'O que toda sessão de agente carrega antes de começar.',
    icon: <ScrollText className={size} />,
    render: () => <InstructionsView />,
  },
  {
    id: 'hooks',
    label: 'Gatilhos',
    title: 'Gatilhos',
    description: 'Comandos executados pela CLI antes ou depois do uso de ferramentas.',
    icon: <Webhook className={size} />,
    render: () => <HooksView />,
  },
  {
    id: 'mcp',
    label: 'Servidores MCP',
    title: 'Servidores MCP',
    description: 'Servidores de ferramentas que usam o protocolo MCP e estão declarados neste projeto.',
    icon: <Plug className={size} />,
    render: () => <McpView />,
  },
]

const ALL = [...TELEMETRY, ...CODE, ...AI]

/**
 * O endereço é a fonte da navegação: `<base>/<view>` e `<base>/r/<request>`. Um caminho
 * fora do prefixo, ou uma view desconhecida, abre nas requisições.
 */
export function routeFromPath(path: string, basePath: string): { view: string; record: string | null } {
  const rest = path === basePath || path.startsWith(`${basePath}/`) ? path.slice(basePath.length) : ''
  const deep = rest.match(/^\/r\/(.+)$/)
  if (deep !== null) return { view: 'requests', record: decodeURIComponent(deep[1]!) }
  const view = rest.replace(/^\//, '').replace(/\/$/, '')
  return { view: ALL.some((spec) => spec.id === view) ? view : 'requests', record: null }
}

export function LensApp(): React.ReactElement {
  const queryClient = useQueryClient()
  const { basePath } = useLensAddress()
  const [route, setRoute] = useState(() => routeFromPath(location.pathname, basePath))

  useEffect(() => {
    const onPop = (): void => {
      setRoute(routeFromPath(location.pathname, basePath))
    }
    addEventListener('popstate', onPop)
    return () => {
      removeEventListener('popstate', onPop)
    }
  }, [basePath])

  const go = useCallback(
    (view: string, record: string | null = null): void => {
      const path = record === null ? `${basePath}/${view}` : `${basePath}/r/${encodeURIComponent(record)}`
      history.pushState(null, '', path)
      setRoute({ view, record })
    },
    [basePath],
  )

  const current = ALL.find((spec) => spec.id === route.view) ?? ALL[0]!

  return (
    <div className="flex h-dvh w-full">
      <Sidebar>
        <PaneHeader className="px-4 py-3.5">
          <span className="font-mono text-sm font-semibold tracking-tight">Lens</span>
          <p className="text-xs text-muted-foreground">Visão de desenvolvimento deste projeto</p>
        </PaneHeader>
        <PaneBody className="py-3">
          <SidebarNav
            navLabel="Lentes"
            activeId={route.view}
            onSelect={(id) => {
              go(id)
            }}
            groups={[
              { label: 'Telemetria', items: TELEMETRY.map(({ id, label, icon }) => ({ id, label, icon })) },
              { label: 'Código', items: CODE.map(({ id, label, icon }) => ({ id, label, icon })) },
              { label: 'AI', items: AI.map(({ id, label, icon }) => ({ id, label, icon })) },
            ]}
          />
        </PaneBody>
      </Sidebar>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-end justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">{current.title}</h1>
            <p className="text-sm text-muted-foreground">{current.description}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw />}
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['lens'] })
            }}
          >
            Atualizar
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {current.id === 'requests' ? (
            <RequestsView
              selected={route.record}
              onSelect={(key) => {
                go('requests', key)
              }}
            />
          ) : (
            <div className="px-6 py-6">{current.render()}</div>
          )}
        </div>
      </main>
    </div>
  )
}
