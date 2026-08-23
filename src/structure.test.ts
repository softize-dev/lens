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
        { name: 'lead.create', kind: 'form', description: 'Cria um lead.', permission: 'sales', tags: ['crm'], invalidates: ['lead.list'] },
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
      reactions: [{ name: 'lead.notify', on: ['lead.created'], description: 'Avisa o time.' }],
      schedules: [{ name: 'lead.sweep', action: 'lead.scan', cron: '0 8 * * *', enabled: true }],
      // O manifest publica dicionários como MAPA, não como lista.
      dicts: { leadStatus: { entries: [{ value: 'new' }, { value: 'lost' }] } },
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
      { name: 'sales', description: 'Vendas.', actions: 2, entities: 1 },
      { name: 'sales/quotes', actions: 1, entities: 0 },
    ])
    // Subdomínio some em silêncio se a leitura não descer: o total tem que incluí-lo.
    expect(structure.actions.map((action) => action.name)).toContain('quote.create')
    expect(structure.actions[0]).toMatchObject({
      domain: 'sales',
      name: 'lead.create',
      kind: 'form',
      description: 'Cria um lead.',
      invalidates: ['lead.list'],
    })
    expect(structure.entities[0]).toMatchObject({ name: 'Lead', table: 'sales_leads', relationCount: 1 })
    expect(structure.entities[0]?.fields[0]).toMatchObject({ name: 'id', type: 'uuid', pk: true, doc: 'Identificador.' })
    expect(structure.reactions[0]).toMatchObject({ name: 'lead.notify', on: ['lead.created'] })
    expect(structure.schedules[0]).toMatchObject({ name: 'lead.sweep', action: 'lead.scan', when: '0 8 * * *' })
    expect(structure.dicts[0]).toMatchObject({ name: 'leadStatus', entryCount: 2 })
  })

  it('devolve null quando o projeto ainda não gerou a projeção', () => {
    expect(readStructure(join(dir, 'inexistente.json'))).toBeNull()
  })

  it('aponta a declaração sem documentação, incluindo o campo', () => {
    const coverage = docCoverage(readStructure(path)!)

    expect(coverage).toMatchObject({ total: 4, documented: 3 })
    expect(coverage.gaps).toEqual([{ kind: 'action', domain: 'sales', name: 'lead.list' }])
    expect(coverage.fields).toEqual({ total: 2, documented: 1 })
  })
})
