/**
 * 実機で計測して確定させた楽曲の基礎点（イベントポイント倍率）。
 *
 * ## なぜこれが必要か
 *
 * 基礎点の主ソースである sekai.best の music_metas.json（＝本ツールが使う
 * transformedMusics.json の event_rate）は、`event_rate` に 130 の上限があり、
 * 長い曲が 130 に張り付く系統誤差を持つ。曲ごとに個別設定された定数なので
 * 楽曲長からは導出できず、実測値だけが確実な根拠になる。
 *
 * したがって基礎点の優先順位は次のとおり（Point-Analyzer の設計を踏襲）:
 *   1. 実機で計測して確定した値（このファイル）
 *   2. event_rate（transformedMusics.json）
 *
 * ## 計測方法
 *
 * スコアを 20,000 未満（=スコア係数 N が 0）にすると計算式からスコア項が消え、
 *     獲得Pt = floor((イベントボーナス + 100) × 基礎点 / 100)
 * となり、基礎点90〜140の範囲で獲得Ptは重複しないため Pt から基礎点が一意に確定する。
 */
export interface VerifiedBasePoint {
  /** 楽曲ID（3桁ゼロ埋め） */
  id: string;
  /** 参考用の曲名。照合はIDで行う */
  title: string;
  /** 実測で確定した基礎点 */
  basePoint: number;
  /** 計測日 */
  measuredAt: string;
}

export const VERIFIED_BASE_POINTS: readonly VerifiedBasePoint[] = [
  { id: "144", title: "アイノマテリアル", basePoint: 114, measuredAt: "2026-07-22" },
  { id: "685", title: "電光刹歌", basePoint: 116, measuredAt: "2026-07-22" },
  { id: "688", title: "ウィーアーピコピコハンマーズ!!!!", basePoint: 114, measuredAt: "2026-07-22" },
  { id: "108", title: "愛されなくても君がいる", basePoint: 119, measuredAt: "2026-07-22" },
  // id131（通常版・常設）の計測値。Full Ver. の id388 は現在プレイ不可のため計測不能。
  { id: "131", title: "初音ミクの激唱", basePoint: 124, measuredAt: "2026-07-22" },
] as const;

const byId = new Map(VERIFIED_BASE_POINTS.map((v) => [v.id, v.basePoint]));

/** 実測済みの基礎点を引く。3桁ゼロ埋めID で照合。未計測なら undefined。 */
export function getVerifiedBasePoint(musicId: string): number | undefined {
  return byId.get(musicId.padStart(3, "0"));
}
