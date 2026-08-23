/**
 * Lente de testes — o que existe de teste e o que ele encosta.
 *
 * Leitura ESTÁTICA: nada é executado aqui. Rodar a suíte é outra pergunta, com outro
 * custo de tempo, e não cabe numa resposta de requisição atrás do túnel.
 *
 * A contagem de casos é estimativa e a cobertura é por MENÇÃO: "o nome aparece num
 * arquivo de teste" não é o mesmo que "está testado". É um sinal barato de onde a
 * cobertura provavelmente falta, e a tela diz isso com todas as letras.
 */
import { readdirSync, readFileSync, type Dirent } from 'node:fs'
import { join } from 'node:path'

export interface TestFile {
  file: string
  cases: number
}

export interface TestMentions {
  total: number
  mentioned: number
  missing: string[]
}

export interface TestInventory {
  files: TestFile[]
  total: number
  cases: number
  actions: TestMentions
  entities: TestMentions
}

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/
// `test(` / `it(` / `test.each(` — sem casar `.test(` de regex nem palavras como `limit`.
const TEST_CASE = /(^|[^.\w])(test|it)\b\s*(\.\w+)?\s*\(/gm
const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage', '.next', '.git'])

interface ScannedTest extends TestFile {
  content: string
}

function walk(dir: string, base: string, out: ScannedTest[]): void {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue
    const path = join(dir, entry.name)
    const relative = base === '' ? entry.name : `${base}/${entry.name}`
    if (entry.isDirectory()) {
      walk(path, relative, out)
      continue
    }
    if (!TEST_FILE.test(entry.name)) continue
    let content = ''
    try {
      content = readFileSync(path, 'utf8')
    } catch {
      /* Ilegível → conta como arquivo sem casos. */
    }
    out.push({ file: relative, cases: content.match(TEST_CASE)?.length ?? 0, content })
  }
}

function mentions(names: string[], blob: string): TestMentions {
  const missing = names.filter((name) => name.length === 0 || !blob.includes(name)).sort()
  return { total: names.length, mentioned: names.length - missing.length, missing }
}

export function testInventory(
  dir: string,
  declared: { actions: string[]; entities: string[] } = { actions: [], entities: [] },
): TestInventory {
  const scanned: ScannedTest[] = []
  walk(dir, '', scanned)
  scanned.sort((a, b) => a.file.localeCompare(b.file))
  const blob = scanned.map((test) => test.content).join('\n')
  return {
    files: scanned.map(({ file, cases }) => ({ file, cases })),
    total: scanned.length,
    cases: scanned.reduce((sum, test) => sum + test.cases, 0),
    actions: mentions(declared.actions, blob),
    entities: mentions(declared.entities, blob),
  }
}
