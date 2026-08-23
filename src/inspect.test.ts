import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inspect } from './inspect.ts'
import { inspectStructure } from './structure.ts'

let dir: string
const write = (relative: string, content: string): void => {
  const path = join(dir, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

const MANIFEST = {
  opusVersion: '12.3.0',
  domains: [
    {
      name: 'sales',
      actions: [{ name: 'lead.create', kind: 'form', description: 'Cria.', permission: 'sales' }],
      entities: [{ name: 'Lead', table: 'sales_leads', description: 'Interesse.', fields: [], relations: [] }],
    },
  ],
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lens-inspect-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('inspeção de um alvo', () => {
  it('reúne estrutura, documentação, IA, projeto e testes de um diretório qualquer', async () => {
    write('.opus/manifest.json', JSON.stringify(MANIFEST))
    write('base.json', JSON.stringify({ packages: { '@softize/opus': { version: '12.3.0' } } }))
    write('opus.json', JSON.stringify({ version: '12.3.0' }))
    write('.claude/agents/review.md', '---\nname: review\n---\nCorpo.')
    write('src/lead.test.ts', "it('cria lead.create', () => {})")

    const result = await inspect({ root: dir })

    expect(result.structure).toMatchObject({ source: 'manifest' })
    expect(result.docs).toMatchObject({ total: 2, documented: 2 })
    expect(result.ai.agents).toHaveLength(1)
    expect(result.project.packages[0]).toMatchObject({ name: '@softize/opus', applied: '12.3.0' })
    expect(result.tests).toMatchObject({ total: 1, cases: 1 })
    expect(result.tests.actions).toMatchObject({ total: 1, mentioned: 1 })
  })

  it('não depende do diretório do processo: o alvo é sempre explícito', async () => {
    write('service/.opus/manifest.json', JSON.stringify(MANIFEST))
    write('base.json', JSON.stringify({ packages: {} }))

    const result = await inspect({ root: dir, dir: join(dir, 'service') })

    expect(result.structure?.actions[0]?.name).toBe('lead.create')
    expect(result.project.root).toBe(dir)
  })

  it('sem manifest e sem declaração encontrada, responde null em vez de uma tela vazia', async () => {
    // Introspecção que não achou nada é indistinguível, na tela, de projeto sem projeção.
    // `null` faz a interface pedir `opus gen`, que é a ação útil.
    expect(await inspectStructure({ manifest: join(dir, 'ausente.json'), dir })).toBeNull()
  })
})
