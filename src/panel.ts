/**
 * Painel da lente — página autocontida, servida pelo motor.
 *
 * Fora do bundle da SPA de propósito (ADR 0054): a interface de depuração não entra no
 * build do produto por construção, e não por disciplina de import. Sem dependência
 * externa, sem etapa de build e sem recurso remoto — o que a página precisa vem do
 * prefixo de dados na mesma origem.
 *
 * São duas leituras sobre o mesmo projeto: o que uma requisição FEZ (telemetria) e o que
 * o projeto DECLARA (estrutura e documentação). Elas vivem juntas porque a pergunta do
 * loop de desenvolvimento costuma atravessar as duas.
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
header { display:flex; align-items:center; gap:1rem; padding:0.75rem 1.25rem; border-bottom:1px solid var(--line); }
h1 { font-size:1rem; margin:0; letter-spacing:0.02em; }
h2 { font-size:0.9375rem; margin:0 0 0.75rem; }
h3 { font-size:0.8125rem; color:var(--muted); font-weight:600; text-transform:uppercase;
  letter-spacing:0.04em; margin:1.5rem 0 0.5rem; }
nav.tabs { display:flex; gap:0.25rem; }
nav.tabs button, header button.action { font:inherit; padding:0.25rem 0.75rem; border:1px solid transparent;
  border-radius:0.375rem; background:none; color:var(--muted); cursor:pointer; }
nav.tabs button.active { background:var(--panel); border-color:var(--line); color:var(--fg); }
header button.action { margin-left:auto; border-color:var(--line); background:var(--panel); color:var(--fg); }
main { display:grid; grid-template-columns:22rem 1fr; height:calc(100vh - 3.25rem); }
main.single { grid-template-columns:1fr; }
main.single #list { display:none; }
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
.muted { color:var(--muted); }
code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:0.8125rem; word-break:break-all; }
.bar { height:0.375rem; background:var(--line); border-radius:0.25rem; overflow:hidden; margin:0.5rem 0 1rem; }
.bar span { display:block; height:100%; background:var(--accent); }
`

const SCRIPT = `
const listEl = document.getElementById('list')
const detailEl = document.getElementById('detail')
const mainEl = document.querySelector('main')
let tab = 'requests'
let records = []
let structure = null
let docs = null
let selectedRecord = null
let selectedDomain = null

function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = String(text)
  return node
}
function ms(value) { return Math.round(value) + ' ms' }
function clock(value) { return new Date(value).toLocaleTimeString() }
function facts(pairs) {
  const dl = el('dl')
  for (const [term, value] of pairs) dl.append(el('dt', undefined, term), el('dd', undefined, value))
  return dl
}
function table(headers, rows) {
  const node = el('table')
  const head = el('tr')
  for (const [text, cls] of headers) head.append(el('th', cls, text))
  node.append(head)
  for (const cells of rows) {
    const row = el('tr')
    for (const [text, cls] of cells) {
      const cell = el('td', cls)
      cell.append(el('code', undefined, text === undefined || text === '' ? '—' : text))
      row.append(cell)
    }
    node.append(row)
  }
  return node
}
async function json(url) {
  const response = await fetch(url)
  return response.ok ? response.json() : null
}

function entryLabel(entry) {
  if (entry.kind === 'query') return entry.sql
  if (entry.kind === 'event') return entry.type
  if (entry.kind === 'job') return entry.action + ' (' + entry.jobId + ')'
  if (entry.kind === 'ai') return entry.operation + (entry.model ? ' — ' + entry.model : '')
  return entry.name
}

function renderRequestsList() {
  listEl.replaceChildren()
  if (records.length === 0) {
    listEl.append(el('p', 'empty', 'No requests recorded yet. Exercise the app and refresh.'))
    return
  }
  for (const record of records) {
    const row = el('button', 'row' + (selectedRecord === record.id ? ' active' : ''))
    const top = el('div', 'row-top')
    top.append(el('span', 'row-name', record.root), el('span', 'row-time', ms(record.durationMs)))
    const meta = el('div', 'row-meta')
    meta.append(
      el('span', record.outcome === 'success' ? 'ok' : 'fail', record.outcome),
      el('span', undefined, ' · ' + record.entryCount + ' entries · ' + clock(record.startedAt)),
    )
    row.append(top, meta)
    row.addEventListener('click', () => { selectRecord(record.id) })
    listEl.append(row)
  }
}

function renderRecord(record) {
  detailEl.replaceChildren()
  if (!record) {
    detailEl.append(el('p', 'empty', 'Select a request to see what it did.'))
    return
  }
  detailEl.append(el('h2', undefined, record.root))
  detailEl.append(facts([
    ['Outcome', record.outcome],
    ['Duration', ms(record.durationMs)],
    ['Started', new Date(record.startedAt).toLocaleString()],
    ['Request id', record.requestId || '—'],
    ['Trace id', record.traceId || '—'],
    ['Provenance', record.provenance ? record.provenance.kind : '—'],
  ]))
  const rows = record.entries.map((entry) => [
    [entry.kind],
    [entryLabel(entry)],
    [entry.durationMs === undefined ? '—' : ms(entry.durationMs), 'num'],
  ])
  detailEl.append(table([['Kind'], ['What'], ['Duration', 'num']], rows))
  for (const entry of record.entries) {
    if (entry.error) detailEl.append(el('p', 'fail', entry.name + ': ' + (entry.error.message || entry.error.code)))
  }
}

function renderDomainsList() {
  listEl.replaceChildren()
  if (!structure) {
    listEl.append(el('p', 'empty', 'No manifest found. Run opus gen to publish the projection.'))
    return
  }
  for (const domain of structure.domains) {
    const row = el('button', 'row' + (selectedDomain === domain.name ? ' active' : ''))
    const top = el('div', 'row-top')
    top.append(el('span', 'row-name', domain.name))
    row.append(top)
    row.append(el('div', 'row-meta', domain.actions + ' actions · ' + domain.entities + ' entities'))
    row.addEventListener('click', () => { selectedDomain = domain.name; renderDomainsList(); renderDomain() })
    listEl.append(row)
  }
}

function ofDomain(collection) {
  return structure[collection].filter((item) => item.domain === selectedDomain)
}

function section(title, headers, rows) {
  if (rows.length === 0) return
  detailEl.append(el('h3', undefined, title))
  detailEl.append(table(headers, rows))
}

function renderDomain() {
  detailEl.replaceChildren()
  if (!structure) {
    detailEl.append(el('p', 'empty', 'Structure comes from .opus/manifest.json — run opus gen first.'))
    return
  }
  if (!selectedDomain) {
    detailEl.append(el('h2', undefined, 'Structure'))
    detailEl.append(facts([
      ['Domains', structure.domains.length],
      ['Actions', structure.actions.length],
      ['Entities', structure.entities.length],
      ['Dictionaries', structure.dicts.length],
      ['Reactions', structure.reactions.length],
      ['Schedules', structure.schedules.length],
      ['Opus', structure.opusVersion || '—'],
    ]))
    detailEl.append(el('p', 'muted', 'Pick a domain to see what it declares.'))
    return
  }
  detailEl.append(el('h2', undefined, selectedDomain))
  section('Actions', [['Name'], ['Kind'], ['Permission'], ['Doc']],
    ofDomain('actions').map((a) => [[a.name], [a.kind], [a.permission], [a.description]]))
  section('Entities', [['Name'], ['Table'], ['Fields'], ['Doc']],
    ofDomain('entities').map((e) => [[e.name], [e.table], [String(e.fields.length), 'num'], [e.description]]))
  for (const entity of ofDomain('entities')) {
    section('Fields · ' + entity.name, [['Field'], ['Type'], ['Null'], ['Doc']],
      entity.fields.map((f) => [[f.name], [f.type + (f.pk ? ' (pk)' : '')], [f.nullable ? 'yes' : 'no'], [f.doc]]))
  }
  section('Dictionaries', [['Name'], ['Entries'], ['Doc']],
    ofDomain('dicts').map((d) => [[d.name], [String(d.entryCount), 'num'], [d.description]]))
  section('Reactions', [['Name'], ['On'], ['Doc']],
    ofDomain('reactions').map((r) => [[r.name], [r.on.join(', ')], [r.description]]))
  section('Schedules', [['Name'], ['Action'], ['When'], ['Enabled']],
    ofDomain('schedules').map((s) => [[s.name], [s.action], [s.when], [s.enabled ? 'yes' : 'no']]))
}

function renderDocs() {
  detailEl.replaceChildren()
  if (!docs) {
    detailEl.append(el('p', 'empty', 'Documentation coverage needs the manifest — run opus gen first.'))
    return
  }
  const percent = docs.total === 0 ? 0 : Math.round((docs.documented / docs.total) * 100)
  detailEl.append(el('h2', undefined, 'Documentation'))
  detailEl.append(facts([
    ['Declarations', docs.documented + ' of ' + docs.total + ' documented (' + percent + '%)'],
    ['Fields', docs.fields.documented + ' of ' + docs.fields.total + ' documented'],
  ]))
  const bar = el('div', 'bar')
  const fill = el('span')
  fill.style.width = percent + '%'
  bar.append(fill)
  detailEl.append(bar)
  if (docs.gaps.length === 0) {
    detailEl.append(el('p', 'muted', 'Every action and entity carries a description.'))
    return
  }
  detailEl.append(el('h3', undefined, 'Missing a description'))
  detailEl.append(table([['Kind'], ['Domain'], ['Name']], docs.gaps.map((g) => [[g.kind], [g.domain], [g.name]])))
}

async function selectRecord(key) {
  const record = await json('/__lens/api/records/' + encodeURIComponent(key))
  if (!record) { renderRecord(null); return }
  selectedRecord = record.id
  history.replaceState(null, '', '/lens/r/' + (record.requestId || record.id))
  renderRequestsList()
  renderRecord(record)
}

function renderTab() {
  mainEl.className = tab === 'docs' ? 'single' : ''
  for (const button of document.querySelectorAll('nav.tabs button')) {
    button.className = button.dataset.tab === tab ? 'active' : ''
  }
  if (tab === 'requests') { renderRequestsList(); renderRecord(null) }
  if (tab === 'structure') { renderDomainsList(); renderDomain() }
  if (tab === 'docs') { renderDocs() }
}

async function refresh() {
  if (tab === 'requests') records = (await json('/__lens/api/records')) || []
  if (tab === 'structure' && !structure) structure = await json('/__lens/api/structure')
  if (tab === 'docs' && !docs) docs = await json('/__lens/api/docs')
  renderTab()
}

for (const button of document.querySelectorAll('nav.tabs button')) {
  button.addEventListener('click', () => { tab = button.dataset.tab; refresh() })
}
document.getElementById('refresh').addEventListener('click', () => { refresh() })

const deepLink = location.pathname.match(/\\/lens\\/r\\/(.+)$/)
refresh().then(() => {
  if (deepLink) return selectRecord(decodeURIComponent(deepLink[1]))
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
    '<header><h1>Lens</h1>',
    '<nav class="tabs">',
    '<button type="button" data-tab="requests" class="active">Requests</button>',
    '<button type="button" data-tab="structure">Structure</button>',
    '<button type="button" data-tab="docs">Docs</button>',
    '</nav>',
    '<button id="refresh" class="action" type="button">Refresh</button></header>',
    '<main><nav id="list"></nav><section id="detail"></section></main>',
    '<script>' + SCRIPT + '</script>',
    '</body></html>',
  ].join('')
}
