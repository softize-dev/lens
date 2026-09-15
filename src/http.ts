/**
 * Rotas de dados do painel, como handler Fetch padrão.
 *
 * O handler recebe um `Request` e devolve um `Response`, ou `null` quando o pedido não é
 * da lente (ou quando ela está desligada). Assim o mesmo mapa serve um Fastify, um
 * `node:http` ou qualquer servidor que converse em Fetch: o host só adapta a entrada e
 * repassa adiante o que recebeu `null`.
 *
 * As rotas não são actions: o painel observa o produto e não faz parte dele, e entrar no
 * manifest o transformaria em superfície pública com contrato, documentação gerada e
 * trilha de auditoria.
 */
import type { Lens } from './index.ts'
import { docCoverage } from './structure.ts'
import { findRecord, listRecords } from './api.ts'

export const DEFAULT_API_BASE = '/__lens/api'

export interface LensHandlerOptions {
  /** Prefixo das rotas. Padrão: `/__lens/api`, o mesmo que o painel usa. */
  apiBase?: string
  /** Chamado quando uma leitura falha; a resposta segue como 503 com o motivo. */
  onError?: (route: string, cause: unknown) => void
}

export type LensHandler = (request: Request) => Promise<Response | null>

type LensReads = Pick<Lens, 'enabled' | 'store' | 'structure' | 'ai' | 'project' | 'tests' | 'suite' | 'conformity'>

export function createLensHandler(lens: LensReads, options: LensHandlerOptions = {}): LensHandler {
  const apiBase = (options.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '')

  return async (request) => {
    if (!lens.enabled) return null
    const path = new URL(request.url).pathname
    if (path !== apiBase && !path.startsWith(`${apiBase}/`)) return null
    const route = path.slice(apiBase.length)
    const method = request.method.toUpperCase()

    if (method === 'GET' && route === '/records') return json(listRecords(lens.store))
    if (method === 'GET' && route.startsWith('/records/')) {
      const record = findRecord(lens.store, decodeURIComponent(route.slice('/records/'.length)))
      return record === null ? notFound('not_found') : json(record)
    }

    // Estrutura e documentação vêm do manifest que o `opus gen` publica. Sem ele a resposta
    // é 404 com o motivo, e o painel pede `opus gen` em vez de mostrar lista incompleta.
    if (method === 'GET' && (route === '/structure' || route === '/docs')) {
      const structure = await lens.structure()
      if (structure === null) return notFound('no_manifest')
      return json(route === '/structure' ? structure : docCoverage(structure))
    }

    // Leitura de arquivo, barata o bastante para responder na requisição.
    if (method === 'GET' && route === '/ai') return json(lens.ai())
    if (method === 'GET' && route === '/project') return json(lens.project())
    if (method === 'GET' && route === '/tests') return json(lens.tests())

    // A suíte é a única lente que RODA o projeto: o POST dispara e responde na hora, o GET
    // acompanha. Prender a execução na requisição faria um proxy com tempo limite cortar a
    // resposta antes do fim.
    if (method === 'POST' && route === '/tests/run') return json(lens.suite.start())
    if (method === 'GET' && route === '/tests/run') return json(lens.suite.state())

    // A conformidade executa a régua do Opus sobre o código: segundos, não milissegundos.
    // O erro volta explícito em vez de virar 500 sem motivo.
    if (method === 'GET' && route === '/conformity') {
      try {
        return json(await lens.conformity())
      } catch (cause) {
        options.onError?.(route, cause)
        return json({ error: 'check_failed' }, 503)
      }
    }

    return notFound('not_found')
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function notFound(error: 'not_found' | 'no_manifest'): Response {
  return json({ error }, 404)
}
