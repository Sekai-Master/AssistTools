/**
 * sekaimaster-border: ボーダーの収集・予測ログ・公開 API（AssistTools#128 / #129）
 *
 * 全体の設計と運用は docs/border-prediction.md が正本。
 */
import { handleRequest } from './api.ts'
import { runCron } from './collect.ts'
import type { Env } from './env.ts'

export default {
  fetch(req, env) {
    return handleRequest(req, env)
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runCron(env, Date.now()).then(
        (r) => console.log('cron', JSON.stringify(r)),
        (err) => console.error('cron failed', err),
      ),
    )
  },
} satisfies ExportedHandler<Env>
