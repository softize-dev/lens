import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aiInventory } from './ai.ts'
import { projectStatus } from './project.ts'
import { testInventory } from './tests.ts'

let dir: string
const write = (relative: string, content: string): void => {
  const path = join(dir, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lens-inventory-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('lente de IA', () => {
  it('lê agentes, skills, hooks, MCP e o custo de contexto de pé', () => {
    write('.claude/agents/review.md', '---\nname: review\ndescription: "Revisa."\n---\nCorpo do agente.')
    write('.claude/skills/deploy/SKILL.md', '---\nname: deploy\ndescription: "Publica."\n---\nComo publicar.')
    write('.claude/settings.json', JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ command: 'guard.sh' }] }] } }))
    write('.mcp.json', JSON.stringify({ mcpServers: { docs: { url: 'https://example.test/mcp' }, local: { command: 'node', args: ['mcp.mjs'] } } }))
    write('CLAUDE.md', 'x'.repeat(400))

    const inventory = aiInventory(dir)

    expect(inventory.configured).toBe(true)
    expect(inventory.agents).toHaveLength(1)
    expect(inventory.agents[0]).toMatchObject({ name: 'review', description: 'Revisa.', content: 'Corpo do agente.' })
    expect(inventory.skills[0]).toMatchObject({ name: 'deploy' })
    expect(inventory.hooks[0]).toEqual({ event: 'PreToolUse', matcher: 'Bash', command: 'guard.sh' })
    expect(inventory.mcp).toEqual([
      { name: 'docs', kind: 'http', spec: 'https://example.test/mcp' },
      { name: 'local', kind: 'stdio', spec: 'node mcp.mjs' },
    ])
    expect(inventory.contextTokens).toBe(100)
  })

  it('não confunde projeto sem configuração com projeto ilegível', () => {
    expect(aiInventory(dir)).toMatchObject({ configured: false, agents: [], skills: [], hooks: [], mcp: [] })
  })
})

describe('lente do projeto', () => {
  it('mostra a versão aplicada e o que falta inicializar', () => {
    write('base.json', JSON.stringify({ packages: { '@softize/opus': { version: '12.3.0' } } }))

    const status = projectStatus(dir)

    expect(status.packages[0]).toMatchObject({ name: '@softize/opus', applied: '12.3.0' })
    // Sem marcador do app, a inicialização está incompleta e a tela precisa dizer isso.
    expect(status.missing).toEqual(['opus.json'])
    expect(status.marker).toBeNull()
  })

  it('acusa a ausência do manifesto do Base', () => {
    expect(projectStatus(dir).missing).toEqual(['base.json'])
  })
})

describe('lente de testes', () => {
  it('conta arquivos e casos e cruza com o que o projeto declara', () => {
    write('src/lead.test.ts', "import { it } from 'vitest'\nit('cria', () => {})\nit('lista', () => {})\n// /x/.test(y) não conta\n")
    write('src/helper.ts', 'export const noop = () => {}')

    const inventory = testInventory(dir, { actions: ['lead.create', 'lead.remove'], entities: [] })

    expect(inventory.total).toBe(1)
    expect(inventory.cases).toBe(2)
    expect(inventory.files[0]?.file).toBe('src/lead.test.ts')
    // "cria" aparece no teste, mas o nome da action não — a menção é o sinal, e ele falta.
    expect(inventory.actions).toEqual({ total: 2, mentioned: 0, missing: ['lead.create', 'lead.remove'] })
  })
})
