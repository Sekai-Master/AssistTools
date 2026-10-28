/**
 * 比べる方法の一覧。名前は results/ のファイル名と report.ts の表に出る。
 * prod（本番の fitModel そのもの）は eval.ts にある
 */
import { THIN_WEIGHT, durationHours, thinKey, type EventMeta, type HistoryEvent, type Model } from '../../../workers/border/src/model.ts'
import { BAND_TAILS, blendTable, thinTable } from '../../../workers/border/src/fit.ts'
import { PROD, fitX, type FitX } from './fitx.ts'
import { fitRate, rateShareTable } from '../../../workers/border/src/rate.ts'

interface Method {
  name: string
  fit: (train: HistoryEvent[], target: EventMeta) => Model
}

const x = (name: string, o: FitX): Method => ({ name, fit: (train, target) => fitX(train, o, target).model })

type Table = (number | null)[]
/** 長さの前例が3件未満の回で、Worker が引く表を source の表に差し替える（参考値の札と帯の広げはそのまま） */
function forRare(o: FitX, source: (history: readonly HistoryEvent[], rank: number, target: EventMeta) => Table | null, mixKnown = false) {
  return (train: HistoryEvent[], target: EventMeta): Model => {
    const d = durationHours(target)
    const same = train.filter((h) => durationHours(h.meta) === d)
    const known = [...new Set(train.map((h) => durationHours(h.meta)))].filter((k) => train.filter((h) => durationHours(h.meta) === k).length >= 3)
    const hook: FitX['tableHook'] = ({ history, rank, tables }) => {
      const t = source(history, rank, target)
      if (!t) return
      const own = tables[String(d)]
      if (own) {
        // 前例が3件以上ある長さ: mixKnown のときだけ、いまの表と幾何平均
        if (mixKnown) tables[String(d)] = own.map((v, i) => (v != null && t[i] != null && v > 0 && (t[i] as number) > 0 ? Math.sqrt(v * (t[i] as number)) : v))
        return
      }
      const filled = (base: Table | undefined) => t.map((v, i) => v ?? base?.[i] ?? null)
      if (same.length > 0 && tables[thinKey(d)]) {
        const latest = same[same.length - 1].shapes.get(rank)
        if (latest) tables[thinKey(d)] = thinTable(latest.share, filled(undefined), THIN_WEIGHT)
        return
      }
      const key = known.length === 0 ? 'all' : d > Math.max(...known) ? 'far_long' : d < Math.min(...known) ? 'far_short' : 'all'
      tables[key] = filled(tables[key])
    }
    return fitX(train, { ...o, tableHook: hook }).model
  }
}
const rateSource = (history: readonly HistoryEvent[], rank: number, target: EventMeta) => {
  const f = fitRate(history, rank)
  return f ? rateShareTable(f, target) : null
}
const blendSource = (history: readonly HistoryEvent[], rank: number, target: EventMeta) => blendTable(durationHours(target), history, rank)

/** 帯の裾の候補を、狭い側（15〜85%）まで広げたもの。当たり率 8割を満たす限り狭いほうを選ぶ */
const WIDE_TAILS = [0.15, 0.125, ...BAND_TAILS]

