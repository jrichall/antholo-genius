#!/usr/bin/env node
// Antholo-genius — Phase 0 spike.
// Checks the Hardcover API facts the build depends on and writes spike/REPORT.md.
//
// Usage (Node 18+, no installs needed):
//   1. Put your token in .dev.vars at the repo root:  HARDCOVER_TOKEN="eyJ..."
//   2. node spike/hardcover-spike.mjs                       (uses the default test series)
//      node spike/hardcover-spike.mjs "Series A" "Series B"  (or your own)
//
// The token is never printed or written to the report.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ENDPOINT = process.env.HARDCOVER_ENDPOINT || 'https://api.hardcover.app/v1/graphql';
const UA = 'antholo-genius-spike/0.1 (personal series tracker; one user)';
const DEFAULT_SERIES = [
  'The Stormlight Archive', // novellas at .5 positions
  'The Expanse',            // novellas and short stories
  'The Dresden Files',      // long series, side collections
  'Discworld',              // known duplicate records
  'The Murderbot Diaries'   // novellas as main entries
];
const SERIES = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_SERIES;
const TODAY = new Date().toISOString().slice(0, 10);

const lines = [];
const out = (s = '') => { console.log(s); lines.push(s); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = 0;
let lastRateHeaders = {};

function loadToken() {
  let t = process.env.HARDCOVER_TOKEN;
  if (!t && existsSync('.dev.vars')) {
    const m = readFileSync('.dev.vars', 'utf8').match(/^HARDCOVER_TOKEN\s*=\s*"?([^"\n]+)"?/m);
    if (m) t = m[1].trim();
  }
  if (!t) {
    console.error('No token found. Add HARDCOVER_TOKEN="..." to .dev.vars at the repo root, or set it in your environment.');
    process.exit(1);
  }
  return t.startsWith('Bearer ') ? t : `Bearer ${t}`;
}
const TOKEN = loadToken();

async function gql(query, variables = {}) {
  await sleep(1100); // stays under 60 requests/minute
  calls++;
  const t0 = Date.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: TOKEN, 'user-agent': UA },
    body: JSON.stringify({ query, variables })
  });
  const ms = Date.now() - t0;
  const rate = {};
  for (const [k, v] of res.headers) if (/rate|limit|retry/i.test(k)) rate[k] = v;
  if (Object.keys(rate).length) lastRateHeaders = rate;
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, ms, json };
}

const errText = (r) => (r.json.errors ? r.json.errors.map((e) => e.message).join('; ') : r.json.raw || '');

function typeStr(t) {
  if (!t) return '?';
  if (t.kind === 'NON_NULL') return typeStr(t.ofType) + '!';
  if (t.kind === 'LIST') return '[' + typeStr(t.ofType) + ']';
  return t.name;
}

async function introspect(name) {
  const r = await gql(
    'query($n:String!){ __type(name:$n){ name fields { name type { kind name ofType { kind name ofType { kind name } } } } } }',
    { n: name }
  );
  const t = r.json.data && r.json.data.__type;
  if (!t) return null;
  const fields = {};
  for (const f of t.fields || []) fields[f.name] = { type: typeStr(f.type), kind: (f.type.ofType || f.type).kind };
  return fields;
}

// Same rule the app will use: 3 -> "03", 3.5 -> "03.5", 0 -> "00".
function label(pos, width = 2) {
  if (pos === null || pos === undefined) return '—';
  const n = Number(pos);
  const whole = Math.floor(n);
  const frac = n - whole;
  const head = String(whole).padStart(width, '0');
  return frac ? head + String(Number(frac.toFixed(3))).slice(1) : head;
}

const findings = {};

