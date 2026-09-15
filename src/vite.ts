/**
 * `lens()` — plugin Vite que serve o painel da lente numa rota do dev server do projeto.
 *
 * Um módulo virtual importa o CSS do app (padrão `/src/index.css`, onde ficam o tema do
 * Opus, as sobrescritas de token e o `@source` do Tailwind) e então chama `mountLens`.
 * Com o mesmo CSS, o painel herda identidade e utilitários do projeto. É o mesmo desenho
 * do `opusDocs()` do Opus.
 *
 * Só existe no dev server (`apply: 'serve'`): o build de produção não recebe página,
 * módulo nem proxy da lente, sem depender de disciplina de import no projeto.
 *
 * Uso (vite.config.ts do app):
 *   import { lens } from '@softize/lens/vite'
 *   export default defineConfig({ plugins: [react(), tailwindcss(), lens({ target: 'http://127.0.0.1:7012' })] })
 */
import type { Plugin } from 'vite'

export interface LensPluginOptions {
  /** Prefixo da página. Padrão: `/lens`. */
  basePath?: string
  /** Prefixo das rotas de dados, o mesmo do handler do servidor. Padrão: `/__lens/api`. */
  apiBase?: string
  /** CSS de entrada do app, de onde o painel herda tema e Tailwind. Padrão: `/src/index.css`. */
  css?: string
  /**
   * Endereço do servidor que monta o handler. Com valor, o plugin encaminha `apiBase`
   * para ele; sem valor, o projeto configura o próprio proxy (ou serve na mesma origem).
   */
  target?: string
}

const VIRTUAL_ID = 'virtual:lens-entry'
// O `/@id/` é como o Vite serve módulos por id; o `\0` da convenção de virtual vira `__x00__`.
const RESOLVED_ID = '\0' + VIRTUAL_ID
const ENTRY_URL = '/@id/__x00__' + VIRTUAL_ID

export function lens(options: LensPluginOptions = {}): Plugin {
  const basePath = trimSlash(options.basePath ?? '/lens')
  const apiBase = trimSlash(options.apiBase ?? '/__lens/api')
  const css = options.css ?? '/src/index.css'

  return {
    name: 'softize-lens',
    apply: 'serve',
    config() {
      if (options.target === undefined) return undefined
      return { server: { proxy: { [apiBase]: options.target } } }
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined
      return [
        `import ${JSON.stringify(css)}`,
        `import { mountLens } from '@softize/lens/ui'`,
        `mountLens(document.getElementById('root'), ${JSON.stringify({ basePath, apiBase })})`,
      ].join('\n')
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? ''
        if (path !== basePath && !path.startsWith(`${basePath}/`)) {
          next()
          return
        }
        // `transformIndexHtml` injeta o cliente de HMR e roda os plugins de HTML do projeto.
        server
          .transformIndexHtml(req.originalUrl ?? path, page())
          .then((html) => {
            res.statusCode = 200
            res.setHeader('Content-Type', 'text/html')
            res.end(html)
          })
          .catch(next)
      })
    },
  }
}

function page(): string {
  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '    <title>Lens</title>',
    '    <script>',
    // O tema acompanha o sistema antes do bundle, para a página não piscar clara no escuro.
    // A lente não guarda preferência própria: é ferramenta, não produto.
    "      try { if (matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('dark') } catch (e) {}",
    '    </script>',
    '  </head>',
    '  <body>',
    '    <div id="root"></div>',
    `    <script type="module" src=${JSON.stringify(ENTRY_URL)}></script>`,
    '  </body>',
    '</html>',
  ].join('\n')
}

function trimSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}
