/**
 * Tabela das lentes de código — uma forma só para listas de declarações.
 *
 * Cada lente muda as colunas, não a mecânica: cabeçalho discreto, linhas densas e um
 * campo de busca quando a lista é grande o bastante para caçar algo dentro dela.
 */
import { useMemo, useState, type ReactNode } from 'react'
import {
  DataState,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@softize/opus/ui/react'

export interface Column<T> {
  header: string
  cell: (item: T) => ReactNode
  /** Classes da célula — largura, alinhamento, tom. */
  className?: string
}

export interface DeclarationTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  /** Texto por onde a busca filtra; ausente desliga o campo. */
  search?: (item: T) => string
  emptyMessage: string
  loading?: boolean
  error?: { message?: string } | null
}

export function DeclarationTable<T>({
  columns,
  rows,
  search,
  emptyMessage,
  loading = false,
  error = null,
}: DeclarationTableProps<T>): React.ReactElement {
  const [term, setTerm] = useState('')
  const filtered = useMemo(() => {
    if (search === undefined || term.trim() === '') return rows
    const needle = term.trim().toLowerCase()
    return rows.filter((row) => search(row).toLowerCase().includes(needle))
  }, [rows, search, term])

  return (
    <div className="space-y-4">
      {search !== undefined && rows.length > 8 && (
        <Input
          value={term}
          onChange={(event) => {
            setTerm(event.target.value)
          }}
          placeholder="Filtrar…"
          className="max-w-xs"
        />
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.header} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <DataState
            loading={loading}
            error={error}
            empty={filtered.length === 0}
            emptyMessage={term.trim() === '' ? emptyMessage : 'Nenhum resultado corresponde ao filtro.'}
            colSpan={columns.length}
          >
            {filtered.map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell key={column.header} className={column.className}>
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </DataState>
        </TableBody>
      </Table>
    </div>
  )
}