async function main() {
  out(`# Hardcover spike report`);
  out(`Run on ${TODAY}. Test series: ${SERIES.join(', ')}.`);
  out('');

  // 1. Auth
  out('## 1. Token');
  const me = await gql('{ me { id username } }');
  if (me.status === 401 || me.status === 403 || !me.json.data) {
    out(`FAILED (HTTP ${me.status}): ${errText(me)}`);
    out('Check the token in .dev.vars. It may have expired.');
    finish();
    return;
  }
  const meRow = Array.isArray(me.json.data.me) ? me.json.data.me[0] : me.json.data.me;
  out(`OK. Signed in as ${meRow ? meRow.username : '(unknown)'} in ${me.ms} ms.`);
  findings.auth = true;
  out('');

  // 2. Schema
  out('## 2. Schema (introspection)');
  const types = {};
  for (const n of ['series', 'book_series', 'books', 'images']) {
    types[n] = await introspect(n);
    out(`- ${n}: ${types[n] ? Object.keys(types[n]).length + ' fields' : 'not found'}`);
  }
  if (types.book_series) {
    const bs = types.book_series;
    out(`- book_series fields: ${Object.entries(bs).filter(([, v]) => v.kind !== 'OBJECT').map(([k, v]) => `${k} (${v.type})`).join(', ')}`);
    findings.positionType = bs.position ? bs.position.type : 'missing';
  }
  const root = await gql('{ __schema { queryType { fields { name } } } }');
  const rootFields = ((root.json.data && root.json.data.__schema.queryType.fields) || []).map((f) => f.name);
  const charRoots = rootFields.filter((f) => /character/i.test(f));
  out(`- Root fields mentioning characters: ${charRoots.length ? charRoots.join(', ') : 'none'}`);
  out(`- Search root field present: ${rootFields.includes('search') ? 'yes' : 'no'}`);
  findings.characterRoots = charRoots;
  out('');

  // 3. Build the series query from fields that actually exist
  const pick = (t, names) => names.filter((n) => types[t] && types[t][n] && types[t][n].kind !== 'OBJECT' && types[t][n].kind !== 'LIST');
  const sf = pick('series', ['id', 'name', 'slug', 'is_completed', 'books_count', 'primary_books_count', 'state', 'canonical_id']);
  const bsf = pick('book_series', ['position', 'featured', 'details', 'compilation']);
  const bf = pick('books', ['id', 'title', 'slug', 'release_date', 'release_year', 'compilation', 'users_read_count', 'description', 'cached_tags', 'cached_image', 'pages']);
  const imageSel = types.books && types.books.image && types.books.image.kind === 'OBJECT' ? ' image { url }' : '';
  const buildQ = (withImage) =>
    `query($name:String!){ series(where:{name:{_eq:$name}}, limit:5){ ${sf.join(' ')} book_series(order_by:{position:asc}){ ${bsf.join(' ')} book { ${bf.join(' ')}${withImage ? imageSel : ''} } } } }`;

  out('## 3. Series data');
  findings.series = [];
  let depthProblem = false;
  for (const name of SERIES) {
    let r = await gql(buildQ(true), { name });
    if (!r.json.data && /depth/i.test(errText(r))) {
      depthProblem = true;
      r = await gql(buildQ(false), { name });
    }
    out(`### ${name}`);
    if (!r.json.data) { out(`Query failed (HTTP ${r.status}): ${errText(r)}`); out(''); continue; }
    const recs = r.json.data.series || [];
    if (!recs.length) { out('No exact-name match. Try the name as Hardcover spells it.'); out(''); continue; }
    if (recs.length > 1) out(`${recs.length} records share this name: ${recs.map((s) => `#${s.id} (${s.state || '?'}, ${s.books_count ?? '?'} books)`).join(', ')}`);
    const s = recs.filter((x) => x.state !== 'duplicate').sort((a, b) => (b.books_count || 0) - (a.books_count || 0))[0] || recs[0];
    const rows = s.book_series || [];
    const byPos = {};
    for (const row of rows) { const k = String(row.position); (byPos[k] = byPos[k] || []).push(row); }
    const decimals = rows.filter((x) => x.position !== null && !Number.isInteger(Number(x.position)));
    const nulls = rows.filter((x) => x.position === null);
    const dupPositions = Object.entries(byPos).filter(([k, v]) => k !== 'null' && v.length > 1);
    const comps = rows.filter((x) => x.compilation || (x.book && x.book.compilation));
    const upcoming = rows.filter((x) => x.book && x.book.release_date && x.book.release_date > TODAY);
    const noDesc = rows.filter((x) => x.book && !x.book.description);
    const noCover = rows.filter((x) => x.book && !(x.book.image && x.book.image.url) && !x.book.cached_image);
    const tagKeys = new Set();
    for (const row of rows) { const t = row.book && row.book.cached_tags; if (t && typeof t === 'object') Object.keys(t).forEach((k) => tagKeys.add(k)); }
    out(`Record #${s.id}: completed=${s.is_completed}, books_count=${s.books_count}, primary_books_count=${s.primary_books_count}, rows=${rows.length}`);
    out(`Decimal positions: ${decimals.length} · No position: ${nulls.length} · Positions shared by 2+ books: ${dupPositions.length} · Compilations: ${comps.length}`);
    out(`Future release dates: ${upcoming.length} · Missing description: ${noDesc.length} · Missing cover: ${noCover.length}`);
    out(`Tag categories: ${tagKeys.size ? [...tagKeys].join(', ') : 'none found'}`);
    if (dupPositions.length) out(`Shared positions: ${dupPositions.slice(0, 5).map(([k, v]) => `${k} → ${v.map((x) => x.book && x.book.title).join(' | ')}`).join(' ;; ')}`);
    out('');
    out('| # | Title | Released | Notes |');
    out('| --- | --- | --- | --- |');
    for (const row of rows.slice(0, 40)) {
      const b = row.book || {};
      const notes = [row.featured === false ? 'not featured' : '', row.compilation || b.compilation ? 'compilation' : '', b.release_date > TODAY ? 'UPCOMING' : ''].filter(Boolean).join(', ');
      out(`| ${label(row.position)} | ${(b.title || '?').replace(/\|/g, '/')} | ${b.release_date || b.release_year || '?'} | ${notes} |`);
    }
    if (rows.length > 40) out(`| … | ${rows.length - 40} more | | |`);
    out('');
    findings.series.push({ name, rows: rows.length, decimals: decimals.length, dup: dupPositions.length, comps: comps.length, upcoming: upcoming.length, tags: [...tagKeys] });
  }
  findings.depthProblem = depthProblem;
  if (depthProblem) out('NOTE: the nested image query hit a depth limit. The build should use a flat cover field or a second query.');

  // 4. Search
  out('## 4. Search');
  if (rootFields.includes('search')) {
    for (const [q, kind] of [['Stormlight', 'Series'], ['Brandon Sanderson', 'Author'], ['Way of Kings', 'Book'], ['Harry Dresden', 'Character']]) {
      const r = await gql('query($q:String!,$k:String!){ search(query:$q, query_type:$k, per_page:5, page:1){ results } }', { q, k: kind });
      const res = r.json.data && r.json.data.search && r.json.data.search.results;
      const hits = (res && res.hits) || [];
      const names = hits.map((h) => (h.document && (h.document.name || h.document.title)) || '?').slice(0, 5);
      out(`- ${kind} "${q}": ${r.json.data ? `${res && res.found !== undefined ? res.found : hits.length} found, ${r.ms} ms` : 'failed: ' + errText(r)}${names.length ? ' → ' + names.join(' · ') : ''}`);
      if (kind === 'Character') findings.characterSearch = r.json.data ? hits.length : 'error';
    }
  } else {
    out('No search root field. Search will need where-clauses with _ilike instead.');
  }
  out('');

  // 5. Open Library character fallback (no token needed)
  out('## 5. Open Library character lookup');
  try {
    const r = await fetch('https://openlibrary.org/search.json?person=' + encodeURIComponent('Harry Dresden') + '&fields=title,author_name&limit=5', { headers: { 'user-agent': UA } });
    const j = await r.json();
    out(`"Harry Dresden": ${j.numFound} works → ${(j.docs || []).map((d) => d.title).join(' · ')}`);
    findings.olCharacters = j.numFound;
  } catch (e) {
    out(`Open Library request failed: ${e.message}`);
  }
  out('');
  finish();
}

function finish() {
  out('## Summary');
  out(`- Token works: ${findings.auth ? 'yes' : 'NO'}`);
  if (findings.positionType) out(`- Position type: ${findings.positionType} · decimal positions seen: ${(findings.series || []).some((s) => s.decimals) ? 'yes' : 'no'}`);
  if (findings.series) {
    out(`- Shared positions (duplicates) seen: ${findings.series.some((s) => s.dup) ? 'yes' : 'no'} · compilations flagged: ${findings.series.some((s) => s.comps) ? 'yes' : 'no'}`);
    out(`- Future release dates seen: ${findings.series.some((s) => s.upcoming) ? 'yes' : 'no'}`);
    out(`- Tag categories available: ${[...new Set(findings.series.flatMap((s) => s.tags))].join(', ') || 'none'}`);
  }
  if (findings.characterRoots) out(`- Character data in Hardcover: ${findings.characterRoots.length ? 'root fields exist (' + findings.characterRoots.join(', ') + ')' : 'no root field'}; character search hits: ${findings.characterSearch ?? 'not tried'}`);
  if (findings.olCharacters !== undefined) out(`- Open Library character lookup: ${findings.olCharacters} works`);
  if (findings.depthProblem !== undefined) out(`- Query depth limit hit: ${findings.depthProblem ? 'yes' : 'no'}`);
  out(`- API calls used: ${calls}`);
  if (Object.keys(lastRateHeaders).length) out(`- Last rate-limit headers: ${JSON.stringify(lastRateHeaders)}`);
  writeFileSync(new URL('./REPORT.md', import.meta.url), lines.join('\n') + '\n');
  console.log('\nWrote spike/REPORT.md');
}

main().catch((e) => {
  out(`\nSpike stopped: ${e.message}`);
  if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(e.message)) out('Could not reach api.hardcover.app. Check your internet connection.');
  finish();
  process.exitCode = 1;
});
