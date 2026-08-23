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
  /** Caminho do manifest. Padrão: `.opus/manifest.json` dentro de `dir`. */
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

export async function inspect(target: InspectTarget): Promise<Inspection> {
  const dir = target.dir ?? target.root
  const manifest = target.manifest ?? join(dir, '.opus', 'manifest.json')
  const structure = await inspectStructure({ manifest, dir })
  return {
    structure,
    docs: structure === null ? null : docCoverage(structure),
    ai: aiInventory(target.root),
    project: projectStatus(target.root, dir),
    tests: testInventory(dir, {
      actions: structure?.actions.map((action) => action.name) ?? [],
      entities: structure?.entities.map((entity) => entity.name) ?? [],
    }),
  }
}
