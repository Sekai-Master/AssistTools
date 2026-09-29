/**
 * テスト用: node:sqlite の上に D1 の使っている部分だけを載せる。
 * 本物のマイグレーション SQL と本物のクエリをそのまま流すためのもの（モックで SQL を素通りさせない）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

type Row = Record<string, unknown>

class Stmt {
  private args: unknown[] = []
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
  ) {}
  bind(...args: unknown[]) {
    const s = new Stmt(this.db, this.sql)
    s.args = args.map((a) => (typeof a === 'boolean' ? Number(a) : a))
    return s
  }
  async first<T = Row>(): Promise<T | null> {
    const r = this.db.prepare(this.sql).get(...(this.args as never[]))
    return (r as T | undefined) ?? null
  }
  async all<T = Row>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...(this.args as never[])) as T[] }
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...(this.args as never[]))
    return { meta: { changes: Number(r.changes) } }
  }
}

export function createD1(): D1Database {
  const db = new DatabaseSync(':memory:')
  const dir = path.join(import.meta.dirname, '..', 'migrations')
  for (const f of fs.readdirSync(dir).sort()) db.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
  const shim = {
    prepare: (sql: string) => new Stmt(db, sql),
    batch: async (stmts: Stmt[]) => {
      db.exec('BEGIN')
      try {
        const out = []
        for (const s of stmts) out.push(await s.run())
        db.exec('COMMIT')
        return out
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    },
  }
  return shim as unknown as D1Database
}
