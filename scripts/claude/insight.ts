/**
 * ③ 答え合わせの一言解説 と ④ モデルの改善案（純粋関数）。実行は scripts/border/analyze.ts の答え合わせのあと。
 *
 * ★ Claude に渡すのは答え合わせのレポートの数字だけ。それ以外の事実を書かせない。
 * ★ 改善案は「次に試す候補」を出させるだけで、採るかどうかは今の前向きの検証（fit.ts）が決める
 *   （Claude を審判にしない。2026-10-08 Nori と合意）。
 */
import type { ModelSummary } from '../../workers/border/src/fit.ts'
import { BORDER_PAGE_URL, formatMan, xWeight } from '../../workers/border/src/posts.ts'
import type { Report } from '../border/report.ts'
import { X_BUDGET, safeForX } from './xposts.ts'

const pct = (x: number) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)}%`

/** レポートを、順位ごとの1行の事実に直す（Claude に渡すのはこれだけ） */
export function reportFacts(r: Report): string[] {
  return r.ranks.map((x) => {
    const at = (c: number) => x.prospective.find((p) => p.checkpoint === c)
    const parts = [0.5, 0.85]
      .map((c) => {
        const p = at(c)
        if (!p) return `経過${c * 100}%の予測 なし`
        const band = p.inBand == null ? '' : p.inBand ? '・8割の幅の中' : '・8割の幅の外'
        return `経過${c * 100}%の予測 ${formatMan(p.predicted)}（誤差 ${pct(p.error)}${band}）`
      })
      .join('、')
    return `${x.rank}位: 実測 ${formatMan(x.final)}、${parts}`
  })
}

export const INSIGHT_SYSTEM = `あなたはプロセカのイベントのボーダー予測の解説係です。終わったイベントの答え合わせの数字を渡すので、外れ方の要点を一言で書いてください。

決まり:
- 日本語で 1〜2 文、全体で 90 字以内
- 渡した数字と事実だけを使う。原因は断定しない（「〜とみられます」「〜の可能性があります」）
- どの順位が、どちら向きに、どのくらい外れたか（または当たったか）を一番に書く
- プレイヤー個人・運営への評価に触れない。URL・ハッシュタグ・絵文字は書かない
- 解説の文だけを出す（前置き・引用符を付けない）`

export function insightUser(r: Report): string {
  return [`イベント: ${r.name}（${r.durationHours}時間）`, '', ...reportFacts(r)].join('\n')
}

/** Claude の一言が型に合っているか。合っていなければ理由を返す */
export function checkInsight(text: string): string | null {
  if (text.length === 0) return '空'
  if ([...text].length > 120) return `長すぎる（${[...text].length}字）`
  if (/https?:\/\//.test(text)) return 'URL が入っている'
  if (/[#＃]/.test(text)) return 'ハッシュタグが入っている'
  if (/\n\s*\n/.test(text)) return '段落が分かれている'
  return safeForX(text)
}

/** 一言解説の投稿。入りきらなければハッシュタグを外す。イベント名も確かめる（外から来る文字なので） */
export function insightPost(eventName: string, insight: string): string | null {
  if (safeForX(eventName) != null) return null
  const build = (tags: boolean) =>
    [`【ボーダー予測・答え合わせの補足】${eventName}`, '', insight, '', BORDER_PAGE_URL, ...(tags ? ['#プロセカボーダー #プロセカ'] : [])].join('\n')
  if (xWeight(build(true)) <= X_BUDGET) return build(true)
  if (xWeight(build(false)) <= X_BUDGET) return build(false)
  return null
}

export const PROPOSAL_SYSTEM = `あなたはプロセカのイベントのボーダー予測モデルの研究係です。

いまのモデル: 終値予測 = 現在の実測ボーダー ÷ シェア表(期間, 順位帯, 経過率)。シェアは「過去のイベントで、その経過率の時点に終値の何割まで積み上がっていたか」の中央値。候補モデルは前向き検証（その時点までのデータだけで作ったモデルで後のイベントを当てる）で採点し、王者より 5% 以上良いときだけ入れ替える。8割の幅は王者の直近の誤差の分位点。
これまでに試して不採用: 属性で分ける・開始曜日で分ける（どちらも前向き検証で悪化）。

終わったイベントの答え合わせと、いまのモデルの要約を渡すので、次の見出しで日本語の Markdown を書いてください。
## 外れ方の読み
数字から言えることだけ。推測は推測と書く。
## 次に試す候補
多くて 3 つ。それぞれ「仮説」「候補の作り方（シェア表の作り方・使う過去のイベントの選び方などをどう変えるか）」「前向き検証で見る指標」「効かなかったときに分かること」。
## 試さないほうがよいこと
理由つきで。

候補は前向き検証で採否を決める前提で書く（ここで採用を決めない）。1 回のイベントの外れだけで結論を出さない。`

export function proposalUser(r: Report, summary: ModelSummary): string {
  const ranks = summary.ranks.map((x) => {
    const cov = x.coverage.map((c) => `${c.covered}/${c.total}`).join(' ')
    return `- ${x.rank}位: 王者 ${x.champion}／表に出すのは経過 ${Math.round(x.minProgress * 100)}% から／帯の的中 ${cov}`
  })
  return [
    `イベント: ${r.name}（${r.durationHours}時間・予測に使った版 ${r.modelVersions.join(', ')}）`,
    '',
    '## 答え合わせ',
    ...reportFacts(r),
    '',
    `## いまのモデル（${summary.version}・学習 ${summary.poolSize} 件・期間 ${summary.durations.join('/')}h）`,
    ...ranks,
  ].join('\n')
}
