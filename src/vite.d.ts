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

/** Serve o painel da lente no dev server do projeto. Não participa do build. */
export function lens(options?: LensPluginOptions): Plugin
