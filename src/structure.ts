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
import { resolveOpusModule } from './opus-module.ts'

export interface StructureField {
  name: string
  type: string
  nullable: boolean
  pk: boolean
  references: string | null
  doc?: string
}

/** Campo de entrada ou saída de uma action, derivado do schema publicado no manifest. */
export interface StructureParam {
  name: string
  type: string
  optional: boolean
  doc?: string
}

export interface StructureRelation {
  field: string
  target: string
}

export interface DictEntry {
  key: string
  label?: string
  color?: string
}

export interface StructureEntity {
  domain: string
  name: string
  table?: string
  description?: string
  fields: StructureField[]
  relations: StructureRelation[]
  relationCount: number
}

export interface StructureAction {
  domain: string
  name: string
  kind: string
  description?: string
  /** Rótulo e resumo de interface, quando a action os declara. */
  label?: string
  summary?: string
  permission?: string
  /** Pré-condição declarativa; o runtime não a executa (ver `opus check`). */
  requires?: string
  tags: string[]
  /** Eventos que a action publica — a metade que abre a cadeia de causalidade. */
  emits: string[]
  /** Coleções que a action invalida ao concluir. */
  invalidates: string[]
  input: StructureParam[]
  output: StructureParam[]
}

export interface StructureReaction {
  domain: string
  name: string
  on: string[]
  description?: string
  tags: string[]
  /** Descarta repetição do mesmo evento antes de executar. */
  dedup: boolean
  timeout?: number
  concurrency?: number
}

export interface StructureSchedule {
  domain: string
  name: string
  action: string
  when: string
  enabled: boolean
  description?: string
  timezone?: string
  tags: string[]
}

export interface StructureDict {
  domain: string
  name: string
  description?: string
  entries: DictEntry[]
  entryCount: number
}

/** Uma permissão do RBAC e o que ela protege. Derivada das actions, não declarada à parte. */
export interface StructurePermission {
  name: string
  actions: string[]
}

export interface StructureDataProductSource {
  id: string
  label: string
  description?: string
}

/** Produto de Dados governado publicado pelo Opus. */
export interface StructureDataProduct {
  domain: string
  id: string
  version: number | null
  label?: string
  description?: string
  owner?: string
  grain?: string
  classification?: string
  nature?: string
  sources: StructureDataProductSource[]
  entities: string[]
  permissionContexts: string[]
  organizationalScopes: string[]
  interfaces: string[]
  status: 'active' | 'deprecated'
  replacedBy?: string
}

export interface StructureLineageEdge {
  kind: 'source-product' | 'entity-product' | 'product-action'
  from: string
  to: string
}

export interface StructureDomain {
  name: string
  description?: string
  actions: number
  entities: number
  dataProducts: number
}

export interface Structure {
  /**
   * De onde as declarações vieram. `manifest` é a projeção completa, com documentação de
   * negócio; `introspect` é a leitura estática do próprio Opus, que hoje enxerga actions,
   * reactions e schedules — sem entidades, dicionários nem docs. A tela mostra qual está
   * em uso para ninguém confundir "não existe" com "esta fonte não vê".
   */
  source: 'manifest' | 'introspect'
  opusVersion?: string
  domains: StructureDomain[]
  actions: StructureAction[]
  entities: StructureEntity[]
  dataProducts: StructureDataProduct[]
  /** Linhagem derivada das declarações, sem inferir relações pelo nome. */
  lineage: StructureLineageEdge[]
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
  dataProducts?: unknown[]
  dicts?: unknown
  reactions?: unknown[]
  schedules?: unknown
  subdomains?: unknown
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/**
 * Entrada e saída chegam como JSON Schema, que é a projeção honesta do contrato mas não
 * é o que se lê numa tabela. A conversão achata o primeiro nível em campos nomeados —
 * profundidade maior não cabe numa linha e não é o que a tela pergunta.
 */
function paramsOf(value: unknown): StructureParam[] {
  if (value === null || typeof value !== 'object') return []
  const schema = value as { properties?: Record<string, unknown>; required?: unknown }
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((name): name is string => typeof name === 'string') : [])
  return Object.entries(schema.properties ?? {}).map(([name, raw]) => {
    const field = (raw ?? {}) as { type?: unknown; description?: unknown; items?: { type?: unknown } }
    const base = typeof field.type === 'string' ? field.type : 'unknown'
    const type = base === 'array' && typeof field.items?.type === 'string' ? `${field.items.type}[]` : base
    return { name, type, optional: !required.has(name), ...optional('doc', field.description) }
  })
}

function relationsOf(value: unknown): StructureRelation[] {
  if (!Array.isArray(value)) return []
  return value
    .map((raw) => {
      const relation = (raw ?? {}) as { field?: unknown; target?: unknown }
      return { field: str(relation.field) ?? '—', target: str(relation.target) ?? '—' }
    })
    .filter((relation) => relation.field !== '—' || relation.target !== '—')
}

