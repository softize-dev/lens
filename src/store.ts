/**
 * Armazenamento do registro — buffer circular por contagem, em arquivos JSON.
 *
 * Gravar no banco da aplicação foi descartado. O Telescope mantém as entradas numa
 * tabela e o modo de falha conhecido é ela crescer até o expurgo agendado não terminar
 * mais. Como retenção longa não é objetivo aqui, o descarte acontece na própria escrita:
 * passou do limite de registros, o mais antigo sai. Não há rotina agendada nem comando de
 * limpeza para lembrar de rodar.
 *
 * A escrita é síncrona de propósito. O volume é de desenvolvimento, o arquivo é pequeno e
 * um registro gravado fora de ordem confunde mais do que o custo economizado.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LensRecord, LensRecordSummary } from './types.ts'

export interface LensStore {
  save(record: LensRecord): void
  list(): LensRecordSummary[]
  get(id: string): LensRecord | null
  clear(): void
}

export interface FileStoreOptions {
  dir: string
  /** Quantos registros o buffer mantém. O excedente mais antigo é removido na escrita. */
  limit?: number
}

const DEFAULT_LIMIT = 100
/** Epoch em milissegundos ocupa 13 dígitos hoje; 14 mantém a ordem lexicográfica estável. */
const STAMP_WIDTH = 14
const RECORD_FILE = /^\d{14}-(.+)\.json$/

/** Só o que é seguro num nome de arquivo; o identificador vem de fora. */
function safeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '')
}

function summarize(record: LensRecord): LensRecordSummary {
  return {
    id: record.id,
    root: record.root,
    startedAt: record.startedAt,
    durationMs: record.durationMs,
    outcome: record.outcome,
    entryCount: record.entries.length,
    ...(record.requestId !== undefined ? { requestId: record.requestId } : {}),
  }
}

export function fileStore(options: FileStoreOptions): LensStore {
  const limit = Math.max(1, options.limit ?? DEFAULT_LIMIT)
  const dir = options.dir

  /** Arquivos de registro em ordem crescente de início. */
  function files(): string[] {
    try {
      return readdirSync(dir)
        .filter((name) => RECORD_FILE.test(name))
        .sort()
    } catch {
      return []
    }
  }

  function read(name: string): LensRecord | null {
    try {
      return JSON.parse(readFileSync(join(dir, name), 'utf8')) as LensRecord
    } catch {
      // Registro truncado ou ilegível não interrompe a leitura dos demais.
      return null
    }
  }

  return {
    save(record) {
      try {
        mkdirSync(dir, { recursive: true })
        const stamp = String(record.startedAt).padStart(STAMP_WIDTH, '0')
        writeFileSync(join(dir, `${stamp}-${safeId(record.id)}.json`), JSON.stringify(record), 'utf8')
        const current = files()
        for (const name of current.slice(0, Math.max(0, current.length - limit))) {
          rmSync(join(dir, name), { force: true })
        }
      } catch {
        // A lente observa o trabalho; uma falha de escrita dela não derruba a requisição.
      }
    },
    list() {
      return files()
        .reverse()
        .map(read)
        .filter((record): record is LensRecord => record !== null)
        .map(summarize)
    },
    get(id) {
      const wanted = safeId(id)
      const name = files().find((file) => RECORD_FILE.exec(file)?.[1] === wanted)
      return name === undefined ? null : read(name)
    },
    clear() {
      if (!existsSync(dir)) return
      for (const name of files()) rmSync(join(dir, name), { force: true })
    },
  }
}
