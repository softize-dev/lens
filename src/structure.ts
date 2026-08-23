/**
 * Lente de estrutura — o que o projeto declara (ADR 0054).
 *
 * A fonte é `.opus/manifest.json`, a projeção que o `opus gen` produz a partir das
 * declarações. É de propósito: quem sabe o que é uma action, uma entidade ou um
 * dicionário é o Opus, e o manifest é o formato em que ele publica esse entendimento —
 * com a documentação de negócio junto. A lente lê e apresenta; não reimplementa o
 * reconhecimento das declarações, que é o erro que a ADR mandou não repetir.
 *
 * Sem manifest, a leitura devolve `null` em vez de adivinhar: um projeto que não gerou a
 * projeção precisa rodar `opus gen`, e dizer isso é mais útil que uma lista incompleta.
 */
import { readFileSync } from 'node:fs'

export interface StructureField {
  name: string
  type: string
  nullable: boolean
  pk: boolean
  references: string | null
  doc?: string
}

export interface StructureEntity {
  domain: string
  name: string
  table?: string
  description?: string
  fields: StructureField[]
  relationCount: number
}

export interface StructureAction {
  domain: string
  name: string
  kind: string
  description?: string
  permission?: string
  tags: string[]
  invalidates: string[]
}

export interface StructureReaction {
  domain: string
  name: string
  on: string[]
  description?: string
}

export interface StructureSchedule {
  domain: string
  name: string
  action: string
  when: string
  enabled: boolean
  description?: string
}

export interface StructureDict {
  domain: string
  name: string
  description?: string
  entryCount: number
}

/** Uma permissão do RBAC e o que ela protege. Derivada das actions, não declarada à parte. */
export interface StructurePermission {
  name: string
  actions: string[]
}

export interface StructureDomain {
  name: string
  description?: string
  actions: number
  entities: number
}

export interface Structure {
  source: 'manifest'
  opusVersion?: string
  domains: StructureDomain[]
  actions: StructureAction[]
  entities: StructureEntity[]
  dicts: StructureDict[]
  reactions: StructureReaction[]
  schedules: StructureSchedule[]
  permissions: StructurePermission[]
}

/** O manifest é dado gerado; a leitura aceita ausência de campo sem quebrar. */
interface RawDomain {
  name?: unknown
  description?: unknown
  actions?: unknown[]
  entities?: unknown[]
  dicts?: unknown
  reactions?: unknown[]
  schedules?: unknown
  subdomains?: unknown
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/** Aceita coleção em lista ou em mapa; devolve sempre pares chave/valor. */
function entries(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const name = (item as Record<string, unknown> | null)?.['name']
      return [typeof name === 'string' ? name : String(index), item]
    })
  }
  if (value !== null && typeof value === 'object') return Object.entries(value as Record<string, unknown>)
  return []
}

function optional(key: string, value: unknown): Record<string, string> {
  const text = str(value)
  return text === undefined ? {} : { [key]: text }
}

