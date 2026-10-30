/**
 * ボーダー予測の検証用データ。本番の学習と同じ形（51点の share）を、リポジトリにある種から読む。
 *
 * - 形: scripts/border/data/pace-seed.json（1〜85回と 124〜221回。本番の D1 の shapes と同じ作り方）
 * - 日程: research/data/events-meta.json（マスタの events.json からマラソンだけを抜いたもの。正確な開始・終了時刻）
 *
 * BORDER_DATA に export-data.ts の出力フォルダを渡すと、124回以降は本番 D1 の形（丸めの無い生値。pace-seed は小数4桁）を使い、
 * 30分刻みの推移（series/）も読めるようになる
 *
 * 時代は2つに分けて使う:
 *   new … 124回以降。本番の学習と同じ範囲（sekai.best の graph が遡れる範囲）
 *   old … 1〜85回。本番の開発では一度も見ていないので、調整に使っていない「手つかずの確かめ」に使う
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EventMeta, HistoryEvent, Sample, Shape } from '../../../workers/border/src/model.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = process.env.BORDER_DATA ?? null
const paceSeed = JSON.parse(fs.readFileSync(path.join(here, '../data/pace-seed.json'), 'utf8')).shapes as Shape[]
/** wrangler d1 execute --json の出力（[{ results: [...] }]）の行 */
function d1Rows<T>(file: string): T[] {
  return (JSON.parse(fs.readFileSync(path.join(DATA_DIR as string, file), 'utf8')) as { results: T[] }[])[0].results
}
const seedShapes: Shape[] = DATA_DIR
  ? [
      ...paceSeed.filter((s) => s.eventId < 124),
      ...d1Rows<{ event_id: number; rank: number; final: number; share: string | (number | null)[] }>('d1-shapes.json').map((r) => ({
        eventId: r.event_id,
        rank: r.rank,
        final: r.final,
        share: typeof r.share === 'string' ? (JSON.parse(r.share) as (number | null)[]) : r.share,
      })),
    ]
  : paceSeed
const metaList = JSON.parse(fs.readFileSync(path.join(here, 'data/events-meta.json'), 'utf8')).events as (EventMeta & { asset: string | null })[]

export const META: ReadonlyMap<number, EventMeta> = new Map(metaList.map((e) => [e.id, e]))

export type Era = 'new' | 'old'

/** 時代ごとの全履歴（開始順）。形が1順位も無い回は入れない */
export function loadHistory(era: Era): HistoryEvent[] {
  const inEra = (id: number) => (era === 'new' ? id >= 124 : id <= 85)
  const byEvent = new Map<number, Map<number, Shape>>()
  for (const s of seedShapes) {
    if (!inEra(s.eventId) || !META.has(s.eventId)) continue
    const m = byEvent.get(s.eventId) ?? new Map<number, Shape>()
    m.set(s.rank, s)
    byEvent.set(s.eventId, m)
  }
  return [...byEvent.entries()]
    .map(([id, shapes]) => ({ meta: META.get(id) as EventMeta, shapes }))
    .sort((a, b) => a.meta.startAt - b.meta.startAt)
}

/** target の開始前に終わった回だけ（本番の学習と同じリーク防止） */
export function historyBefore(all: readonly HistoryEvent[], target: EventMeta): HistoryEvent[] {
  return all.filter((h) => h.meta.aggregateAt < target.startAt)
}

/** 学習用の入力（fitModel の引数の形）に戻す */
export function fitInputs(history: readonly HistoryEvent[]): { events: EventMeta[]; shapes: Shape[] } {
  return { events: history.map((h) => h.meta), shapes: history.flatMap((h) => [...h.shapes.values()]) }
}

const seriesCache = new Map<string, Sample[] | null>()
/** 30分刻みの推移（BORDER_DATA/series/{回}_{順位}.json）。無ければ null */
export function loadSeries(eventId: number, rank: number): Sample[] | null {
  const key = `${eventId}_${rank}`
  if (!seriesCache.has(key)) {
    const file = DATA_DIR ? path.join(DATA_DIR, 'series', `${key}.json`) : null
    seriesCache.set(key, file && fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Sample[]) : null)
  }
  return seriesCache.get(key) ?? null
}
