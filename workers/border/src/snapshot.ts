/**
 * 公開 API（/api/border/current）が返す形。サイトの画面もこの型を import する。
 * ★ ここには Workers ランタイムの型を持ち込まない（サイト側の tsconfig でも通すため）。
 */
export interface Snapshot {
  event: { id: number; name: string; type: string; unit: string; startAt: number; aggregateAt: number; durationHours: number }
  checkedAt: number
  sampleAt: number
  progress: number
  modelVersion: string | null
  predicted: boolean
  ranks: {
    rank: number
    current: number
    predicted: number | null
    low: number | null
    high: number | null
    visible: boolean
  }[]
}

/** /api/border/events/{id}/history の1行: [sampleAt, progress, [[rank, current, predicted, low, high, visible], ...]] */
export type HistoryRow = [number, number, [number, number, number | null, number | null, number | null, 0 | 1][]]
