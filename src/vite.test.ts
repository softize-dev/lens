import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lens } from './vite.js'

type Middleware = (req: { url?: string; originalUrl?: string }, res: FakeResponse, next: () => void) => void

interface FakeResponse {
  statusCode: number
  headers: Record<string, string>
  body: string | undefined
  setHeader(name: string, value: string): void
  end(body: string): void
}

function response(): FakeResponse {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value
    },
    end(body) {
      this.body = body
    },
  }
}

/** Monta o plugin num servidor falso e devolve o middleware que ele registra. */
function middlewareOf(plugin: ReturnType<typeof lens>, base = '/'): Middleware {
  ;(plugin.configResolved as (config: unknown) => void)({ base })
  let registered: Middleware | undefined
  const server = {
    middlewares: { use: (fn: Middleware) => (registered = fn) },
    transformIndexHtml: (_url: string, html: string) => Promise.resolve(html),
  }
  ;(plugin.configureServer as (server: unknown) => void)(server)
  return registered!
}

async function visit(middleware: Middleware, url: string): Promise<{ res: FakeResponse; passed: boolean }> {
  const res = response()
  let passed = false
  middleware({ url }, res, () => (passed = true))
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { res, passed }
}

describe('plugin Vite da lente', () => {
  it('a entrada publicada é JavaScript, que o Node carrega de node_modules sem remover tipos', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      exports: Record<string, { default: string }>
    }

    expect(pkg.exports['./vite']!.default).toMatch(/\.js$/)
  })

  it('existe só no dev server, então o build de produção não recebe o painel', () => {
    expect(lens().apply).toBe('serve')
  })

  it('serve a página no prefixo e deixa o resto do app seguir', async () => {
    const middleware = middlewareOf(lens())

    const page = await visit(middleware, '/lens/r/req-1?x=1')
    expect(page.passed).toBe(false)
    expect(page.res.statusCode).toBe(200)
    expect(page.res.body).toContain('/@id/__x00__virtual:lens-entry')

    expect((await visit(middleware, '/')).passed).toBe(true)
    expect((await visit(middleware, '/lensx')).passed).toBe(true)
  })

  it('o módulo de entrada chama um símbolo que o subpath publicado realmente exporta', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      name: string
      exports: Record<string, string | { default: string }>
    }
    const plugin = lens()
    const resolved = (plugin.resolveId as (id: string) => string | undefined)('virtual:lens-entry')
    const entry = (plugin.load as (id: string) => string | undefined)(resolved!)!
    const [, symbol, specifier] = /import \{ (\w+) \} from '([^']+)'/.exec(entry)!

    // O módulo virtual é texto: sem isto, renomear o export ou mexer no `exports` do
    // package deixa o painel branco com typecheck e testes verdes.
    expect(specifier).toBe(`${pkg.name}/ui`)
    const published = typeof pkg.exports['./ui'] === 'string' ? pkg.exports['./ui'] : pkg.exports['./ui']!.default
    // O caminho é relativo à raiz do pacote, que é onde o `exports` é interpretado. Aqui
    // basta ler: montar o painel é trabalho do teste que roda no navegador.
    const entryModule = readFileSync(new URL(published, new URL('../', import.meta.url)), 'utf8')
    expect(entryModule).toMatch(new RegExp(`export \\{[^}]*\\b${symbol}\\b`))
    expect(entry).toContain(`${symbol}(document.getElementById('root')`)
  })

  it('o módulo de entrada importa o CSS do app e monta com os prefixos configurados', () => {
    const plugin = lens({ basePath: '/maestro/lens/', apiBase: '/maestro/__lens/api', css: '/src/app.css' })
    const resolved = (plugin.resolveId as (id: string) => string | undefined)('virtual:lens-entry')
    const source = (plugin.load as (id: string) => string | undefined)(resolved!)

    expect(source).toContain('import "/src/app.css"')
    expect(source).toContain("from '@softize/lens/ui'")
    expect(source).toContain('"basePath":"/maestro/lens"')
    expect(source).toContain('"apiBase":"/maestro/__lens/api"')
  })

  it('o endereço do painel acompanha o `base`, e as rotas de dados não', () => {
    const plugin = lens()
    ;(plugin.configResolved as (config: unknown) => void)({ base: '/app/' })
    const resolved = (plugin.resolveId as (id: string) => string | undefined)('virtual:lens-entry')
    const entry = (plugin.load as (id: string) => string | undefined)(resolved!)!

    // O painel lê `location.pathname`, que inclui o base; as rotas são do servidor observado.
    expect(entry).toContain('"basePath":"/app/lens"')
    expect(entry).toContain('"apiBase":"/__lens/api"')
  })

  it('encaminha as rotas de dados só quando recebe o endereço do servidor', () => {
    const config = (plugin: ReturnType<typeof lens>) => (plugin.config as () => unknown)()

    expect(config(lens())).toBeUndefined()
    expect(config(lens({ target: 'http://127.0.0.1:7012' }))).toEqual({
      server: { proxy: { '/__lens/api': 'http://127.0.0.1:7012' } },
    })
  })
})
