/**
 * Endereços do painel: onde a página fica e de onde vêm os dados.
 *
 * Os padrões são os mesmos do plugin Vite e do handler do servidor, então um projeto que
 * não mude nada não precisa informar nada. Quem hospeda a lente sob outro prefixo — a
 * cabine do Maestro, por exemplo — passa os dois valores na montagem.
 */
import { createContext, useContext, type ReactNode } from 'react'
import { trimSlash } from '../base-path.js'

export const DEFAULT_BASE_PATH = '/lens'
export const DEFAULT_API_BASE = '/__lens/api'

export interface LensAddress {
  /** Prefixo da página no endereço do navegador. Padrão: `/lens`. */
  basePath: string
  /** Prefixo das rotas de dados. Padrão: `/__lens/api`. */
  apiBase: string
}

const LensAddressContext = createContext<LensAddress>({ basePath: DEFAULT_BASE_PATH, apiBase: DEFAULT_API_BASE })

export function LensAddressProvider({
  basePath = DEFAULT_BASE_PATH,
  apiBase = DEFAULT_API_BASE,
  children,
}: Partial<LensAddress> & { children: ReactNode }): React.ReactElement {
  return (
    <LensAddressContext.Provider value={{ basePath: trimSlash(basePath), apiBase: trimSlash(apiBase) }}>
      {children}
    </LensAddressContext.Provider>
  )
}

export function useLensAddress(): LensAddress {
  return useContext(LensAddressContext)
}
