/**
 * sekaimaster-border: ボーダーの収集・予測ログ・公開 API（AssistTools#128 / #129）
 *
 * 全体の設計と運用は docs/border-prediction.md が正本。
 */
import { handleRequest } from './api.ts'
import { runCron } from './collect.ts'
import type { Env } from './env.ts'
import { runDaily } from './daily.ts'
import { runFinals } from './finals.ts'

/** 5分ごとの見回り: 終わった直後の回を歴代の表へ足す（finals.ts）と、21時の日報（daily.ts）。wrangler.jsonc の crons と同じ文字列 */
export const FINALS_CRON = '*/5 * * * *'

export default {
  fetch(req, env) {
    return handleRequest(req, env)
  },
  async scheduled(controller, env, ctx) {
    // 5分ごとの見回りと、30分ごとの収集は別の Cron。:05 と :35 は両方が別々に呼ばれる
    if (controller.cron === FINALS_CRON) {
      const now = Date.now()
      ctx.waitUntil(
        runFinals(env, now).then(
          (r) => {
            if (r.status !== 'idle') console.log('finals', JSON.stringify(r))
          },
          (err) => console.error('finals failed', err),
        ),
      )
      ctx.waitUntil(
        runDaily(env, now).then(
          (r) => {
            if (r.status === 'queued' || r.status === 'skip') console.log('daily', JSON.stringify(r))
          },
          (err) => console.error('daily failed', err),
        ),
      )
      return
    }
    ctx.waitUntil(
      runCron(env, Date.now()).then(
        (r) => console.log('cron', JSON.stringify(r)),
        (err) => console.error('cron failed', err),
      ),
    )
  },
} satisfies ExportedHandler<Env>
