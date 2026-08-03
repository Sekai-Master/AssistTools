// ★ 'vite' ではなく 'vitest/config' から取る。test セクションの型が付くのは
//    こちらだけで、'vite' の defineConfig に test を書くと tsc が通らない。
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

/** アプリのバージョン。package.json の version が唯一の正本（docs/versioning.md）。 */
function appVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
}

/**
 * カード・イベントデータの生成時刻（ISO 文字列）。
 *
 * アプリのバージョンとは別系統で動く（毎日の自動更新でバージョンは上げない）ので、
 * フッターでは2つを別々に出す。1.3MB の JSON を parse せず末尾の generatedAt だけ
 * 拾うのは、ビルドのたびに巨大な配列を組み立てても捨てるだけだから。
 * データが無い/壊れている場合は空文字を返し、フッター側で表示ごと落とす。
 */
function cardDataGeneratedAt(): string {
  try {
    const raw = fs.readFileSync(path.join(root, 'public/CardDatas/cards.json'), 'utf8')
    const m = /"generatedAt"\s*:\s*(\d+)/.exec(raw.slice(-200))
    return m ? new Date(Number(m[1])).toISOString() : ''
  } catch {
    return ''
  }
}

/**
 * Cloudflare Web Analytics のビーコン。
 *
 * トークン（VITE_CF_BEACON_TOKEN）が渡された時だけ差し込む。無ければ何もしない
 * ので、手元の開発や fork したビルドが他人の集計に混ざることはない。
 * トークンは公開前提の値（HTML に載る）なので secrets ではなく variables でよい。
 *
 * ★ これがサイト唯一の外部通信。増やすときはプライバシーポリシー第5項も直すこと。
 */
function cloudflareBeacon(token: string | undefined): Plugin {
  return {
    name: 'cloudflare-web-analytics',
    transformIndexHtml() {
      if (!token) return []
      return [
        {
          tag: 'script',
          attrs: {
            defer: true,
            src: 'https://static.cloudflareinsights.com/beacon.min.js',
            'data-cf-beacon': JSON.stringify({ token }),
          },
          injectTo: 'body',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflareBeacon(process.env.VITE_CF_BEACON_TOKEN)],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
    __CARD_DATA_GENERATED_AT__: JSON.stringify(cardDataGeneratedAt()),
  },
  test: {
    /*
     * 既定の5秒だと、組み合わせ探索のテストが CI で時間切れになる。
     *
     * アナライザーの探索系は手元でも数秒かかる（dynamicReserve は CI で24秒）。
     * CI ランナーは手元より遅いうえ、テストファイルが増えるほど並列で CPU を
     * 取り合うので、「手元では通るが CI でだけ落ちる」「増やした瞬間に別の
     * テストが落ちる」という形で出る。実際そうなった。
     *
     * 遅いこと自体は探索の中身が重いからで、テストの書き方の問題ではない。
     * 上限は残す（本当に止まったものを見逃さないため）が、実測に見合う値にする。
     */
    testTimeout: 30_000,
  },
})
