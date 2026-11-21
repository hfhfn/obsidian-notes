// 用 node:sqlite 模拟 Cloudflare D1 的接口，供本地端到端测试使用。
import { DatabaseSync } from "node:sqlite"

export function makeD1(sqliteDb) {
  function prepare(sql) {
    return {
      bind(...params) {
        return {
          async first() {
            const stmt = sqliteDb.prepare(sql)
            const row = stmt.get(...params)
            return row ?? null
          },
          async all() {
            const stmt = sqliteDb.prepare(sql)
            return { results: stmt.all(...params), success: true }
          },
          async run() {
            const stmt = sqliteDb.prepare(sql)
            const info = stmt.run(...params)
            return { success: true, meta: { changes: Number(info.changes) } }
          },
        }
      },
      async first() {
        const stmt = sqliteDb.prepare(sql)
        return stmt.get() ?? null
      },
      async all() {
        const stmt = sqliteDb.prepare(sql)
        return { results: stmt.all(), success: true }
      },
      async run() {
        const stmt = sqliteDb.prepare(sql)
        const info = stmt.run()
        return { success: true, meta: { changes: Number(info.changes) } }
      },
    }
  }
  return { prepare }
}
