/**
 * 公開 API（/api/border/current）と投稿キューが運ぶ形。サイトの画面もこの型を import する。
 * ★ ここには Workers ランタイムの型を持ち込まない（サイト側の tsconfig でも通すため）。
 * ★ sekaimaster-bot（別リポジトリ）の src/border/client.ts が同じ形を読む。フィールドを変えたらそちらも直す。
 */
import type { Confidence } from './model.ts'

export interface SnapshotEvent {
  id: number
  name: string
  type: string
  unit: string
  startAt: number
  aggregateAt: number
  durationHours: number
}

export interface SnapshotRank {
  rank: number
  current: number
  predicted: number | null
  low: number | null
  high: number | null
  /** 帯の幅から決めた確度（高・中・目安）。予測が無い・帯が広すぎるときは null */
  confidence: Confidence | null
  visible: boolean
}

export interface Snapshot {
  event: SnapshotEvent
  checkedAt: number
  sampleAt: number
  progress: number
  modelVersion: string | null
  /**
   * 過去に無い長さのイベントで、近い端の期間（時間）の伸び方を借りて予測しているとき、その期間。帯は広げてある。
   * 古い版の Worker の出力には無い
   */
  extrapolatedFrom?: number | null
  predicted: boolean
  ranks: SnapshotRank[]
}

/** /api/border/events/{id}/history の1行: [sampleAt, progress, [[rank, current, predicted, low, high, visible], ...]] */
export type HistoryRow = [number, number, [number, number, number | null, number | null, number | null, 0 | 1][]]

/** 答え合わせの1順位（投稿・画像用） */
export interface ResultPostRank {
  rank: number
  final: number
  predicted: number
  /** 採点に使った予測の経過率 */
  progress: number
  /** 予測 ÷ 実測 − 1 */
  error: number
  inBand: boolean | null
  /** そのとき出していた8割の幅（画像に描く） */
  low: number | null
  high: number | null
}

/**
 * 投稿キューの1件に添えるデータ。Bot はこれから画像を作る（文字だけの text は画像が作れないときの控えと代替テキスト）。
 * D1 の kv に `post:{id}` で入る。
 */
export type PostPayload =
  | { kind: 'milestone'; key: string; label: string; snapshot: Snapshot }
  | { kind: 'result'; event: SnapshotEvent; ranks: ResultPostRank[] }
