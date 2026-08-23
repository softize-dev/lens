/**
 * A direção da dependência é a fronteira que a ADR 0054 pede verificável: a lente
 * consome os donos do vocabulário e nunca o contrário. Um import de domínio, de serviço
 * ou do app aqui dentro transformaria a lente em parte da aplicação que ela observa.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const IMPORT_RE = /from\s+'([^']+)'/g

/** O que a lente pode consumir: o runtime que ela observa, o driver que vê as consultas,
 *  a biblioteca padrão do Node e os próprios arquivos. */
const ALLOWED = [/^node:/, /^@softize\/opus(\/|$)/, /^kysely$/, /^\.\.?\//, /^vitest$/]

describe('direção da dependência (ADR 0054)', () => {
  const dir = fileURLToPath(new URL('.', import.meta.url))
  const files = readdirSync(dir).filter((name) => name.endsWith('.ts'))

  it('encontra os módulos da lente para verificar', () => {
    expect(files.length).toBeGreaterThan(3)
  })

  it('não importa domínio, serviço nem app', () => {
    const forbidden: string[] = []
    for (const name of files) {
      const source = readFileSync(`${dir}${name}`, 'utf8')
      for (const [, specifier] of source.matchAll(IMPORT_RE)) {
        if (specifier !== undefined && !ALLOWED.some((pattern) => pattern.test(specifier))) {
          forbidden.push(`${name}: ${specifier}`)
        }
      }
    }
    expect(forbidden).toEqual([])
  })
})