export const METHODS: Record<string, Method> = {
  /** fitModel の写し（一致の確かめ用） */
  x_prod: x('x_prod', PROD),
  /** 王者を選ばず、4候補の表の幾何平均 */
  ens: x('ens', { ...PROD, selection: 'ensemble' }),
  /** 序盤の差し替えを、なだらかな重みに */
  ramp: x('ramp', { ...PROD, early: 'ramp' }),
  /** 帯: 1回1標本・直近40回・6区間で裾を選ぶ */
  band40: x('band40', { ...PROD, band: 'perEvent', bandWindow: 40, tailMode: 'bucket', tails: WIDE_TAILS }),
  /** 帯: 1回1標本・直近20回（窓は本番と同じ）・6区間 */
  band20: x('band20', { ...PROD, band: 'perEvent', bandWindow: 20, tailMode: 'bucket', tails: WIDE_TAILS }),
  /** 帯: 本番の標本の取り方のまま、裾だけ6区間で */
  bucket: x('bucket', { ...PROD, tailMode: 'bucket', tails: WIDE_TAILS }),
  /** 帯: 1回1標本・直近40回・裾は本番と同じ2区間 */
  pe40zone: x('pe40zone', { ...PROD, band: 'perEvent', bandWindow: 40 }),
  /** 前例の少ない長さ: 率モデル（経過・残り・時刻）の表に差し替え */
  rate: { name: 'rate', fit: forRare(PROD, rateSource) },
  /** 前例の少ない長さ: 経過時間と残り時間でそろえて混ぜた表（序盤の差し替えの blend を全区間に） */
  blendfull: { name: 'blendfull', fit: forRare(PROD, blendSource) },
  /** 率モデルを、前例のある長さでも今の表と幾何平均 */
  ratemix: { name: 'ratemix', fit: forRare(PROD, rateSource, true) },
  /** 率モデルとの幾何平均を、学習の中（誤差・王者・帯）まで一貫させたもの */
  rmix: x('rmix', { ...PROD, rate: 'mix' }),
  /** rmix ＋ 4候補の平均 */
  rmix_ens: x('rmix_ens', { ...PROD, rate: 'mix', selection: 'ensemble' }),
  /** rmix ＋ 帯（1回1標本・40回・6区間） */
  rmix_band: x('rmix_band', { ...PROD, rate: 'mix', band: 'perEvent', bandWindow: 40, tailMode: 'bucket', tails: WIDE_TAILS }),
  /** rmix ＋ 4候補の平均 ＋ 帯 */
  final: x('final', { ...PROD, rate: 'mix', selection: 'ensemble', band: 'perEvent', bandWindow: 40, tailMode: 'bucket', tails: WIDE_TAILS }),
  /** 4候補の平均 ＋ 帯（率モデルなし） */
  ens_band: x('ens_band', { ...PROD, selection: 'ensemble', band: 'perEvent', bandWindow: 40, tailMode: 'bucket', tails: WIDE_TAILS }),
  /** 採用案を、直近の K 回だけで学習（古い回を学習から外す） */
  recent30: { name: 'recent30', fit: (train, target) => fitX(train.slice(-30), { ...PROD, rate: 'mix', band: 'perEvent', bandWindow: 40, tailMode: 'bucket', tails: WIDE_TAILS }, target).model },
  recent45: { name: 'recent45', fit: (train, target) => fitX(train.slice(-45), { ...PROD, rate: 'mix', band: 'perEvent', bandWindow: 40, tailMode: 'bucket', tails: WIDE_TAILS }, target).model },
  /** 採用案の率モデルを、30分刻みの推移で当てはめる（BORDER_DATA が要る） */
  s30: x('s30', { ...PROD, rate: 'mix', rateData: 'series', band: 'perEvent', bandWindow: 40, tailMode: 'bucket', tails: WIDE_TAILS }),
  /** s30 で時刻を1時間刻み（24ビン）に */
  s30h: x('s30h', { ...PROD, rate: 'mix', rateData: 'series', rateClockBins: 24, band: 'perEvent', bandWindow: 40, tailMode: 'bucket', tails: WIDE_TAILS }),
  /** 30分刻みの推移を2時間・3時間ごとにまとめてから当てはめる（30分の伸びのノイズを減らす） */
  s2h: x('s2h', { ...PROD, rate: 'mix', rateData: 'series', rateMergeH: 2, band: 'perEvent', bandWindow: 40, tailMode: 'bucket', tails: WIDE_TAILS }),
  s3h: x('s3h', { ...PROD, rate: 'mix', rateData: 'series', rateMergeH: 3, band: 'perEvent', bandWindow: 40, tailMode: 'bucket', tails: WIDE_TAILS }),
  /** 形のまま、時刻だけ1時間刻みに（s30h との切り分け） */
  shape24: x('shape24', { ...PROD, rate: 'mix', rateClockBins: 24, band: 'perEvent', bandWindow: 40, tailMode: 'bucket', tails: WIDE_TAILS }),
  /** 全部入り */
  combo: x('combo', { selection: 'ensemble', early: 'ramp', band: 'perEvent', bandWindow: 40, tailMode: 'bucket', tails: WIDE_TAILS }),
}
