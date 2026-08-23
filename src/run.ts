/**
 * Execução da suíte — a única lente que roda o projeto em vez de lê-lo.
 *
 * É assíncrona por necessidade, não por elegância: uma suíte leva dezenas de segundos e o
 * túnel que serve o ambiente remoto encerra respostas por volta de cem segundos. Manter a
 * execução presa a uma requisição transformaria "os testes demoraram" em "a lente caiu".
 * Então quem pede recebe na hora o estado, e volta para ver o resultado.
 *
 * Uma execução por vez: duas suítes do mesmo repositório disputariam o mesmo banco e
 * passariam a se derrubar, e o veredito perderia sentido.
 */
import { execFile } from 'node:child_process'

export type RunState =
  | { status: 'idle' }
  | { status: 'running'; startedAt: number }
  | {
      status: 'done'
      startedAt: number
      finishedAt: number
      ok: boolean
      /** null quando a execução foi interrompida ou nem chegou a começar. */
      exitCode: number | null
      /** Cauda da saída — o começo raramente importa quando algo falha. */
      output: string
    }

export interface SuiteRunner {
  /** Dispara se não houver execução em andamento; devolve o estado resultante. */
  start(): RunState
  state(): RunState
}

export interface SuiteRunnerOptions {
  timeoutMs?: number
  /** Comando da suíte. Padrão: `pnpm test` no diretório observado. */
  command?: [string, string[]]
  maxOutput?: number
}

function tail(text: string, max: number): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `…${trimmed.slice(trimmed.length - max)}` : trimmed
}

export function createSuiteRunner(dir: string, options: SuiteRunnerOptions = {}): SuiteRunner {
  const timeoutMs = options.timeoutMs ?? 300_000
  const [file, args] = options.command ?? ['pnpm', ['test']]
  const maxOutput = options.maxOutput ?? 12_000
  let state: RunState = { status: 'idle' }

  return {
    state: () => state,
    start() {
      if (state.status === 'running') return state
      const startedAt = Date.now()
      state = { status: 'running', startedAt }
      execFile(
        file,
        args,
        { cwd: dir, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, CI: '1', FORCE_COLOR: '0' } },
        (error, stdout, stderr) => {
          const failure = error as (Error & { code?: number | string; killed?: boolean }) | null
          const done = (ok: boolean, exitCode: number | null, output: string): void => {
            state = { status: 'done', startedAt, finishedAt: Date.now(), ok, exitCode, output }
          }
          // Falha de AMBIENTE volta explícita: "não deu para rodar" não é "os testes falharam".
          if (failure?.killed === true) {
            done(false, null, `The suite passed the ${Math.round(timeoutMs / 1000)}s limit and was stopped.`)
            return
          }
          if (failure !== null && typeof failure.code === 'string') {
            done(false, null, `Could not run the suite (${failure.code}).`)
            return
          }
          const exitCode = failure !== null && typeof failure.code === 'number' ? failure.code : failure !== null ? 1 : 0
          done(exitCode === 0, exitCode, tail(`${stdout}${stderr}`, maxOutput))
        },
      )
      return state
    },
  }
}