/** Entradas de dicionário chegam em lista ou em mapa `chave → { label, color }`. */
function dictEntries(value: unknown): DictEntry[] {
  return entries(value).map(([key, raw]) => {
    const entry = (raw ?? {}) as { key?: unknown; value?: unknown; label?: unknown; color?: unknown }
    return {
      key: str(entry.key) ?? str(entry.value) ?? key,
      ...optional('label', entry.label),
      ...optional('color', entry.color),
    }
  })
}

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
    dataProducts: [],
    lineage: [],
    dicts: [],
    reactions: [],
    schedules: [],
    permissions: [],
  }

  const visit = (domain: RawDomain, prefix: string): void => {
    const name = prefix + (str(domain.name) ?? '—')
    const actions = Array.isArray(domain.actions) ? domain.actions : []
    const entities = Array.isArray(domain.entities) ? domain.entities : []
    const dataProducts = Array.isArray(domain.dataProducts) ? domain.dataProducts : []

    structure.domains.push({
      name,
      ...optional('description', domain.description),
      actions: actions.length,
      entities: entities.length,
      dataProducts: dataProducts.length,
    })

    for (const item of actions as Record<string, unknown>[]) {
      structure.actions.push({
        domain: name,
        name: str(item['name']) ?? '—',
        kind: str(item['kind']) ?? 'simple',
        ...optional('description', item['description'] ?? item['summary']),
        ...optional('label', item['label']),
        ...optional('summary', item['summary']),
        ...optional('permission', item['permission']),
        ...optional('requires', item['requires']),
        tags: list(item['tags']),
        emits: list(item['emits']),
        invalidates: list(item['invalidates']),
        input: paramsOf(item['input']),
        output: paramsOf(item['output']),
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
        relations: relationsOf(item['relations']),
        relationCount: Array.isArray(item['relations']) ? item['relations'].length : 0,
      })
    }

    for (const item of dataProducts as Record<string, unknown>[]) {
      const id = str(item['id']) ?? '—'
      const access = (item['access'] ?? {}) as Record<string, unknown>
      const sources = (Array.isArray(item['sources']) ? item['sources'] : []).map((rawSource) => {
        const source = (rawSource ?? {}) as Record<string, unknown>
        return {
          id: str(source['id']) ?? '—',
          label: str(source['label']) ?? str(source['id']) ?? '—',
          ...optional('description', source['description']),
        }
      })
      const product: StructureDataProduct = {
        domain: name,
        id,
        version: typeof item['version'] === 'number' ? item['version'] : null,
        ...optional('label', item['label']),
        ...optional('description', item['description']),
        ...optional('owner', item['owner']),
        ...optional('grain', item['grain']),
        ...optional('classification', item['classification']),
        ...optional('nature', item['nature']),
        sources,
        entities: list(item['entities']),
        permissionContexts: list(access['permissionContexts'] ?? access['contexts']),
        organizationalScopes: list(access['organizationalScopes']),
        interfaces: list(item['interfaces']),
        status: item['status'] === 'deprecated' ? 'deprecated' : 'active',
        ...optional('replacedBy', item['replacedBy']),
      }
      structure.dataProducts.push(product)
      for (const source of product.sources) {
        structure.lineage.push({ kind: 'source-product', from: source.id, to: product.id })
      }
      for (const entity of product.entities) {
        structure.lineage.push({ kind: 'entity-product', from: entity, to: product.id })
      }
      for (const action of product.interfaces) {
        structure.lineage.push({ kind: 'product-action', from: product.id, to: action })
      }
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
        entries: dictEntries(item['entries'] ?? item['values']),
        entryCount: Array.isArray(item['entries']) ? item['entries'].length : 0,
      })
    }

    for (const item of (Array.isArray(domain.reactions) ? domain.reactions : []) as Record<string, unknown>[]) {
      structure.reactions.push({
        domain: name,
        name: str(item['name']) ?? '—',
        on: list(item['on']),
        ...optional('description', item['description']),
        tags: list(item['tags']),
        dedup: item['hasDedup'] === true,
        ...(typeof item['timeout'] === 'number' ? { timeout: item['timeout'] } : {}),
        ...(typeof item['concurrency'] === 'number' ? { concurrency: item['concurrency'] } : {}),
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
        ...optional('timezone', item['timezone']),
        tags: list(item['tags']),
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
  kind: 'action' | 'entity' | 'data-product' | 'field'
  domain: string
  /** Para campo, `Entidade.campo` — o nome sozinho não localiza nada. */
  name: string
}

export interface DocCoverage {
  total: number
  documented: number
  /** Toda lacuna, de declaração e de campo — é a lista que diz o que fazer a seguir. */
  gaps: DocGap[]
  /** Campos de entidade, contados à parte: são muito mais numerosos que as declarações
   *  e afundariam a porcentagem que mede action e entidade. */
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
  for (const product of structure.dataProducts) {
    if (product.description === undefined) gaps.push({ kind: 'data-product', domain: product.domain, name: product.id })
  }
  const total = structure.actions.length + structure.entities.length + structure.dataProducts.length
  const documented = total - gaps.length

  // O campo sem doc é a lacuna mais comum e a que estava invisível: a cobertura por
  // declaração pode marcar 100% enquanto dezenas de campos seguem sem explicação.
  const fields = structure.entities.flatMap((entity) => entity.fields.map((field) => ({ entity, field })))
  for (const { entity, field } of fields) {
    if (field.doc === undefined) gaps.push({ kind: 'field', domain: entity.domain, name: `${entity.name}.${field.name}` })
  }

  return {
    total,
    documented,
    gaps,
    fields: { total: fields.length, documented: fields.filter(({ field }) => field.doc !== undefined).length },
  }
}

interface IntrospectAction {
  name?: string | null
  kind?: string | null
  emits?: string[]
  file?: string
}

interface IntrospectResult {
  actions: IntrospectAction[]
  reactions: { name?: string | null; on?: string[]; file?: string }[]
  schedules: { name?: string | null; action?: string | null; cron?: string | null; every?: string | null }[]
  dataProducts?: { id?: string | null; version?: number | null; entities?: string[]; interfaces?: string[]; file?: string }[]
}

interface IntrospectModule {
  introspect: (dir: string) => Promise<IntrospectResult>
}

/** O domínio não é declarado no código: o caminho do arquivo é a melhor pista disponível. */
function domainFromFile(file: string | undefined): string {
  return file?.split('/').find((part) => part !== 'src' && part !== 'domains' && !part.endsWith('.ts')) ?? '—'
}

/**
 * Estrutura do projeto: o manifest quando existe, senão a introspecção do próprio Opus.
 *
 * O fallback é do Opus de propósito. Reimplementar aqui o reconhecimento de `defineAction`
 * seria recriar a duplicação que a ADR 0054 mandou desfazer — a lente apresenta, não é
 * dona do vocabulário. Como o `introspect` ainda não cobre entidades e dicionários, essa
 * leitura vem menor, e é o `source` que conta isso à tela.
 */
export async function inspectStructure(options: { manifest: string; dir: string }): Promise<Structure | null> {
  const fromManifest = readStructure(options.manifest)
  if (fromManifest !== null) return fromManifest

  const { module } = await resolveOpusModule<IntrospectModule>(options.dir, 'introspect', async () => {
    // @ts-expect-error — engine `.mjs` do Opus, sem tipos publicados.
    return (await import('@softize/opus/introspect')) as IntrospectModule
  })
  let result: IntrospectResult
  try {
    result = await module.introspect(options.dir)
  } catch {
    return null
  }

  const structure: Structure = {
    source: 'introspect',
    domains: [],
    actions: result.actions.map((action) => ({
      domain: domainFromFile(action.file),
      name: action.name ?? '—',
      kind: action.kind ?? 'simple',
      tags: [],
      emits: action.emits ?? [],
      invalidates: [],
      input: [],
      output: [],
    })),
    entities: [],
    dataProducts: (result.dataProducts ?? []).map((product) => ({
      domain: domainFromFile(product.file),
      id: product.id ?? '—',
      version: product.version ?? null,
      sources: [],
      entities: product.entities ?? [],
      permissionContexts: [],
      organizationalScopes: [],
      interfaces: product.interfaces ?? [],
      status: 'active',
    })),
    lineage: (result.dataProducts ?? []).flatMap((product) => [
      ...(product.entities ?? []).map((entity): StructureLineageEdge => ({ kind: 'entity-product', from: entity, to: product.id ?? '—' })),
      ...(product.interfaces ?? []).map((action): StructureLineageEdge => ({ kind: 'product-action', from: product.id ?? '—', to: action })),
    ]),
    dicts: [],
    reactions: result.reactions.map((reaction) => ({
      domain: domainFromFile(reaction.file),
      name: reaction.name ?? '—',
      on: reaction.on ?? [],
      tags: [],
      dedup: false,
    })),
    schedules: result.schedules.map((schedule) => ({
      domain: '—',
      name: schedule.name ?? '—',
      action: schedule.action ?? '—',
      when: schedule.cron ?? schedule.every ?? '—',
      enabled: true,
      tags: [],
    })),
    permissions: [],
  }
  // Sem action encontrada, esta fonte não tem o que dizer — e "0 actions" quase nunca
  // significa "o projeto não tem action". O `introspect` do Opus reconhece `defineAction`,
  // mas ainda NÃO reconhece o split `defineContract` + `bindAction`, que é o padrão
  // canônico do protocolo e o que este repositório usa: aqui ele enxerga 0 de 189. Devolver
  // `null` faz a tela pedir `opus gen`, que é a ação útil; devolver a leitura mutilada
  // sugeriria que o projeto declara quase nada.
  if (structure.actions.length === 0 && structure.dataProducts.length === 0) return null

  const domains = new Map<string, StructureDomain>()
  for (const action of structure.actions) {
    const current = domains.get(action.domain) ?? { name: action.domain, actions: 0, entities: 0, dataProducts: 0 }
    current.actions += 1
    domains.set(action.domain, current)
  }
  for (const product of structure.dataProducts) {
    const current = domains.get(product.domain) ?? { name: product.domain, actions: 0, entities: 0, dataProducts: 0 }
    current.dataProducts += 1
    domains.set(product.domain, current)
  }
  structure.domains = [...domains.values()].sort((a, b) => a.name.localeCompare(b.name))
  return structure
}
