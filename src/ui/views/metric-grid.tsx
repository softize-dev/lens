import type { ComponentProps, ReactElement } from 'react'
import { cn } from '@softize/opus/ui/react'

/**
 * A grade de `MetricCard` das lentes: dois por linha a partir de `sm`, quatro a partir de
 * `xl`. A view decide os cards; a grade só fixa a cadência das colunas.
 */
export function MetricGrid({ className, ...props }: ComponentProps<'div'>): ReactElement {
  return (
    <div
      data-slot="metric-grid"
      className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}
      {...props}
    />
  )
}
