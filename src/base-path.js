/**
 * Normalização dos prefixos, compartilhada pelo servidor, pelo painel e pelo plugin.
 *
 * `/lens/` e `/lens` são o mesmo prefixo; a barra final duplicaria o separador das rotas.
 * A raiz (`/`) é preservada: reduzi-la a `''` faria o prefixo casar qualquer caminho do
 * servidor. É função pura, sem acesso a arquivo ou processo — por isso o painel pode
 * consumi-la, ao contrário do resto do servidor.
 *
 * É JavaScript porque o plugin Vite também a usa, e ele é carregado pelo Node, que não
 * remove tipos de arquivos dentro de `node_modules`.
 *
 * @param {string} path
 * @returns {string}
 */
export function trimSlash(path) {
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}
