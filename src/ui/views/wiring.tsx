/**
 * Encadeamento — o que dispara o quê.
 *
 * A declaração já contém a cadeia inteira: o relógio aciona uma action, a action publica
 * um evento, o evento acorda uma reaction. Espalhada por dezenas de arquivos, ninguém
 * enxerga; num desenho só, é a leitura que responde "o que acontece se eu chamar isso".
 *
 * Só entra no desenho quem participa de alguma cadeia — as 189 actions inteiras seriam
 * uma parede, e a pergunta aqui não é "o que existe", é "o que se conecta".
 */
import { useMemo, useState } from 'react'
import type { Structure } from '../../index.ts'
import {
  Badge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@softize/opus/ui/react'
import { useStructure } from '../data.ts'
import { ManifestMissing } from './missing.tsx'

/**
 * Geometria do desenho em `rem`: nós e ligações escalam junto com a fonte da interface.
 * O SVG das ligações usa o mesmo sistema de unidades via `viewBox`, então um "1" no path
 * é 1 rem na tela.
 */
const COLUMN_WIDTH = 10.5
const COLUMN_GAP = 3.5
const ROW_HEIGHT = 2.75
const NODE_HEIGHT = 1.875

type NodeKind = 'schedule' | 'action' | 'event' | 'reaction'

interface Node {
  id: string
  label: string
  kind: NodeKind
  column: number
  row: number
}

/** Cada coluna tem seu contexto: a cor reforça a legenda do cabeçalho, não a substitui. */
const TONE: Record<NodeKind, string> = {
  schedule: 'border-context-info-border bg-context-info-subtle text-context-info-emphasis',
  action: 'border-context-primary-border bg-context-primary-subtle text-context-primary-emphasis',
  event: 'border-context-warning-border bg-context-warning-subtle text-context-warning-emphasis',
  reaction: 'border-context-success-border bg-context-success-subtle text-context-success-emphasis',
}

const COLUMN_LABEL = ['Relógio', 'Ação', 'Evento', 'Reação']

function buildGraph(
  structure: Structure,
  domain: string | null,
): { nodes: Node[]; edges: [string, string][]; width: number; height: number } {
  const inDomain = <T extends { domain: string }>(item: T): boolean =>
    domain === null || item.domain === domain

  const actions = structure.actions.filter((action) => inDomain(action) && action.emits.length > 0)
  const emitted = new Set(actions.flatMap((action) => action.emits))
  const reactions = structure.reactions.filter(
    (reaction) => inDomain(reaction) && reaction.on.some((event) => emitted.has(event)),
  )
  // Um schedule entra pelo alvo: é ele que liga o relógio a uma action já no desenho.
  const targets = new Set(actions.map((action) => action.name))
  const schedules = structure.schedules.filter((schedule) => targets.has(schedule.action))

  const events = [...emitted].sort()
  const columns: Node[][] = [
    schedules.map((schedule) => ({
      id: `s:${schedule.name}`,
      label: schedule.name,
      kind: 'schedule' as const,
      column: 0,
      row: 0,
    })),
    actions.map((action) => ({
      id: `a:${action.name}`,
      label: action.name,
      kind: 'action' as const,
      column: 1,
      row: 0,
    })),
    events.map((event) => ({ id: `e:${event}`, label: event, kind: 'event' as const, column: 2, row: 0 })),
    reactions.map((reaction) => ({
      id: `r:${reaction.name}`,
      label: reaction.name,
      kind: 'reaction' as const,
      column: 3,
      row: 0,
    })),
  ]
  const nodes = columns.flatMap((column, index) =>
    column.map((node, row) => ({ ...node, column: index, row })),
  )

  const edges: [string, string][] = [
    ...schedules.map((schedule): [string, string] => [`s:${schedule.name}`, `a:${schedule.action}`]),
    ...actions.flatMap((action) =>
      action.emits.map((event): [string, string] => [`a:${action.name}`, `e:${event}`]),
    ),
    ...reactions.flatMap((reaction) =>
      reaction.on
        .filter((event) => emitted.has(event))
        .map((event): [string, string] => [`e:${event}`, `r:${reaction.name}`]),
    ),
  ]
  const rows = Math.max(1, ...columns.map((column) => column.length))
  return {
    nodes,
    edges: edges.filter(([from, to]) => nodes.some((n) => n.id === from) && nodes.some((n) => n.id === to)),
    width: 4 * COLUMN_WIDTH + 3 * COLUMN_GAP,
    height: rows * ROW_HEIGHT,
  }
}

const nodeX = (column: number): number => column * (COLUMN_WIDTH + COLUMN_GAP)
const nodeY = (row: number): number => row * ROW_HEIGHT

export function WiringView(): React.ReactElement {
  const { data: structure } = useStructure()
  const [domain, setDomain] = useState<string | null>(null)
  const graph = useMemo(() => (structure == null ? null : buildGraph(structure, domain)), [structure, domain])

  if (structure == null || graph == null) {
    return <ManifestMissing>O encadeamento vem do manifesto.</ManifestMissing>
  }
  if (graph.nodes.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Ainda não há encadeamento</EmptyTitle>
          <EmptyDescription>Nenhuma ação deste domínio publica um evento.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const position = new Map(graph.nodes.map((node) => [node.id, node]))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            setDomain(null)
          }}
        >
          <Badge context="neutral" variant={domain === null ? 'solid' : 'outline'}>
            Todos os domínios
          </Badge>
        </button>
        {structure.domains.map((item) => (
          <button
            key={item.name}
            type="button"
            onClick={() => {
              setDomain(item.name)
            }}
          >
            <Badge context="neutral" variant={domain === item.name ? 'solid' : 'outline'}>
              {item.name}
            </Badge>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div
          className="grid text-xs uppercase tracking-wide text-muted-foreground"
          style={{ gridTemplateColumns: `repeat(4, ${COLUMN_WIDTH}rem)`, columnGap: `${COLUMN_GAP}rem` }}
        >
          {COLUMN_LABEL.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="relative mt-2" style={{ width: `${graph.width}rem`, height: `${graph.height}rem` }}>
          <svg
            className="absolute inset-0 size-full overflow-visible"
            viewBox={`0 0 ${graph.width} ${graph.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {graph.edges.map(([from, to], index) => {
              const source = position.get(from)
              const target = position.get(to)
              if (source === undefined || target === undefined) return null
              const x1 = nodeX(source.column) + COLUMN_WIDTH
              const y1 = nodeY(source.row) + NODE_HEIGHT / 2
              const x2 = nodeX(target.column)
              const y2 = nodeY(target.row) + NODE_HEIGHT / 2
              const midpoint = x1 + (x2 - x1) / 2
              return (
                <path
                  key={index}
                  d={`M ${x1} ${y1} C ${midpoint} ${y1}, ${midpoint} ${y2}, ${x2} ${y2}`}
                  className="fill-none stroke-border"
                  // Hairline: 1px na tela independentemente da escala do viewBox (que está em rem).
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </svg>
          {graph.nodes.map((node) => (
            <Tooltip key={node.id}>
              <TooltipTrigger asChild>
                <div
                  className={`absolute truncate rounded-md border px-2 py-1.5 font-mono text-xs ${TONE[node.kind]}`}
                  tabIndex={0}
                  style={{
                    left: `${nodeX(node.column)}rem`,
                    top: `${nodeY(node.row)}rem`,
                    width: `${COLUMN_WIDTH}rem`,
                    height: `${NODE_HEIGHT}rem`,
                  }}
                >
                  {node.label}
                </div>
              </TooltipTrigger>
              <TooltipContent className="font-mono">{node.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  )
}
