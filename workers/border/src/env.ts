export interface Env {
  DB: D1Database
  /** 解析ジョブ・Bot が使う管理用トークン（wrangler secret put ADMIN_TOKEN） */
  ADMIN_TOKEN?: string
  /** 表のサイト。日程（bonuses.json）の取得元 */
  SITE_ORIGIN: string
}
