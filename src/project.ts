/**
 * Lente do projeto — qual régua está valendo aqui.
 *
 * Três versões costumam divergir e a confusão nasce de olhar só uma: a que o marcador do
 * app aplicou, a que está instalada e a que a branch principal adotou. A lente mostra as
 * três, e diz de onde leu cada uma.
 *
 * A conformidade é executada pela régua DO PROJETO observado, não pela que este pacote
 * carrega: resolver `@softize/opus/check` a partir do diretório observado é o que evita
 * julgar um projeto com a régua de outra versão.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface PackageAdoption {
  name: string
  /** Versão que o `base.json` declara ter aplicado. */
  applied: string | null
  /** Versão instalada em node_modules e de onde ela foi resolvida. */
  installed: string | null
  installedFrom: 'project' | 'lens' | null
  /** Versão que a branch principal adotou — registry não é política. */
  adopted: string | null
  adoptedRef: string | null
  /** Aplicada e adotada divergem: reconcilie antes de commit ou review. */
  drift: boolean
}

export interface ProjectStatus {
  root: string
  /** Marcador por app (`opus.json`), quando existe. */
  marker: string | null
  packages: PackageAdoption[]
  /** O que falta para o projeto estar inicializado. */
  missing: string[]
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function git(root: string, args: string[]): string | null {
  const { GIT_DIR: _dir, GIT_WORK_TREE: _tree, ...env } = process.env
  try {
    const value = execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env }).trim()
    return value.length > 0 ? value : null
  } catch {
    return null
  }
}

function declaredVersion(manifest: Record<string, unknown> | null, name: string): string | null {
  const packages = manifest?.['packages']
  if (packages === null || typeof packages !== 'object') return null
  const entry = (packages as Record<string, { version?: unknown }>)[name]
  return typeof entry?.version === 'string' ? entry.version : null
}

/** A autoridade é a branch que o clone já conhece; buscar no registry seria outra pergunta. */
function adoptedVersion(root: string, name: string): { version: string | null; ref: string | null } {
  const head = git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])
  for (const ref of [...new Set([head, 'origin/main', 'main'].filter((value): value is string => value !== null))]) {
    const raw = git(root, ['show', `${ref}:base.json`])
    if (raw === null) continue
    try {
      const version = declaredVersion(JSON.parse(raw) as Record<string, unknown>, name)
      if (version !== null) return { version, ref }
    } catch {
      /* base.json ilegível naquele ref → tenta o próximo. */
    }
  }
  return { version: null, ref: null }
}

function installedVersion(
  from: string,
  name: string,
  repoRoot: string,
): { version: string | null; from: 'project' | 'lens' | null } {
  try {
    const resolved = createRequire(join(from, 'package.json')).resolve(`${name}/package.json`)
    const version = (readJson(resolved)?.['version'] as string | undefined) ?? null
    // A resolução do Node sobe diretórios e pode escapar para outra instalação. Num
    // monorepo pnpm o arquivo real mora no store da RAIZ (`node_modules/.pnpm/...`), então
    // a fronteira que importa é o repositório observado, não o subdiretório do serviço.
    return { version, from: resolved.startsWith(`${repoRoot}/`) ? 'project' : 'lens' }
  } catch {
    return { version: null, from: null }
  }
}

export function projectStatus(root: string, appRoot: string = root): ProjectStatus {
  const manifest = readJson(join(root, 'base.json'))
  const markerFile = join(appRoot, 'opus.json')
  const marker = existsSync(markerFile) ? ((readJson(markerFile)?.['version'] as string | undefined) ?? null) : null

  const names = Object.keys((manifest?.['packages'] as Record<string, unknown> | undefined) ?? {})
  const packages = names.map((name) => {
    const applied = declaredVersion(manifest, name)
    const { version: installed, from } = installedVersion(appRoot, name, root)
    const { version: adopted, ref } = adoptedVersion(root, name)
    return {
      name,
      applied,
      installed,
      installedFrom: from,
      adopted,
      adoptedRef: ref,
      drift: applied !== null && adopted !== null && applied !== adopted,
    }
  })

  const missing: string[] = []
  if (manifest === null) missing.push('base.json')
  if (names.includes('@softize/opus') && marker === null) missing.push('opus.json')

  return { root, marker, packages, missing }
}

export interface ConformityFinding {
  file: string
  rule: string
  action: string
  line?: number
  message: string
}

export interface Conformity {
  /** De onde veio a régua: a instalação do projeto observado, ou a deste pacote. */
  rulerFrom: 'project' | 'lens'
  rulerVersion: string | null
  files: number
  actions: number
  findings: ConformityFinding[]
}

interface CheckEngine {
  scanDir: (dir: string) => Promise<{ files: number; actions: number; findings: ConformityFinding[] }>
}

/**
 * Executa `opus check` pela API do próprio Opus instalado no projeto observado. Sem
 * `--json` no CLI, ler a saída de texto seria adivinhação; a API devolve os achados.
 */
export async function conformity(dir: string): Promise<Conformity> {
  const require = createRequire(join(dir, 'package.json'))
  let from: 'project' | 'lens' = 'lens'
  let engine: CheckEngine
  try {
    const resolved = require.resolve('@softize/opus/check')
    from = resolved.startsWith(`${dir}/`) || resolved.includes('/node_modules/') ? 'project' : 'lens'
    engine = (await import(pathToFileURL(resolved).href)) as CheckEngine
  } catch {
    // @ts-expect-error — engine `.mjs` do Opus, sem tipos publicados.
    engine = (await import('@softize/opus/check')) as CheckEngine
  }
  const { version } = installedVersion(dir, '@softize/opus', dir)
  const result = await engine.scanDir(dir)
  return {
    rulerFrom: from,
    rulerVersion: version,
    files: result.files,
    actions: result.actions,
    findings: result.findings,
  }
}
