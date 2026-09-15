/**
 * Monta o painel como página inteira.
 *
 * O painel traz os próprios providers — cliente de consultas e dicas — porque é uma página
 * separada da aplicação e não deve depender de como ela monta os seus. Tema e utilitários
 * vêm do CSS do projeto, importado antes da montagem (o plugin Vite faz isso), então o
 * painel usa a identidade e a versão do Opus de quem o hospeda.
 */
import { StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@softize/opus/ui/react'
import { LensAddressProvider, type LensAddress } from './config.tsx'
import { LensApp } from './lens-app.tsx'

export type MountLensOptions = Partial<LensAddress>

export function LensRoot({ basePath, apiBase }: MountLensOptions): React.ReactElement {
  // Um cliente por montagem: recriá-lo a cada render descartaria o cache das consultas.
  const [queryClient] = useState(createQueryClient)
  return (
    <LensAddressProvider {...(basePath !== undefined ? { basePath } : {})} {...(apiBase !== undefined ? { apiBase } : {})}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <LensApp />
        </TooltipProvider>
      </QueryClientProvider>
    </LensAddressProvider>
  )
}

export function mountLens(element: HTMLElement, options: MountLensOptions = {}): Root {
  const root = createRoot(element)
  root.render(
    <StrictMode>
      <LensRoot {...options} />
    </StrictMode>,
  )
  return root
}

function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, retry: false } } })
}