export function readStructure(path: string): Structure | null {
  let raw: { opusVersion?: unknown; domains?: unknown }
  try {
    raw = JSON.parse(readFileSync(path, 'utf8')) as { opusVersion?: unknown; domains?: unknown }
  } catch {
    return null
  }
  const domains = Array.isArray(raw.domains) ? (raw.domains as RawDomain[]) : []

  const structure: Structure = {
    source: 'manifest',
    ...optional('opusVersion', raw.opusVersion),
    domains: [],
    actions: [],
    entities: [],
    dicts: [],
    reactions: [],
    schedules: [],
    permissions: [],
  }

  const visit = (domain: RawDomain, prefix: string): void => {
    const name = prefix + (str(domain.name) ?? '—')
    const actions = Array.isArray(domain.actions) ? domain.actions : []
    const entities = Array.isArray(domain.entities) ? domain.entities : []

    structure.domains.push({
      name,
      ...optional('description', domain.description),
      actions: actions.length,
      entities: entities.length,
    })

    for (const item of actions as Record<string, unknown>[]) {
      structure.actions.push({
        domain: name,
        name: str(item['name']) ?? '—',
        kind: str(item['kind']) ?? 'simple',
        ...optional('description', item['description'] ?? item['summary']),
        ...optional('permission', item['permission']),
        tags: list(item['tags']),
        invalidates: list(item['invalidates']),
      })
    }

    for (const item of entities as Record<string, unknown>[]) {
      const fields = Array.isArray(item['fields']) ? (item['fields'] as Record<string, unknown>[]) : []
      structure.entities.push({
        domain: name,
        name: str(item['name']) ?? '—',
        ...optional('table', item['table']),
        ...optional('description', item['description']),
        fields: fields.map((field) => ({
          name: str(field['name']) ?? '—',
          type: str(field['logicalType']) ?? str(field['type']) ?? 'unknown',
          nullable: field['nullable'] === true,
          pk: field['pk'] === true,
          references: str(field['references']) ?? null,
          ...optional('doc', field['doc']),
        })),
        relationCount: Array.isArray(item['relations']) ? item['relations'].length : 0,
      })
    }

    // Dicionários chegam como MAPA (`{ nome: definição }`), não como lista — as demais
    // coleções do manifest são listas. Tratar os dois formatos evita que uma projeção
    // futura em outro formato derrube a leitura inteira.
    for (const [key, value] of entries(domain.dicts)) {
      const item = (value ?? {}) as Record<string, unknown>
      structure.dicts.push({
        domain: name,
        name: str(item['name']) ?? key,
        ...optional('description', item['description']),
        entryCount: Array.isArray(item['entries']) ? item['entries'].length : 0,
      })
    }

    for (const item of (Array.isArray(domain.reactions) ? domain.reactions : []) as Record<string, unknown>[]) {
      structure.reactions.push({
        domain: name,
        name: str(item['name']) ?? '—',
        on: list(item['on']),
        ...optional('description', item['description']),
      })
    }

    for (const item of (Array.isArray(domain.schedules) ? domain.schedules : []) as Record<string, unknown>[]) {
      structure.schedules.push({
        domain: name,
        name: str(item['name']) ?? '—',
        action: str(item['action']) ?? '—',
        when: str(item['cron']) ?? str(item['every']) ?? '—',
        enabled: item['enabled'] !== false,
        ...optional('description', item['description']),
      })
    }

    // Subdomínios declaram como domínios; omiti-los faria a lente mostrar menos do que o
    // projeto tem, em silêncio — que é o pior defeito possível numa lente.
    for (const [key, value] of entries(domain.subdomains)) {
      const child = (value ?? {}) as RawDomain
      visit({ ...child, name: str(child.name) ?? key }, name + '/')
    }
  }

  for (const domain of domains) visit(domain, '')

  // Quem pode o quê é uma pergunta de leitura frequente, e a resposta já está espalhada
  // pelas actions: agrupar aqui evita que cada tela refaça o agrupamento à mão.
  const byPermission = new Map<string, string[]>()
  for (const action of structure.actions) {
    if (action.permission === undefined) continue
    const current = byPermission.get(action.permission) ?? []
    current.push(action.name)
    byPermission.set(action.permission, current)
  }
  structure.permissions = [...byPermission.entries()]
    .map(([name, actions]) => ({ name, actions: actions.sort() }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return structure
}

export interface DocGap {
  kind: 'action' | 'entity'
  domain: string
  name: string
}

export interface DocCoverage {
  total: number
  documented: number
  gaps: DocGap[]
  /** Campos de entidade sem documentação — sinal mais fino que o total por declaração. */
  fields: { total: number; documented: number }
}

/**
 * No manifest a documentação de negócio vive colada à declaração, então cobertura aqui é
 * quantas declarações têm `description` — não a existência de um documento à parte.
 */
export function docCoverage(structure: Structure): DocCoverage {
  const gaps: DocGap[] = []
  for (const action of structure.actions) {
    if (action.description === undefined) gaps.push({ kind: 'action', domain: action.domain, name: action.name })
  }
  for (const entity of structure.entities) {
    if (entity.description === undefined) gaps.push({ kind: 'entity', domain: entity.domain, name: entity.name })
  }
  const total = structure.actions.length + structure.entities.length
  const fields = structure.entities.flatMap((entity) => entity.fields)
  return {
    total,
    documented: total - gaps.length,
    gaps,
    fields: { total: fields.length, documented: fields.filter((field) => field.doc !== undefined).length },
  }
}
