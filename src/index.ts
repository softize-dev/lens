/**
 * Lente de desenvolvimento — o que uma requisição fez, do enfileiramento à consulta.
 *
 * A montagem é uma linha no ponto em que o app registra os adapters do runtime. Sem
 * ativação explícita nada é decorado e nada é gravado: a lente devolve os mesmos adapters
 * que recebeu, então deixá-la montada não muda o comportamento do serviço.
 *
 * O painel (`@softize/lens/ui`) e o plugin Vite (`@softize/lens/vite`) são entradas
 * separadas: nada daqui chega ao navegador, e nada de lá roda no servidor.
 */
import { existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { LogEvent } from 'kysely'
import type {
  AiAdapter,
  AuditSink,
  CacheAdapter,
  EventBusAdapter,
  ObservabilityAdapter,
  QueueAdapter,
} from '@softize/opus/core'
import { lensAi, lensAudit, lensCache, lensEvents, lensObservability, lensQueue } from './adapters.ts'
import { fileStore, type LensStore } from './store.ts'
import { lensKyselyLog, type KyselyLogOptions } from './kysely.ts'
import { aiInventory, type AiInventory } from './ai.ts'
import { conformity, projectStatus, type Conformity, type ProjectStatus } from './project.ts'
import { inspectStructure, readStructure, type Structure } from './structure.ts'
import { testInventory, type TestInventory } from './tests.ts'
import { createSuiteRunner, type SuiteRunner } from './run.ts'
import { createLensHandler, type LensHandler, type LensHandlerOptions } from './http.ts'

export type { LensStore } from './store.ts'
export type { KyselyLogOptions } from './kysely.ts'
export * from './types.ts'
export { lensKyselyLog } from './kysely.ts'
export { findRecord, listRecords } from './api.ts'
export { docCoverage, inspectStructure, readStructure } from './structure.ts'
export { inspect } from './inspect.ts'
export type * from './inspect.ts'
export { conformity, projectStatus } from './project.ts'
export { aiInventory } from './ai.ts'
export { testInventory } from './tests.ts'
export { createSuiteRunner } from './run.ts'
export { createLensHandler, DEFAULT_API_BASE } from './http.ts'
export type { LensHandler, LensHandlerOptions } from './http.ts'
export type * from './structure.ts'
export type * from './project.ts'
export type * from './ai.ts'
export type * from './tests.ts'
export type * from './run.ts'

/** Os adapters que a lente sabe observar. Os demais seguem intactos. */
export interface InstrumentableAdapters {
  observability?: ObservabilityAdapter | undefined
  audit?: AuditSink | undefined
  queue?: QueueAdapter | undefined
  eventBus?: EventBusAdapter | undefined
  cache?: CacheAdapter | undefined
  ai?: AiAdapter | undefined
}

export interface LensOptions extends LensHandlerOptions {
  /** Diretório do buffer. Padrão: `.lens` na raiz do processo. */
  dir?: string
  /** Quantos registros o buffer mantém. */
  limit?: number
  /**
   * Caminho do `.opus/manifest.json` que descreve o projeto observado. Padrão: `.opus`
   * na raiz do processo, que é onde o `opus gen` publica a projeção.
   */
  manifest?: string
  /** Diretório observado — o serviço em execução. Padrão: a raiz do processo. */
  target?: string
  /** Raiz do repositório, onde vivem `.claude/` e `base.json`. Padrão: descoberta. */
  repoRoot?: string
  /**
   * Diretório onde a régua do Opus roda — o pacote com o código e o Opus instalado.
   * Padrão: a raiz do processo.
   */
  checkDir?: string
  /**
   * Ativação. Sem valor explícito, a lente lê `LENS_ENABLED` e permanece desligada em
   * produção mesmo que a variável esteja presente — a inspeção é ferramenta de
   * desenvolvimento e não acompanha um build de produção por acidente de ambiente.
   */
  enabled?: boolean
}

export interface Lens {
  enabled: boolean
  store: LensStore
  /** Declarações do projeto: actions, entidades, dicionários, reactions e schedules.
   *  Cai na introspecção do Opus quando não há manifest; `null` se nem isso responder. */
  structure(): Promise<Structure | null>
  /** Configuração de agentes que o repositório carrega. */
  ai(): AiInventory
  /** Versões do Opus e do Base: aplicada, instalada e adotada pela branch principal. */
  project(): ProjectStatus
  /** Arquivos de teste do alvo observado e o que eles mencionam. */
  tests(): TestInventory
  /** Execução da suíte do alvo — assíncrona, uma por vez. */
  suite: SuiteRunner
  /** Régua do Opus do projeto aplicada ao código. Leva segundos: só sob demanda. */
  conformity(): Promise<Conformity>
  /**
   * Rotas de dados do painel como handler Fetch. Devolve `null` para pedidos fora do
   * prefixo e para todos quando a lente está desligada — o host repassa adiante.
   */
  handle(request: Request): Promise<Response | null>
  /** Devolve os adapters decorados, ou os mesmos que recebeu quando desligada. */
  instrument<T extends InstrumentableAdapters>(adapters: T): T
  /** `log` para o construtor do Kysely; sem efeito quando a lente está desligada. */
  kyselyLog(options?: KyselyLogOptions): (event: LogEvent) => void
}

/** A raiz é onde mora o `.claude/`; o serviço observado costuma ser um subdiretório. */
function discoverRepoRoot(from: string): string {
  let current = from
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(current, '.claude')) || existsSync(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return from
}

function resolveEnabled(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit
  if (process.env.NODE_ENV === 'production') return false
  return process.env.LENS_ENABLED === 'true'
}

export function createLens(options: LensOptions = {}): Lens {
  const enabled = resolveEnabled(options.enabled)
  const store = fileStore({
    dir: options.dir ?? join(process.cwd(), '.lens'),
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
  })

  const manifest = options.manifest ?? join(process.cwd(), '.opus', 'manifest.json')
  const target = options.target ?? process.cwd()
  const repoRoot = options.repoRoot ?? discoverRepoRoot(target)
  const checkDir = options.checkDir ?? process.cwd()
  let handle: LensHandler | undefined

  const lens: Lens = {
    enabled,
    store,
    structure: () => inspectStructure({ manifest, dir: target }),
    ai: () => aiInventory(repoRoot, [relative(repoRoot, target) === '' ? 'CLAUDE.md' : `${relative(repoRoot, target)}/CLAUDE.md`]),
    project: () => projectStatus(repoRoot, target),
    suite: createSuiteRunner(target),
    conformity: () => conformity(checkDir),
    handle: (request) => {
      handle ??= createLensHandler(lens, options)
      return handle(request)
    },
    tests: () => {
      // O inventário é síncrono e a menção só precisa dos nomes: o manifest basta, e sem
      // ele a lista de menções vem vazia em vez de a tela inteira esperar a introspecção.
      const structure = readStructure(manifest)
      return testInventory(target, {
        actions: structure?.actions.map((action) => action.name) ?? [],
        entities: structure?.entities.map((entity) => entity.name) ?? [],
      })
    },
    instrument(adapters) {
      if (!enabled) return adapters
      return {
        ...adapters,
        // Observabilidade e auditoria entram sempre: a primeira abre o registro e a
        // segunda informa a origem. Quando o app não registra as suas, a lente é a única.
        observability: lensObservability(store, adapters.observability),
        audit: lensAudit(adapters.audit),
        ...(adapters.queue !== undefined ? { queue: lensQueue(adapters.queue) } : {}),
        ...(adapters.eventBus !== undefined ? { eventBus: lensEvents(adapters.eventBus) } : {}),
        ...(adapters.cache !== undefined ? { cache: lensCache(adapters.cache) } : {}),
        ...(adapters.ai !== undefined ? { ai: lensAi(adapters.ai) } : {}),
      }
    },
    kyselyLog(logOptions) {
      const log = lensKyselyLog(logOptions)
      return enabled ? log : (logOptions?.next ?? (() => {}))
    },
  }
  return lens
}
