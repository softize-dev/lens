/**
 * A direção da dependência é a fronteira verificável da lente: ela consome os donos do
 * vocabulário e nunca o contrário. Um import de domínio, de serviço ou do app aqui dentro
 * transformaria a lente em parte da aplicação que ela observa.
 *
 * Com o painel no pacote, há uma segunda fronteira: servidor e navegador. O painel só
 * conhece os TIPOS do servidor, e o servidor não alcança o painel.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const IMPORT_RE = /import\s+(type\s+)?[^'"]*?from\s+'([^']+)'|^import\s+'([^']+)'/gm

/** O que o servidor pode consumir: o runtime que observa, o driver que vê as consultas,
 *  a biblioteca padrão do Node e os próprios arquivos. */
const SERVER_ALLOWED = [/^node:/, /^@softize\/opus(\/|$)/, /^kysely$/, /^\.\.?\//, /^vitest$/]

/** O que o painel pode consumir: React, o design system do Opus e os próprios arquivos.
 *  De fora de `ui/`, só tipos — e `base-path.js`, função pura que os três lados usam. */
const UI_SHARED = ['base-path.js']

const UI_ALLOWED = [
  /^react$/,
  /^react-dom\/client$/,
  /^@tanstack\/react-query$/,
  /^lucide-react$/,
  /^@softize\/opus\/ui\/react$/,
  /^\.\.?\//,
  /^vitest$/,
]

interface Import {
  file: string
  specifier: string
  typeOnly: boolean
}

const src = fileURLToPath(new URL('.', import.meta.url))
const ui = join(src, 'ui')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(tsx?|js)$/.test(name) ? [path] : []
  })
}

/** Um caminho de módulo não tem metacaractere: é assim que a varredura ignora uma expressão
 *  regular escrita dentro de um teste, que de resto se parece com um import. Os dois-pontos
 *  entram porque `node:fs` num arquivo do painel é exatamente o que este gate procura. */
const MODULE_ID = /^[\w@./~:-]+$/

function importsOf(file: string): Import[] {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(IMPORT_RE)]
    .map((match) => ({
      file: relative(src, file),
      specifier: (match[2] ?? match[3])!,
      typeOnly: match[1] !== undefined,
    }))
    .filter(({ specifier }) => MODULE_ID.test(specifier))
}

const files = walk(src)
const uiFiles = files.filter((file) => file.startsWith(`${ui}/`))
const serverFiles = files.filter((file) => !file.startsWith(`${ui}/`))

describe('direção da dependência', () => {
  it('encontra os módulos do servidor e do painel para verificar', () => {
    expect(serverFiles.length).toBeGreaterThan(3)
    expect(uiFiles.length).toBeGreaterThan(3)
  })

  it('o servidor não importa domínio, serviço, app nem o painel', () => {
    const forbidden = serverFiles
      .flatMap(importsOf)
      .filter(({ file, specifier, typeOnly }) => {
        // O `vite` é dependência de desenvolvimento: o plugin só o consome como tipo, e um
        // teste pode subir um dev server de verdade para exercitá-lo.
        if (specifier === 'vite') {
          return !(file.startsWith('vite.') && typeOnly) && !file.endsWith('.test.ts')
        }
        // O plugin escreve o módulo de entrada do navegador como texto, pelo nome público.
        if (file === 'vite.js' && specifier.startsWith('@softize/lens/')) return false
        if (specifier.startsWith('./ui/')) return true
        return !SERVER_ALLOWED.some((pattern) => pattern.test(specifier))
      })
      .map(({ file, specifier }) => `${file}: ${specifier}`)

    expect(forbidden).toEqual([])
  })

  it('o painel usa só React e o Opus UI, e do servidor recebe apenas tipos', () => {
    const forbidden = uiFiles
      .flatMap(importsOf)
      .filter(({ file, specifier, typeOnly }) => {
        if (!UI_ALLOWED.some((pattern) => pattern.test(specifier))) return true
        const target = join(src, file, '..', specifier)
        if (UI_SHARED.includes(relative(src, target))) return false
        return specifier.startsWith('.') && !target.startsWith(`${ui}/`) && !typeOnly
      })
      .map(({ file, specifier }) => `${file}: ${specifier}`)

    expect(forbidden).toEqual([])
  })
})
