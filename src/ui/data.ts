/**
 * Acesso aos dados da lente.
 *
 * As rotas não são actions Opus de propósito: a lente observa o produto e não faz parte
 * dele, então nada aqui entra no manifest, na documentação gerada ou na auditoria. Por
 * isso o acesso é `fetch` direto, e não os hooks de action do SDK. O prefixo vem da
 * montagem (`apiBase`), com o mesmo padrão do handler do servidor.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type {
  AiInventory,
  RunState,
  Conformity,
  DocCoverage,
  LensRecord,
  LensRecordSummary,
  ProjectStatus,
  Structure,
  TestInventory,
} from '../index.ts'
import { useLensAddress } from './config.tsx'

async function get<T>(url: string): Promise<T | null> {
  const response = await fetch(url)
  // 404 é resposta legítima: registro que saiu do buffer, ou projeto sem manifest.
  if (response.status === 404) return null
  if (!response.ok) throw new Error(String(response.status))
  return (await response.json()) as T
}

export function useRecords(): UseQueryResult<LensRecordSummary[] | null> {
  const { apiBase } = useLensAddress()
  return useQuery({ queryKey: ['lens', 'records'], queryFn: () => get<LensRecordSummary[]>(apiBase + '/records') })
}

export function useRecord(key: string | null): UseQueryResult<LensRecord | null> {
  const { apiBase } = useLensAddress()
  return useQuery({
    queryKey: ['lens', 'record', key],
    queryFn: () => (key === null ? null : get<LensRecord>(apiBase + '/records/' + encodeURIComponent(key))),
    enabled: key !== null,
  })
}

export function useStructure(): UseQueryResult<Structure | null> {
  const { apiBase } = useLensAddress()
  return useQuery({
    queryKey: ['lens', 'structure'],
    queryFn: () => get<Structure>(apiBase + '/structure'),
    staleTime: 30_000,
  })
}

export function useDocs(): UseQueryResult<DocCoverage | null> {
  const { apiBase } = useLensAddress()
  return useQuery({ queryKey: ['lens', 'docs'], queryFn: () => get<DocCoverage>(apiBase + '/docs'), staleTime: 30_000 })
}

/**
 * Execução da suíte: dispara e acompanha. Enquanto roda, a tela repergunta sozinha — é o
 * preço de a execução não caber numa resposta só, e o usuário não deve pagar com F5.
 */
export function useSuiteRun(): {
  state: RunState | null | undefined
  start: () => void
  starting: boolean
} {
  const { apiBase } = useLensAddress()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['lens', 'suite'],
    queryFn: () => get<RunState>(apiBase + '/tests/run'),
    refetchInterval: (current) => (current.state.data?.status === 'running' ? 2_000 : false),
  })
  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(apiBase + '/tests/run', { method: 'POST' })
      return (await response.json()) as RunState
    },
    onSuccess: (state) => {
      client.setQueryData(['lens', 'suite'], state)
    },
  })
  return {
    state: query.data,
    start: () => {
      mutation.mutate()
    },
    starting: mutation.isPending,
  }
}

export function useAi(): UseQueryResult<AiInventory | null> {
  const { apiBase } = useLensAddress()
  return useQuery({ queryKey: ['lens', 'ai'], queryFn: () => get<AiInventory>(apiBase + '/ai'), staleTime: 30_000 })
}

export function useProject(): UseQueryResult<ProjectStatus | null> {
  const { apiBase } = useLensAddress()
  return useQuery({
    queryKey: ['lens', 'project'],
    queryFn: () => get<ProjectStatus>(apiBase + '/project'),
    staleTime: 30_000,
  })
}

export function useTests(): UseQueryResult<TestInventory | null> {
  const { apiBase } = useLensAddress()
  return useQuery({
    queryKey: ['lens', 'tests'],
    queryFn: () => get<TestInventory>(apiBase + '/tests'),
    staleTime: 30_000,
  })
}

/** A conformidade executa a régua do Opus: só busca quando a tela está aberta. */
export function useConformity(enabled: boolean): UseQueryResult<Conformity | null> {
  const { apiBase } = useLensAddress()
  return useQuery({
    queryKey: ['lens', 'conformity'],
    queryFn: () => get<Conformity>(apiBase + '/conformity'),
    enabled,
    staleTime: 60_000,
  })
}
