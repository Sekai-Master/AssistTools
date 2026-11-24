/**
 * イベントバッジの除数（マスタ configs.json の `event_item_reduction`）を取り出す。
 *
 * アナライザーはバッジを「1回ごとに floor(獲得Pt ÷ 除数)」で数える。除数は長く "10" だったが、
 * 2026-11-19（master 7.1.0.71）に "7" になった（みんなでライブを止めている間の調整）。
 * 再開のときに戻る可能性があるので、決め打ちせずマスタから写す。
 * 書き出し先と読み込み方は refresh-card-data.mjs と src/pages/analyzer/lib/eventBadges.ts の冒頭。
 *
 * configs.json は [{ configKey, value }] の配列で、value は文字列（"7"）。
 */

export const EVENT_ITEM_REDUCTION_KEY = "event_item_reduction";

/**
 * 除数を数で返す。行が無い・数でない・0 以下なら null。
 * ★ null のとき呼び出し側はファイルを書き換えない（最後に取れた値を残す）。
 */
export function pickEventItemReduction(configs) {
  if (!Array.isArray(configs)) return null;
  const row = configs.find((c) => c && c.configKey === EVENT_ITEM_REDUCTION_KEY);
  if (!row) return null;
  const { value } = row;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}
