/**
 * Lente de IA — o que este repositório carrega de configuração para agentes.
 *
 * A fonte é o próprio repositório, não um cadastro: agentes, skills, instruções, hooks e
 * MCP servers são arquivos versionados, e é isso que um agente encontra ao abrir o
 * projeto. Vale para qualquer projeto, inclusive um que não use Opus.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface AiDoc {
  slug: string
  name: string
  description: string
  /** Corpo do documento, sem o frontmatter. */
  content: string
  file: string
}

export interface AiHook {
  event: string
  matcher: string
  command: string
}

export interface AiMcpServer {
  name: string
  kind: string
  spec: string
}

export interface AiInstruction {
  file: string
  tokens: number
}

export interface AiInventory {
  /** Existe `.claude/` no repositório? Falso = projeto sem configuração de agente. */
  configured: boolean
  agents: AiDoc[]
  skills: AiDoc[]
  instructions: AiInstruction[]
  /**
   * Custo de contexto DE PÉ: quanto entra em toda sessão de agente, aproximado. É um
   * empurrão para podar instrução que só cresce — não entra em gate nenhum.
   */
  contextTokens: number
  hooks: AiHook[]
  hookSources: string[]
  mcp: AiMcpServer[]
}

/** Estimativa barata (~4 caracteres por token): ordem de grandeza, não contagem. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Frontmatter YAML de primeiro nível — só o que precisamos: nome e descrição. */
function frontmatter(source: string): { meta: Record<string, string>; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (match === null) return { meta: {}, body: source }
  const meta: Record<string, string> = {}
  for (const line of match[1]!.split('\n')) {
    const pair = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
    if (pair === null) continue
    let value = pair[2]!.trim()
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value) as string
      } catch {
        /* Aspas soltas → mantém como está. */
      }
    }
    meta[pair[1]!] = value
  }
  return { meta, body: source.slice(match[0].length) }
}

function readDoc(path: string, slug: string, file: string): AiDoc | null {
  try {
    const { meta, body } = frontmatter(readFileSync(path, 'utf8'))
    return { slug, name: meta['name'] ?? slug, description: meta['description'] ?? '', content: body.trim(), file }
  } catch {
    return null
  }
}

function readAgents(root: string): AiDoc[] {
  const dir = join(root, '.claude', 'agents')
  let files: string[]
  try {
    files = readdirSync(dir).filter((name) => name.endsWith('.md'))
  } catch {
    return []
  }
  return files
    .map((name) => readDoc(join(dir, name), name.slice(0, -3), `.claude/agents/${name}`))
    .filter((doc): doc is AiDoc => doc !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function readSkills(root: string): AiDoc[] {
  const dir = join(root, '.claude', 'skills')
  let dirs: string[]
  try {
    dirs = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
  return dirs
    .map((slug) => readDoc(join(dir, slug, 'SKILL.md'), slug, `.claude/skills/${slug}/SKILL.md`))
    .filter((doc): doc is AiDoc => doc !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Hooks vivem no settings do projeto e no local; o CLI une os dois, a lente também. */
function readHooks(root: string): { hooks: AiHook[]; sources: string[] } {
  const hooks: AiHook[] = []
  const sources: string[] = []
  for (const relative of ['.claude/settings.json', '.claude/settings.local.json']) {
    const path = join(root, relative)
    if (!existsSync(path)) continue
    sources.push(relative)
    try {
      const config = JSON.parse(readFileSync(path, 'utf8')) as {
        hooks?: Record<string, { matcher?: string; hooks?: { type?: string; command?: string }[] }[]>
      }
      for (const [event, entries] of Object.entries(config.hooks ?? {})) {
        for (const entry of entries ?? []) {
          for (const hook of entry.hooks ?? []) {
            hooks.push({ event, matcher: entry.matcher ?? '', command: hook.command ?? hook.type ?? '' })
          }
        }
      }
    } catch {
      /* Ilegível → segue com as outras fontes. */
    }
  }
  return { hooks, sources }
}

function readMcp(root: string): AiMcpServer[] {
  const path = join(root, '.mcp.json')
  if (!existsSync(path)) return []
  try {
    const config = JSON.parse(readFileSync(path, 'utf8')) as {
      mcpServers?: Record<string, { command?: string; args?: string[]; url?: string; type?: string }>
    }
    return Object.entries(config.mcpServers ?? {}).map(([name, server]) => ({
      name,
      kind: server.url !== undefined ? (server.type ?? 'http') : 'stdio',
      spec: server.url ?? [server.command, ...(server.args ?? [])].filter((part): part is string => part !== undefined).join(' '),
    }))
  } catch {
    return []
  }
}

export function aiInventory(root: string, extraInstructions: string[] = []): AiInventory {
  const candidates = ['CLAUDE.md', 'AGENTS.md', ...extraInstructions, '.claude/memory/MEMORY.md']
  const instructions: AiInstruction[] = []
  for (const relative of new Set(candidates)) {
    const path = join(root, relative)
    if (!existsSync(path)) continue
    try {
      instructions.push({ file: relative, tokens: estimateTokens(readFileSync(path, 'utf8')) })
    } catch {
      /* Ilegível → pula. */
    }
  }
  const { hooks, sources } = readHooks(root)
  return {
    configured: existsSync(join(root, '.claude')),
    agents: readAgents(root),
    skills: readSkills(root),
    instructions,
    contextTokens: instructions.reduce((total, item) => total + item.tokens, 0),
    hooks,
    hookSources: sources,
    mcp: readMcp(root),
  }
}
