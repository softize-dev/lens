import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSuiteRunner, type RunState } from './run.ts'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lens-run-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** Espera a execução sair de `running` — a lente é assíncrona, o teste também. */
async function settled(state: () => RunState): Promise<RunState> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const current = state()
    if (current.status === 'done') return current
    await new Promise((resolve) => { setTimeout(resolve, 20) })
  }
  throw new Error('a execução não terminou')
}

describe('execução da suíte', () => {
  it('responde na hora e guarda o veredito quando termina', async () => {
    const runner = createSuiteRunner(dir, { command: ['node', ['-e', 'console.log("2 passed")']] })

    expect(runner.state()).toEqual({ status: 'idle' })
    expect(runner.start().status).toBe('running')

    const done = await settled(runner.state)
    expect(done).toMatchObject({ status: 'done', ok: true, exitCode: 0 })
    expect(done.status === 'done' && done.output).toContain('2 passed')
  })

  it('distingue suíte vermelha de falha de ambiente', async () => {
    const failing = createSuiteRunner(dir, { command: ['node', ['-e', 'console.error("1 failed"); process.exit(1)']] })
    failing.start()
    expect(await settled(failing.state)).toMatchObject({ status: 'done', ok: false, exitCode: 1 })

    const missing = createSuiteRunner(dir, { command: ['comando-que-nao-existe', []] })
    missing.start()
    const broken = await settled(missing.state)
    // Sem código de saída: o processo não chegou a rodar, e a tela precisa dizer isso.
    expect(broken).toMatchObject({ status: 'done', ok: false, exitCode: null })
    expect(broken.status === 'done' && broken.output).toContain('Could not run the suite')
  })

  it('não deixa duas execuções concorrerem pelo mesmo projeto', async () => {
    const runner = createSuiteRunner(dir, { command: ['node', ['-e', 'setTimeout(() => {}, 120)']] })

    const first = runner.start()
    const second = runner.start()

    expect(second).toBe(first)
    await settled(runner.state)
  })

  it('interrompe a suíte que passa do tempo e reporta o limite', async () => {
    const runner = createSuiteRunner(dir, { command: ['node', ['-e', 'setTimeout(() => {}, 5000)']], timeoutMs: 150 })
    runner.start()

    const done = await settled(runner.state)
    expect(done).toMatchObject({ status: 'done', ok: false, exitCode: null })
    expect(done.status === 'done' && done.output).toContain('limit and was stopped')
  })
})
