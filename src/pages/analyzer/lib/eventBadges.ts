/**
 * イベントバッジ（イベント交換所で使う通貨。マスタ eventItems.json の名称は
 * 「イベントバッジ」、ワールドリンクは「チャプターNバッジ」「ワールドバッジ」）の獲得数。
 *
 * ## 式
 *
 *   1回のライブ（またはマイセカイの採取1回）ごとに
 *   バッジ = floor(そのプレイの獲得イベントPt ÷ 10)
 *
 * 10 はマスタDB configs.json の `event_item_reduction`（2026-10-25 時点で "10"）。
 * https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/main/configs.json
 * 「ライブでもマイセカイでもポイントの10分の1」という攻略記事の記述とも合う。
 *
 * ## ★ 実機で裏を取れていない点（2026-10-25）
 *
 * ゲームのリザルトの実例（何Ptで何バッジだったか）と照合できたものは 1 件（2026-10-26）。
 * 下の 2・3 は実機で確かめるまで「目安」として扱い、画面にもそう書く。
 *
 * 1. **端数の丸め（確定・2026-10-26）**: Pt を出してから ÷10 で切り捨てる。
 *    実機の 5炊き（倍率25）・ソロで 4,655 Pt → 465 バッジ（MORE MORE JUMP！ Memories）。
 *    炊き倍率を掛ける前に ÷10 していたなら 4,655÷25=186.2 → 18×25=450 になる。
 * 2. **炊き倍率**: マスタ boosts.json はイベントPt用の eventPointRate と報酬用の
 *    rewardRate を別に持ち、6炊き以上で食い違う（10炊きで 35 と 30）。
 *    バッジがどちらに乗るかは未確認。ここでは「獲得Ptの1/10」＝eventPointRate 側を採る。
 *    rewardRate 側だった場合、10炊きでは表示の 30/35（約86%）になる。
 * 3. **ワールドリンク**: サポートユニットのボーナスはバッジには半分しか乗らない
 *    （configs.json `world_bloom_support_deck_event_item_correction_value` = 0.5、
 *    英語版 wiki の "the Support Unit's event points bonus is double the chapter badge bonus"）。
 *    このツールはボーナスを合計1本で受け取るので区別できず、ワールドリンクでは表示より少なくなる。
 *
 * 判定が付いたら、このコメントと BADGE_NOTE の文面を同時に直すこと。
 */

/** 獲得Ptをバッジに換算する除数（configs.json の event_item_reduction）。 */
export const EVENT_ITEM_REDUCTION = 10;

/** 画面・画像で使う呼び名。ゲーム内の正式名称は「イベントバッジ」。 */
export const BADGE_LABEL = "バッジ";

/** 未確認点を利用者に伝える注記（画面用。上の ★ と内容を揃える）。 */
export const BADGE_NOTE =
  "イベントバッジは1回ごとに「獲得Pt÷10（切り捨て）」で出した目安です。" +
  "ワールドリンクのチャプターバッジはサポートユニットの分の計算が違い、表示より少なくなります。";

/** 1回のプレイで得るバッジ数。非数・負値は 0（表示を壊さない）。 */
export function badgesForPlay(pt: number): number {
  if (!Number.isFinite(pt) || pt <= 0) return 0;
  return Math.floor(pt / EVENT_ITEM_REDUCTION);
}

/**
 * 同じ条件のプレイを count 回ずつ叩くまとまりの合計バッジ数。
 * 合計Ptを ÷10 するのではなく、1回ごとに切り捨ててから足す（1回ずつ配られるため）。
 */
export function badgesForUnits(
  units: ReadonlyArray<{ pt: number; count: number }>,
): number {
  return units.reduce(
    (sum, u) => sum + badgesForPlay(u.pt) * Math.max(0, Math.floor(u.count)),
    0,
  );
}

/**
 * マイセカイ採取の合計バッジ数。
 *
 * 本来は採取1回ごとに切り捨てるが、単価（calculateUnitBasePt）は必ず100の倍数で、
 * 採取1回のPt（単価×1.0 / 0.5 / 0.2）はどれも10の倍数になる。よって合計Ptの1/10と一致する。
 */
export function badgesForMySekai(totalPt: number): number {
  return badgesForPlay(totalPt);
}

/** 「バッジ 473個」。 */
export function formatBadges(n: number): string {
  return `${BADGE_LABEL} ${n.toLocaleString()}個`;
}

/** 1回のプレイの獲得Ptから「バッジ 473個」を作る（画面の行で使う短縮形）。 */
export function formatPlayBadges(pt: number): string {
  return formatBadges(badgesForPlay(pt));
}
