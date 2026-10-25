/**
 * 歴代ボーダー（終値の表）の純粋関数。解析ジョブ（analyze.ts）が終わった回を書き足し、Worker の kv `finals` に置く。
 * サイトの「歴代ボーダー」と Bot の画像はこの表を読む。
 *
 * 決まり（2026-10-25 Nori。正本は brain 外の Documents/border-research/old-borders/README.md）:
 * - 対象はマラソン・チアフル・Memories。ワールドリンクとテストの回（名前に「テストイベント」）は除く
 * - 素材名が event_memories_<ユニット>_<年> の回は、種別を Memories に、ユニットを素材名のユニットに上書きする
 * - 終値は sekai.best の最後の点。ただし順位発表（集計終了の10分後）より後の点でなければ確定値とみなさない
 *   （sekai.best は 21:15 ごろに確定後の点を取る。199 は 20:57 で止まっていた）
 * - 順位は 50・100・1000位（200位以下は古い回に記録が無い）
 */
export const FINAL_RANKS = [50, 100, 1000] as const

export type HistoryType = 'marathon' | 'cheerful_carnival' | 'memories'

export interface HistoryEvent {
  id: number
  name: string
  /** 素材名（ロゴは サイトの /CardDatas/logo/<asset>.webp） */
  asset: string | null
  type: HistoryType
  typeLabel: string
  unit: string
  /** 開始日（日本時間 YYYY-MM-DD） */
  start: string
  days: number
  hours: number
  finals: Record<string, number>
  sources: Record<string, string>
}

export interface MasterEvent {
  id: number
  name: string
  eventType: string
  unit?: string
  assetbundleName?: string
  startAt: number
  aggregateAt: number
  rankingAnnounceAt?: number
}

const TYPE_LABEL: Record<HistoryType, string> = { marathon: 'マラソン', cheerful_carnival: 'チアフル', memories: 'Memories' }
/** 特殊形式の上書きは、ここ1か所にまとめる */
const MEMORIES_UNIT: Record<string, string> = {
  vbs: 'street',
  ln: 'light_sound',
  mmj: 'idol',
  wxs: 'theme_park',
  '25': 'school_refusal',
  vs: 'piapro',
}

const JST = 9 * 3_600_000
const ymd = (ms: number) => new Date(ms + JST).toISOString().slice(0, 10)

/**
 * 素材名が Memories の形なのに、略称が対応表に無い回か。
 * そのまま入れるとマラソンとして確定してしまい、あとで対応表を足しても直らない（保存済みの表が優先）ので、保留にする（レビュー MEDIUM-2）
 */
export function unknownMemories(e: MasterEvent): boolean {
  const m = /^event_memories_([a-z0-9]+)_\d{4}$/.exec(e.assetbundleName ?? '')
  return m != null && !Object.hasOwn(MEMORIES_UNIT, m[1])
}

/** マスタの1行を歴代の表の行（終値はまだ空）にする。対象外の回と、知らない Memories の回は null */
export function historyMeta(e: MasterEvent): Omit<HistoryEvent, 'finals' | 'sources'> | null {
  if (e.eventType !== 'marathon' && e.eventType !== 'cheerful_carnival') return null
  if (e.name.includes('テストイベント')) return null
  if (unknownMemories(e)) return null
  let type: HistoryType = e.eventType
  let unit = e.unit ?? 'none'
  const m = /^event_memories_([a-z0-9]+)_\d{4}$/.exec(e.assetbundleName ?? '')
  if (m && Object.hasOwn(MEMORIES_UNIT, m[1])) {
    type = 'memories'
    unit = MEMORIES_UNIT[m[1]]
  }
  const end = e.aggregateAt + 60_000
  return {
    id: e.id,
    name: e.name,
    asset: e.assetbundleName ?? null,
    type,
    typeLabel: TYPE_LABEL[type],
    unit,
    start: ymd(e.startAt),
    days: Math.round((Date.parse(`${ymd(end - 1)}T00:00:00Z`) - Date.parse(`${ymd(e.startAt)}T00:00:00Z`)) / 86_400_000) + 1,
    hours: Math.round((end - e.startAt) / 3_600_000),
  }
}

/** 順位発表の時刻（マスタに無ければ集計終了の10分後） */
export const announceAt = (e: MasterEvent) => e.rankingAnnounceAt ?? e.aggregateAt + 600_000

/** 時系列の最後の点が確定値か（順位発表より後の点か） */
export function confirmedFinal(series: readonly (readonly [number, number])[], e: MasterEvent): number | null {
  const last = series[series.length - 1]
  if (!last || last[0] <= announceAt(e) || !(last[1] > 0)) return null
  return last[1]
}

/** kv の表を読む。壊れていれば空 */
export function parseHistory(raw: unknown): HistoryEvent[] {
  const list = (raw as { events?: unknown } | null)?.events
  if (!Array.isArray(list)) return []
  return list.filter(
    (x): x is HistoryEvent =>
      x != null && typeof x === 'object' && typeof (x as HistoryEvent).id === 'number' && typeof (x as HistoryEvent).finals === 'object',
  )
}
