/** 入力欄の文字列を数値へ。空欄・数値でないものは undefined（＝未入力）。 */
export function numOrUndef(v: string | number | undefined): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (v == null) return undefined;
  const n = Number(String(v).trim());
  return String(v).trim() !== "" && Number.isFinite(n) ? n : undefined;
}
