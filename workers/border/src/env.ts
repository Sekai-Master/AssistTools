export interface Env {
  DB: D1Database
  /** 解析ジョブ・Bot が使う管理用トークン（wrangler secret put ADMIN_TOKEN） */
  ADMIN_TOKEN?: string
  /**
   * GitHub Actions（解析ジョブ・日程の取り込み）を起動する鍵（wrangler secret put GITHUB_DISPATCH_TOKEN）。
   * AssistTools の Actions: Read and write だけの fine-grained PAT。無ければ起動しない（dispatch.ts）
   */
  GITHUB_DISPATCH_TOKEN?: string
  /** 表のサイト。日程（bonuses.json）の取得元 */
  SITE_ORIGIN: string
}
