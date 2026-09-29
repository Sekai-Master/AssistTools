/**
 * /api/border/* — ボーダー予測の読み出し（Cloudflare Pages Functions）。
 *
 * 画面（src/pages/border）はここを同一オリジンで読む。workers.dev を直接叩かせないのは、
 * 「ページを開いただけで外部のサーバーに接続しない」（プライバシーポリシー第5項）を守るため。
 * 中身は Worker と共通（workers/border/src/public.ts）で、D1 はプロジェクト設定のバインディング BORDER_DB。
 */
import { publicBorderResponse } from '../../../workers/border/src/public.ts'

interface Env {
  BORDER_DB?: D1Database
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.BORDER_DB) return Response.json({ error: 'BORDER_DB が未設定' }, { status: 503 })
  const path = new URL(request.url).pathname.replace(/^\/api\/border/, '')
  try {
    return (await publicBorderResponse(env.BORDER_DB, path)) ?? Response.json({ error: 'not found' }, { status: 404 })
  } catch (err) {
    console.error('border api failed', path, err)
    return Response.json({ error: '内部エラー' }, { status: 500 })
  }
}
