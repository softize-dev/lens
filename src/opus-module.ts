/**
 * Resolução do Opus a partir do projeto observado.
 *
 * A régua e o leitor de declarações têm que ser os do projeto avaliado, não os que este
 * pacote carrega. É a diferença entre medir alguém pelo padrão dele e medir pelo nosso —
 * e foi o defeito que motivou tirar as lentes do lugar onde estavam, então não é para
 * repeti-lo aqui.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface ResolvedModule<T> {
  module: T
  /** De onde veio: a instalação do projeto observado, ou a deste pacote. */
  from: 'project' | 'lens'
}

export async function resolveOpusModule<T>(dir: string, subpath: string, fallback: () => Promise<T>): Promise<ResolvedModule<T>> {
  try {
    const resolved = createRequire(join(dir, 'package.json')).resolve(`@softize/opus/${subpath}`)
    return { module: (await import(pathToFileURL(resolved).href)) as T, from: 'project' }
  } catch {
    return { module: await fallback(), from: 'lens' }
  }
}
