import type { ComponentProps, ReactElement } from 'react'
import { cn } from '@softize/opus/ui/react'

/**
 * A grade de `MetricCard` das lentes: dois por linha. A view decide os cards; a grade só
 * fixa a cadência das colunas.
 *
 * Sem breakpoint de viewport: desde o Opus 18.1 a interface assume largura mínima de
 * desktop, e a lente segue a mesma régua do produto que ela observa.
 */
export function MetricGrid({ className, ...props }: ComponentProps<'div'>): ReactElement {
  return (
    <div
      data-slot="metric-grid"
      className={cn('grid grid-cols-2 gap-3', className)}
      {...props}
    />
  )
}
