// @vitest-environment happy-dom

/**
 * O painel monta e navega de verdade. Typecheck não cobre isto: um export inexistente do
 * design system, um hook mal usado ou uma view que quebra no primeiro render só aparecem
 * quando alguém renderiza — e este é o teste que renderiza.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LensRoot, type MountLensOptions } from './mount.tsx'
import { routeFromPath } from './lens-app.tsx'

const STRUCTURE = {
  source: 'manifest',
  opusVersion: '12.3.0',
  domains: [{ name: 'sales', actions: 1, entities: 1 }],
  actions: [
    {
      domain: 'sales',
      name: 'lead.create',
      kind: 'form',
      tags: [],
      emits: ['lead.created'],
      invalidates: [],
      input: [],
      output: [],
      description: 'Cria um lead.',
      permission: 'sales',
    },
  ],
  presentations: [
    {
      id: 'sales.leads',
      title: 'Leads',
      bodyAction: 'lead.list',
      actions: ['lead.create'],
      definition: {
        schemaVersion: 1,
        id: 'sales.leads',
        title: 'Leads',
        body: { action: 'lead.list', input: {} },
        actions: [],
      },
    },
  ],
  permissions: [{ name: 'sales', actions: ['lead.create'] }],
  entities: [{ domain: 'sales', name: 'Lead', table: 'sales_leads', fields: [], relationCount: 0 }],
  dicts: [],
  reactions: [{ domain: 'sales', name: 'lead.notify', on: ['lead.created'], tags: [], dedup: false }],
  schedules: [
    {
      domain: 'sales',
      name: 'lead.sweep',
      action: 'lead.create',
      when: '0 8 * * *',
      enabled: true,
      tags: [],
    },
  ],
}

const RECORDS = [
  {
    id: 'rec-1',
    root: 'lead.create',
    startedAt: Date.now(),
    durationMs: 12,
    outcome: 'success',
    entryCount: 1,
    requestId: 'req-1',
  },
]

function respond(url: string): unknown {
  if (url.endsWith('/records')) return RECORDS
  if (url.includes('/records/')) {
    return {
      ...RECORDS[0],
      provenance: { kind: 'http' },
      entries: [{ kind: 'query', sql: 'select 1', at: Date.now(), durationMs: 3 }],
    }
  }
  if (url.endsWith('/structure')) return STRUCTURE
  if (url.endsWith('/docs'))
    return {
      total: 2,
      documented: 1,
      gaps: [{ kind: 'action', domain: 'sales', name: 'lead.list' }],
      fields: { total: 4, documented: 2 },
    }
  if (url.endsWith('/ai')) {
    return {
      configured: true,
      agents: [
        {
          slug: 'review',
          name: 'review',
          description: 'Revisa.',
          content: '',
          file: '.claude/agents/review.md',
        },
      ],
      skills: [],
      instructions: [{ file: 'CLAUDE.md', tokens: 120 }],
      contextTokens: 120,
      hooks: [{ event: 'PreToolUse', matcher: 'Bash', command: 'guard.sh' }],
      hookSources: ['.claude/settings.json'],
      mcp: [],
    }
  }
  if (url.endsWith('/project')) {
    return {
      root: '/repo',
      marker: '12.3.0',
      missing: [],
      packages: [
        {
          name: '@softize/opus',
          applied: '12.3.0',
          installed: '12.3.0',
          installedFrom: 'project',
          adopted: '12.3.0',
          adoptedRef: 'origin/main',
          drift: false,
        },
      ],
    }
  }
  if (url.endsWith('/tests')) {
    return {
      files: [],
      total: 3,
      cases: 9,
      actions: { total: 2, mentioned: 1, missing: ['lead.remove'] },
      entities: { total: 1, mentioned: 1, missing: [] },
    }
  }
  if (url.endsWith('/tests/run')) return { status: 'idle' }
  if (url.endsWith('/conformity'))
    return { rulerFrom: 'project', rulerVersion: '12.3.0', files: 10, actions: 5, findings: [] }
  return null
}

describe('LensApp', () => {
  let container: HTMLDivElement
  let root: Root
  let requested: string[]

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    requested = []
    vi.stubGlobal('fetch', (input: string) => {
      requested.push(String(input))
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(respond(String(input))),
      } as Response)
    })
    history.replaceState(null, '', '/lens')
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
  })

  /** A carga é assíncrona: sem drenar as microtasks, a asserção vê só o esqueleto. */
  async function flush(): Promise<void> {
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    })
  }

  async function mount(options: MountLensOptions = {}): Promise<void> {
    await act(async () => {
      // O mesmo envelope de `mountLens`: as dicas e as consultas dependem dos providers da raiz.
      root.render(<LensRoot {...options} />)
    })
    await flush()
  }

  it('abre nas requisições e lista o que o buffer tem', async () => {
    await mount()

    expect(container.textContent).toContain('Requisições')
    expect(container.textContent).toContain('lead.create')
  })

  it('navega para uma lente de código e leva a rota para o endereço', async () => {
    await mount()

    const actions = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Ações')
    expect(actions).toBeDefined()
    await act(async () => {
      actions!.click()
    })
    await flush()

    expect(location.pathname).toBe('/lens/actions')
    expect(container.textContent).toContain('Cria um lead.')
  })

  it('mostra as lentes de IA e do projeto', async () => {
    await mount()

    for (const [label, expected] of [
      ['Agentes', 'review'],
      ['Instruções', '120 tokens'],
      ['Gatilhos', 'guard.sh'],
      ['Opus', 'origin/main'],
      ['Testes', 'Executar suíte'],
      ['Permissões', 'sales'],
      ['Presentations', 'sales.leads'],
      // O encadeamento é o desenho que a cabine tem hoje: sai de lá, tem que existir aqui.
      ['Encadeamento', 'lead.notify'],
    ] as const) {
      const button = [...container.querySelectorAll('button')].find((item) => item.textContent === label)
      expect(button, label).toBeDefined()
      await act(async () => {
        button!.click()
      })
      await flush()
      expect(container.textContent, label).toContain(expected)
    }
  })

  it('abre direto no registro quando o endereço aponta para uma requisição', async () => {
    history.replaceState(null, '', '/lens/r/req-1')

    await mount()

    expect(container.textContent).toContain('select 1')
  })

  it('navega e busca dados sob os prefixos informados na montagem', async () => {
    history.replaceState(null, '', '/maestro/lens/r/req-1')

    await mount({ basePath: '/maestro/lens/', apiBase: '/maestro/__lens/api' })

    expect(container.textContent).toContain('select 1')
    expect(requested.length).toBeGreaterThan(0)
    expect(requested.every((url) => url.startsWith('/maestro/__lens/api/'))).toBe(true)

    const actions = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Ações')
    await act(async () => {
      actions!.click()
    })
    await flush()

    expect(location.pathname).toBe('/maestro/lens/actions')
  })
})

describe('routeFromPath', () => {
  it('lê a view e o registro relativos ao prefixo', () => {
    expect(routeFromPath('/lens', '/lens')).toEqual({ view: 'requests', record: null })
    expect(routeFromPath('/lens/actions/', '/lens')).toEqual({ view: 'actions', record: null })
    expect(routeFromPath('/lens/r/a%2Fb', '/lens')).toEqual({ view: 'requests', record: 'a/b' })
  })

  it('abre nas requisições quando o caminho não pertence ao prefixo ou a view não existe', () => {
    expect(routeFromPath('/lensx/actions', '/lens')).toEqual({ view: 'requests', record: null })
    expect(routeFromPath('/lens/inexistente', '/lens')).toEqual({ view: 'requests', record: null })
  })
})
