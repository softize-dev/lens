/**
 * O plugin contra um dev server Vite de verdade.
 *
 * O servidor falso do outro arquivo mede a string que o plugin monta; só o Vite real mostra
 * o que o navegador recebe. É nessa diferença que mora o defeito que este teste existe para
 * impedir: o `transformIndexHtml` prefixa o `base` em toda URL do HTML, então uma URL já
 * prefixada pelo plugin chegaria dobrada — e o módulo do painel responderia 404.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'
import { lens } from './vite.js'

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'lens-vite-'))
  writeFileSync(join(root, 'index.html'), '<!doctype html><html><body></body></html>')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

async function serve(base: string): Promise<ViteDevServer> {
  const server = await createServer({
    root,
    base,
    configFile: false,
    logLevel: 'silent',
    plugins: [lens()],
    server: { port: 0, host: '127.0.0.1' },
  })
  await server.listen()
  return server
}

function address(server: ViteDevServer): string {
  const [url] = server.resolvedUrls?.local ?? []
  // O `base` já vem na URL resolvida; os testes montam o caminho completo por conta própria.
  return url!.replace(/\/+$/, '').replace(/\/app$/, '')
}

describe('plugin no dev server real', () => {
  it('serve a página na raiz e aponta para o módulo do painel', async () => {
    const server = await serve('/')
    try {
      const response = await fetch(`${address(server)}/lens/actions`)
      const html = await response.text()

      expect(response.status).toBe(200)
      expect(html).toContain('src="/@id/__x00__virtual:lens-entry"')
      expect(html).toContain('href="/favicon.svg"')
      // Quem protege contra o prefixo somado são as asserções de endereço acima: a raiz de
      // teste não tem as dependências do painel, então o módulo resolve e falha ao transformar.
      expect((await fetch(`${address(server)}/@id/__x00__virtual:lens-entry`)).status).toBe(500)
    } finally {
      await server.close()
    }
  })

  it('sob outro `base`, prefixa uma vez só e o módulo continua alcançável', async () => {
    const server = await serve('/app/')
    try {
      const response = await fetch(`${address(server)}/app/lens`)
      const html = await response.text()

      expect(response.status).toBe(200)
      expect(html).toContain('src="/app/@id/__x00__virtual:lens-entry"')
      expect(html).not.toContain('/app/app/')
      expect(html).toContain('href="/app/favicon.svg"')
      // O endereço tem que responder, não só parecer certo.
      expect((await fetch(`${address(server)}/app/@id/__x00__virtual:lens-entry`)).status).toBe(500)
    } finally {
      await server.close()
    }
  })
})
