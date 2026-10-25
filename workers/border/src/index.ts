/**
 * sekaimaster-border: ボーダーの収集・予測ログ・公開 API（AssistTools#128 / #129）
 *
 * 全体の設計と運用は docs/border-prediction.md が正本。
 */
import { handleRequest } from './api.ts'
import { runCron } from './collect.ts'
import type { Env } from './env.ts'
import { runFinals } from './finals.ts'

/** 終わった直後の回を歴代の表へ足す見回り（wrangler.jsonc の crons と同じ文字列） */
export const FINALS_CRON = '*/5 * * * *'

export default {
  fetch(req, env) {
    return handleRequest(req, env)
  },
  async scheduled(controller, env, ctx) {
    // 5分ごとの見回りと、30分ごとの収集は別の Cron。:05 と :35 は両方が別々に呼ばれる
    if (controller.cron === FINALS_CRON) {
      ctx.waitUntil(
        runFinals(env, Date.now()).then(
          (r) => {
            if (r.status !== 'idle') console.log('finals', JSON.stringify(r))
          },
          (err) => console.error('finals failed', err),
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
