/**
 * Inspeção de um alvo — a porta única da lente estática.
 *
 * Recebe um diretório e devolve o que dá para saber dele. Não depende do processo em
 * execução, do diretório atual nem de sessão: é o que permite a mesma lente servir ao
 * serviço que roda aqui e a um worktree qualquer, que é como a cabine a consome.
 */
import { join } from 'node:path'
import { aiInventory, type AiInventory } from './ai.ts'
import { projectStatus, type ProjectStatus } from './project.ts'
import { docCoverage, inspectStructure, type DocCoverage, type Structure } from './structure.ts'
import { testInventory, type TestInventory } from './tests.ts'

export interface InspectTarget {
  /** Raiz do repositório observado — onde vivem `.claude/` e `base.json`. */
  root: string
  /** Serviço ou app dentro dela. Padrão: a própria raiz. */
  dir?: string
  /**
   * Vários alvos, quando o repositório tem mais de um projeto Opus — o caso comum num
   * monorepo, onde a cara não declara domínio e o motor não tem tela. As leituras são
   * somadas: mirar num só devolveria metade do projeto sem avisar.
   */
  dirs?: string[]
  /** Caminho do manifest do alvo único. Padrão: `.opus/manifest.json` dentro de `dir`. */
  manifest?: string
}

export interface Inspection {
  structure: Structure | null
  /** `null` quando não há estrutura para medir. */
  docs: DocCoverage | null
  ai: AiInventory
  project: ProjectStatus
  tests: TestInventory
}

/** Soma as leituras de vários alvos preservando a ordem; a primeira fonte nomeia o todo. */
function merge(parts: Structure[]): Structure | null {
  const first = parts[0]
  if (first === undefined) return null
  const merged: Structure = {
    source: first.source,
    ...(first.opusVersion !== undefined ? { opusVersion: first.opusVersion } : {}),
    domains: parts.flatMap((part) => part.domains),
    actions: parts.flatMap((part) => part.actions),
    entities: parts.flatMap((part) => part.entities),
    dicts: parts.flatMap((part) => part.dicts),
    reactions: parts.flatMap((part) => part.reactions),
    schedules: parts.flatMap((part) => part.schedules),
    permissions: [],
  }
  const byPermission = new Map<string, string[]>()
  for (const permission of parts.flatMap((part) => part.permissions)) {
    byPermission.set(permission.name, [...(byPermission.get(permission.name) ?? []), ...permission.actions])
  }
  merged.permissions = [...byPermission.entries()]
    .map(([name, actions]) => ({ name, actions: [...new Set(actions)].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return merged
}

export async function inspect(target: InspectTarget): Promise<Inspection> {
  const dirs = target.dirs !== undefined && target.dirs.length > 0 ? target.dirs : [target.dir ?? target.root]
  const parts: Structure[] = []
  for (const dir of dirs) {
    const manifest = dirs.length === 1 && target.manifest !== undefined ? target.manifest : join(dir, '.opus', 'manifest.json')
    const part = await inspectStructure({ manifest, dir })
    if (part !== null) parts.push(part)
  }
  const structure = merge(parts)
  const names = {
    actions: structure?.actions.map((action) => action.name) ?? [],
    entities: structure?.entities.map((entity) => entity.name) ?? [],
  }
  const tests = dirs.map((dir) => testInventory(dir, names))
  return {
    structure,
    docs: structure === null ? null : docCoverage(structure),
    ai: aiInventory(target.root),
    project: projectStatus(target.root, dirs[0]!),
    tests: {
      files: tests.flatMap((inventory) => inventory.files),
      total: tests.reduce((sum, inventory) => sum + inventory.total, 0),
      cases: tests.reduce((sum, inventory) => sum + inventory.cases, 0),
      // A menção vale se APARECE em qualquer alvo: um teste do motor cobre a action do motor.
      actions: {
        total: names.actions.length,
        mentioned: names.actions.length - tests.reduce<string[]>((missing, inventory) => missing.filter((name) => inventory.actions.missing.includes(name)), names.actions).length,
        missing: tests.reduce<string[]>((missing, inventory) => missing.filter((name) => inventory.actions.missing.includes(name)), names.actions),
      },
      entities: {
        total: names.entities.length,
        mentioned: names.entities.length - tests.reduce<string[]>((missing, inventory) => missing.filter((name) => inventory.entities.missing.includes(name)), names.entities).length,
        missing: tests.reduce<string[]>((missing, inventory) => missing.filter((name) => inventory.entities.missing.includes(name)), names.entities),
      },
    },
  }
}
