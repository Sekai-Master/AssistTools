/**
 * X / Discord に流す文面（純粋関数）。数値は必ずプログラムで埋める（LLM に書かせない）。
 *
 * 口調は docs/x-operations.md に合わせる: 【見出し】で始める・事実だけを平叙で・URL は独立行・絵文字なし。
 */

export const BORDER_PAGE_URL = 'https://sekaimaster.pages.dev/border'

/** X の文字数上限（重み付き） */
export const X_LIMIT = 280
const X_URL_WEIGHT = 23

/**
 * twitter-text の重み付け（v3）に合わせた数え方。
 * U+0000–U+10FF・U+2000–U+200D・U+2010–U+201F・U+2032–U+2037 は 1、それ以外（日本語など）は 2。URL は一律 23。
 */
export function xWeight(text: string): number {
  let weight = 0
  const withoutUrls = text.replace(/https?:\/\/\S+/g, () => {
    weight += X_URL_WEIGHT
    return ''
  })
  for (const ch of withoutUrls) {
    const c = ch.codePointAt(0) as number
    const light =
      (c >= 0x0000 && c <= 0x10ff) || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037)
    weight += light ? 1 : 2
  }
  return weight
}

/** 15,025,880 → "1,503万"。1万未満はそのまま */
export function formatMan(n: number): string {
  if (!Number.isFinite(n)) return '-'
  if (Math.abs(n) < 10_000) return Math.round(n).toLocaleString('en-US')
  return `${Math.round(n / 10_000).toLocaleString('en-US')}万`
}

export function formatPct(x: number, digits = 1): string {
  const v = (x * 100).toFixed(digits)
  return x > 0 ? `+${v}%` : `${v}%`
}

export interface PostRank {
  rank: number
  predicted: number
  low: number | null
  high: number | null
}

/** 投稿で並べる順（読み手に多い順位帯から） */
const POST_ORDER = [1000, 2000, 500, 100, 200, 50]

function fitLines(head: string[], body: string[], tail: string[]): string {
  const lines = [...body]
  for (;;) {
    const text = [...head, ...lines, ...tail].join('\n')
    if (xWeight(text) <= X_LIMIT || lines.length <= 1) return text
    lines.pop()
  }
}

/** 開催中のマイルストーン（経過50%・85%）の予測ポスト */
export function milestoneText(eventName: string, progress: number, ranks: readonly PostRank[]): string | null {
  const ordered = POST_ORDER.map((r) => ranks.find((x) => x.rank === r)).filter((x): x is PostRank => x != null)
  if (ordered.length === 0) return null
  const body = ordered.map((r) => {
    const range = r.low != null && r.high != null ? `（${formatMan(r.low)}〜${formatMan(r.high)}）` : ''
    return `${r.rank}位 ${formatMan(r.predicted)}${range}`
  })
  const head = [`【ボーダー予測】${eventName}（経過${Math.round(progress * 100)}%）`, '']
  const tail = ['', '括弧は8割の確率で収まる幅です。過去イベントの伸び方から自動で出しています。', BORDER_PAGE_URL]
  return fitLines(head, body, tail)
}

export interface ResultRank {
  rank: number
  final: number
  predicted: number
  /** 採点に使った予測の経過率 */
  progress: number
}

/** 終了後の答え合わせポスト */
export function resultText(eventName: string, ranks: readonly ResultRank[]): string | null {
  const ordered = POST_ORDER.map((r) => ranks.find((x) => x.rank === r)).filter((x): x is ResultRank => x != null)
  if (ordered.length === 0) return null
  const p = Math.round(ordered[0].progress * 100)
  const body = ordered.map((r) => `${r.rank}位 実測${formatMan(r.final)}／予測${formatMan(r.predicted)}（${formatPct(r.predicted / r.final - 1)}）`)
  const head = [`【ボーダー予測・答え合わせ】${eventName}`, '']
  const tail = ['', `予測は経過${p}%時点のもの。外れた回も含めて全部載せています。`, BORDER_PAGE_URL]
  return fitLines(head, body, tail)
}
