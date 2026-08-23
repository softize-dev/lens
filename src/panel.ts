/**
 * Painel da lente — página autocontida, servida pelo motor.
 *
 * Fora do bundle da SPA de propósito (ADR 0054): a interface de depuração não entra no
 * build do produto por construção, e não por disciplina de import. Sem dependência
 * externa, sem etapa de build e sem recurso remoto — o que a página precisa vem do
 * prefixo de dados na mesma origem.
 *
 * O texto do painel é inglês, a exceção deliberada que a ADR registra: o leitor aqui é
 * quem desenvolve e o vocabulário é o das ferramentas equivalentes.
 */

const STYLE = `
:root { color-scheme: light dark; --bg:#fff; --fg:#111; --muted:#666; --line:#e5e5e5;
  --panel:#fafafa; --ok:#137333; --fail:#b3261e; --accent:#1a73e8; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#131313; --fg:#ededed; --muted:#9b9b9b; --line:#2c2c2c; --panel:#1b1b1b;
    --ok:#7ee2a8; --fail:#ff8a80; --accent:#8ab4f8; }
}
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:0.875rem/1.5 ui-sans-serif,system-ui,sans-serif; }
header { display:flex; align-items:baseline; gap:1rem; padding:1rem 1.25rem; border-bottom:1px solid var(--line); }
h1 { font-size:1rem; margin:0; letter-spacing:0.02em; }
header p { margin:0; color:var(--muted); font-size:0.8125rem; }
header button { margin-left:auto; font:inherit; padding:0.25rem 0.75rem; border:1px solid var(--line);
  border-radius:0.375rem; background:var(--panel); color:var(--fg); cursor:pointer; }
main { display:grid; grid-template-columns:22rem 1fr; height:calc(100vh - 3.5rem); }
@media (max-width: 60rem) { main { grid-template-columns:1fr; height:auto; } }
#list { overflow-y:auto; border-right:1px solid var(--line); }
#detail { overflow-y:auto; padding:1.25rem; }
.row { display:block; width:100%; text-align:left; font:inherit; color:inherit; background:none;
  border:0; border-bottom:1px solid var(--line); padding:0.625rem 1rem; cursor:pointer; }
.row:hover, .row.active { background:var(--panel); }
.row-top { display:flex; gap:0.5rem; align-items:baseline; }
.row-name { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.row-time { margin-left:auto; color:var(--muted); font-variant-numeric:tabular-nums; }
.row-meta { color:var(--muted); font-size:0.8125rem; }
.ok { color:var(--ok); } .fail { color:var(--fail); }
.empty { padding:1.25rem; color:var(--muted); }
dl { display:grid; grid-template-columns:auto 1fr; gap:0.25rem 1rem; margin:0 0 1.25rem; }
dt { color:var(--muted); } dd { margin:0; font-variant-numeric:tabular-nums; word-break:break-all; }
table { width:100%; border-collapse:collapse; }
th { text-align:left; color:var(--muted); font-weight:500; border-bottom:1px solid var(--line); padding:0.375rem 0.5rem; }
td { border-bottom:1px solid var(--line); padding:0.375rem 0.5rem; vertical-align:top; }
td.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.tag { display:inline-block; min-width:4.5rem; color:var(--muted); }
code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:0.8125rem; word-break:break-all; }
`

const SCRIPT = `
const listEl = document.getElementById('list')
const detailEl = document.getElementById('detail')
let records = []
let selected = null

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = String(text)
  return node
}

function ms(value) { return Math.round(value) + ' ms' }
function clock(value) { return new Date(value).toLocaleTimeString() }

function label(entry) {
  if (entry.kind === 'query') return entry.sql
  if (entry.kind === 'event') return entry.type
  if (entry.kind === 'job') return entry.action + ' (' + entry.jobId + ')'
  if (entry.kind === 'ai') return entry.operation + (entry.model ? ' — ' + entry.model : '')
  return entry.name
}

function renderList() {
  listEl.replaceChildren()
  if (records.length === 0) {
    listEl.append(el('p', 'empty', 'No requests recorded yet. Exercise the app and refresh.'))
    return
  }
  for (const record of records) {
    const row = el('button', 'row' + (selected === record.id ? ' active' : ''))
    const top = el('div', 'row-top')
    top.append(el('span', 'row-name', record.root), el('span', 'row-time', ms(record.durationMs)))
    const meta = el('div', 'row-meta')
    meta.append(
      el('span', record.outcome === 'success' ? 'ok' : 'fail', record.outcome),
      el('span', undefined, ' · ' + record.entryCount + ' entries · ' + clock(record.startedAt)),
    )
    row.append(top, meta)
    row.addEventListener('click', () => { select(record.id) })
    listEl.append(row)
  }
}

function renderDetail(record) {
  detailEl.replaceChildren()
  if (!record) {
    detailEl.append(el('p', 'empty', 'Select a request to see what it did.'))
    return
  }
  detailEl.append(el('h2', undefined, record.root))
  const dl = el('dl')
  const facts = [
    ['Outcome', record.outcome],
    ['Duration', ms(record.durationMs)],
    ['Started', new Date(record.startedAt).toLocaleString()],
    ['Request id', record.requestId || '—'],
    ['Trace id', record.traceId || '—'],
    ['Provenance', record.provenance ? record.provenance.kind : '—'],
  ]
  for (const [term, value] of facts) {
    dl.append(el('dt', undefined, term), el('dd', undefined, value))
  }
  detailEl.append(dl)

  const table = el('table')
  const head = el('tr')
  head.append(el('th', undefined, 'Kind'), el('th', undefined, 'What'), el('th', 'num', 'Duration'))
  table.append(head)
  for (const entry of record.entries) {
    const row = el('tr')
    row.append(el('td', undefined, entry.kind))
    const what = el('td')
    what.append(el('code', undefined, label(entry)))
    if (entry.error) {
      what.append(el('div', 'fail', entry.error.message || entry.error.code || entry.error))
    }
    row.append(what)
    row.append(el('td', 'num', entry.durationMs === undefined ? '—' : ms(entry.durationMs)))
    table.append(row)
  }
  detailEl.append(table)
}

async function select(key) {
  const response = await fetch('/__lens/api/records/' + encodeURIComponent(key))
  if (!response.ok) { renderDetail(null); return }
  const record = await response.json()
  selected = record.id
  history.replaceState(null, '', '/lens/r/' + (record.requestId || record.id))
  renderList()
  renderDetail(record)
}

async function refresh() {
  const response = await fetch('/__lens/api/records')
  records = response.ok ? await response.json() : []
  renderList()
}

document.getElementById('refresh').addEventListener('click', () => { refresh() })

const deepLink = location.pathname.match(/\\/lens\\/r\\/(.+)$/)
refresh().then(() => {
  if (deepLink) return select(decodeURIComponent(deepLink[1]))
  renderDetail(null)
})
`

export function renderPanel(): string {
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Lens</title>',
    '<style>' + STYLE + '</style>',
    '</head><body>',
    '<header><h1>Lens</h1><p>What each request actually did.</p>',
    '<button id="refresh" type="button">Refresh</button></header>',
    '<main><nav id="list"></nav><section id="detail"></section></main>',
    '<script>' + SCRIPT + '</script>',
    '</body></html>',
  ].join('')
}
