import ts from 'typescript'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const nativeRequire = createRequire(import.meta.url)

// Execute real route/library code; replace only DB, framework response and network boundaries.
export function loadRoute(file, { client, env = {}, fetch = async () => { throw new Error('network forbidden') }, mocks = {} } = {}) {
  const cache = new Map()
  let clients = 0
  const load = (filename) => {
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }
    cache.set(filename, module)
    const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const require = (id) => {
      if (id in mocks) return mocks[id]
      if (id === 'next/server') return { NextResponse: { json: (body, options) => Response.json(body, options) } }
      if (['@/lib/supabase', '@/lib/supabaseServer'].includes(id)) return {
        createAdminClient: () => { clients++; return client },
        createSupabaseServerClient: () => { clients++; return client },
      }
      if (id.startsWith('@/')) return load(resolve(id.slice(2) + '.ts'))
      return nativeRequire(id)
    }
    vm.runInNewContext(source, { module, exports: module.exports, require, process: { env }, Buffer, Request, Response, URL, fetch, console, Date }, { filename })
    return module.exports
  }
  return { route: load(resolve(file)), clientCount: () => clients }
}

export function memoryClient(rows = [], { failPosted = false } = {}) {
  const writes = []
  return { rows, writes, from() {
    let patch, filters = [], single = false, updating = false
    const q = {
      select() { return q }, order() { return q }, limit() { return q },
      eq(k, v) { filters.push(r => r[k] === v); return q },
      is(k, v) { filters.push(r => (r[k] ?? null) === v); return q },
      lt(k, v) { filters.push(r => r[k] < v); return q },
      neq(k, v) { filters.push(r => r[k] !== v); return q },
      or() { return q }, gte() { return q },
      update(value) { patch = value; updating = true; return q },
      single() { single = true; return q }, maybeSingle() { single = true; return q },
      then(resolve) {
        if (failPosted && patch?.status === 'posted') return Promise.resolve({ data: null, error: new Error('test: receipt persistence unavailable') }).then(resolve)
        const found = rows.filter(r => filters.every(f => f(r)))
        if (updating) for (const r of found) { writes.push({ ...patch }); Object.assign(r, patch) }
        return Promise.resolve({ data: single ? found[0] || null : found, error: null }).then(resolve)
      },
    }
    return q
  } }
}
