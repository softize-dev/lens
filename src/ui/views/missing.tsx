/**
 * Ausência de manifesto — o mesmo aviso para todas as lentes que leem a declaração.
 *
 * Não há adivinhação sem `opus gen`: a região fica vazia e diz o comando que a preenche.
 */
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@softize/opus/ui/react'

export function ManifestMissing({ children }: { children?: React.ReactNode }): React.ReactElement {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Nenhum manifesto encontrado</EmptyTitle>
        <EmptyDescription>
          {children ?? 'Esta lente lê o manifesto do projeto.'} Execute{' '}
          <code className="font-mono text-xs">opus gen</code> para gerar os dados.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
