import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { docCoverage, readStructure } from './structure.ts'

const MANIFEST = {
  opusVersion: '12.3.0',
  domains: [
    {
      name: 'sales',
      description: 'Vendas.',
      actions: [
        {
          name: 'lead.create',
          kind: 'form',
          label: 'Novo lead',
          description: 'Cria um lead.',
          permission: 'sales',
          tags: ['crm'],
          emits: ['lead.created'],
          invalidates: ['lead.list'],
          input: {
            type: 'object',
            properties: { name: { type: 'string', description: 'Nome de quem procurou.' }, tags: { type: 'array', items: { type: 'string' } } },
            required: ['name'],
          },
          output: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        },
        { name: 'lead.list', kind: 'list', tags: [] },
      ],
      entities: [
        {
          name: 'Lead',
          table: 'sales_leads',
          description: 'Interesse registrado.',
          fields: [
            { name: 'id', logicalType: 'uuid', pk: true, nullable: false, doc: 'Identificador.' },
            { name: 'phone', logicalType: 'string', nullable: true },
          ],
          relations: [{ field: 'personId', target: 'Person' }],
        },
      ],
      dataProducts: [
        {
          id: 'sales.leads',
          version: 1,
          label: 'Leads',
          description: 'Leads e seus resultados comerciais.',
          owner: 'Vendas',
          grain: 'Um lead.',
          classification: 'internal',
          nature: 'real',
          sources: [{ id: 'followize', label: 'Followize' }],
          entities: ['Lead'],
          access: { contexts: ['sales'], organizationalScopes: ['unit', 'team'] },
          interfaces: ['lead.list'],
          status: 'active',
        },
      ],
      reactions: [{ name: 'lead.notify', on: ['lead.created'], description: 'Avisa o time.', hasDedup: true, timeout: 30, tags: ['crm'] }],
      schedules: [{ name: 'lead.sweep', action: 'lead.scan', cron: '0 8 * * *', enabled: true, timezone: 'America/Sao_Paulo' }],
      // O manifest publica dicionários como MAPA, não como lista.
      dicts: { leadStatus: { entries: { new: { label: 'Novo', color: 'green' }, lost: { label: 'Perdido' } } } },
      subdomains: [
        { name: 'quotes', actions: [{ name: 'quote.create', kind: 'form', description: 'Cria proposta.' }], entities: [] },
      ],
    },
  ],
}

describe('lente de estrutura', () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lens-structure-'))
    path = join(dir, 'manifest.json')
    writeFileSync(path, JSON.stringify(MANIFEST))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('lê as declarações do manifest, com a documentação de negócio junto', () => {
    const structure = readStructure(path)!

    expect(structure.source).toBe('manifest')
    expect(structure.opusVersion).toBe('12.3.0')
    expect(structure.domains).toEqual([
      { name: 'sales', description: 'Vendas.', actions: 2, entities: 1, dataProducts: 1 },
      { name: 'sales/quotes', actions: 1, entities: 0, dataProducts: 0 },
    ])
    // Subdomínio some em silêncio se a leitura não descer: o total tem que incluí-lo.
    expect(structure.actions.map((action) => action.name)).toContain('quote.create')
    expect(structure.actions[0]).toMatchObject({
      domain: 'sales',
      name: 'lead.create',
      kind: 'form',
      description: 'Cria um lead.',
      label: 'Novo lead',
      emits: ['lead.created'],
      invalidates: ['lead.list'],
    })
    // O schema vira campo nomeado: é o que a tabela mostra, e `required` decide o opcional.
    expect(structure.actions[0]?.input).toEqual([
      { name: 'name', type: 'string', optional: false, doc: 'Nome de quem procurou.' },
      { name: 'tags', type: 'string[]', optional: true },
    ])
    expect(structure.actions[0]?.output).toEqual([{ name: 'id', type: 'string', optional: false }])
    expect(structure.entities[0]).toMatchObject({ name: 'Lead', table: 'sales_leads', relationCount: 1 })
    expect(structure.entities[0]?.relations).toEqual([{ field: 'personId', target: 'Person' }])
    expect(structure.entities[0]?.fields[0]).toMatchObject({ name: 'id', type: 'uuid', pk: true, doc: 'Identificador.' })
    expect(structure.dataProducts[0]).toMatchObject({ id: 'sales.leads', entities: ['Lead'], interfaces: ['lead.list'] })
    expect(structure.lineage).toEqual([
      { kind: 'source-product', from: 'followize', to: 'sales.leads' },
      { kind: 'entity-product', from: 'Lead', to: 'sales.leads' },
      { kind: 'product-action', from: 'sales.leads', to: 'lead.list' },
    ])
    expect(structure.reactions[0]).toMatchObject({ name: 'lead.notify', on: ['lead.created'], dedup: true, timeout: 30 })
    expect(structure.schedules[0]).toMatchObject({ name: 'lead.sweep', action: 'lead.scan', when: '0 8 * * *', timezone: 'America/Sao_Paulo' })
    expect(structure.dicts[0]?.entries).toEqual([
      { key: 'new', label: 'Novo', color: 'green' },
      { key: 'lost', label: 'Perdido' },
    ])
    expect(structure.permissions).toEqual([{ name: 'sales', actions: ['lead.create'] }])
  })

  it('devolve null quando o projeto ainda não gerou a projeção', () => {
    expect(readStructure(join(dir, 'inexistente.json'))).toBeNull()
  })

  it('aponta a declaração sem documentação, incluindo o campo', () => {
    const coverage = docCoverage(readStructure(path)!)

    expect(coverage).toMatchObject({ total: 5, documented: 4 })
    expect(coverage.fields).toEqual({ total: 2, documented: 1 })
    // O campo sem doc entra na MESMA lista: era a lacuna que não aparecia em lugar nenhum.
    expect(coverage.gaps).toEqual([
      { kind: 'action', domain: 'sales', name: 'lead.list' },
      { kind: 'field', domain: 'sales', name: 'Lead.phone' },
    ])
  })
})
